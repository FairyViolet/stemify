"use client";

import { Check } from "lucide-react";
import type { MusicMode, SeparationQuality } from "@/types";
import { clsx } from "@/lib/utils";

interface Props {
  selected: MusicMode;
  onChange: (mode: MusicMode) => void;
  quality: SeparationQuality;
  onQualityChange: (quality: SeparationQuality) => void;
  roformerAvailable: boolean;
}

const qualityOptions: { id: SeparationQuality; title: string; badge: string; description: string }[] = [
  {
    id: "roformer",
    title: "RoFormer",
    badge: "Mejor voz",
    description: "BS-RoFormer, el modelo de Ultimate Vocal Remover. La voz más limpia. En 4 pistas, Demucs divide el instrumental.",
  },
  {
    id: "high",
    title: "Demucs Máxima precisión",
    badge: "Preciso",
    description: "Modelo afinado + doble pasada. Más lento.",
  },
  {
    id: "standard",
    title: "Demucs Estándar",
    badge: "Rápido",
    description: "Una sola pasada. Unas 8 veces más rápido.",
  },
];

const STEM_COLORS: Record<string, string> = {
  "🎤 Vocals":       "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "🎵 Instrumental": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "🥁 Drums":        "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "🎸 Bass":         "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "🎹 Other":        "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

const options: { id: MusicMode; title: string; badge: string; description: string; stems: string[] }[] = [
  {
    id: "2stem",
    title: "2 Pistas",
    badge: "Rápido",
    description: "Ideal para aislar la voz rápidamente",
    stems: ["🎤 Vocals", "🎵 Instrumental"],
  },
  {
    id: "4stem",
    title: "4 Pistas",
    badge: "Detallado",
    description: "Separación completa de todos los instrumentos",
    stems: ["🎤 Vocals", "🥁 Drums", "🎸 Bass", "🎹 Other"],
  },
];

export function MusicSeparationOptions({ selected, onChange, quality, onQualityChange, roformerAvailable }: Props) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold mb-3">
        Step 3 — Tipo de separación
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {options.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              className={clsx(
                "relative text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer",
                active
                  ? "border-violet-500/60 bg-violet-500/10 ring-1 ring-violet-500/20 scale-[1.01]"
                  : "border-white/10 hover:border-violet-500/30 bg-white/3 hover:bg-violet-500/5"
              )}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold text-sm">{opt.title}</p>
                  <span className={clsx(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full",
                    active ? "bg-violet-500 text-white" : "bg-white/10 text-white/40"
                  )}>
                    {opt.badge}
                  </span>
                </div>
                {active && (
                  <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="text-white/40 text-xs mb-3">{opt.description}</p>
              {/* Stem pills */}
              <div className="flex flex-wrap gap-1.5">
                {opt.stems.map((s) => (
                  <span
                    key={s}
                    className={clsx(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                      STEM_COLORS[s] ?? "bg-white/10 text-white/60 border-white/15"
                    )}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold mt-5 mb-3">
        Calidad de separación
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        {qualityOptions.map((opt) => {
          const active = quality === opt.id;
          const disabled = opt.id === "roformer" && !roformerAvailable;
          return (
            <button
              key={opt.id}
              onClick={() => !disabled && onQualityChange(opt.id)}
              disabled={disabled}
              className={clsx(
                "relative text-left rounded-xl border p-3 transition-all duration-200",
                disabled
                  ? "border-white/5 bg-white/2 opacity-50 cursor-not-allowed"
                  : active
                    ? "border-violet-500/60 bg-violet-500/10 ring-1 ring-violet-500/20 cursor-pointer"
                    : "border-white/10 hover:border-violet-500/30 bg-white/3 hover:bg-violet-500/5 cursor-pointer"
              )}
            >
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-bold text-sm">{opt.title}</p>
                  <span className={clsx(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full",
                    active ? "bg-violet-500 text-white" : "bg-white/10 text-white/40"
                  )}>
                    {opt.badge}
                  </span>
                </div>
                {active && (
                  <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="text-white/40 text-xs">
                {disabled ? "No instalado: ejecuta instalar_ia.bat en la carpeta de Stemify." : opt.description}
              </p>
            </button>
          );
        })}
      </div>
      <p className="text-white/30 text-[11px] mt-2">
        Las pistas se exportan en WAV de 32 bits: conservan el volumen exacto de la canción original.
      </p>
    </div>
  );
}
