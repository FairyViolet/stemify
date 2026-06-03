import os
import asyncio
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from app.jobs import JobFile, update_job
from app.ffmpeg_utils import (
    extract_audio,
    remove_audio,
    validate_audio_stream,
)
from app.demucs_utils import run_demucs, stem_label

_executor = ThreadPoolExecutor(max_workers=2)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "outputs"))


def _get_file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def _run_music_separation(job_id: str, upload_path: Path, mode: str) -> None:
    output_dir = OUTPUT_DIR / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    update_job(job_id, stage="Validating audio", progress=5)

    if not validate_audio_stream(upload_path):
        raise RuntimeError("File has no valid audio stream.")

    update_job(job_id, stage="Running AI separation", progress=20)

    stem_files = run_demucs(upload_path, output_dir, mode)

    if not stem_files:
        raise RuntimeError("Demucs produced no output files.")

    update_job(job_id, stage="Exporting files", progress=85)

    job_files: list[JobFile] = []
    base_name = upload_path.stem

    for src in stem_files:
        dest_name = f"{base_name}_{src.stem}.wav"
        dest = output_dir / dest_name
        if src != dest:
            src.rename(dest)
        label = stem_label(src.name, mode)
        job_files.append(JobFile(
            filename=dest_name,
            label=label,
            size_bytes=_get_file_size(dest),
        ))

    update_job(job_id, status="completed", progress=100, stage="Completed", files=job_files)


def _run_video_processing(
    job_id: str,
    upload_path: Path,
    extract_full_audio: bool,
    remove_audio_track: bool,
    separate_voice_music: bool,
    separate_music_stems: bool,
) -> None:
    output_dir = OUTPUT_DIR / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    update_job(job_id, stage="Validating video", progress=5)

    base_name = upload_path.stem
    job_files: list[JobFile] = []

    extracted_audio: Path | None = None

    needs_audio = extract_full_audio or separate_voice_music or separate_music_stems

    if needs_audio:
        update_job(job_id, stage="Extracting audio", progress=15)
        extracted_audio = output_dir / f"{base_name}_full-audio.wav"

        if not validate_audio_stream(upload_path):
            raise RuntimeError("Video file has no audio track.")

        extract_audio(upload_path, extracted_audio)

        if extract_full_audio:
            job_files.append(JobFile(
                filename=extracted_audio.name,
                label="Full Audio",
                size_bytes=_get_file_size(extracted_audio),
            ))

    if remove_audio_track:
        update_job(job_id, stage="Removing audio track", progress=30)
        video_ext = upload_path.suffix
        muted_name = f"{base_name}_no-audio{video_ext}"
        muted_path = output_dir / muted_name
        remove_audio(upload_path, muted_path)
        job_files.append(JobFile(
            filename=muted_name,
            label="Muted Video",
            size_bytes=_get_file_size(muted_path),
        ))

    if separate_voice_music and extracted_audio:
        update_job(job_id, stage="Separating voices and music", progress=45)
        stem_files = run_demucs(extracted_audio, output_dir, "2stem")
        for src in stem_files:
            dest_name = f"{base_name}_{src.stem}.wav"
            dest = output_dir / dest_name
            if src != dest and src.exists():
                src.rename(dest)
            label = stem_label(src.name, "2stem")
            if "full-audio" not in dest_name:
                job_files.append(JobFile(
                    filename=dest_name,
                    label=label,
                    size_bytes=_get_file_size(dest),
                ))

    if separate_music_stems and extracted_audio:
        update_job(job_id, stage="Running 4-stem AI separation", progress=60)
        stem_audio = extracted_audio if extracted_audio else output_dir / f"{base_name}_full-audio.wav"
        stem_files = run_demucs(stem_audio, output_dir, "4stem")
        for src in stem_files:
            dest_name = f"{base_name}_{src.stem}.wav"
            dest = output_dir / dest_name
            if src != dest and src.exists():
                src.rename(dest)
            label = stem_label(src.name, "4stem")
            if "full-audio" not in dest_name:
                job_files.append(JobFile(
                    filename=dest_name,
                    label=label,
                    size_bytes=_get_file_size(dest),
                ))

    seen = set()
    unique_files = []
    for f in job_files:
        if f.filename not in seen:
            seen.add(f.filename)
            unique_files.append(f)

    update_job(job_id, stage="Exporting files", progress=90)
    update_job(job_id, status="completed", progress=100, stage="Completed", files=unique_files)


async def process_music_job(job_id: str, upload_path: Path, mode: str) -> None:
    loop = asyncio.get_event_loop()
    try:
        update_job(job_id, status="processing", stage="Starting", progress=0)
        await loop.run_in_executor(
            _executor,
            _run_music_separation,
            job_id,
            upload_path,
            mode,
        )
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc), stage="Failed")


async def process_video_job(
    job_id: str,
    upload_path: Path,
    extract_full_audio: bool,
    remove_audio_track: bool,
    separate_voice_music: bool,
    separate_music_stems: bool,
) -> None:
    loop = asyncio.get_event_loop()
    try:
        update_job(job_id, status="processing", stage="Starting", progress=0)
        await loop.run_in_executor(
            _executor,
            _run_video_processing,
            job_id,
            upload_path,
            extract_full_audio,
            remove_audio_track,
            separate_voice_music,
            separate_music_stems,
        )
    except Exception as exc:
        update_job(job_id, status="failed", error=str(exc), stage="Failed")
