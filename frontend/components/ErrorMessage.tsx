"use client";

import { AlertCircle, RefreshCw, RotateCcw } from "lucide-react";

interface Props {
  message: string;
  onRetry?: () => void;   // vuelve a idle conservando el archivo
  onReset?: () => void;   // borra todo y empieza desde cero
}

export function ErrorMessage({ message, onRetry, onReset }: Props) {
  // Detect backend-unreachable errors to show special formatting
  const isNetworkError = message.includes("backend") || message.includes("corriendo") || message.includes("fetch");

  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/8 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-red-500/20 bg-red-500/5">
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <p className="text-red-300 font-semibold text-sm">
          {isNetworkError ? "Servidor no disponible" : "Error en el procesamiento"}
        </p>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1">
          {message.split("\n").map((line, i) => (
            line.trim() ? (
              <p key={i} className={`text-sm ${i === 0 ? "text-red-200/80" : "text-red-300/50 text-xs font-mono"}`}>
                {line}
              </p>
            ) : <div key={i} className="h-1" />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30
                text-red-200 text-xs font-semibold transition-colors border border-red-500/30"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Volver e intentar de nuevo
            </button>
          )}
          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Empezar desde cero
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
