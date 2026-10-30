"""
Stemify — music source separation worker (Demucs).

Spawned by backend-node/src/demucs.js. Talks to Node through JSON lines on
stdout, like subtitle_worker.py:
    {"progress": 0-100, "stage": "..."}
    {"done": true, "files": ["/abs/path/song_vocals.wav", ...]}
    {"error": "..."}

Why not just `python -m demucs`?
  * Volume: the Demucs CLI rescales each stem whose peak goes above 0 dBFS
    (or, in 4.1+, clamps it even when saving float32). Stems from mastered
    songs often peak above 0 dBFS, so they came out quieter than the original,
    each by a different amount. Here every stem is written as 32-bit float WAV
    with no rescaling and no clipping, so it keeps the exact original level.
  * Windows: audio is decoded with the bundled FFmpeg instead of torchaudio,
    so no TorchCodec / backend workaround is needed.
  * Progress: one overall percentage instead of a bar that restarts for every
    model and every shift.
"""

import argparse
import json
import os
import subprocess
import sys
import types

import numpy as np
import soundfile as sf
import torch

FFMPEG_EXE = os.environ.get("STEMIFY_FFMPEG_PATH", "ffmpeg")


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def load_audio(path, samplerate, channels):
    """Decode any audio/video file to a float32 [channels, samples] tensor."""
    cmd = [
        FFMPEG_EXE, "-v", "error", "-nostdin", "-i", path,
        "-map", "0:a:0", "-f", "f32le", "-acodec", "pcm_f32le",
        "-ac", str(channels), "-ar", str(samplerate), "-",
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError("FFmpeg no pudo leer el audio: " + proc.stderr.decode("utf8", "replace")[-500:])
    data = np.frombuffer(proc.stdout, dtype=np.float32)
    if data.size == 0:
        raise RuntimeError("El archivo no contiene audio.")
    return torch.from_numpy(data.reshape(-1, channels).T.copy())


def install_progress_hook(total_passes, start, end):
    """
    Demucs reports progress through tqdm, with one bar per model and per
    shift. Replace tqdm inside demucs.apply with a wrapper that turns those
    bars into a single overall percentage between `start` and `end`.
    """
    import demucs.apply

    state = {"pass": 0, "last": -1}

    def tqdm_wrapper(iterable, *args, **kwargs):
        items = list(iterable)
        current = state["pass"]
        state["pass"] += 1
        for i, item in enumerate(items, 1):
            yield item
            frac = (min(current, total_passes - 1) + i / len(items)) / total_passes
            pct = int(start + (end - start) * frac)
            if pct != state["last"]:
                state["last"] = pct
                emit({"progress": pct, "stage": "Separando con IA"})

    demucs.apply.tqdm = types.SimpleNamespace(tqdm=tqdm_wrapper)


def pick_device():
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_model(name):
    from demucs.pretrained import get_model as demucs_get_model
    return demucs_get_model(name)


def separate(args):
    from demucs.apply import BagOfModels, apply_model

    emit({"progress": 2, "stage": f"Cargando modelo {args.model}"})
    model = get_model(args.model)
    model.eval()

    emit({"progress": 5, "stage": "Leyendo audio"})
    mix = load_audio(args.input, model.samplerate, model.audio_channels)

    # Same normalisation as the Demucs CLI; undone right after separation,
    # so the output level matches the input exactly.
    ref = mix.mean(0)
    mean, std = ref.mean(), ref.std()
    if std < 1e-8:
        std = torch.tensor(1.0)
    normalized = (mix - mean) / std

    n_models = len(model.models) if isinstance(model, BagOfModels) else 1
    install_progress_hook(n_models * max(1, args.shifts), 8, 95)

    device = pick_device()
    with torch.no_grad():
        sources = apply_model(
            model, normalized[None], device=device, shifts=args.shifts,
            split=True, overlap=args.overlap, progress=True, num_workers=0,
        )[0]
    sources = sources * std + mean

    emit({"progress": 96, "stage": "Guardando pistas"})
    stems = dict(zip(model.sources, sources))
    if args.two_stems:
        if args.two_stems not in stems:
            raise RuntimeError(f"El modelo no tiene la pista '{args.two_stems}'.")
        main = stems.pop(args.two_stems)
        rest = sum(stems.values())
        stems = {args.two_stems: main, "no_" + args.two_stems: rest}

    os.makedirs(args.output_dir, exist_ok=True)
    track = os.path.splitext(os.path.basename(args.input))[0]
    files = []
    for name, wav in stems.items():
        out = os.path.join(args.output_dir, f"{track}_{name}.wav")
        # FLOAT = 32-bit float WAV: values above 1.0 are kept, not clipped.
        sf.write(out, wav.cpu().numpy().T, model.samplerate, subtype="FLOAT")
        files.append(os.path.abspath(out))

    emit({"done": True, "files": files, "device": device})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--model", default="htdemucs_ft")
    parser.add_argument("--shifts", type=int, default=1)
    parser.add_argument("--overlap", type=float, default=0.25)
    parser.add_argument("--two_stems", default=None)
    args = parser.parse_args()
    try:
        separate(args)
    except Exception as exc:  # report every failure to Node as JSON
        emit({"error": f"{type(exc).__name__}: {exc}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
