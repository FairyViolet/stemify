import subprocess
import shutil
from pathlib import Path


def check_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def extract_audio(video_path: Path, output_path: Path) -> None:
    """Extract audio track from a video file as WAV."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        "-ac", "2",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio extraction failed: {result.stderr}")


def remove_audio(video_path: Path, output_path: Path) -> None:
    """Create a muted video (no audio track)."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-an",
        "-vcodec", "copy",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg mute video failed: {result.stderr}")


def convert_to_mp3(wav_path: Path, mp3_path: Path, bitrate: str = "320k") -> None:
    """Convert WAV to MP3."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(wav_path),
        "-acodec", "libmp3lame",
        "-b:a", bitrate,
        str(mp3_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg MP3 conversion failed: {result.stderr}")


def get_duration_seconds(file_path: Path) -> float:
    """Get duration of a media file in seconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def validate_audio_stream(file_path: Path) -> bool:
    """Check if file has at least one audio stream."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=codec_type",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0 and "audio" in result.stdout
