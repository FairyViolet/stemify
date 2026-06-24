#!/usr/bin/env python3
"""
Dynamic (karaoke-style) subtitle burner for Stemify.

Three modes:
  --mode full        Transcribe + burn in one shot (fast path, no editing).
  --mode transcribe   Transcribe only, emit word-level segments as JSON
                      (used by the manual emphasis editor).
  --mode render       Skip transcription — read segments (with optional
                      per-word color/sizeMultiplier overrides) from a JSON
                      file and burn them into the video.

Usage:
  python subtitle_worker.py --mode full --input <video> --output_dir <dir> --style pop
  python subtitle_worker.py --mode transcribe --input <video> --output_dir <dir>
  python subtitle_worker.py --mode render --input <video> --output_dir <dir> \
                             --style pop --segments_json <path>
"""

import argparse
import json
import os
import subprocess
import sys

FFMPEG_EXE = os.environ.get("STEMIFY_FFMPEG_PATH", "ffmpeg")
FFPROBE_EXE = os.environ.get("STEMIFY_FFPROBE_PATH", "ffprobe")

REFERENCE_HEIGHT = 1080  # the style presets below are tuned for ~1080px height


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


def get_video_dimensions(path: str):
    """Return (width, height) of the input video using ffprobe, or None on failure."""
    cmd = [
        FFPROBE_EXE, "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        path,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if out.returncode != 0:
            return None
        line = out.stdout.strip().splitlines()[0]
        w_str, h_str = line.split(",")
        return int(w_str), int(h_str)
    except Exception:
        return None


def hex_to_ass_bgr(hex_color: str):
    """Convert '#RRGGBB' to ASS '&H00BBGGRR&' format. Returns None if invalid."""
    if not hex_color:
        return None
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return None
    try:
        r, g, b = h[0:2], h[2:4], h[4:6]
        int(r, 16); int(g, 16); int(b, 16)
    except ValueError:
        return None
    return f"&H00{b}{g}{r}"


# ── Style presets ────────────────────────────────────────────────────────────
# Sizes below are tuned for a REFERENCE_HEIGHT-tall frame and get scaled to the
# actual video resolution at runtime (see scale_style()).
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
        "margin_v_horizontal": 90,
        "margin_v_vertical": 230,    # extra clearance for social-media UI overlays
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
        "margin_v_horizontal": 70,
        "margin_v_vertical": 210,
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
        "margin_v_horizontal": 60,
        "margin_v_vertical": 190,
        "pop_scale": False,
    },
}


def resolve_orientation(orientation: str, width: int, height: int) -> str:
    if orientation in ("horizontal", "vertical"):
        return orientation
    return "vertical" if height > width else "horizontal"


def scale_style(style: dict, video_height: int, orientation: str) -> dict:
    """Scale font/outline/margin from the 1080-reference design to the actual video height."""
    factor = video_height / REFERENCE_HEIGHT
    margin_key = "margin_v_vertical" if orientation == "vertical" else "margin_v_horizontal"
    return {
        **style,
        "fontsize": max(12, round(style["fontsize"] * factor)),
        "outline_width": max(1, round(style["outline_width"] * factor)),
        "margin_v": max(10, round(style[margin_key] * factor)),
    }


def build_ass_header(style: dict, play_res_x: int, play_res_y: int) -> str:
    return f"""[Script Info]
Title: Stemify Dynamic Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: {play_res_x}
PlayResY: {play_res_y}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{style['fontname']},{style['fontsize']},{style['primary']},&H000000FF,{style['outline']},&H64000000,1,0,0,0,100,100,0,0,1,{style['outline_width']},2,{style['alignment']},60,60,{style['margin_v']},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def build_ass_events_word_level(segments, style: dict) -> str:
    """
    One Dialogue line per word: full phrase text, active word highlighted.
    A word dict may carry manual overrides — "color" (hex "#RRGGBB") and/or
    "sizeMultiplier" (float, e.g. 1.5) — set by the user in the emphasis
    editor. These take priority over the style's default highlight/scale.
    """
    lines = []
    default_highlight = style["highlight"]
    default_scale = 118 if style["pop_scale"] else 100

    for seg in segments:
        words = seg.get("words", [])
        if not words:
            continue
        for i, w in enumerate(words):
            start = ass_time(w["start"])
            end = ass_time(w["end"])
            parts = []
            for j, w2 in enumerate(words):
                word_text = w2.get("word", "").strip()
                if j != i:
                    parts.append(word_text)
                    continue

                override_color = hex_to_ass_bgr(w2.get("color"))
                override_scale = w2.get("sizeMultiplier")
                color = override_color or default_highlight
                scale_pct = round(override_scale * 100) if override_scale else default_scale
                animated = style["pop_scale"] or bool(override_scale)

                if not color and scale_pct == 100:
                    parts.append(word_text)
                elif animated:
                    color_tag = f"\\c{color}&" if color else ""
                    parts.append(
                        f"{{{color_tag}\\t(0,80,\\fscx{scale_pct}\\fscy{scale_pct})"
                        f"\\t(80,180,\\fscx100\\fscy100)}}{word_text}{{\\r}}"
                    )
                elif color:
                    parts.append(f"{{\\c{color}&}}{word_text}{{\\r}}")
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


def load_whisper_model(model_name: str):
    import torch
    import whisper
    device = "cuda" if torch.cuda.is_available() else "cpu"
    emit({"progress": 10, "stage": f"Cargando modelo {model_name} ({device.upper()})..."})
    return whisper.load_model(model_name, device=device)


def transcribe_with_words(model, input_path: str):
    return model.transcribe(input_path, word_timestamps=True, verbose=False)


def burn_subtitles(input_path: str, output_dir: str, style_name: str, orientation_arg: str, segments: list):
    """Shared by 'full' and 'render' modes: build .ass from segments and burn it in."""
    base_style = STYLES[style_name]

    dims = get_video_dimensions(input_path)
    if dims is None:
        emit({"error": "No se pudo leer la resolución del video con ffprobe."})
        sys.exit(1)
    video_w, video_h = dims
    orientation = resolve_orientation(orientation_arg, video_w, video_h)
    style = scale_style(base_style, video_h, orientation)

    os.makedirs(output_dir, exist_ok=True)
    ass_path = os.path.join(output_dir, "subtitles.ass")

    has_words = any(seg.get("words") for seg in segments)
    if style["highlight"] and has_words:
        events = build_ass_events_word_level(segments, style)
    else:
        events = build_ass_events_phrase_level(segments)

    # PlayRes matches the REAL video frame exactly — this is what prevents
    # distorted/stretched text on vertical (9:16) or any non-16:9 video.
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(build_ass_header(style, video_w, video_h))
        f.write(events)

    emit({"progress": 65, "stage": "Quemando subtítulos en el video..."})

    base_name = os.path.splitext(os.path.basename(input_path))[0]
    out_video = os.path.join(output_dir, f"{base_name}_subtitulado.mp4")
    ass_filter_path = escape_path_for_filter(ass_path)
    vf = f"ass=filename='{ass_filter_path}'"

    cmd = [
        FFMPEG_EXE, "-y",
        "-i", input_path,
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
    return orientation, out_video


def run_full(args):
    """Transcribe + burn in one shot — the fast path, no manual editing."""
    emit({"progress": 5, "stage": "Iniciando Whisper..."})
    try:
        model = load_whisper_model(args.model)
    except ImportError as e:
        emit({"error": f"Dependencia no encontrada: {e}"})
        sys.exit(1)
    except Exception as e:
        emit({"error": f"Error cargando modelo Whisper: {e}"})
        sys.exit(1)

    emit({"progress": 25, "stage": "Modelo cargado. Transcribiendo con timestamps por palabra..."})
    try:
        result = transcribe_with_words(model, args.input)
    except Exception as e:
        emit({"error": f"Error durante la transcripción: {e}"})
        sys.exit(1)

    segments = result.get("segments", [])
    emit({"progress": 55, "stage": "Transcripción completada. Generando subtítulos..."})

    orientation, out_video = burn_subtitles(args.input, args.output_dir, args.style, args.orientation, segments)

    emit({
        "done": True,
        "detected_language": result.get("language", "unknown"),
        "orientation": orientation,
        "files": [
            {
                "filename": os.path.basename(out_video),
                "label": "Video con Subtítulos",
                "size_bytes": os.path.getsize(out_video),
            },
        ],
    })


def run_transcribe_only(args):
    """Transcribe only — returns word-level segments for the emphasis editor."""
    emit({"progress": 5, "stage": "Iniciando Whisper..."})
    try:
        model = load_whisper_model(args.model)
    except ImportError as e:
        emit({"error": f"Dependencia no encontrada: {e}"})
        sys.exit(1)
    except Exception as e:
        emit({"error": f"Error cargando modelo Whisper: {e}"})
        sys.exit(1)

    emit({"progress": 40, "stage": "Transcribiendo con timestamps por palabra..."})
    try:
        result = transcribe_with_words(model, args.input)
    except Exception as e:
        emit({"error": f"Error durante la transcripción: {e}"})
        sys.exit(1)

    segments = result.get("segments", [])
    clean_segments = []
    for seg in segments:
        words = [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in seg.get("words", [])]
        if not words:
            continue
        clean_segments.append({"start": seg["start"], "end": seg["end"], "text": seg["text"], "words": words})

    emit({
        "done": True,
        "detected_language": result.get("language", "unknown"),
        "segments": clean_segments,
        "files": [],
    })


def run_render_only(args):
    """Skip transcription — burn pre-supplied (possibly edited) segments into the video."""
    if not args.segments_json or not os.path.exists(args.segments_json):
        emit({"error": "Falta el archivo de segmentos para renderizar."})
        sys.exit(1)

    emit({"progress": 10, "stage": "Preparando subtítulos editados..."})
    with open(args.segments_json, "r", encoding="utf-8") as f:
        segments = json.load(f)

    orientation, out_video = burn_subtitles(args.input, args.output_dir, args.style, args.orientation, segments)

    emit({
        "done": True,
        "orientation": orientation,
        "files": [
            {
                "filename": os.path.basename(out_video),
                "label": "Video con Subtítulos",
                "size_bytes": os.path.getsize(out_video),
            },
        ],
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", default="full", choices=["full", "transcribe", "render"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--style", default="pop", choices=list(STYLES.keys()))
    parser.add_argument("--orientation", default="auto", choices=["auto", "horizontal", "vertical"])
    parser.add_argument("--model", default="large-v2")
    parser.add_argument("--segments_json", default=None)
    args = parser.parse_args()

    if args.mode == "transcribe":
        run_transcribe_only(args)
    elif args.mode == "render":
        run_render_only(args)
    else:
        run_full(args)


if __name__ == "__main__":
    main()
