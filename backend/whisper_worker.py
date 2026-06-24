#!/usr/bin/env python3
"""
Whisper transcription worker for Stemify.
Called by Node.js as a subprocess. Emits JSON lines to stdout for progress tracking.

Usage:
  python whisper_worker.py --input <path> --output_dir <dir>
                           [--model large-v2] [--task transcribe|translate]
                           [--language es|en|pt|fr]
"""

import argparse
import json
import os
import sys
from pathlib import Path


def emit(obj):
    """Print a JSON line to stdout, flushed immediately so Node.js can read it."""
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def format_srt_timestamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h = ms // 3_600_000
    ms %= 3_600_000
    m = ms // 60_000
    ms %= 60_000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(segments) -> str:
    lines = []
    for i, seg in enumerate(segments, start=1):
        start = format_srt_timestamp(seg["start"])
        end = format_srt_timestamp(seg["end"])
        text = seg["text"].strip()
        lines.append(f"{i}\n{start} --> {end}\n{text}\n")
    return "\n".join(lines)


def translate_with_argos(text: str, from_code: str, to_code: str):
    """
    Translate text using Argos Translate.
    Returns None silently if the language pair is not installed.
    """
    try:
        import argostranslate.translate
        installed = argostranslate.translate.get_installed_languages()
        from_lang = next((l for l in installed if l.code == from_code), None)
        if from_lang is None:
            return None
        to_lang = next((l for l in installed if l.code == to_code), None)
        if to_lang is None:
            return None
        translation = from_lang.get_translation(to_lang)
        if translation is None:
            return None
        return translation.translate(text)
    except Exception:
        return None


def translate_segments_with_argos(segments, from_code: str, to_code: str):
    """Translate each segment text. Returns None if unavailable."""
    translated = []
    try:
        import argostranslate.translate
        installed = argostranslate.translate.get_installed_languages()
        from_lang = next((l for l in installed if l.code == from_code), None)
        to_lang = next((l for l in installed if l.code == to_code), None)
        if from_lang is None or to_lang is None:
            return None
        translation = from_lang.get_translation(to_lang)
        if translation is None:
            return None
        for seg in segments:
            new_seg = dict(seg)
            new_seg["text"] = translation.translate(seg["text"].strip())
            translated.append(new_seg)
        return translated
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--model", default="large-v2")
    parser.add_argument("--task", default="transcribe", choices=["transcribe", "translate"])
    parser.add_argument("--language", default=None,
                        help="Target output language code (original|en|es|pt|fr). "
                             "'en' uses Whisper native translate. Others use Argos Translate.")
    args = parser.parse_args()

    target_lang = args.language  # "original", "en", "es", "pt", "fr", or None

    # ── Step 1: Load model ──────────────────────────────────────────────────
    emit({"progress": 5, "stage": "Iniciando Whisper..."})

    try:
        import torch
        import whisper
    except ImportError as e:
        emit({"error": f"Dependencia no encontrada: {e}. Instala whisper y torch en el entorno."})
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    emit({"progress": 10, "stage": f"Cargando modelo {args.model} ({device.upper()})..."})

    try:
        model = whisper.load_model(args.model, device=device)
    except Exception as e:
        emit({"error": f"Error cargando modelo Whisper: {e}"})
        sys.exit(1)

    emit({"progress": 30, "stage": "Modelo cargado. Transcribiendo audio..."})

    # ── Step 2: Transcribe ───────────────────────────────────────────────────
    # Use Whisper's native translate task when target is English
    whisper_task = "translate" if target_lang == "en" else "transcribe"

    try:
        result = model.transcribe(
            args.input,
            task=whisper_task,
            verbose=False,
        )
    except Exception as e:
        emit({"error": f"Error durante la transcripción: {e}"})
        sys.exit(1)

    detected_language = result.get("language", "unknown")
    segments = result.get("segments", [])
    full_text = result.get("text", "").strip()

    emit({"progress": 75, "stage": "Transcripción completada. Generando archivos..."})

    # ── Step 3: Argos Translate for non-English targets ─────────────────────
    if target_lang and target_lang not in ("original", "en", detected_language):
        emit({"progress": 80, "stage": f"Traduciendo al idioma destino..."})
        translated_segments = translate_segments_with_argos(segments, detected_language, target_lang)
        if translated_segments is not None:
            segments = translated_segments
            translated_text = translate_with_argos(full_text, detected_language, target_lang)
            if translated_text:
                full_text = translated_text

    # ── Step 4: Write output files ───────────────────────────────────────────
    os.makedirs(args.output_dir, exist_ok=True)

    txt_path = os.path.join(args.output_dir, "transcript.txt")
    srt_path = os.path.join(args.output_dir, "transcript.srt")

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(full_text)

    srt_content = build_srt(segments)
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(srt_content)

    emit({"progress": 95, "stage": "Finalizando..."})

    # ── Step 5: Emit done ────────────────────────────────────────────────────
    emit({
        "done": True,
        "detected_language": detected_language,
        "text": full_text,
        "files": [
            {
                "filename": "transcript.txt",
                "label": "Transcripción TXT",
                "size_bytes": os.path.getsize(txt_path),
            },
            {
                "filename": "transcript.srt",
                "label": "Subtítulos SRT",
                "size_bytes": os.path.getsize(srt_path),
            },
        ],
    })


if __name__ == "__main__":
    main()
