"use client";

import { CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import type { Job } from "@/types";
import { StemResultCard } from "./StemResultCard";

interface Props {
  job: Job;
  onReset: () => void;
  title?: string;
}

export function DownloadSection({ job, onReset, title = "Pistas separadas" }: Props) {
  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-5 py-4">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-400 blur-md opacity-30 rounded-full" />
          <CheckCircle2 className="relative w-6 h-6 text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-emerald-300 font-semibold">¡Procesamiento completado!</p>
          <p className="text-emerald-400/50 text-xs mt-0.5">
            {job.files.length} pista{job.files.length !== 1 ? "s" : ""} lista{job.files.length !== 1 ? "s" : ""} para descargar
          </p>
        </div>
        <Sparkles className="w-4 h-4 text-emerald-400/50" />
      </div>

      {/* Step label */}
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
        {title}
      </p>

      {/* Stem cards */}
      <div className="space-y-2">
        {job.files.map((file, i) => (
          <StemResultCard key={file.filename} jobId={job.job_id} file={file} index={i} />
        ))}
      </div>

      {/* Reset */}
      <button
        onClick={onReset}
        className="flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors mt-1 group"
      >
        <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-300" />
        Procesar otro archivo
      </button>
    </div>
  );
}
