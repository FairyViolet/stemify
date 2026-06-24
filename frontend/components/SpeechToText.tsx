"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Globe, RotateCcw, Mic } from "lucide-react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { ProcessingProgress } from "@/components/ProcessingProgress";
import { ErrorMessage } from "@/components/ErrorMessage";
import { submitTranscriptionJob, fetchJob, deleteJob, getDownloadUrl } from "@/lib/api";
import type { Job } from "@/types";
import { clsx } from "@/lib/utils";

type SpeechUIState = "idle" | "uploading" | "processing" | "completed" | "failed";
type TargetLanguage = "original" | "en" | "es" | "pt" | "fr";

const LANGUAGE_OPTIONS: { value: TargetLanguage; label: string; flag: string }[] = [
  { value: "original", label: "Original", flag: "🔤" },
  { value: "en", label: "Inglés", flag: "🇬🇧" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "pt", label: "Portugués", flag: "🇧🇷" },
  { value: "fr", label: "Francés", flag: "🇫🇷" },
];

const LANGUAGE_NAMES: Record<string, string> = {
  en: "Inglés", es: "Español", pt: "Portugués", fr: "Francés",
  de: "Alemán", it: "Italiano", ja: "Japonés", zh: "Chino",
  ko: "Coreano", ru: "Ruso", ar: "Árabe", hi: "Hindi",
};

function languageLabel(code: string) {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

interface Props {
  onReset: () => void;
}

export function SpeechToText({ onReset }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("original");
  const [uiState, setUiState] = useState<SpeechUIState>("idle");
  const [job, setJob] = useState<Job | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentJobRef = useRef<string | null>(null);

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
            setUiState("completed");
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

  const handleTranscribe = async () => {
    if (!file) return;
    setSubmitError(null);
    setUiState("uploading");
    setJob(null);

    try {
      const result = await submitTranscriptionJob(file, targetLanguage);
      const initial: Job = {
        job_id: result.job_id,
        status: "queued",
        progress: 0,
        stage: "En cola...",
        error: null,
        files: [],
      };
      setJob(initial);
      setUiState("processing");
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
    setSubmitError(null);
  }, [job, stopPolling]);

  const handleFullReset = useCallback(() => {
    stopPolling();
    if (job?.job_id) deleteJob(job.job_id).catch(() => {});
    onReset();
  }, [job, stopPolling, onReset]);

  const showProgress = (uiState === "uploading" || uiState === "processing") && job;
  const showCompleted = uiState === "completed" && job;
  const showFailed = uiState === "failed";

  // ── Completed state ─────────────────────────────────────────────────────
  if (showCompleted && job) {
    const txtFile = job.files.find((f) => f.filename === "transcript.txt");
    const srtFile = job.files.find((f) => f.filename === "transcript.srt");

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Mic className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-white font-semibold text-sm">Transcripción completada</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 font-medium">
              ✓ Listo
            </span>
          </div>
          <button
            onClick={handleFullReset}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Nuevo
          </button>
        </div>

        {/* Download buttons */}
        <div className="grid grid-cols-2 gap-3">
          {txtFile && (
            <a
              href={getDownloadUrl(job.job_id, txtFile.filename)}
              download={txtFile.filename}
              className={clsx(
                "flex items-center justify-center gap-2 rounded-xl py-3 px-4",
                "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300",
                "hover:bg-emerald-500/25 hover:border-emerald-500/50 transition-all text-sm font-medium"
              )}
            >
              <Download className="w-4 h-4" />
              Descargar .txt
            </a>
          )}
          {srtFile && (
            <a
              href={getDownloadUrl(job.job_id, srtFile.filename)}
              download={srtFile.filename}
              className={clsx(
                "flex items-center justify-center gap-2 rounded-xl py-3 px-4",
                "bg-teal-500/15 border border-teal-500/30 text-teal-300",
                "hover:bg-teal-500/25 hover:border-teal-500/50 transition-all text-sm font-medium"
              )}
            >
              <Download className="w-4 h-4" />
              Descargar .srt
            </a>
          )}
        </div>

        {/* Another file button */}
        <button
          onClick={handleRetry}
          className="w-full py-3 rounded-xl border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition-all text-sm"
        >
          Transcribir otro archivo
        </button>
      </div>
    );
  }

  // ── Uploading placeholder ────────────────────────────────────────────────
  if (uiState === "uploading" && !job) {
    return (
      <div className="rounded-2xl border border-white/10 p-6 flex items-center gap-3"
        style={{ background: "rgba(15,12,30,0.6)" }}>
        <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <div>
          <p className="text-white/80 text-sm font-medium">Subiendo archivo…</p>
          <p className="text-white/30 text-xs">Esto puede tardar un momento</p>
        </div>
      </div>
    );
  }

  // ── Processing progress ──────────────────────────────────────────────────
  if (showProgress) {
    return <ProcessingProgress job={job} />;
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (showFailed) {
    return (
      <ErrorMessage
        message={submitError ?? job?.error ?? "Ha ocurrido un error durante la transcripción."}
        onRetry={handleRetry}
        onReset={handleFullReset}
      />
    );
  }

  // ── Idle state ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Step label */}
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
        Step 2 — Sube tu archivo
      </p>

      <UploadDropzone mode="speech" file={file} onFile={setFile} />

      {file && (
        <>
          {/* Language selector */}
          <div className="rounded-2xl border border-white/8 p-5 space-y-3"
            style={{ background: "rgba(10,10,20,0.5)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-emerald-400/70" />
              <span className="text-[11px] uppercase tracking-[0.12em] text-white/30 font-semibold">
                Idioma de salida
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTargetLanguage(opt.value)}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all",
                    targetLanguage === opt.value
                      ? "bg-emerald-500/25 border border-emerald-500/60 text-emerald-200"
                      : "bg-white/5 border border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
                  )}
                >
                  <span>{opt.flag}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            {targetLanguage !== "original" && targetLanguage !== "en" && (
              <p className="text-[11px] text-white/25 flex items-center gap-1">
                <span>ℹ</span>
                Traducción con Argos Translate — requiere modelos de idioma instalados.
              </p>
            )}
            {targetLanguage === "en" && (
              <p className="text-[11px] text-emerald-400/50 flex items-center gap-1">
                <span>⚡</span>
                Traducción nativa de Whisper — alta precisión.
              </p>
            )}
          </div>

          {/* Transcribe button */}
          <div className="pt-1 space-y-2">
            <button
              onClick={handleTranscribe}
              className="relative w-full py-4 rounded-2xl font-bold text-white text-sm transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-emerald-500/50
                btn-glow hover:scale-[1.02] active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, #059669, #10b981, #14b8a6)",
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Mic className="w-4 h-4" />
                Transcribir Audio
              </span>
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
                <div className="shimmer w-full h-full" />
              </div>
            </button>
            <p className="text-center text-white/20 text-[11px]">
              El modelo Whisper large-v2 se descargará en el primer uso (~3 GB).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
