import uuid
import time
from typing import Optional, Literal
from dataclasses import dataclass, field


JobStatus = Literal["queued", "processing", "completed", "failed"]


@dataclass
class JobFile:
    filename: str
    label: str
    size_bytes: int


@dataclass
class Job:
    job_id: str
    status: JobStatus = "queued"
    progress: int = 0
    stage: str = "queued"
    error: Optional[str] = None
    files: list[JobFile] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


_jobs: dict[str, Job] = {}


def create_job() -> Job:
    job_id = str(uuid.uuid4())
    job = Job(job_id=job_id)
    _jobs[job_id] = job
    return job


def get_job(job_id: str) -> Optional[Job]:
    return _jobs.get(job_id)


def update_job(
    job_id: str,
    status: Optional[JobStatus] = None,
    progress: Optional[int] = None,
    stage: Optional[str] = None,
    error: Optional[str] = None,
    files: Optional[list[JobFile]] = None,
) -> Optional[Job]:
    job = _jobs.get(job_id)
    if not job:
        return None
    if status is not None:
        job.status = status
    if progress is not None:
        job.progress = progress
    if stage is not None:
        job.stage = stage
    if error is not None:
        job.error = error
    if files is not None:
        job.files = files
    job.updated_at = time.time()
    return job


def delete_job(job_id: str) -> bool:
    return _jobs.pop(job_id, None) is not None


def get_all_jobs() -> dict[str, Job]:
    return _jobs


def get_stale_job_ids(max_age_seconds: float) -> list[str]:
    now = time.time()
    return [
        jid for jid, job in _jobs.items()
        if (now - job.created_at) > max_age_seconds
    ]
