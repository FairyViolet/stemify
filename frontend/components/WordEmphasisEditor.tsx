"use client";

import { useState } from "react";
import { X, Sparkles, Pencil } from "lucide-react";
import type { SubtitleSegment, SubtitleAnimation } from "@/types";
import { clsx } from "@/lib/utils";

interface Props {
  segments: SubtitleSegment[];
  onChange: (segments: SubtitleSegment[]) => void;
}

const COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: "Rojo", value: "#FF3B3B" },
  { label: "Amarillo", value: "#FFD400" },
  { label: "Verde", value: "#3BFF6E" },
  { label: "Celeste", value: "#3BD4FF" },
  { label: "Rosa", value: "#FF3BC8" },
  { label: "Naranja", value: "#FF8A3B" },
  { label: "Blanco", value: "#FFFFFF" },
];

const SIZE_OPTIONS: { label: string; value: number }[] = [
  { label: "Normal", value: 1 },
  { label: "Grande", value: 1.35 },
  { label: "Enorme", value: 1.7 },
];

const ANIMATION_OPTIONS: { label: string; value: SubtitleAnimation }[] = [
  { label: "Rebote", value: "pop" },
  { label: "Sacudida", value: "shake" },
  { label: "Destello", value: "flash" },
  { label: "Ninguna", value: "none" },
];

interface WordKey {
  segIdx: number;
  wordIdx: number;
}

type WordPatch = Partial<{
  word: string;
  color?: string;
  sizeMultiplier?: number;
  animation?: SubtitleAnimation;
}>;

export function WordEmphasisEditor({ segments, onChange }: Props) {
  const [active, setActive] = useState<WordKey | null>(null);

  const emphasizedCount = segments.reduce(
    (n, seg) => n + seg.words.filter((w) => w.color || w.sizeMultiplier || (w.animation && w.animation !== "pop")).length,
    0
  );

  function updateWord(segIdx: number, wordIdx: number, patch: WordPatch) {
    const next = segments.map((seg, si) => {
      if (si !== segIdx) return seg;
      return {
        ...seg,
        words: seg.words.map((w, wi) => (wi !== wordIdx ? w : { ...w, ...patch })),
      };
    });
    onChange(next);
  }

  function clearWord(segIdx: number, wordIdx: number) {
    updateWord(segIdx, wordIdx, { color: undefined, sizeMultiplier: undefined, animation: undefined });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">
          Step 5 — Destacá y corregí palabras
        </p>
        {emphasizedCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-300/70 font-medium">
            <Sparkles className="w-3 h-3" />
            {emphasizedCount} destacada{emphasizedCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <p className="text-white/30 text-xs">
        Tocá cualquier palabra para corregir el texto, darle color, tamaño o animación distinta.
      </p>

      <div className="rounded-2xl border border-white/10 p-4 max-h-80 overflow-y-auto"
        style={{ background: "rgba(10,10,20,0.5)" }}>
        {segments.map((seg, si) => (
          <p key={si} className="leading-loose mb-1">
            {seg.words.map((w, wi) => {
              const isOpen = active?.segIdx === si && active?.wordIdx === wi;
              const hasOverride = !!(w.color || w.sizeMultiplier || (w.animation && w.animation !== "pop"));
              return (
                <span key={wi} className="relative inline-block">
                  <button
                    onClick={() => setActive(isOpen ? null : { segIdx: si, wordIdx: wi })}
                    className={clsx(
                      "px-0.5 mx-0.5 rounded transition-all",
                      hasOverride
                        ? "font-extrabold ring-1 ring-white/20"
                        : "text-white/70 hover:bg-amber-500/15 font-medium"
                    )}
                    style={
                      hasOverride
                        ? {
                            color: w.color || "#FFFFFF",
                            fontSize: w.sizeMultiplier ? `${Math.min(w.sizeMultiplier, 1.5)}em` : undefined,
                          }
                        : undefined
                    }
                  >
                    {w.word}
                  </button>

                  {isOpen && (
                    <div
                      className="absolute z-30 top-full left-0 mt-2 w-64 rounded-xl border border-amber-500/30 p-3 shadow-2xl"
                      style={{ background: "#15131f" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-1 text-white/40 text-[10px]">
                          <Pencil className="w-3 h-3" /> Texto
                        </span>
                        <button onClick={() => setActive(null)} className="text-white/30 hover:text-white/70">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={w.word}
                        onChange={(e) => updateWord(si, wi, { word: e.target.value })}
                        className="w-full mb-3 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/15
                          text-white text-sm focus:outline-none focus:border-amber-500/50"
                        placeholder="Corregí la palabra…"
                      />

                      <p className="text-[10px] text-white/40 mb-1.5">Color</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {COLOR_SWATCHES.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => updateWord(si, wi, { color: c.value })}
                            title={c.label}
                            className={clsx(
                              "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                              w.color === c.value ? "border-white" : "border-white/15"
                            )}
                            style={{ background: c.value }}
                          />
                        ))}
                      </div>

                      <p className="text-[10px] text-white/40 mb-1.5">Tamaño</p>
                      <div className="flex gap-1.5 mb-3">
                        {SIZE_OPTIONS.map((s) => (
                          <button
                            key={s.label}
                            onClick={() => updateWord(si, wi, { sizeMultiplier: s.value === 1 ? undefined : s.value })}
                            className={clsx(
                              "flex-1 text-[10px] py-1.5 rounded-lg border font-medium transition-colors",
                              (w.sizeMultiplier ?? 1) === s.value
                                ? "border-amber-500 bg-amber-500/20 text-white"
                                : "border-white/15 text-white/50 hover:border-white/30"
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>

                      <p className="text-[10px] text-white/40 mb-1.5">Animación</p>
                      <div className="grid grid-cols-2 gap-1.5 mb-3">
                        {ANIMATION_OPTIONS.map((a) => (
                          <button
                            key={a.value}
                            onClick={() => updateWord(si, wi, { animation: a.value })}
                            className={clsx(
                              "text-[10px] py-1.5 rounded-lg border font-medium transition-colors",
                              (w.animation ?? "pop") === a.value
                                ? "border-amber-500 bg-amber-500/20 text-white"
                                : "border-white/15 text-white/50 hover:border-white/30"
                            )}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>

                      {hasOverride && (
                        <button
                          onClick={() => { clearWord(si, wi); setActive(null); }}
                          className="w-full text-[11px] text-white/40 hover:text-red-300 transition-colors py-1"
                        >
                          Quitar énfasis
                        </button>
                      )}
                    </div>
                  )}
                </span>
              );
            })}
          </p>
        ))}
      </div>
    </div>
  );
}
