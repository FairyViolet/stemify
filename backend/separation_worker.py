"""
Stemify — music source separation worker.

Spawned by backend-node/src/demucs.js. Talks to Node through JSON lines on
stdout, like subtitle_worker.py:
    {"progress": 0-100, "stage": "..."}
    {"done": true, "files": ["/abs/path/song_vocals.wav", ...], "device": "cuda"}
    {"error": "..."}

Two engines:
  * demucs   — htdemucs / htdemucs_ft. Splits vocals, drums, bass, other.
  * roformer — BS-RoFormer (through the `audio-separator` package, the engine
               behind Ultimate Vocal Remover). Much cleaner vocals. In 4-stem
               mode RoFormer extracts the vocals, then Demucs splits the
               instrumental into drums / bass / other.

Volume: both libraries change the level of their output by default — the
Demucs CLI rescales any stem peaking above 0 dBFS and audio-separator
normalises every stem (and the input) to a 0.9 peak. Here all of that is
disabled and stems are written as 32-bit float WAV, so they keep the exact
original level and add back up to the original mix.

Audio is decoded with the bundled FFmpeg (no torchaudio backend issues on
Windows). Runs on the GPU when PyTorch can see one (NVIDIA CUDA or Apple MPS).
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import types

import numpy as np
import soundfile as sf
import torch

FFMPEG_EXE = os.environ.get("STEMIFY_FFMPEG_PATH", "ffmpeg")
SAMPLERATE = 44100


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def pick_device():
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def device_label(device):
    if device == "cuda":
        return f"GPU {torch.cuda.get_device_name(0)}"
    if device == "mps":
        return "GPU Apple"
    return "CPU"


def load_audio(path, samplerate=SAMPLERATE, channels=2):
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


def progress_tqdm(start, end, passes, stage):
    """
    Build a drop-in replacement for tqdm that turns the library's progress
    bars (one per model / shift / pass) into one overall percentage between
    `start` and `end`, emitted as JSON.
    """
    state = {"pass": 0, "last": -1}

    def wrapper(iterable=None, *args, **kwargs):
        items = list(iterable) if iterable is not None else []
        current = min(state["pass"], passes - 1)
        state["pass"] += 1
        n = max(1, len(items))
        for i, item in enumerate(items, 1):
            yield item
            pct = int(start + (end - start) * (current + i / n) / passes)
            if pct != state["last"]:
                state["last"] = pct
                emit({"progress": pct, "stage": stage})

    return wrapper


# ──────────────────────────────────────────────
# Demucs
# ──────────────────────────────────────────────
def run_demucs(mix, model_name, shifts, overlap, device, start, end):
    """Separate a [2, samples] tensor. Returns {stem_name: [2, samples] tensor}."""
    import demucs.apply
    from demucs.apply import BagOfModels, apply_model
    from demucs.pretrained import get_model

    emit({"progress": start, "stage": f"Cargando modelo {model_name}"})
    model = get_model(model_name)
    model.eval()

    # Same normalisation as the Demucs CLI; undone right after separation,
    # so the output level matches the input exactly.
    ref = mix.mean(0)
    mean, std = ref.mean(), ref.std()
    if std < 1e-8:
        std = torch.tensor(1.0)
    normalized = (mix - mean) / std

    n_models = len(model.models) if isinstance(model, BagOfModels) else 1
    passes = n_models * max(1, shifts)
    demucs.apply.tqdm = types.SimpleNamespace(
        tqdm=progress_tqdm(start, end, passes, f"Separando con Demucs ({device_label(device)})")
    )

    with torch.no_grad():
        sources = apply_model(
            model, normalized[None], device=device, shifts=shifts,
            split=True, overlap=overlap, progress=True, num_workers=0,
        )[0]
    sources = sources * std + mean
    return dict(zip(model.sources, sources.cpu()))


# ──────────────────────────────────────────────
# RoFormer (audio-separator)
# ──────────────────────────────────────────────
def run_roformer(input_wav, model_filename, model_dir, device, start, end):
    """Returns {"vocals": tensor, "no_vocals": tensor}, both [2, samples]."""
    try:
        from audio_separator.separator import Separator
        from audio_separator.separator import common_separator
        from audio_separator.separator.architectures import mdxc_separator
        from audio_separator.separator.uvr_lib_v5 import spec_utils
    except ImportError:
        raise RuntimeError(
            "RoFormer no está instalado. Ejecuta instalar_ia.bat en la carpeta de Stemify."
        )

    # 1) No peak normalisation of the input or of any stem (keeps the level).
    spec_utils.normalize = lambda wave, max_peak=1.0, min_peak=None: np.asarray(wave)

    # 2) Keep the separated arrays in memory instead of letting the library
    #    write them (it would convert to 16/32-bit integer PCM).
    captured = {}

    def capture(self, stem_path, source, stem_name):
        captured[stem_name] = np.array(source, dtype=np.float32)
        return {stem_name: source}

    common_separator.CommonSeparator.final_process = capture

    # 3) Report progress through our JSON protocol.
    mdxc_separator.tqdm = progress_tqdm(start, end, 1, f"Separando voz con RoFormer ({device_label(device)})")

    emit({"progress": start, "stage": "Cargando modelo RoFormer"})
    with tempfile.TemporaryDirectory() as tmp:
        separator = Separator(
            log_level=40,  # logging.ERROR — keep stdout clean for our JSON
            model_file_dir=model_dir,
            output_dir=tmp,
            output_format="WAV",
            sample_rate=SAMPLERATE,
            use_autocast=(device == "cuda"),
        )
        separator.load_model(model_filename=model_filename)
        separator.separate(input_wav)

    vocals = next((v for k, v in captured.items() if k.lower() == "vocals"), None)
    other = next((v for k, v in captured.items() if k.lower() != "vocals"), None)
    if vocals is None or other is None:
        raise RuntimeError(f"RoFormer devolvió pistas inesperadas: {list(captured)}")
    # Arrays come as [samples, channels]
    return {
        "vocals": torch.from_numpy(vocals.T.copy()),
        "no_vocals": torch.from_numpy(other.T.copy()),
    }


# ──────────────────────────────────────────────
def separate(args):
    device = pick_device()
    emit({"progress": 1, "stage": f"Preparando ({device_label(device)})"})
    mix = load_audio(args.input)
    four_stems = args.two_stems is None

    if args.engine == "roformer":
        with tempfile.TemporaryDirectory() as tmp:
            # Float WAV so the separator reads the exact samples, peaks included.
            mix_path = os.path.join(tmp, "mix.wav")
            sf.write(mix_path, mix.numpy().T, SAMPLERATE, subtype="FLOAT")
            split = run_roformer(mix_path, args.roformer_model, args.model_dir, device,
                                 5, 50 if four_stems else 95)
        if four_stems:
            parts = run_demucs(split["no_vocals"], args.model, args.shifts, args.overlap, device, 50, 95)
            # Demucs only splits the instrumental; whatever it still hears as
            # "vocals" there is RoFormer bleed — fold it into "other" so the
            # four stems still add up to the original mix.
            residual = parts.pop("vocals", 0)
            parts["other"] = parts["other"] + residual
            stems = {"vocals": split["vocals"], **parts}
        else:
            stems = split
    else:
        stems = run_demucs(mix, args.model, args.shifts, args.overlap, device, 5, 95)
        if not four_stems:
            if args.two_stems not in stems:
                raise RuntimeError(f"El modelo no tiene la pista '{args.two_stems}'.")
            main = stems.pop(args.two_stems)
            stems = {args.two_stems: main, "no_" + args.two_stems: sum(stems.values())}

    emit({"progress": 96, "stage": "Guardando pistas"})
    os.makedirs(args.output_dir, exist_ok=True)
    track = os.path.splitext(os.path.basename(args.input))[0]
    files = []
    for name, wav in stems.items():
        out = os.path.join(args.output_dir, f"{track}_{name}.wav")
        # FLOAT = 32-bit float WAV: values above 1.0 are kept, not clipped.
        sf.write(out, wav.numpy().T, SAMPLERATE, subtype="FLOAT")
        files.append(os.path.abspath(out))

    emit({"done": True, "files": files, "device": device_label(device)})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--engine", choices=["demucs", "roformer"], default="demucs")
    parser.add_argument("--model", default="htdemucs_ft", help="Demucs model")
    parser.add_argument("--roformer_model", default="model_bs_roformer_ep_317_sdr_12.9755.ckpt")
    parser.add_argument("--model_dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models"))
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
