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

Task "clean_voice" (--task clean_voice): chains RoFormer models — vocals,
then optionally denoise, dereverb and lead-vocal-only — and writes the
clean voice plus everything removed (mix − voice).

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
_SEPARATOR_PATCHED = False


def _patch_audio_separator():
    """
    Make audio-separator keep the exact level and hand us float arrays:
      1) no peak normalisation of the input or of any stem;
      2) separated arrays are captured in memory instead of being written by
         the library (it would convert them to integer PCM).
    """
    global _SEPARATOR_PATCHED
    try:
        from audio_separator.separator import common_separator
        from audio_separator.separator.uvr_lib_v5 import spec_utils
    except ImportError:
        raise RuntimeError(
            "RoFormer no está instalado. Ejecuta instalar_ia.bat en la carpeta de Stemify."
        )
    if _SEPARATOR_PATCHED:
        return
    spec_utils.normalize = lambda wave, max_peak=1.0, min_peak=None: np.asarray(wave)

    def capture(self, stem_path, source, stem_name):
        self._stemify_captured[stem_name] = np.array(source, dtype=np.float32)
        return {stem_name: source}

    common_separator.CommonSeparator.final_process = capture
    _SEPARATOR_PATCHED = True


def run_audio_separator(input_wav, model_filename, model_dir, device, start, end, stage):
    """
    Run one audio-separator model on a float WAV.
    Returns {stem name (lower case): [2, samples] tensor}.
    """
    _patch_audio_separator()
    from audio_separator.separator import Separator
    from audio_separator.separator.architectures import mdxc_separator
    from audio_separator.separator import common_separator

    captured = {}
    common_separator.CommonSeparator._stemify_captured = captured
    mdxc_separator.tqdm = progress_tqdm(start, end, 1, f"{stage} ({device_label(device)})")

    emit({"progress": start, "stage": f"Cargando modelo: {stage}"})
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

    if len(captured) < 2:
        raise RuntimeError(f"El modelo {model_filename} devolvió pistas inesperadas: {list(captured)}")
    # Arrays come as [samples, channels]
    return {k.lower(): torch.from_numpy(v.T.copy()) for k, v in captured.items()}


def run_roformer(input_wav, model_filename, model_dir, device, start, end):
    """Returns {"vocals": tensor, "no_vocals": tensor}, both [2, samples]."""
    stems = run_audio_separator(input_wav, model_filename, model_dir, device, start, end,
                                "Separando voz con RoFormer")
    vocals = pick_stem(stems, "vocals")
    other = next(v for k, v in stems.items() if v is not vocals)
    return {"vocals": vocals, "no_vocals": other}


# ── Voice cleanup (video/audio → main voice only) ─────────────
CLEAN_MODELS = {
    "vocals":   ("model_bs_roformer_ep_317_sdr_12.9755.ckpt", "Separando la voz de la música y el ruido"),
    "denoise":  ("denoise_mel_band_roformer_aufr33_sdr_27.9959.ckpt", "Reduciendo ruido"),
    "dereverb": ("dereverb_mel_band_roformer_anvuew_sdr_19.1729.ckpt", "Quitando eco y reverberación"),
    "lead":     ("mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt", "Aislando la voz principal"),
}


def pick_stem(stems, kind):
    """Choose the stem to KEEP from a model's two outputs, by its name."""
    names = list(stems)

    def first(pred):
        return next((n for n in names if pred(n)), None)

    if kind in ("vocals", "lead"):
        name = first(lambda n: "vocal" in n and not n.startswith("no") and "instrument" not in n
                     and "back" not in n and "karaoke" not in n)
    elif kind == "denoise":
        name = first(lambda n: "noise" not in n) or first(lambda n: n.startswith("no"))
    elif kind == "dereverb":
        name = (first(lambda n: "noreverb" in n.replace(" ", "").replace("_", "") or "dry" in n)
                or first(lambda n: "reverb" not in n and "echo" not in n))
    else:
        name = None
    if name is None:
        raise RuntimeError(f"No se reconoció qué pista conservar ({kind}): {names}")
    return stems[name]


def clean_voice(args):
    """
    Chain of RoFormer models: vocals → (denoise) → (dereverb) → (lead only).
    Writes the clean voice, everything that was removed (mix − voice), and,
    when --background > 0, the voice with a little of the background mixed in.
    """
    device = pick_device()
    emit({"progress": 1, "stage": f"Preparando ({device_label(device)})"})
    mix = load_audio(args.input)

    steps = ["vocals"] + [k for k in ("denoise", "dereverb", "lead") if getattr(args, k)]
    voice = mix
    with tempfile.TemporaryDirectory() as tmp:
        for n, kind in enumerate(steps):
            path = os.path.join(tmp, f"step{n}.wav")
            sf.write(path, voice.numpy().T, SAMPLERATE, subtype="FLOAT")
            model, stage = CLEAN_MODELS[kind]
            lo = 5 + 90 * n / len(steps)
            hi = 5 + 90 * (n + 1) / len(steps)
            stems = run_audio_separator(path, model, args.model_dir, device, int(lo), int(hi), stage)
            voice = pick_stem(stems, kind)

    n = min(voice.shape[1], mix.shape[1])
    voice, mix = voice[:, :n], mix[:, :n]
    background = mix - voice  # exactly what was removed: voice + background = original

    emit({"progress": 96, "stage": "Guardando pistas"})
    os.makedirs(args.output_dir, exist_ok=True)
    track = os.path.splitext(os.path.basename(args.input))[0]
    out = {}

    def save(role, name, wav):
        path = os.path.abspath(os.path.join(args.output_dir, f"{track}_{name}.wav"))
        sf.write(path, wav.numpy().T, SAMPLERATE, subtype="FLOAT")
        out[role] = path

    save("voice", "voz_limpia", voice)
    save("background", "fondo_eliminado", background)
    level = max(0.0, min(1.0, args.background / 100))
    if level > 0:
        save("mix", "audio_limpio", voice + background * level)

    emit({"done": True, "files": out, "steps": steps, "device": device_label(device)})


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
    # --task clean_voice: keep only the main voice (see clean_voice)
    parser.add_argument("--task", choices=["separate", "clean_voice"], default="separate")
    parser.add_argument("--denoise", action="store_true")
    parser.add_argument("--dereverb", action="store_true")
    parser.add_argument("--lead", action="store_true", help="Remove backing vocals / other voices")
    parser.add_argument("--background", type=float, default=0, help="% of the removed background to keep")
    args = parser.parse_args()
    try:
        if args.task == "clean_voice":
            clean_voice(args)
        else:
            separate(args)
    except Exception as exc:  # report every failure to Node as JSON
        emit({"error": f"{type(exc).__name__}: {exc}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
