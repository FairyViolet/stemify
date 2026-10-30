"use client";

import { useCallback, useState } from "react";
import { Upload, FileAudio, FileVideo, X, Music, Film, Mic, Captions, ArrowRightLeft } from "lucide-react";
import type { AppMode } from "@/types";
import { formatBytes, clsx } from "@/lib/utils";

interface Props {
  mode: AppMode;
  file: File | null;
  onFile: (file: File | null) => void;
}

const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.wma,.aiff,.aif";
const VIDEO_ACCEPT = ".mp4,.mov,.mkv,.webm,.avi";
const BOTH_ACCEPT = `${AUDIO_ACCEPT},${VIDEO_ACCEPT}`;
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi"]);
const BOTH_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]);

type Scheme = {
  allowed: Set<string>;
  accept: string;
  formats: string[];
  dropIcon: React.ReactNode;
  label: string;
  color: string; // tailwind color name, e.g. "violet"
};

function getExt(name: string) {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

const SCHEMES: Record<AppMode, Scheme> = {
  music: {
    allowed: AUDIO_EXTENSIONS,
    accept: AUDIO_ACCEPT,
    formats: ["MP3", "WAV", "M4A", "AAC", "FLAC", "OGG"],
    dropIcon: <Music className="w-7 h-7" />,
    label: "Arrastra tu archivo de audio",
    color: "violet",
  },
  video: {
    allowed: VIDEO_EXTENSIONS,
    accept: VIDEO_ACCEPT,
    formats: ["MP4", "MOV", "MKV", "WEBM", "AVI"],
    dropIcon: <Film className="w-7 h-7" />,
    label: "Arrastra tu archivo de vídeo",
    color: "cyan",
  },
  speech: {
    allowed: BOTH_EXTENSIONS,
    accept: BOTH_ACCEPT,
    formats: ["MP3", "WAV", "M4A", "MP4", "MOV", "MKV"],
    dropIcon: <Mic className="w-7 h-7" />,
    label: "Arrastra tu audio o vídeo",
    color: "emerald",
  },
  subtitles: {
    allowed: VIDEO_EXTENSIONS,
    accept: VIDEO_ACCEPT,
    formats: ["MP4", "MOV", "MKV", "WEBM", "AVI"],
    dropIcon: <Captions className="w-7 h-7" />,
    label: "Arrastra tu vídeo para subtitular",
    color: "amber",
  },
  convert: {
    allowed: BOTH_EXTENSIONS,
    accept: BOTH_ACCEPT,
    formats: ["MP3", "WAV", "FLAC", "M4A", "OGG", "MP4"],
    dropIcon: <ArrowRightLeft className="w-7 h-7" />,
    label: "Arrastra el audio (o vídeo) a convertir",
    color: "rose",
  },
};

/** Color-keyed class lookups — Tailwind needs literal class names, not interpolated strings. */
const COLOR_CLASSES: Record<string, {
  border40: string; bg8: string; bg20: string; text400: string; bg500: string;
  text300_60: string; borderHover50: string; bgHover12: string; borderIdle12: string;
  bgIdleHover5: string; bgGlow: string; radial: string; pillBorder: string; pillText: string; pillBg: string;
}> = {
  violet: {
    border40: "border-violet-500/40", bg8: "bg-violet-500/8", bg20: "bg-violet-500/20",
    text400: "text-violet-400", bg500: "bg-violet-500", text300_60: "text-violet-300/60",
    borderHover50: "border-violet-400/50", bgHover12: "bg-violet-500/12",
    borderIdle12: "hover:border-violet-500/50", bgIdleHover5: "hover:bg-violet-500/5",
    bgGlow: "bg-violet-500", radial: "rgba(139,92,246,0.06)",
    pillBorder: "border-violet-500/25", pillText: "text-violet-300/60", pillBg: "bg-violet-500/8",
  },
  cyan: {
    border40: "border-cyan-500/40", bg8: "bg-cyan-500/8", bg20: "bg-cyan-500/20",
    text400: "text-cyan-400", bg500: "bg-cyan-500", text300_60: "text-cyan-300/60",
    borderHover50: "border-cyan-400/50", bgHover12: "bg-cyan-500/12",
    borderIdle12: "hover:border-cyan-500/50", bgIdleHover5: "hover:bg-cyan-500/5",
    bgGlow: "bg-cyan-500", radial: "rgba(34,211,238,0.06)",
    pillBorder: "border-cyan-500/25", pillText: "text-cyan-300/60", pillBg: "bg-cyan-500/8",
  },
  emerald: {
    border40: "border-emerald-500/40", bg8: "bg-emerald-500/8", bg20: "bg-emerald-500/20",
    text400: "text-emerald-400", bg500: "bg-emerald-500", text300_60: "text-emerald-300/60",
    borderHover50: "border-emerald-400/50", bgHover12: "bg-emerald-500/12",
    borderIdle12: "hover:border-emerald-500/50", bgIdleHover5: "hover:bg-emerald-500/5",
    bgGlow: "bg-emerald-500", radial: "rgba(52,211,153,0.06)",
    pillBorder: "border-emerald-500/25", pillText: "text-emerald-300/60", pillBg: "bg-emerald-500/8",
  },
  amber: {
    border40: "border-amber-500/40", bg8: "bg-amber-500/8", bg20: "bg-amber-500/20",
    text400: "text-amber-400", bg500: "bg-amber-500", text300_60: "text-amber-300/60",
    borderHover50: "border-amber-400/50", bgHover12: "bg-amber-500/12",
    borderIdle12: "hover:border-amber-500/50", bgIdleHover5: "hover:bg-amber-500/5",
    bgGlow: "bg-amber-500", radial: "rgba(251,191,36,0.08)",
    pillBorder: "border-amber-500/25", pillText: "text-amber-300/60", pillBg: "bg-amber-500/8",
  },
  rose: {
    border40: "border-rose-500/40", bg8: "bg-rose-500/8", bg20: "bg-rose-500/20",
    text400: "text-rose-400", bg500: "bg-rose-500", text300_60: "text-rose-300/60",
    borderHover50: "border-rose-400/50", bgHover12: "bg-rose-500/12",
    borderIdle12: "hover:border-rose-500/50", bgIdleHover5: "hover:bg-rose-500/5",
    bgGlow: "bg-rose-500", radial: "rgba(244,63,94,0.06)",
    pillBorder: "border-rose-500/25", pillText: "text-rose-300/60", pillBg: "bg-rose-500/8",
  },
};

export function UploadDropzone({ mode, file, onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheme = SCHEMES[mode];
  const c = COLOR_CLASSES[scheme.color];

  const validate = useCallback((f: File): string | null => {
    const ext = getExt(f.name);
    if (!scheme.allowed.has(ext))
      return `Tipo "${ext}" no soportado. Permitidos: ${[...scheme.allowed].join(", ")}`;
    const maxMb = parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? "500");
    if (f.size > maxMb * 1024 * 1024)
      return `Archivo demasiado grande. Máximo: ${maxMb} MB.`;
    return null;
  }, [scheme.allowed]);

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
      <div className={clsx("flex items-center gap-4 rounded-2xl border px-5 py-4 transition-all", c.border40, c.bg8)}>
        <div className="relative flex-shrink-0">
          <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center", c.bg20)}>
            {(mode === "music" || (mode === "speech" && isAudioFile))
              ? <FileAudio className={clsx("w-6 h-6", c.text400)} />
              : <FileVideo className={clsx("w-6 h-6", c.text400)} />
            }
          </div>
          <span className={clsx("absolute -bottom-1 -right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md text-white", c.bg500)}>
            {ext}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{file.name}</p>
          <p className={clsx("text-xs mt-0.5", c.text300_60)}>
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
  return (
    <div>
      <label
        className={clsx(
          "relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed",
          "px-8 py-14 cursor-pointer transition-all duration-300 overflow-hidden group",
          dragging
            ? clsx(c.borderHover50, c.bgHover12, "scale-[1.01]")
            : clsx("border-white/12", c.borderIdle12, c.bgIdleHover5)
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {/* Background radial on hover */}
        <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `radial-gradient(circle at 50% 50%, ${c.radial} 0%, transparent 70%)` }} />

        {/* Upload icon with glow */}
        <div className="relative">
          <div className={clsx("absolute inset-0 blur-xl opacity-0 group-hover:opacity-60 transition-opacity", c.bgGlow)} />
          <div className={clsx(
            "relative w-16 h-16 rounded-2xl flex items-center justify-center border transition-colors",
            dragging ? clsx(c.borderHover50, c.bgHover12) : "border-white/10 bg-white/5 group-hover:border-white/20"
          )}>
            {dragging
              ? <span className={c.text400}>{scheme.dropIcon}</span>
              : <Upload className="w-7 h-7 text-white/40 group-hover:text-white/70 transition-colors" />
            }
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-white font-semibold">
            {dragging ? "Suelta el archivo aquí" : scheme.label}
          </p>
          <p className="text-white/40 text-sm">o haz clic para explorar</p>
        </div>

        {/* Format pills */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {scheme.formats.map((f) => (
            <span key={f} className={clsx(
              "text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
              c.pillBorder, c.pillText, c.pillBg
            )}>
              {f}
            </span>
          ))}
        </div>

        <input type="file" accept={scheme.accept} className="hidden" onChange={onInput} />
      </label>
      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2.5">
          <span>⚠</span> {error}
        </div>
      )}
    </div>
  );
}
