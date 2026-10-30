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
                             --style pop --segments_json <path> [--config_json <path>]

Design: --style picks a preset (pop, box, karaoke, neon, reveal, oneword,
clean, classic); --config_json overrides any field of BASE_CONFIG
(position, colours, font, animations, words per screen...).
"""

import argparse
import json
import os
import subprocess
import sys

FFMPEG_EXE = os.environ.get("STEMIFY_FFMPEG_PATH", "ffmpeg")
FFPROBE_EXE = os.environ.get("STEMIFY_FFPROBE_PATH", "ffprobe")

# Sizes in a design config are expressed for a frame whose SHORT side is
# 1080 px and are scaled to the real video at render time. Using the short
# side keeps text the same relative size on 16:9 and 9:16 videos.
REFERENCE_SHORT_SIDE = 1080


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def ass_time(seconds: float) -> str:
    """Format seconds as ASS time: H:MM:SS.cc (centiseconds)."""
    cs = int(round(max(0.0, seconds) * 100))
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
        "-show_entries", "stream=width,height:stream_side_data=rotation",
        "-of", "json",
        path,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if out.returncode != 0:
            return None
        stream = json.loads(out.stdout)["streams"][0]
        w, h = int(stream["width"]), int(stream["height"])
        # Phone videos are often stored landscape with a 90° rotation flag;
        # ffmpeg auto-rotates them, so the frame we draw on is swapped.
        for sd in stream.get("side_data_list", []) or []:
            if abs(int(sd.get("rotation", 0))) in (90, 270):
                w, h = h, w
        return w, h
    except Exception:
        return None


def hex_to_ass_bgr(hex_color):
    """Convert '#RRGGBB' to ASS '&H00BBGGRR' format. Returns None if invalid."""
    if not hex_color or not isinstance(hex_color, str):
        return None
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return None
    try:
        int(h, 16)
    except ValueError:
        return None
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


# ── Design presets ───────────────────────────────────────────────────────────
# Mirrored in frontend/lib/subtitlePresets.ts — keep both in sync.
#   highlightMode: color | box | karaoke | none
#   wordAnimation: pop | zoom | shake | flash | glow | none
#   entryAnimation: none | fade | pop | slide
#   position: top | middle | bottom   (offset = % of height from that edge)
#   maxWords: words on screen at once (0 = whole phrase)
#   revealWords: upcoming words stay hidden until spoken
BASE_CONFIG = {
    "font": "Arial Black",
    "fontSize": 84,
    "uppercase": False,
    "textColor": "#FFFFFF",
    "highlightColor": "#FFD400",
    "outlineColor": "#000000",
    "outlineWidth": 6,
    "shadow": 2,
    "highlightMode": "color",
    "boxColor": "#8B5CF6",
    "wordAnimation": "pop",
    "entryAnimation": "pop",
    "position": "bottom",
    "offset": 22,
    "maxWords": 3,
    "revealWords": False,
}

PRESETS = {
    "pop":     {"uppercase": True},
    "box":     {"fontSize": 80, "uppercase": True, "highlightMode": "box", "outlineWidth": 5,
                "entryAnimation": "fade"},
    "karaoke": {"fontSize": 76, "highlightMode": "karaoke", "highlightColor": "#3BD4FF",
                "wordAnimation": "none", "entryAnimation": "fade", "maxWords": 6},
    "neon":    {"font": "Trebuchet MS", "fontSize": 82, "highlightColor": "#FF3BC8",
                "outlineColor": "#2A0A3D", "outlineWidth": 4, "shadow": 0,
                "wordAnimation": "glow", "entryAnimation": "fade"},
    "reveal":  {"fontSize": 80, "highlightColor": "#3BFF6E", "wordAnimation": "zoom",
                "entryAnimation": "none", "maxWords": 4, "revealWords": True},
    "oneword": {"font": "Impact", "fontSize": 130, "uppercase": True, "highlightColor": "#FFFFFF",
                "outlineWidth": 8, "maxWords": 1, "position": "middle", "offset": 0},
    "clean":   {"font": "Arial", "fontSize": 58, "highlightColor": "#35E1FF", "outlineWidth": 3,
                "shadow": 1, "wordAnimation": "none", "entryAnimation": "fade", "maxWords": 6},
    "classic": {"font": "Arial", "fontSize": 52, "highlightMode": "none", "outlineWidth": 3,
                "shadow": 1, "wordAnimation": "none", "entryAnimation": "none", "maxWords": 0,
                "offset": 8},
}

# Fonts that ship with Windows (what the user's PC renders with).
ALLOWED_FONTS = {
    "Arial Black", "Impact", "Arial", "Verdana", "Trebuchet MS", "Comic Sans MS",
    "Segoe UI Black", "Georgia", "Bahnschrift",
}
CHOICES = {
    "highlightMode": {"color", "box", "karaoke", "none"},
    "wordAnimation": {"pop", "zoom", "shake", "flash", "glow", "none"},
    "entryAnimation": {"none", "fade", "pop", "slide"},
    "position": {"top", "middle", "bottom"},
}
RANGES = {  # key: (min, max)
    "fontSize": (20, 220), "outlineWidth": (0, 14), "shadow": (0, 10),
    "offset": (0, 45), "maxWords": (0, 10),
}


def resolve_config(preset_name, overrides):
    """Preset defaults + user overrides, validated and clamped."""
    cfg = {**BASE_CONFIG, **PRESETS.get(preset_name, {})}
    for key, value in (overrides or {}).items():
        if key not in BASE_CONFIG:
            continue
        if key in CHOICES and value not in CHOICES[key]:
            continue
        if key == "font" and value not in ALLOWED_FONTS:
            continue
        if key.endswith("Color") and not hex_to_ass_bgr(value):
            continue
        if key in RANGES:
            try:
                lo, hi = RANGES[key]
                value = max(lo, min(hi, float(value)))
                if key == "maxWords":
                    value = int(value)
            except (TypeError, ValueError):
                continue
        if key in ("uppercase", "revealWords"):
            value = bool(value)
        cfg[key] = value
    return cfg


# ── Timing: chunk long phrases into a few words per screen ───────────────────
def clean_word(text: str, uppercase: bool) -> str:
    text = (text or "").strip()
    # Braces and backslashes would be read as ASS override tags.
    text = text.replace("\\", "").replace("{", "(").replace("}", ")")
    return text.upper() if uppercase else text


def build_chunks(segments, max_words: int, uppercase: bool):
    """
    Split Whisper segments into on-screen captions ("chunks").
    A chunk ends after `max_words` words, after sentence punctuation, or
    when the speaker pauses for more than 1 s. Returns a list of
    {"start", "end", "words": [{text, start, end, color?, sizeMultiplier?, animation?}]}.
    """
    chunks = []
    for seg in segments:
        words = [w for w in seg.get("words", []) if clean_word(w.get("word"), False)]
        if not words:
            text = clean_word(seg.get("text"), uppercase)
            if text:
                chunks.append({"start": seg["start"], "end": seg["end"],
                               "words": [{"text": text, "start": seg["start"], "end": seg["end"]}]})
            continue
        current = []
        for idx, w in enumerate(words):
            word = {**w, "text": clean_word(w.get("word"), uppercase)}
            if current and (
                (max_words and len(current) >= max_words)
                or w["start"] - current[-1]["end"] > 1.0
            ):
                chunks.append(current)
                current = []
            current.append(word)
            if max_words and word["text"][-1:] in ".?!…" and idx < len(words) - 1:
                chunks.append(current)
                current = []
        if current:
            chunks.append(current)

    result = []
    for c in chunks:
        if isinstance(c, dict):
            result.append(c)
            continue
        result.append({"start": c[0]["start"], "end": c[-1]["end"], "words": c})

    # Hold each caption until the next one (no blank flicker on short gaps),
    # or 0.3 s after its last word when the next one is far away.
    for i, c in enumerate(result):
        nxt = result[i + 1]["start"] if i + 1 < len(result) else None
        hold = c["end"] + 0.3
        if nxt is not None:
            hold = nxt if nxt - c["end"] < 0.6 else min(hold, nxt)
        c["end"] = max(hold, c["start"] + 0.1)
    return result


# ── ASS generation ───────────────────────────────────────────────────────────
class Renderer:
    def __init__(self, cfg: dict, width: int, height: int):
        self.cfg = cfg
        self.w, self.h = width, height
        k = min(width, height) / REFERENCE_SHORT_SIDE
        self.font_size = max(12, round(cfg["fontSize"] * k))
        self.outline = round(cfg["outlineWidth"] * k, 1)
        self.shadow = round(cfg["shadow"] * k, 1)
        self.text_c = hex_to_ass_bgr(cfg["textColor"])
        self.hi_c = hex_to_ass_bgr(cfg["highlightColor"])
        self.out_c = hex_to_ass_bgr(cfg["outlineColor"])
        self.box_c = hex_to_ass_bgr(cfg["boxColor"])
        self.box_pad = max(4, round(self.font_size * 0.16))

        x = width // 2
        off = cfg["offset"] / 100 * height
        if cfg["position"] == "top":
            self.an, y = 8, round(off)
        elif cfg["position"] == "middle":
            self.an, y = 5, height // 2
        else:
            self.an, y = 2, round(height - off)
        self.x, self.y = x, y

    # -- header ---------------------------------------------------------------
    def header(self) -> str:
        c = self.cfg
        karaoke = c["highlightMode"] == "karaoke"
        # Karaoke: PrimaryColour = already sung, SecondaryColour = not yet sung
        primary = self.hi_c if karaoke else self.text_c
        secondary = self.text_c if karaoke else "&H000000FF"
        margin = round(self.w * 0.06)
        fmt = ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
               "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
               "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")
        style = (f"Style: Default,{c['font']},{self.font_size},{primary},{secondary},{self.out_c},"
                 f"&H80000000,-1,0,0,0,100,100,0,0,1,{self.outline},{self.shadow},{self.an},"
                 f"{margin},{margin},0,1")
        # BorderStyle 3 draws an opaque box (in OutlineColour) behind the text.
        box = (f"Style: Box,{c['font']},{self.font_size},{self.text_c},&H000000FF,{self.box_c},"
               f"{self.box_c},-1,0,0,0,100,100,0,0,3,{self.box_pad},0,{self.an},"
               f"{margin},{margin},0,1")
        return (
            "[Script Info]\nTitle: Stemify Dynamic Subtitles\nScriptType: v4.00+\nWrapStyle: 0\n"
            f"ScaledBorderAndShadow: yes\nPlayResX: {self.w}\nPlayResY: {self.h}\n\n"
            f"[V4+ Styles]\n{fmt}\n{style}\n{box}\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

    # -- tags -----------------------------------------------------------------
    def position_tags(self, first: bool) -> str:
        if first and self.cfg["entryAnimation"] == "slide":
            dy = round(self.h * 0.03)
            return f"\\an{self.an}\\move({self.x},{self.y + dy},{self.x},{self.y},0,180)"
        return f"\\an{self.an}\\pos({self.x},{self.y})"

    def line_tags(self, first: bool) -> str:
        if first and self.cfg["entryAnimation"] in ("fade", "slide"):
            return "\\fad(150,0)"
        return ""

    def base_word_tags(self, first: bool, color: str, hidden: bool) -> str:
        """State every word starts from (explicit, so no \\r is needed)."""
        alpha = "\\alpha&HFF&" if hidden else "\\alpha&H00&"
        scale = "\\fscx100\\fscy100"
        if first and self.cfg["entryAnimation"] == "pop":
            # \\t times are relative to the line start: every word of the
            # first event grows together from 80% to 100%.
            scale = "\\fscx80\\fscy80\\t(0,140,\\fscx100\\fscy100)"
        return f"\\c{color}&\\3c{self.out_c}&\\bord{self.outline}\\blur0\\frz0{alpha}{scale}"

    def active_tags(self, word: dict, color: str, anim: str, first: bool) -> str:
        base = round(float(word.get("sizeMultiplier") or 1) * 100)
        sc = lambda v: f"\\fscx{v}\\fscy{v}"
        c = f"\\c{color}&" if color else ""
        if anim == "pop":
            peak = round(base * 1.18)
            return f"{c}{sc(base)}\\t(0,80,{sc(peak)})\\t(80,180,{sc(base)})"
        if anim == "zoom":
            return f"{c}{sc(base)}\\t(0,120,{sc(round(base * 1.25))})"
        if anim == "shake":
            return f"{c}{sc(base)}\\t(0,40,\\frz-6)\\t(40,90,\\frz6)\\t(90,140,\\frz-4)\\t(140,180,\\frz0)"
        if anim == "flash":
            return f"{c}{sc(base)}\\alpha&H90&\\t(0,120,\\alpha&H00&)"
        if anim == "glow":
            # Neon tube: sharp light core (text colour) + soft halo in the
            # highlight colour. Drawn as an extra layer under the word (see
            # glow_layer), so the blur never softens the letters themselves.
            return f"\\c{self.text_c}&{sc(base)}"
        return f"{c}{sc(base)}" if (base != 100 or c) else ""

    # -- events ---------------------------------------------------------------
    def chunk_events(self, chunk) -> list:
        mode = self.cfg["highlightMode"]
        words = chunk["words"]
        start, end = chunk["start"], chunk["end"]

        if mode == "none" or not words:
            text = " ".join(w["text"] for w in words)
            tags = self.position_tags(True) + self.line_tags(True)
            return [self.dialogue(0, start, end, "Default",
                                  f"{{{tags}{self.base_word_tags(True, self.text_c, False)}}}{text}")]

        if mode == "karaoke":
            parts = []
            for i, w in enumerate(words):
                nxt = words[i + 1]["start"] if i + 1 < len(words) else w["end"]
                lead = (w["start"] - start) if i == 0 else 0
                dur = max(1, round((nxt - w["start"] + lead) * 100))
                parts.append(f"{{\\kf{dur}}}{w['text']}")
            tags = self.position_tags(True) + self.line_tags(True)
            return [self.dialogue(0, start, end, "Default", f"{{{tags}}}" + " ".join(parts))]

        events = []
        for i, w in enumerate(words):
            w_start = start if i == 0 else w["start"]
            w_end = words[i + 1]["start"] if i + 1 < len(words) else end
            if w_end <= w_start:
                continue
            first = i == 0
            override = hex_to_ass_bgr(w.get("color"))
            anim = w.get("animation") or self.cfg["wordAnimation"]
            pos = self.position_tags(first) + self.line_tags(first)

            if mode == "box":
                # Layer 0: every word in text colour; the active word is drawn
                # by layer 1 on top of its box, so it is invisible here.
                # Same scale tags in both layers keep the layout identical.
                l0, l1 = [], []
                for j, w2 in enumerate(words):
                    hidden = self.cfg["revealWords"] and j > i
                    if j == i:
                        act = self.active_tags(w2, None, anim if anim != "glow" else "pop", first)
                        l0.append(f"{{{self.base_word_tags(first, self.text_c, True)}{act}}}{w2['text']}")
                        box = f"\\3c{override}&" if override else f"\\3c{self.box_c}&"
                        l1.append(f"{{{self.base_word_tags(first, self.text_c, False)}\\bord{self.box_pad}{box}{act}}}{w2['text']}")
                    else:
                        l0.append(f"{{{self.base_word_tags(first, self.text_c, hidden)}}}{w2['text']}")
                        l1.append(f"{{{self.base_word_tags(first, self.text_c, True)}}}{w2['text']}")
                events.append(self.dialogue(0, w_start, w_end, "Default", f"{{{pos}}}" + " ".join(l0)))
                events.append(self.dialogue(1, w_start, w_end, "Box", f"{{{pos}}}" + " ".join(l1)))
                continue

            parts = []
            halo = []  # glow only: blurred copy of the active word, one layer below
            for j, w2 in enumerate(words):
                hidden = self.cfg["revealWords"] and j > i
                if j == i:
                    color = override or self.hi_c
                    parts.append(f"{{{self.base_word_tags(first, self.text_c, False)}"
                                 f"{self.active_tags(w2, color, anim, first)}}}{w2['text']}")
                    blur = max(4, round(self.font_size / 10))
                    halo.append(f"{{{self.base_word_tags(first, color, False)}\\3c{color}&"
                                f"\\bord{round(self.outline + self.font_size / 12)}\\blur{blur}"
                                f"{self.active_tags(w2, None, 'none', first)}}}{w2['text']}")
                else:
                    parts.append(f"{{{self.base_word_tags(first, self.text_c, hidden)}}}{w2['text']}")
                    halo.append(f"{{{self.base_word_tags(first, self.text_c, True)}}}{w2['text']}")
            if anim == "glow":
                events.append(self.dialogue(0, w_start, w_end, "Default", f"{{{pos}}}" + " ".join(halo)))
            events.append(self.dialogue(1, w_start, w_end, "Default", f"{{{pos}}}" + " ".join(parts)))
        return events

    @staticmethod
    def dialogue(layer, start, end, style, text) -> str:
        return f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text}"

    def build(self, segments) -> str:
        chunks = build_chunks(segments, self.cfg["maxWords"], self.cfg["uppercase"])
        lines = [ev for c in chunks for ev in self.chunk_events(c)]
        return self.header() + "\n".join(lines) + "\n"


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


def load_design(args):
    """Design = preset (--style) + optional overrides from --config_json."""
    overrides = {}
    if args.config_json and os.path.exists(args.config_json):
        with open(args.config_json, "r", encoding="utf-8") as f:
            overrides = json.load(f) or {}
    preset = overrides.get("preset") or args.style
    if preset not in PRESETS:
        preset = "pop"
    return resolve_config(preset, overrides)


def burn_subtitles(input_path: str, output_dir: str, cfg: dict, segments: list):
    """Shared by 'full' and 'render' modes: build .ass from segments and burn it in."""
    dims = get_video_dimensions(input_path)
    if dims is None:
        emit({"error": "No se pudo leer la resolución del video con ffprobe."})
        sys.exit(1)
    video_w, video_h = dims
    orientation = "vertical" if video_h > video_w else "horizontal"

    os.makedirs(output_dir, exist_ok=True)
    ass_path = os.path.join(output_dir, "subtitles.ass")

    # PlayRes matches the REAL video frame exactly — this is what prevents
    # distorted/stretched text on vertical (9:16) or any non-16:9 video.
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(Renderer(cfg, video_w, video_h).build(segments))

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
        "-pix_fmt", "yuv420p",
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

    orientation, out_video = burn_subtitles(args.input, args.output_dir, load_design(args), segments)

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

    orientation, out_video = burn_subtitles(args.input, args.output_dir, load_design(args), segments)

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
    parser.add_argument("--style", default="pop", help="Design preset: " + ", ".join(PRESETS))
    # Kept for compatibility: the real frame orientation is read from the video.
    parser.add_argument("--orientation", default="auto", choices=["auto", "horizontal", "vertical"])
    parser.add_argument("--config_json", default=None, help="Design overrides (see BASE_CONFIG)")
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
