"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ModeSelector } from "@/components/ModeSelector";
import { UploadDropzone } from "@/components/UploadDropzone";
import { MusicSeparationOptions } from "@/components/MusicSeparationOptions";
import { VideoSeparationOptions } from "@/components/VideoSeparationOptions";
import { ProcessingProgress } from "@/components/ProcessingProgress";
import { DownloadSection } from "@/components/DownloadSection";
import { ErrorMessage } from "@/components/ErrorMessage";
import { LegalNotice } from "@/components/LegalNotice";
import { BackendStatusBanner } from "@/components/BackendStatusBanner";
import { submitMusicJob, submitVideoJob, fetchJob, deleteJob } from "@/lib/api";
import { useBackendStatus } from "@/lib/useBackendStatus";
import type { AppMode, MusicMode, Job, VideoOptions } from "@/types";

const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  extract_full_audio: true,
  remove_audio_track: false,
  separate_voice_music: false,
  separate_music_stems: false,
};

type UIState = "idle" | "uploading" | "processing" | "completed" | "failed";

export default function HomePage() {
  const [appMode, setAppMode] = useState<AppMode | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [musicMode, setMusicMode] = useState<MusicMode>("2stem");
  const [videoOptions, setVideoOptions] = useState<VideoOptions>(DEFAULT_VIDEO_OPTIONS);
  const [uiState, setUiState] = useState<UIState>("idle");
  const [job, setJob] = useState<Job | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const backendStatus = useBackendStatus();

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
          // ignore transient network errors during polling
        }
      }, 1500);
    },
    [stopPolling]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Derived backend capabilities
  const backendReachable = backendStatus.state !== "unreachable" && backendStatus.state !== "checking";
  const ffmpegOk = backendStatus.state === "ok" || (backendStatus.state === "partial" && backendStatus.ffmpeg);
  const demucsOk  = backendStatus.state === "ok" || (backendStatus.state === "partial" && backendStatus.demucs);

  // Does the current selection need Demucs?
  const needsDemucs =
    appMode === "music" ||
    (appMode === "video" && (videoOptions.separate_voice_music || videoOptions.separate_music_stems));

  const canSubmit =
    file !== null &&
    appMode !== null &&
    uiState === "idle" &&
    backendReachable &&
    ffmpegOk &&
    (appMode === "music" || Object.values(videoOptions).some(Boolean)) &&
    (!needsDemucs || demucsOk);

  const handleSubmit = async () => {
    if (!file || !appMode) return;
    setSubmitError(null);
    setUiState("uploading");
    setJob(null);

    try {
      let result: { job_id: string };
      if (appMode === "music") {
        result = await submitMusicJob(file, musicMode);
      } else {
        result = await submitVideoJob(file, videoOptions);
      }

      const initial: Job = {
        job_id: result.job_id,
        status: "queued",
        progress: 0,
        stage: "Queued",
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

  // Full reset → clears everything, back to start
  const handleReset = useCallback(async () => {
    stopPolling();
    if (job?.job_id) deleteJob(job.job_id).catch(() => {});
    setUiState("idle");
    setJob(null);
    setFile(null);
    setSubmitError(null);
  }, [job, stopPolling]);

  // Soft retry → keeps file + mode, just goes back to idle so user can fix & resubmit
  const handleRetry = useCallback(() => {
    stopPolling();
    if (job?.job_id) deleteJob(job.job_id).catch(() => {});
    setUiState("idle");
    setJob(null);
    setSubmitError(null);
    // file, appMode, musicMode, videoOptions are preserved
  }, [job, stopPolling]);

  const handleModeChange = (mode: AppMode) => {
    setAppMode(mode);
    setFile(null);
    setSubmitError(null);
  };

  const showProgress = (uiState === "uploading" || uiState === "processing") && job;
  const showCompleted = uiState === "completed" && job;
  const showFailed = uiState === "failed";

  return (
    <div className="flex flex-col min-h-screen relative overflow-x-hidden">

      {/* ── Animated background orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="orb-1 absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }} />
        <div className="orb-2 absolute top-1/2 -right-48 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }} />
        <div className="orb-3 absolute -bottom-40 left-1/3 w-[450px] h-[450px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, #ec4899 0%, transparent 70%)" }} />
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }} />
      </div>

      <AppHeader />

      <main className="relative flex-1 max-w-2xl mx-auto w-full px-4 py-10 space-y-8">

        {/* Hero */}
        <div className="text-center space-y-4 pt-4">
          {/* Status pill */}
          <div className="inline-flex items-center gap-2 text-[11px] font-medium text-violet-300/70
            border border-violet-500/20 bg-violet-500/8 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Powered by Demucs · FFmpeg
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            Separa Música, Voces,{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
              Instrumentos
            </span>
            <br />y Audio de Vídeos
          </h1>
          <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
            Sube tus propios archivos de audio o vídeo y descarga cada pista por separado.
          </p>
        </div>

        {/* Backend status */}
        <BackendStatusBanner />

        {/* Mode selector */}
        {uiState === "idle" && (
          <ModeSelector selected={appMode} onChange={handleModeChange} />
        )}

        {/* Upload + options */}
        {appMode && uiState === "idle" && (
          <div className="space-y-5">
            {/* Upload step label */}
            <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
              Step 2 — Sube tu archivo
            </p>
            <UploadDropzone mode={appMode} file={file} onFile={setFile} />

            {file && (
              <>
                {appMode === "music" ? (
                  <MusicSeparationOptions selected={musicMode} onChange={setMusicMode} />
                ) : (
                  <VideoSeparationOptions options={videoOptions} onChange={setVideoOptions} />
                )}

                {/* Submit button */}
                <div className="pt-1 space-y-2">
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className={`relative w-full py-4 rounded-2xl font-bold text-white text-sm transition-all duration-200
                      focus:outline-none focus:ring-2 focus:ring-violet-500/50
                      disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
                      ${canSubmit ? "btn-glow hover:scale-[1.02] active:scale-[0.99]" : ""}
                    `}
                    style={{
                      background: canSubmit
                        ? "linear-gradient(135deg, #7c3aed, #a855f7, #ec4899)"
                        : "rgba(255,255,255,0.06)",
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <span>✨</span>
                      Separar Audio
                    </span>
                    {canSubmit && (
                      <div className="absolute inset-0 rounded-2xl overflow-hidden">
                        <div className="shimmer w-full h-full" />
                      </div>
                    )}
                  </button>

                  {/* Why disabled hints */}
                  {!backendReachable && (
                    <p className="text-center text-red-400/70 text-[11px] flex items-center justify-center gap-1">
                      <span>🔌</span> El servidor backend no está corriendo
                    </p>
                  )}
                  {backendReachable && needsDemucs && !demucsOk && (
                    <p className="text-center text-violet-400/70 text-[11px] flex items-center justify-center gap-1">
                      <span>🤖</span> Esta opción requiere Demucs — instala Python + pip install demucs
                    </p>
                  )}
                  {canSubmit && (
                    <p className="text-center text-white/25 text-[11px]">
                      Solo procesa archivos que poseas o tengas permiso de usar.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Upload placeholder */}
        {uiState === "uploading" && !job && (
          <div className="rounded-2xl border border-white/10 p-6 flex items-center gap-3"
            style={{ background: "rgba(15,12,30,0.6)" }}>
            <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="text-white/80 text-sm font-medium">Subiendo archivo…</p>
              <p className="text-white/30 text-xs">Esto puede tardar un momento</p>
            </div>
          </div>
        )}

        {/* Processing */}
        {showProgress && <ProcessingProgress job={job} />}

        {/* Results */}
        {showCompleted && job && (
          <DownloadSection job={job} onReset={handleReset} />
        )}

        {/* Error */}
        {showFailed && !showProgress && (
          <ErrorMessage
            message={submitError ?? job?.error ?? "Ha ocurrido un error desconocido."}
            onRetry={handleRetry}
            onReset={handleReset}
          />
        )}

        {/* Legal */}
        <LegalNotice />
      </main>

      <footer className="relative border-t border-white/5 py-5 text-center text-white/15 text-[11px]">
        Stemify · Separación de pistas con IA · Demucs + FFmpeg
      </footer>
    </div>
  );
}
