"use client";

import { Check, Lock } from "lucide-react";
import type { CleanVoiceOptions as Options } from "@/types";
import { clsx } from "@/lib/utils";

interface Props {
  options: Options;
  onChange: (options: Options) => void;
  isVideo: boolean;
}

function Toggle({ checked, locked, title, description, onClick }: {
  checked: boolean; locked?: boolean; title: string; description: string; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      className={clsx(
        "w-full flex items-start gap-3 text-left rounded-xl border p-3 transition-all",
        checked ? "border-sky-500/50 bg-sky-500/10" : "border-white/10 bg-white/3 hover:border-sky-500/30",
        locked ? "cursor-default" : "cursor-pointer"
      )}
    >
      <span className={clsx(
        "mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0",
        checked ? "bg-sky-500" : "border border-white/25"
      )}>
        {locked ? <Lock className="w-3 h-3 text-white" /> : checked && <Check className="w-3 h-3 text-white" />}
      </span>
      <span>
        <span className="block text-white text-sm font-semibold">{title}</span>
        <span className="block text-white/45 text-xs mt-0.5">{description}</span>
      </span>
    </button>
  );
}

export function CleanVoiceOptions({ options, onChange, isVideo }: Props) {
  const set = <K extends keyof Options>(k: K, v: Options[K]) => onChange({ ...options, [k]: v });
  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
        Step 3 — ¿Qué quieres limpiar?
      </p>
      <Toggle
        checked locked
        title="Quitar música y ruido de fondo"
        description="Separa la voz de todo lo demás con BS-RoFormer. Siempre activo."
      />
      <Toggle
        checked={options.denoise}
        onClick={() => set("denoise", !options.denoise)}
        title="Reducir ruido extra"
        description="Viento, zumbidos, aire acondicionado, ruido de calle que quede pegado a la voz."
      />
      <Toggle
        checked={options.dereverb}
        onClick={() => set("dereverb", !options.dereverb)}
        title="Quitar eco y reverberación"
        description="Para voces grabadas en salas grandes, baños o cuartos vacíos."
      />
      <Toggle
        checked={options.lead_only}
        onClick={() => set("lead_only", !options.lead_only)}
        title="Dejar solo la voz principal"
        description="Quita coros y voces de fondo. Ojo: en entrevistas puede quitar a la segunda persona."
      />

      <div className="rounded-xl border border-white/10 bg-white/3 p-3 space-y-3">
        <label className="block">
          <div className="flex justify-between text-xs text-white/60 mb-1">
            <span>Dejar un poco del fondo original</span>
            <span className="text-white/90 font-semibold tabular-nums">{options.background}%</span>
          </div>
          <input
            type="range" min={0} max={30} step={1} value={options.background}
            onChange={(e) => set("background", Number(e.target.value))}
            className="w-full accent-sky-500 cursor-pointer"
          />
          <p className="text-white/35 text-[11px] mt-1">
            0% = solo la voz. Un 5–10% conserva el ambiente para que no suene artificial.
          </p>
        </label>
        <label className="flex items-start gap-2 text-xs text-white/70 cursor-pointer">
          <input type="checkbox" checked={options.normalize} onChange={(e) => set("normalize", e.target.checked)} className="accent-sky-500 mt-0.5" />
          <span>
            Igualar el volumen al estándar de redes (−14 LUFS)
            <span className="block text-white/35 text-[11px]">Desactivado: la voz conserva su volumen original.</span>
          </span>
        </label>
      </div>
      {isVideo && (
        <p className="text-white/35 text-[11px]">
          Recibirás el video con el audio limpio (MP4), la voz sola y lo que se quitó.
        </p>
      )}
    </div>
  );
}
