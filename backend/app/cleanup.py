import asyncio
import shutil
import os
from pathlib import Path

from app.jobs import get_stale_job_ids, delete_job

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "outputs"))
TTL_MINUTES = int(os.getenv("TEMP_FILE_TTL_MINUTES", "60"))
CHECK_INTERVAL_SECONDS = 300


def cleanup_job_files(job_id: str) -> None:
    for base_dir in (UPLOAD_DIR, OUTPUT_DIR):
        job_dir = base_dir / job_id
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)


async def start_cleanup_scheduler() -> None:
    while True:
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
        max_age = TTL_MINUTES * 60
        stale_ids = get_stale_job_ids(max_age)
        for job_id in stale_ids:
            cleanup_job_files(job_id)
            delete_job(job_id)
