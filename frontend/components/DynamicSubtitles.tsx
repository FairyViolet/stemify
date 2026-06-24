"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RotateCcw, Captions, Check, Sparkles, Wand2, Monitor, Smartphone, PenLine, Zap } from "lucide-react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ProcessingProgress } from "@/components/ProcessingProgress";
import { ErrorMessage } from "@/components/ErrorMessage";
import { WordEmphasisEditor } from "@/components/WordEmphasisEditor";
import {
  submitSubtitlesJob,
  submitTranscribeOnlyJob,
  submitRenderJob,
  fetchJob,
  deleteJob,
  getDownloadUrl,
} from "@/lib/api";
import type { Job, SubtitleStyle, SubtitleOrientation, SubtitleSegment } from "@/types";
import { clsx } from "@/lib/utils";

type SubsUIState = "idle" | "uploading" | "processing" | "editing" | "completed" | "failed";
type PendingAction = "full" | "transcribe" | "render";

interface StylePreset {
  value: SubtitleStyle;
  label: string;
  description: string;
  preview: { active: string; rest: string[] };
}

const STYLE_PRESETS: StylePreset[] = [
  {
    value: "pop",
    label: "Pop (TikTok)",
    description: "Texto grande, palabra activa en amarillo con efecto de rebote.",
    preview: { active: "IS", rest: ["this", "so", "cool"] },
  },
  {
    value: "clean",
    label: "Clean",
    description: "Más sutil — palabra activa resaltada en celeste, sin animación.",
    preview: { active: "is", rest: ["this", "so", "cool"] },
  },
  {
    value: "classic",
    label: "Clásico",
    description: "Subtítulo blanco tradicional por frase, sin resaltado de palabra.",
    preview: { active: "", rest: ["this is so cool"] },
  },
];

interface OrientationOption {
  value: SubtitleOrientation;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const ORIENTATION_OPTIONS: OrientationOption[] = [
  {
    value: "auto",
    label: "Auto-detectar",
    description: "Lee el video y se adapta solo",
    icon: <Wand2 className="w-4 h-4" />,
  },
  {
    value: "horizontal",
    label: "Horizontal",
    description: "16:9 — YouTube, TV",
    icon: <Monitor className="w-4 h-4" />,
  },
  {
    value: "vertical",
    label: "Vertical",
    description: "9:16 — TikTok, Reels",
    icon: <Smartphone className="w-4 h-4" />,
  },
];

interface Props {
  onReset: () => void;
}

export function DynamicSubtitles({ onReset }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<SubtitleStyle>("pop");
  const [orientation, setOrientation] = useState<SubtitleOrientation>("auto");
  const [uiState, setUiState] = useState<SubsUIState>("idle");
  const [job, setJob] = useState<Job | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [segments, setSegments] = useState<SubtitleSegment[] | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentJobRef = useRef<string | null>(null);
  const pendingActionRef = useRef<PendingAction>("full");

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      currentJobRef.current = jobId;
      pollRef.current = setInterval(async () => {
        if (currentJobRef.current !== jobId) return;
        try {
          const updated = await fetchJob(jobId);
          setJob(updated);
          if (updated.status === "completed") {
            stopPolling();
            if (pendingActionRef.current === "transcribe") {
              setSegments(updated.segments ?? []);
              setUiState("editing");
            } else {
              setUiState("completed");
            }
          } else if (updated.status === "failed") {
            stopPolling();
            setUiState("failed");
          }
        } catch {
          // ignore transient errors
        }
      }, 1500);
    },
    [stopPolling]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ── Fast path: transcribe + burn in one shot ────────────────────────────
  const handleSubmitFast = async () => {
    if (!file) return;
    pendingActionRef.current = "full";
    setSubmitError(null);
    setUiState("uploading");
    setJob(null);

    try {
      const result = await submitSubtitlesJob(file, style, orientation);
      setJob({ job_id: result.job_id, status: "queued", progress: 0, stage: "En cola...", error: null, files: [] });
      setUiState("processing");
      startPolling(result.job_id);
    } catch (err) {
      setSubmitError((err as Error).message);
      setUiState("failed");
    }
  };

  // ── Custom path step 1: transcribe only, then show the word editor ──────
  const handleStartCustomize = async () => {
    if (!file) return;
    pendingActionRef.current = "transcribe";
    setSubmitError(null);
    setUiState("uploading");
    setJob(null);

    try {
      const result = await submitTranscribeOnlyJob(file);
      setJob({ job_id: result.job_id, status: "queued", progress: 0, stage: "En cola...", error: null, files: [] });
      setUiState("processing");
      startPolling(result.job_id);
    } catch (err) {
      setSubmitError((err as Error).message);
      setUiState("failed");
    }
  };

  // ── Custom path step 2: burn the (edited) segments into the video ───────
  const handleRenderEdited = async () => {
    if (!job || !segments) return;
    pendingActionRef.current = "render";
    setSubmitError(null);
    setUiState("processing");

    try {
      const result = await submitRenderJob(job.job_id, style, orientation, segments);
      setJob({ job_id: result.job_id, status: "queued", progress: 0, stage: "En cola...", error: null, files: [] });
      startPolling(result.job_id);
    } catch (err) {
      setSubmitError((err as Error).message);
      setUiState("failed");
    }
  };

  const handleRetry = useCallback(() => {
    stopPolling();
    if (job?.job_id) deleteJob(job.job_id).catch(() => {});
    setUiState("idle");
    setJob(null);
    setSegments(null);
    setSubmitError(null);
  }, [job, stopPolling]);

  const handleFullReset = useCallback(() => {
    stopPolling();
    if (job?.job_id) deleteJob(job.job_id).catch(() => {});
    onReset();
  }, [job, stopPolling, onReset]);

  const showProgress = (uiState === "uploading" || uiState === "processing") && job;
  const showEditing = uiState === "editing" && segments;
  const showCompleted = uiState === "completed" && job;
  const showFailed = uiState === "failed";

  // ── Completed state ─────────────────────────────────────────────────────
  if (showCompleted && job) {
    const videoFile = job.files[0];
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-5 py-4">
          <Check className="w-5 h-5 text-emerald-400" />
          <div className="flex-1">
            <p className="text-emerald-300 font-semibold">¡Video subtitulado listo!</p>
            <p className="text-emerald-400/50 text-xs mt-0.5">
              Subtítulos {STYLE_PRESETS.find((s) => s.value === style)?.label} quemados directamente en el video
            </p>
          </div>
          <Sparkles className="w-4 h-4 text-emerald-400/50" />
        </div>

        {videoFile && (
          <a
            href={getDownloadUrl(job.job_id, videoFile.filename)}
            download={videoFile.filename}
            className="flex items-center justify-center gap-2 w-full rounded-xl py-3.5 px-4
              bg-amber-500/15 border border-amber-500/30 text-amber-300
              hover:bg-amber-500/25 hover:border-amber-500/50 transition-all text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            Descargar {videoFile.filename}
          </a>
        )}

        <button
          onClick={handleRetry}
          className="w-full py-3 rounded-xl border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition-all text-sm"
        >
          Subtitular otro video
        </button>
      </div>
    );
  }

  // ── Uploading placeholder ────────────────────────────────────────────────
  if (uiState === "uploading" && !job) {
    return (
      <div className="rounded-2xl border border-white/10 p-6 flex items-center gap-3"
        style={{ background: "rgba(15,12,30,0.6)" }}>
        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <div>
          <p className="text-white/80 text-sm font-medium">Subiendo video…</p>
          <p className="text-white/30 text-xs">Esto puede tardar un momento</p>
        </div>
      </div>
    );
  }

  // ── Processing progress (transcribing / rendering / full pipeline) ───────
  if (showProgress) {
    return <ProcessingProgress job={job} />;
  }

  // ── Word emphasis editor ─────────────────────────────────────────────────
  if (showEditing && segments) {
    return (
      <div className="space-y-5">
        <WordEmphasisEditor segments={segments} onChange={setSegments} />
        <div className="pt-1 space-y-2">
          <button
            onClick={handleRenderEdited}
            className="relative w-full py-4 rounded-2xl font-bold text-white text-sm transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-amber-500/50
              btn-glow hover:scale-[1.02] active:scale-[0.99]"
            style={{ background: "linear-gradient(135deg, #d97706, #f59e0b, #fbbf24)" }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Captions className="w-4 h-4" />
              Generar Video con Subtítulos
            </span>
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              <div className="shimmer w-full h-full" />
            </div>
          </button>
          <button
            onClick={handleRetry}
            className="w-full py-2.5 rounded-xl text-white/40 hover:text-white/70 transition-colors text-xs"
          >
            Empezar de nuevo
          </button>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (showFailed) {
    return (
      <ErrorMessage
        message={submitError ?? job?.error ?? "Ha ocurrido un error al generar los subtítulos."}
        onRetry={handleRetry}
        onReset={handleFullReset}
      />
    );
  }

  // ── Idle state ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
        Step 2 — Sube tu video
      </p>

      <UploadDropzone mode="subtitles" file={file} onFile={setFile} />

      {file && (
        <>
          {/* Style picker */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
              Step 3 — Elige el estilo
            </p>
            <div className="grid gap-3">
              {STYLE_PRESETS.map((preset) => {
                const active = style === preset.value;
                return (
                  <button
                    key={preset.value}
                    onClick={() => setStyle(preset.value)}
                    className={clsx(
                      "text-left rounded-2xl border p-4 transition-all duration-200",
                      active
                        ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/20"
                        : "border-white/10 bg-white/3 hover:border-amber-500/30 hover:bg-amber-500/5"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-semibold text-sm">{preset.label}</span>
                      {active && (
                        <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    <p className="text-white/40 text-xs mb-3">{preset.description}</p>

                    {/* Mini preview */}
                    <div className="rounded-lg bg-black/40 px-4 py-3 flex items-center justify-center gap-1.5">
                      {preset.preview.rest.map((w, i) => (
                        <span key={i} className="text-white/70 text-xs font-bold">{w}</span>
                      ))}
                      {preset.preview.active && (
                        <span className={clsx(
                          "text-sm font-extrabold",
                          preset.value === "pop" ? "text-amber-400 scale-110" : "text-cyan-300"
                        )}>
                          {preset.preview.active}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Orientation picker */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
              Step 4 — Orientación del video
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ORIENTATION_OPTIONS.map((opt) => {
                const active = orientation === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setOrientation(opt.value)}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all duration-200",
                      active
                        ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/20"
                        : "border-white/10 bg-white/3 hover:border-amber-500/30 hover:bg-amber-500/5"
                    )}
                  >
                    <span className={active ? "text-amber-400" : "text-white/40"}>{opt.icon}</span>
                    <span className={clsx("text-xs font-semibold", active ? "text-white" : "text-white/60")}>
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-white/30 text-center leading-tight">{opt.description}</span>
                  </button>
                );
              })}
            </div>
            {orientation === "auto" && (
              <p className="text-[11px] text-white/25 flex items-center gap-1">
                <span>ℹ</span>
                Detecta automáticamente si tu video es horizontal o vertical y ajusta tamaño de texto y posición.
              </p>
            )}
          </div>

          {/* Action choice: fast vs. customize */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
              Step 5 — ¿Cómo querés generarlo?
            </p>

            <button
              onClick={handleSubmitFast}
              className="relative w-full py-4 rounded-2xl font-bold text-white text-sm transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-amber-500/50
                btn-glow hover:scale-[1.02] active:scale-[0.99]"
              style={{ background: "linear-gradient(135deg, #d97706, #f59e0b, #fbbf24)" }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" />
                Generar directamente
              </span>
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
                <div className="shimmer w-full h-full" />
              </div>
            </button>

            <button
              onClick={handleStartCustomize}
              className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200
                border border-amber-500/30 text-amber-300 bg-amber-500/8
                hover:bg-amber-500/15 hover:border-amber-500/50"
            >
              <span className="flex items-center justify-center gap-2">
                <PenLine className="w-4 h-4" />
                Revisar y destacar palabras clave
              </span>
            </button>

            <p className="text-center text-white/20 text-[11px]">
              El modelo Whisper large-v2 se descargará en el primer uso (~3 GB). Quemar subtítulos requiere re-codificar el video.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
