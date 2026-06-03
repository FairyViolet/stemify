import subprocess
import shutil
from pathlib import Path


STEM_LABELS = {
    "2stem": {
        "vocals": "Vocals",
        "no_vocals": "Instrumental",
    },
    "4stem": {
        "vocals": "Vocals",
        "drums": "Drums",
        "bass": "Bass",
        "other": "Other Instruments",
    },
}

MODEL_MAP = {
    "2stem": "htdemucs",
    "4stem": "htdemucs",
}


def check_demucs() -> bool:
    return shutil.which("demucs") is not None


def run_demucs(
    audio_path: Path,
    output_dir: Path,
    mode: str,
) -> list[Path]:
    """
    Run Demucs separation.

    For 2stem mode: uses --two-stems=vocals to produce vocals + no_vocals.
    For 4stem mode: uses default 4-stem model (vocals/drums/bass/other).

    Returns list of output WAV file paths.
    """
    model = MODEL_MAP.get(mode, "htdemucs")
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "demucs",
        "--out", str(output_dir),
        "--name", model,
        "--filename", "{track}_{stem}.{ext}",
    ]

    if mode == "2stem":
        cmd += ["--two-stems", "vocals"]

    cmd.append(str(audio_path))

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"Demucs failed (model={model}, mode={mode}): {result.stderr[-2000:]}"
        )

    stem_dir = output_dir / model / audio_path.stem
    if not stem_dir.exists():
        stem_dir = _find_stem_dir(output_dir, audio_path.stem)

    if stem_dir is None or not stem_dir.exists():
        flat_files = list(output_dir.rglob("*.wav"))
        return flat_files

    return sorted(stem_dir.glob("*.wav"))


def _find_stem_dir(output_dir: Path, track_stem: str) -> Path | None:
    for d in output_dir.rglob("*"):
        if d.is_dir() and d.name == track_stem:
            return d
    return None


def stem_label(filename: str, mode: str) -> str:
    """Map a demucs output filename to a human-readable label."""
    lower = filename.lower()
    labels = STEM_LABELS.get(mode, {})
    for key, label in labels.items():
        if key in lower:
            return label
    return filename.replace("_", " ").replace(".wav", "").title()
