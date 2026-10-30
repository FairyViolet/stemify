"use client";

import { Check } from "lucide-react";
import type { AudioFormat } from "@/types";
import { AUDIO_FORMAT_OPTIONS } from "@/lib/audioFormats";
import { clsx } from "@/lib/utils";

interface Props {
  title: string;
  value: AudioFormat;
  onChange: (format: AudioFormat) => void;
  note?: string;
}

function Group({ label, lossless, value, onChange }: {
  label: string; lossless: boolean; value: AudioFormat; onChange: (f: AudioFormat) => void;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {AUDIO_FORMAT_OPTIONS.filter((o) => o.lossless === lossless).map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              title={opt.hint}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer",
                active
                  ? "border-violet-500/60 bg-violet-500/15 text-white ring-1 ring-violet-500/20"
                  : "border-white/10 bg-white/3 text-white/60 hover:border-violet-500/30 hover:text-white/90"
              )}
            >
              {active && <Check className="w-3 h-3 text-violet-300" />}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AudioFormatPicker({ title, value, onChange, note }: Props) {
  const current = AUDIO_FORMAT_OPTIONS.find((o) => o.id === value);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold mb-3">{title}</p>
      <div className="rounded-xl border border-white/10 bg-white/3 p-3 space-y-3">
        <Group label="Sin pérdida" lossless value={value} onChange={onChange} />
        <Group label="Comprimido (más liviano)" lossless={false} value={value} onChange={onChange} />
        {current && <p className="text-white/45 text-xs">{current.hint}</p>}
      </div>
      {note && <p className="text-white/30 text-[11px] mt-2">{note}</p>}
    </div>
  );
}
