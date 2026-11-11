"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Captions, Check, Sparkles, Monitor, Smartphone, PenLine, Zap, Shield, SlidersHorizontal } from "lucide-react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ProcessingProgress } from "@/components/ProcessingProgress";
import { ErrorMessage } from "@/components/ErrorMessage";
import { WordEmphasisEditor } from "@/components/WordEmphasisEditor";
import { SubtitlePreview } from "@/components/SubtitlePreview";
import { SubtitleDesigner } from "@/components/SubtitleDesigner";
import {
  submitSubtitlesJob,
  submitTranscribeOnlyJob,
  submitRenderJob,
  fetchJob,
  deleteJob,
  getDownloadUrl,
} from "@/lib/api";
import { presetConfig, PRESET_META } from "@/lib/subtitlePresets";
import type { Job, SubtitleConfig, SubtitleSegment } from "@/types";
import { clsx } from "@/lib/utils";

type SubsUIState = "idle" | "uploading" | "processing" | "editing" | "completed" | "failed";
type PendingAction = "full" | "transcribe" | "render";

const DESIGN_KEY = "stemify.subtitleDesign";

function loadSavedDesign(): SubtitleConfig | null {
  try {
    const raw = localStorage.getItem(DESIGN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Merge over a fresh preset so designs saved by older versions stay valid
    return saved?.preset ? { ...presetConfig(saved.preset, "vertical"), ...saved } : null;
  } catch {
    return null;
  }
}

interface Props {
  onReset: () => void;
}

export function DynamicSubtitles({ onReset }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<SubtitleConfig>(() => presetConfig("pop", "vertical"));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  // Browsers can't read every format (e.g. some .avi/.mkv): then the user picks
  const [probeFailed, setProbeFailed] = useState(false);
  const [manualOrientation, setManualOrientation] = useState<"vertical" | "horizontal">("vertical");
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [showDesigner, setShowDesigner] = useState(false);
  const designTouched = useRef(false);
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

  // Restore the last design used in this browser
  useEffect(() => {
    const saved = loadSavedDesign();
    if (saved) {
      setConfig(saved);
      designTouched.current = true;
    }
  }, []);

  const updateConfig = useCallback((next: SubtitleConfig) => {
    designTouched.current = true;
    setConfig(next);
    try { localStorage.setItem(DESIGN_KEY, JSON.stringify(next)); } catch {}
  }, []);

  // Local preview URL of the chosen video + its real size (vertical/horizontal)
  useEffect(() => {
    setDims(null);
    setProbeFailed(false);
    if (!file) { setVideoUrl(null); return; }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (probe.videoWidth && probe.videoHeight) setDims({ w: probe.videoWidth, h: probe.videoHeight });
      else setProbeFailed(true);
    };
    probe.onerror = () => setProbeFailed(true);
    const timer = setTimeout(() => setProbeFailed(true), 4000);
    probe.addEventListener("loadedmetadata", () => clearTimeout(timer));
    probe.src = url;
    return () => { clearTimeout(timer); probe.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [file]);

  const orientation: "vertical" | "horizontal" = dims
    ? (dims.w > dims.h ? "horizontal" : "vertical")
    : manualOrientation;
  const aspect = dims ? dims.w / dims.h : orientation === "vertical" ? 9 / 16 : 16 / 9;

  // When the orientation becomes known, adapt the untouched default design to it
  useEffect(() => {
    if (!designTouched.current) setConfig((c) => presetConfig(c.preset, orientation));
  }, [orientation]);

  // ── Fast path: transcribe + burn in one shot ────────────────────────────
  const handleSubmitFast = async () => {
    if (!file) return;
    pendingActionRef.current = "full";
    setSubmitError(null);
    setUiState("uploading");
    setJob(null);

    try {
      const result = await submitSubtitlesJob(file, config.preset, "auto", config);
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
      const result = await submitRenderJob(job.job_id, config.preset, "auto", segments, config);
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
              Estilo {PRESET_META.find((p) => p.id === config.preset)?.label} quemado directamente en el video
            </p>
          </div>
          <Sparkles className="w-4 h-4 text-emerald-400/50" />
        </div>

        {videoFile && (
          <video
            src={getDownloadUrl(job.job_id, videoFile.filename)}
            controls
            playsInline
            className="mx-auto rounded-xl border border-white/10 bg-black"
            style={orientation === "vertical" ? { maxHeight: 520 } : { width: "100%" }}
          />
        )}

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
        <SubtitlePreview
          config={config}
          aspect={aspect}
          videoUrl={videoUrl}
          segments={segments}
          showSafeZone={showSafeZone}
        />
        <button
          type="button"
          onClick={() => setShowDesigner((v) => !v)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white/90 hover:border-amber-500/30 transition-all text-xs"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {showDesigner ? "Ocultar ajustes de diseño" : "Ajustar diseño (posición, colores, animaciones…)"}
        </button>
        {showDesigner && <SubtitleDesigner config={config} onChange={updateConfig} orientation={orientation} />}
        <WordEmphasisEditor segments={segments} onChange={setSegments} defaultAnimation={config.wordAnimation} />
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
          {/* Design: live preview + controls */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
                Step 3 — Diseña tus subtítulos
              </p>
              {probeFailed && !dims ? (
                <span className="flex items-center gap-1.5 text-[11px] text-white/50">
                  Tu video es:
                  {(["vertical", "horizontal"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setManualOrientation(o)}
                      className={clsx(
                        "flex items-center gap-1 rounded-full border px-2.5 py-0.5 transition-colors",
                        manualOrientation === o
                          ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                          : "border-white/15 text-white/50 hover:text-white/80"
                      )}
                    >
                      {o === "vertical" ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                      {o === "vertical" ? "Vertical" : "Horizontal"}
                    </button>
                  ))}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] text-amber-300/80 border border-amber-500/25 bg-amber-500/8 rounded-full px-2.5 py-0.5">
                  {orientation === "vertical" ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                  {dims ? `Video ${orientation} · ${dims.w}×${dims.h}` : "Detectando formato del video…"}
                </span>
              )}
            </div>

            <div className={clsx(
              "gap-4",
              orientation === "vertical" ? "grid sm:grid-cols-[auto_1fr] items-start" : "space-y-4"
            )}>
              <div className={clsx(orientation === "vertical" && "sm:sticky sm:top-4")}>
                <SubtitlePreview
                  config={config}
                  aspect={aspect}
                  videoUrl={videoUrl}
                  showSafeZone={showSafeZone}
                  maxHeight={orientation === "vertical" ? 460 : 380}
                />
                {orientation === "vertical" && (
                  <label className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-white/45 cursor-pointer">
                    <input type="checkbox" checked={showSafeZone} onChange={(e) => setShowSafeZone(e.target.checked)} className="accent-amber-500" />
                    <Shield className="w-3 h-3" /> Mostrar zona de botones de TikTok / Reels
                  </label>
                )}
              </div>
              <SubtitleDesigner config={config} onChange={updateConfig} orientation={orientation} />
            </div>
          </div>

          {/* Action choice: fast vs. customize */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
              Step 4 — ¿Cómo querés generarlo?
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
