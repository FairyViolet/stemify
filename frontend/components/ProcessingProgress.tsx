"use client";

import { Loader2, AlertCircle, Check, Clock, Cpu, Download, FileAudio } from "lucide-react";
import type { Job } from "@/types";
import { clsx } from "@/lib/utils";

interface Props {
  job: Job;
}

const STEPS = [
  { key: "upload",    label: "Carga",          icon: FileAudio },
  { key: "prepare",   label: "Preparación",    icon: Clock },
  { key: "ai",        label: "IA Separation",  icon: Cpu },
  { key: "export",    label: "Exportación",    icon: Download },
];

function getStepIndex(stage: string): number {
  const s = stage.toLowerCase();
  if (s.includes("upload") || s.includes("starting") || s.includes("queued") || s.includes("preparing")) return 0;
  if (s.includes("validat") || s.includes("extract")) return 1;
  if (s.includes("ai") || s.includes("separat") || s.includes("running") || s.includes("voice")) return 2;
  if (s.includes("export") || s.includes("completed")) return 3;
  return 0;
}

/* Animated waveform while AI is working */
function WaveformAnim() {
  const heights = [40, 70, 55, 90, 60, 80, 45, 75, 50, 85, 65, 95, 50, 70, 40];
  return (
    <div className="flex items-end gap-[3px] h-8">
      {heights.map((h, i) => (
        <div
          key={i}
          className="wave-bar w-1 rounded-full bg-gradient-to-t from-violet-500 to-fuchsia-400"
          style={{
            height: `${h}%`,
            "--dur": `${0.5 + (i % 5) * 0.15}s`,
            animationDelay: `${i * 0.06}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function ProcessingProgress({ job }: Props) {
  const isFailed = job.status === "failed";
  const stepIdx = getStepIndex(job.stage);
  const isAI = stepIdx === 2;

  if (isFailed) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-5 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-red-300 font-semibold text-sm">Falló el procesamiento</p>
          {job.error && <p className="text-red-400/70 text-xs mt-1">{job.error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden"
      style={{ background: "rgba(15,12,30,0.7)", backdropFilter: "blur(12px)" }}>

      {/* Shimmer overlay */}
      <div className="shimmer absolute inset-0 pointer-events-none rounded-2xl" />

      <div className="relative p-5 space-y-5">
        {/* Steps row */}
        <div className="flex items-center gap-0">
          {STEPS.map((step, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                {/* Circle */}
                <div className="flex flex-col items-center gap-1">
                  <div className={clsx(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                    done
                      ? "bg-violet-500 border-violet-500"
                      : active
                        ? "border-violet-400 bg-violet-500/20 animate-pulse"
                        : "border-white/15 bg-white/5"
                  )}>
                    {done
                      ? <Check className="w-4 h-4 text-white" />
                      : active
                        ? <Loader2 className="w-3.5 h-3.5 text-violet-300 animate-spin" />
                        : <Icon className="w-3.5 h-3.5 text-white/20" />
                    }
                  </div>
                  <span className={clsx(
                    "text-[10px] font-medium whitespace-nowrap",
                    done ? "text-violet-300" : active ? "text-white" : "text-white/25"
                  )}>
                    {step.label}
                  </span>
                </div>
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 mx-2 rounded-full overflow-hidden bg-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700"
                      style={{ width: done ? "100%" : active ? "50%" : "0%" }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Current stage label */}
        <div className="flex items-center justify-between">
          <p className="text-white/80 text-sm font-medium">{job.stage}</p>
          <span className="text-violet-300 font-bold text-sm tabular-nums">{job.progress}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${job.progress}%`,
              background: "linear-gradient(90deg, #7c3aed, #a855f7, #ec4899)",
              boxShadow: "0 0 12px rgba(139,92,246,0.6)",
            }}
          />
        </div>

        {/* AI waveform animation when separating */}
        {isAI && (
          <div className="flex items-center gap-3 pt-1">
            <WaveformAnim />
            <p className="text-xs text-violet-300/60">
              La IA está analizando y separando las pistas de audio…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
