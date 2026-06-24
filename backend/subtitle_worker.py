#!/usr/bin/env python3
"""
Dynamic (karaoke-style) subtitle burner for Stemify.
Transcribes a video with word-level timestamps, builds an .ass subtitle
file with per-word highlighting, then burns it into the video with FFmpeg.

Usage:
  python subtitle_worker.py --input <video> --output_dir <dir> --style pop
                            [--model large-v2]
"""

import argparse
import json
import os
import subprocess
import sys

FFMPEG_EXE = os.environ.get("STEMIFY_FFMPEG_PATH", "ffmpeg")


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def ass_time(seconds: float) -> str:
    """Format seconds as ASS time: H:MM:SS.cc (centiseconds)."""
    cs = int(round(seconds * 100))
    h = cs // 360000
    cs %= 360000
    m = cs // 6000
    cs %= 6000
    s = cs // 100
    cs %= 100
    return f"{h:01d}:{m:02d}:{s:02d}.{cs:02d}"


# ── Style presets ────────────────────────────────────────────────────────────
# Colors in ASS are &HAABBGGRR& (alpha-blue-green-red, hex, opaque = 00 alpha)
STYLES = {
    "pop": {
        "fontname": "Arial Black",
        "fontsize": 84,
        "primary": "&H00FFFFFF",     # white (default word color)
        "highlight": "&H0000F0FF",   # bright yellow (active word)
        "outline": "&H00000000",     # black
        "outline_width": 5,
        "alignment": 2,              # bottom-center
        "margin_v": 90,
        "pop_scale": True,
    },
    "clean": {
        "fontname": "Arial",
        "fontsize": 58,
        "primary": "&H00FFFFFF",
        "highlight": "&H00FFE135",   # cyan-ish
        "outline": "&H00000000",
        "outline_width": 3,
        "alignment": 2,
        "margin_v": 70,
        "pop_scale": False,
    },
    "classic": {
        "fontname": "Arial",
        "fontsize": 52,
        "primary": "&H00FFFFFF",
        "highlight": None,           # no per-word highlight
        "outline": "&H00000000",
        "outline_width": 3,
        "alignment": 2,
        "margin_v": 60,
        "pop_scale": False,
    },
}


def build_ass_header(style: dict) -> str:
    return f"""[Script Info]
Title: Stemify Dynamic Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{style['fontname']},{style['fontsize']},{style['primary']},&H000000FF,{style['outline']},&H64000000,1,0,0,0,100,100,0,0,1,{style['outline_width']},2,{style['alignment']},60,60,{style['margin_v']},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def build_ass_events_word_level(segments, style: dict) -> str:
    """One Dialogue line per word: full phrase text, active word highlighted."""
    lines = []
    highlight = style["highlight"]
    pop = style["pop_scale"]

    for seg in segments:
        words = seg.get("words", [])
        if not words:
            continue
        for i, w in enumerate(words):
            start = ass_time(w["start"])
            end = ass_time(w["end"])
            parts = []
            for j, w2 in enumerate(words):
                word_text = w2["word"].strip()
                if j == i and highlight:
                    if pop:
                        parts.append(
                            f"{{\\c{highlight}&\\t(0,80,\\fscx118\\fscy118)\\t(80,180,\\fscx100\\fscy100)}}"
                            f"{word_text}{{\\r}}"
                        )
                    else:
                        parts.append(f"{{\\c{highlight}&}}{word_text}{{\\r}}")
                else:
                    parts.append(word_text)
            text = " ".join(parts)
            lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")

    return "\n".join(lines) + "\n"


def build_ass_events_phrase_level(segments) -> str:
    """One Dialogue line per phrase/segment — classic static subtitle."""
    lines = []
    for seg in segments:
        start = ass_time(seg["start"])
        end = ass_time(seg["end"])
        text = seg["text"].strip().replace("\n", " ")
        lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")
    return "\n".join(lines) + "\n"


def escape_path_for_filter(p: str) -> str:
    """
    Escape a Windows path for use inside an ffmpeg -vf filter argument.
    Drive-letter colons must be backslash-escaped or the avfilter parser
    treats them as the filename/options separator.
    """
    p = p.replace("\\", "/")
    p = p.replace(":", "\\:")
    return p


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--style", default="pop", choices=list(STYLES.keys()))
    parser.add_argument("--model", default="large-v2")
    args = parser.parse_args()

    style = STYLES[args.style]

    # ── Step 1: Load model ──────────────────────────────────────────────────
    emit({"progress": 5, "stage": "Iniciando Whisper..."})

    try:
        import torch
        import whisper
    except ImportError as e:
        emit({"error": f"Dependencia no encontrada: {e}"})
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    emit({"progress": 10, "stage": f"Cargando modelo {args.model} ({device.upper()})..."})

    try:
        model = whisper.load_model(args.model, device=device)
    except Exception as e:
        emit({"error": f"Error cargando modelo Whisper: {e}"})
        sys.exit(1)

    emit({"progress": 25, "stage": "Modelo cargado. Transcribiendo con timestamps por palabra..."})

    # ── Step 2: Transcribe with word-level timestamps ───────────────────────
    try:
        result = model.transcribe(
            args.input,
            word_timestamps=True,
            verbose=False,
        )
    except Exception as e:
        emit({"error": f"Error durante la transcripción: {e}"})
        sys.exit(1)

    segments = result.get("segments", [])
    emit({"progress": 55, "stage": "Transcripción completada. Generando subtítulos..."})

    # ── Step 3: Build .ass file ──────────────────────────────────────────────
    os.makedirs(args.output_dir, exist_ok=True)
    ass_path = os.path.join(args.output_dir, "subtitles.ass")

    has_words = any(seg.get("words") for seg in segments)
    if style["highlight"] and has_words:
        events = build_ass_events_word_level(segments, style)
    else:
        events = build_ass_events_phrase_level(segments)

    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(build_ass_header(style))
        f.write(events)

    emit({"progress": 65, "stage": "Quemando subtítulos en el video..."})

    # ── Step 4: Burn into video with FFmpeg ──────────────────────────────────
    base_name = os.path.splitext(os.path.basename(args.input))[0]
    out_video = os.path.join(args.output_dir, f"{base_name}_subtitulado.mp4")

    ass_filter_path = escape_path_for_filter(ass_path)
    vf = f"ass=filename='{ass_filter_path}'"

    cmd = [
        FFMPEG_EXE, "-y",
        "-i", args.input,
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-c:a", "copy",
        out_video,
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        emit({"error": f"FFmpeg falló al quemar subtítulos: {proc.stderr[-1500:]}"})
        sys.exit(1)

    emit({"progress": 95, "stage": "Finalizando..."})

    emit({
        "done": True,
        "detected_language": result.get("language", "unknown"),
        "files": [
            {
                "filename": os.path.basename(out_video),
                "label": "Video con Subtítulos",
                "size_bytes": os.path.getsize(out_video),
            },
        ],
    })


if __name__ == "__main__":
    main()
