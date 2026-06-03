# Stemify Backend

FastAPI backend for audio stem separation using Demucs and FFmpeg.

## Setup

```bash
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

## API Endpoints

- `GET /health` — health check
- `GET /api/status` — check FFmpeg and Demucs availability
- `POST /api/process/music` — submit a music separation job
- `POST /api/process/video` — submit a video processing job
- `GET /api/jobs/{job_id}` — poll job status
- `GET /api/download/{job_id}/{filename}` — download a result file
- `DELETE /api/jobs/{job_id}` — delete a job and its files
