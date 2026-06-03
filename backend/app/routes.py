import asyncio
import os
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.cleanup import cleanup_job_files
from app.demucs_utils import check_demucs
from app.ffmpeg_utils import check_ffmpeg
from app.jobs import JobFile, create_job, delete_job, get_job, update_job
from app.processing import process_music_job, process_video_job

router = APIRouter()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "outputs"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "500")) * 1024 * 1024

ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi"}

ALLOWED_AUDIO_MIMES = {
    "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4",
    "audio/aac", "audio/flac", "audio/ogg", "audio/x-flac",
}
ALLOWED_VIDEO_MIMES = {
    "video/mp4", "video/quicktime", "video/x-matroska",
    "video/webm", "video/x-msvideo",
}


def _validate_upload(file: UploadFile, allowed_extensions: set[str]) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(allowed_extensions))}",
        )


def _safe_filename(name: str) -> str:
    """Strip path components and replace unsafe chars."""
    name = Path(name).name
    safe = "".join(c if c.isalnum() or c in "._- " else "_" for c in name)
    return safe or "upload"


async def _save_upload(file: UploadFile, dest: Path) -> int:
    size = 0
    with open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_BYTES // (1024*1024)} MB.",
                )
            f.write(chunk)
    return size


def _check_dependencies(need_ffmpeg: bool = True, need_demucs: bool = True) -> None:
    errors = []
    if need_ffmpeg and not check_ffmpeg():
        errors.append("FFmpeg is not installed or not in PATH. Install from https://ffmpeg.org/download.html")
    if need_demucs and not check_demucs():
        errors.append("Demucs is not installed. Install with: pip install demucs")
    if errors:
        raise HTTPException(status_code=503, detail=" | ".join(errors))


@router.get("/status")
async def api_status():
    return {
        "ffmpeg": check_ffmpeg(),
        "demucs": check_demucs(),
    }


@router.post("/process/music")
async def process_music(
    file: Annotated[UploadFile, File(description="Audio file to separate")],
    mode: Annotated[str, Form(description="2stem or 4stem")] = "2stem",
):
    _check_dependencies()
    _validate_upload(file, ALLOWED_AUDIO_EXTENSIONS)

    if mode not in ("2stem", "4stem"):
        raise HTTPException(status_code=400, detail="mode must be '2stem' or '4stem'.")

    job = create_job()
    job_dir = UPLOAD_DIR / job.job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(file.filename or "audio.wav")
    upload_path = job_dir / safe_name

    await _save_upload(file, upload_path)
    update_job(job.job_id, stage="Preparing file", progress=10)

    asyncio.create_task(
        process_music_job(job.job_id, upload_path, mode)
    )

    return {"job_id": job.job_id}


@router.post("/process/video")
async def process_video(
    file: Annotated[UploadFile, File(description="Video file to process")],
    extract_full_audio: Annotated[bool, Form()] = False,
    remove_audio_track: Annotated[bool, Form()] = False,
    separate_voice_music: Annotated[bool, Form()] = False,
    separate_music_stems: Annotated[bool, Form()] = False,
):
    _check_dependencies(need_ffmpeg=True, need_demucs=separate_voice_music or separate_music_stems)
    _validate_upload(file, ALLOWED_VIDEO_EXTENSIONS)

    if not any([extract_full_audio, remove_audio_track, separate_voice_music, separate_music_stems]):
        raise HTTPException(
            status_code=400,
            detail="Select at least one processing option.",
        )

    job = create_job()
    job_dir = UPLOAD_DIR / job.job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(file.filename or "video.mp4")
    upload_path = job_dir / safe_name

    await _save_upload(file, upload_path)
    update_job(job.job_id, stage="Preparing file", progress=5)

    asyncio.create_task(
        process_video_job(
            job.job_id,
            upload_path,
            extract_full_audio,
            remove_audio_track,
            separate_voice_music,
            separate_music_stems,
        )
    )

    return {"job_id": job.job_id}


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "progress": job.progress,
        "stage": job.stage,
        "error": job.error,
        "files": [
            {
                "filename": f.filename,
                "label": f.label,
                "size_bytes": f.size_bytes,
            }
            for f in job.files
        ],
    }


@router.get("/download/{job_id}/{filename}")
async def download_file(job_id: str, filename: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Job is not completed yet.")

    safe_name = _safe_filename(filename)
    file_path = OUTPUT_DIR / job_id / safe_name

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")

    known_names = {f.filename for f in job.files}
    if safe_name not in known_names:
        raise HTTPException(status_code=403, detail="Access denied.")

    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type="application/octet-stream",
    )


@router.delete("/jobs/{job_id}")
async def delete_job_endpoint(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    cleanup_job_files(job_id)
    delete_job(job_id)
    return {"message": "Job deleted."}
