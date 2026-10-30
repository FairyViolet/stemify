"use client";

import { AlertTriangle, CheckCircle2, Terminal, Zap } from "lucide-react";
import { useBackendStatus } from "@/lib/useBackendStatus";

export function BackendStatusBanner() {
  const backend = useBackendStatus();

  if (backend.state === "checking") return null;

  // ── All good ──────────────────────────────────────────────
  if (backend.state === "ok") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-400/60 justify-center text-center">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Backend conectado · FFmpeg ✓ · Demucs ✓
        {backend.roformer && <> · RoFormer ✓</>}
        <span className={backend.gpu ? "text-emerald-300/80" : "text-amber-300/70"}>
          · {backend.gpu ? `GPU ${backend.gpu} ⚡` : "CPU (sin GPU)"}
        </span>
      </div>
    );
  }

  // ── Backend not reachable ──────────────────────────────────
  if (backend.state === "unreachable") {
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-500/8 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-red-500/15">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-red-300 font-semibold text-xs">Backend no iniciado — sube archivos no funcionará</p>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-red-200/60 text-xs">🔌 El servidor no responde en el puerto 8000.</p>
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5">
            <Terminal className="w-3 h-3 text-white/30 flex-shrink-0" />
            <code className="text-[10px] text-emerald-300/80 font-mono select-all">
              Abre start.bat en la carpeta de Stemify
            </code>
          </div>
        </div>
      </div>
    );
  }

  // ── Backend up but missing deps ────────────────────────────
  if (backend.state === "partial") {
    const { ffmpeg, demucs } = backend;

    // FFmpeg missing — only FFmpeg-based features broken
    if (!ffmpeg) {
      return (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-200/70 text-xs">
            🎬 FFmpeg no disponible. Instala FFmpeg y reinicia el backend.
          </p>
        </div>
      );
    }

    // FFmpeg OK, only Demucs missing — AI features disabled but FFmpeg ops work
    if (!demucs) {
      return (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/8 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-500/12">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            <p className="text-violet-300 font-semibold text-xs">
              FFmpeg activo · Separación por IA no disponible
            </p>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <p className="text-violet-200/50 text-xs">
              ✅ Extracción de audio y silenciado de vídeo funcionan normalmente.
            </p>
            <p className="text-violet-200/50 text-xs">
              🤖 Para usar IA (separar voces/instrumentos) instala Python + Demucs:
            </p>
            <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5">
              <Terminal className="w-3 h-3 text-white/25 flex-shrink-0" />
              <code className="text-[10px] text-emerald-300/70 font-mono select-all">
                pip install demucs
              </code>
            </div>
          </div>
        </div>
      );
    }
  }

  return null;
}
