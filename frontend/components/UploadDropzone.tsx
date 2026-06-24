"use client";

import { useCallback, useState } from "react";
import { Upload, FileAudio, FileVideo, X, Music, Film, Mic } from "lucide-react";
import type { AppMode } from "@/types";
import { formatBytes, clsx } from "@/lib/utils";

interface Props {
  mode: AppMode;
  file: File | null;
  onFile: (file: File | null) => void;
}

const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.flac,.ogg";
const VIDEO_ACCEPT = ".mp4,.mov,.mkv,.webm,.avi";
const BOTH_ACCEPT = `${AUDIO_ACCEPT},${VIDEO_ACCEPT}`;
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi"]);
const BOTH_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]);

function getExt(name: string) {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

export function UploadDropzone({ mode, file, onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMusic = mode === "music";
  const isSpeech = mode === "speech";
  const allowed = isMusic ? AUDIO_EXTENSIONS : isSpeech ? BOTH_EXTENSIONS : VIDEO_EXTENSIONS;
  const accept = isMusic ? AUDIO_ACCEPT : isSpeech ? BOTH_ACCEPT : VIDEO_ACCEPT;
  const accentColor = isMusic ? "violet" : isSpeech ? "emerald" : "cyan";

  const validate = useCallback((f: File): string | null => {
    const ext = getExt(f.name);
    if (!allowed.has(ext))
      return `Tipo "${ext}" no soportado. Permitidos: ${[...allowed].join(", ")}`;
    const maxMb = parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? "500");
    if (f.size > maxMb * 1024 * 1024)
      return `Archivo demasiado grande. Máximo: ${maxMb} MB.`;
    return null;
  }, [allowed]);

  const handleFile = useCallback((f: File) => {
    const err = validate(f);
    if (err) { setError(err); return; }
    setError(null);
    onFile(f);
  }, [validate, onFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }, [handleFile]);

  /* File selected state */
  if (file) {
    const ext = getExt(file.name).replace(".", "").toUpperCase();
    const isAudioFile = AUDIO_EXTENSIONS.has(getExt(file.name));
    return (
      <div className={clsx(
        "flex items-center gap-4 rounded-2xl border px-5 py-4 transition-all",
        isMusic
          ? "border-violet-500/40 bg-violet-500/8"
          : isSpeech
            ? "border-emerald-500/40 bg-emerald-500/8"
            : "border-cyan-500/40 bg-cyan-500/8"
      )}>
        {/* Icon + ext badge */}
        <div className="relative flex-shrink-0">
          <div className={clsx(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            isMusic ? "bg-violet-500/20" : isSpeech ? "bg-emerald-500/20" : "bg-cyan-500/20"
          )}>
            {isMusic || (isSpeech && isAudioFile)
              ? <FileAudio className={clsx("w-6 h-6", isMusic ? "text-violet-400" : "text-emerald-400")} />
              : <FileVideo className={clsx("w-6 h-6", isSpeech ? "text-emerald-400" : "text-cyan-400")} />
            }
          </div>
          <span className={clsx(
            "absolute -bottom-1 -right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md",
            isMusic ? "bg-violet-500 text-white" : isSpeech ? "bg-emerald-500 text-white" : "bg-cyan-500 text-black"
          )}>{ext}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{file.name}</p>
          <p className={clsx("text-xs mt-0.5",
            isMusic ? "text-violet-300/60" : isSpeech ? "text-emerald-300/60" : "text-cyan-300/60"
          )}>
            {formatBytes(file.size)} · listo para procesar
          </p>
        </div>

        <button
          onClick={() => onFile(null)}
          className="p-2 rounded-xl hover:bg-white/10 text-white/30 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  /* Drop zone */
  const formats = isMusic
    ? ["MP3", "WAV", "M4A", "AAC", "FLAC", "OGG"]
    : isSpeech
      ? ["MP3", "WAV", "M4A", "MP4", "MOV", "MKV"]
      : ["MP4", "MOV", "MKV", "WEBM", "AVI"];

  return (
    <div>
      <label
        className={clsx(
          "relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed",
          "px-8 py-14 cursor-pointer transition-all duration-300 overflow-hidden group",
          dragging
            ? isMusic
              ? "border-violet-400 bg-violet-500/12 scale-[1.01]"
              : isSpeech
                ? "border-emerald-400 bg-emerald-500/12 scale-[1.01]"
                : "border-cyan-400 bg-cyan-500/12 scale-[1.01]"
            : isMusic
              ? "border-white/12 hover:border-violet-500/50 bg-white/2 hover:bg-violet-500/5"
              : isSpeech
                ? "border-white/12 hover:border-emerald-500/50 bg-white/2 hover:bg-emerald-500/5"
                : "border-white/12 hover:border-cyan-500/50 bg-white/2 hover:bg-cyan-500/5"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {/* Background radial on hover */}
        <div className={clsx(
          "pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        )}
          style={{
            background: isMusic
              ? "radial-gradient(circle at 50% 50%, rgba(139,92,246,0.06) 0%, transparent 70%)"
              : isSpeech
                ? "radial-gradient(circle at 50% 50%, rgba(52,211,153,0.06) 0%, transparent 70%)"
                : "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.06) 0%, transparent 70%)"
          }} />

        {/* Upload icon with glow */}
        <div className="relative">
          <div className={clsx(
            "absolute inset-0 blur-xl opacity-0 group-hover:opacity-60 transition-opacity",
            isMusic ? "bg-violet-500" : isSpeech ? "bg-emerald-500" : "bg-cyan-500"
          )} />
          <div className={clsx(
            "relative w-16 h-16 rounded-2xl flex items-center justify-center border transition-colors",
            dragging
              ? isMusic
                ? "border-violet-400/50 bg-violet-500/20"
                : isSpeech
                  ? "border-emerald-400/50 bg-emerald-500/20"
                  : "border-cyan-400/50 bg-cyan-500/20"
              : "border-white/10 bg-white/5 group-hover:border-white/20"
          )}>
            {dragging
              ? isMusic
                ? <Music className="w-7 h-7 text-violet-300" />
                : isSpeech
                  ? <Mic className="w-7 h-7 text-emerald-300" />
                  : <Film className="w-7 h-7 text-cyan-300" />
              : <Upload className="w-7 h-7 text-white/40 group-hover:text-white/70 transition-colors" />
            }
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-white font-semibold">
            {dragging
              ? "Suelta el archivo aquí"
              : isMusic
                ? "Arrastra tu archivo de audio"
                : isSpeech
                  ? "Arrastra tu audio o vídeo"
                  : "Arrastra tu archivo de vídeo"}
          </p>
          <p className="text-white/40 text-sm">o haz clic para explorar</p>
        </div>

        {/* Format pills */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {formats.map((f) => (
            <span key={f} className={clsx(
              "text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
              isMusic
                ? "border-violet-500/25 text-violet-300/60 bg-violet-500/8 group-hover:border-violet-500/40"
                : isSpeech
                  ? "border-emerald-500/25 text-emerald-300/60 bg-emerald-500/8 group-hover:border-emerald-500/40"
                  : "border-cyan-500/25 text-cyan-300/60 bg-cyan-500/8 group-hover:border-cyan-500/40"
            )}>
              {f}
            </span>
          ))}
        </div>

        <input type="file" accept={accept} className="hidden" onChange={onInput} />
      </label>
      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2.5">
          <span>⚠</span> {error}
        </div>
      )}
    </div>
  );
}
