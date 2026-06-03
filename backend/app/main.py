import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes import router
from app.cleanup import start_cleanup_scheduler

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(start_cleanup_scheduler())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Stemify API",
    description="Audio stem separation from music and video files",
    version="1.0.0",
    lifespan=lifespan,
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
