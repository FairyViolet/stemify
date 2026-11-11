"use client";

import { Check, RotateCcw, ArrowUpToLine, AlignVerticalJustifyCenter, ArrowDownToLine } from "lucide-react";
import type { SubtitleConfig, SubtitleStyle } from "@/types";
import { PRESET_META, FONT_OPTIONS, presetConfig } from "@/lib/subtitlePresets";
import { clsx } from "@/lib/utils";

interface Props {
  config: SubtitleConfig;
  onChange: (config: SubtitleConfig) => void;
  orientation: "vertical" | "horizontal";
}

// ── Small building blocks ────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">{title}</p>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer",
            value === o.value
              ? "border-amber-500/70 bg-amber-500/20 text-white"
              : "border-white/10 bg-white/3 text-white/55 hover:border-amber-500/30 hover:text-white/85"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, suffix = "", onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-[11px] text-white/50 mb-1">
        <span>{label}</span>
        <span className="text-white/80 font-semibold tabular-nums">{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-500 cursor-pointer"
      />
    </label>
  );
}

const SWATCHES = ["#FFFFFF", "#FFD400", "#FF3B3B", "#3BFF6E", "#3BD4FF", "#FF3BC8", "#8B5CF6", "#FF8A3B", "#000000"];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-[11px] text-white/50 mb-1">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className={clsx(
              "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer",
              value.toUpperCase() === c ? "border-amber-400 scale-110" : "border-white/20"
            )}
            style={{ background: c }}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          title="Elegir otro color"
          className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20"
        />
      </div>
    </div>
  );
}

/** Static thumbnail of a preset for the gallery. */
function PresetThumb({ id, orientation }: { id: SubtitleStyle; orientation: "vertical" | "horizontal" }) {
  const c = presetConfig(id, orientation);
  const words = c.maxWords === 1 ? ["ASÍ"] : ["se", "verá"];
  const shadow = c.outlineWidth > 0
    ? [-1, 1].flatMap((x) => [-1, 1].map((y) => `${x * 1.2}px ${y * 1.2}px 0 ${c.outlineColor}`)).join(",")
    : "none";
  return (
    <div className="rounded-lg bg-gradient-to-br from-slate-700/60 to-violet-950/80 h-12 flex items-center justify-center gap-1 px-1 overflow-hidden"
      style={{ fontFamily: `"${c.font}", "Arial Black", sans-serif`, fontWeight: 900 }}>
      {words.map((w, i) => {
        const text = c.uppercase ? w.toUpperCase() : w;
        const active = i === words.length - 1 && c.highlightMode !== "none";
        const style: React.CSSProperties = { color: c.textColor, textShadow: shadow, fontSize: c.maxWords === 1 ? 18 : 13, whiteSpace: "nowrap" };
        if (active && c.highlightMode === "box") Object.assign(style, { background: c.boxColor, padding: "0 3px", textShadow: "none" });
        else if (active && c.highlightMode === "karaoke")
          Object.assign(style, { backgroundImage: `linear-gradient(90deg, ${c.highlightColor} 55%, ${c.textColor} 55%)`, WebkitBackgroundClip: "text", color: "transparent" });
        else if (active && c.wordAnimation === "glow")
          Object.assign(style, { textShadow: `0 0 4px ${c.highlightColor}, 0 0 8px ${c.highlightColor}` });
        else if (active) Object.assign(style, { color: c.highlightColor, transform: "scale(1.15)", display: "inline-block" });
        return <span key={i} style={style}>{text}</span>;
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function SubtitleDesigner({ config, onChange, orientation }: Props) {
  const set = <K extends keyof SubtitleConfig>(key: K, value: SubtitleConfig[K]) => onChange({ ...config, [key]: value });

  return (
    <div className="space-y-5">
      {/* Preset gallery */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PRESET_META.map((p) => {
          const active = config.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(presetConfig(p.id, orientation))}
              title={p.description}
              className={clsx(
                "relative text-left rounded-xl border p-2 transition-all duration-200 cursor-pointer",
                active
                  ? "border-amber-500/70 bg-amber-500/10 ring-1 ring-amber-500/30"
                  : "border-white/10 bg-white/3 hover:border-amber-500/30"
              )}
            >
              <PresetThumb id={p.id} orientation={orientation} />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-white text-[11px] font-semibold">{p.label}</span>
                {active && <Check className="w-3 h-3 text-amber-400" />}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-white/35 text-xs -mt-2">
        {PRESET_META.find((p) => p.id === config.preset)?.description}
      </p>

      {/* Controls */}
      <div className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-white/80 text-sm font-semibold">Personaliza el diseño</p>
          <button
            type="button"
            onClick={() => onChange(presetConfig(config.preset, orientation))}
            className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/80 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Restablecer plantilla
          </button>
        </div>

        <Section title="Posición">
          <Segmented
            value={config.position}
            onChange={(v) => set("position", v)}
            options={[
              { value: "top", label: <><ArrowUpToLine className="w-3 h-3" /> Arriba</> },
              { value: "middle", label: <><AlignVerticalJustifyCenter className="w-3 h-3" /> Centro</> },
              { value: "bottom", label: <><ArrowDownToLine className="w-3 h-3" /> Abajo</> },
            ]}
          />
          {config.position !== "middle" && (
            <Slider label="Distancia del borde" value={config.offset} min={0} max={45} suffix="%" onChange={(v) => set("offset", v)} />
          )}
        </Section>

        <Section title="Texto">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <p className="text-[11px] text-white/50 mb-1">Fuente</p>
              <select
                value={config.font}
                onChange={(e) => set("font", e.target.value)}
                className="w-full rounded-lg bg-black/40 border border-white/15 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-amber-500/50"
              >
                {FONT_OPTIONS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
            </label>
            <Slider label="Tamaño" value={config.fontSize} min={30} max={180} onChange={(v) => set("fontSize", v)} />
          </div>
          <p className="text-[11px] text-white/50">Palabras en pantalla</p>
          <Segmented
            value={config.maxWords}
            onChange={(v) => set("maxWords", v)}
            options={[1, 2, 3, 4, 6].map((n) => ({ value: n, label: String(n) })).concat([{ value: 0, label: "Frase completa" }])}
          />
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
              <input type="checkbox" checked={config.uppercase} onChange={(e) => set("uppercase", e.target.checked)} className="accent-amber-500" />
              MAYÚSCULAS
            </label>
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
              <input type="checkbox" checked={config.revealWords} onChange={(e) => set("revealWords", e.target.checked)} className="accent-amber-500" />
              Mostrar palabra por palabra
            </label>
          </div>
        </Section>

        <Section title="Resaltado de la palabra que se dice">
          <Segmented
            value={config.highlightMode}
            onChange={(v) => set("highlightMode", v)}
            options={[
              { value: "color", label: "Color" },
              { value: "box", label: "Caja" },
              { value: "karaoke", label: "Karaoke" },
              { value: "none", label: "Ninguno" },
            ]}
          />
          {(config.highlightMode === "color" || config.highlightMode === "box") && (
            <>
              <p className="text-[11px] text-white/50">Animación de la palabra</p>
              <Segmented
                value={config.wordAnimation}
                onChange={(v) => set("wordAnimation", v)}
                options={[
                  { value: "pop", label: "Rebote" },
                  { value: "zoom", label: "Zoom" },
                  { value: "shake", label: "Sacudida" },
                  { value: "flash", label: "Destello" },
                  ...(config.highlightMode === "color" ? [{ value: "glow" as const, label: "Neón" }] : []),
                  { value: "none", label: "Ninguna" },
                ]}
              />
            </>
          )}
        </Section>

        <Section title="Animación al aparecer cada frase">
          <Segmented
            value={config.entryAnimation}
            onChange={(v) => set("entryAnimation", v)}
            options={[
              { value: "none", label: "Ninguna" },
              { value: "fade", label: "Aparecer suave" },
              { value: "pop", label: "Crecer" },
              { value: "slide", label: "Subir" },
            ]}
          />
        </Section>

        <Section title="Colores y borde">
          <div className="grid sm:grid-cols-2 gap-3">
            <ColorField label="Texto" value={config.textColor} onChange={(v) => set("textColor", v)} />
            {config.highlightMode === "box"
              ? <ColorField label="Caja" value={config.boxColor} onChange={(v) => set("boxColor", v)} />
              : config.highlightMode !== "none" && (
                <ColorField label="Palabra resaltada" value={config.highlightColor} onChange={(v) => set("highlightColor", v)} />
              )}
            <ColorField label="Borde" value={config.outlineColor} onChange={(v) => set("outlineColor", v)} />
            <div className="space-y-2">
              <Slider label="Grosor del borde" value={config.outlineWidth} min={0} max={14} onChange={(v) => set("outlineWidth", v)} />
              <Slider label="Sombra" value={config.shadow} min={0} max={10} onChange={(v) => set("shadow", v)} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
