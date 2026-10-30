import type { SubtitleConfig, SubtitleStyle, SubtitleSegment } from "@/types";

/** Mirrors BASE_CONFIG + PRESETS in backend/subtitle_worker.py — keep in sync. */
export const BASE_CONFIG: Omit<SubtitleConfig, "preset"> = {
  font: "Arial Black",
  fontSize: 84,
  uppercase: false,
  textColor: "#FFFFFF",
  highlightColor: "#FFD400",
  outlineColor: "#000000",
  outlineWidth: 6,
  shadow: 2,
  highlightMode: "color",
  boxColor: "#8B5CF6",
  wordAnimation: "pop",
  entryAnimation: "pop",
  position: "bottom",
  offset: 22,
  maxWords: 3,
  revealWords: false,
};

const PRESET_OVERRIDES: Record<SubtitleStyle, Partial<SubtitleConfig>> = {
  pop:     { uppercase: true },
  box:     { fontSize: 80, uppercase: true, highlightMode: "box", outlineWidth: 5, entryAnimation: "fade" },
  karaoke: { fontSize: 76, highlightMode: "karaoke", highlightColor: "#3BD4FF", wordAnimation: "none",
             entryAnimation: "fade", maxWords: 6 },
  neon:    { font: "Trebuchet MS", fontSize: 82, highlightColor: "#FF3BC8", outlineColor: "#2A0A3D",
             outlineWidth: 4, shadow: 0, wordAnimation: "glow", entryAnimation: "fade" },
  reveal:  { fontSize: 80, highlightColor: "#3BFF6E", wordAnimation: "zoom", entryAnimation: "none",
             maxWords: 4, revealWords: true },
  oneword: { font: "Impact", fontSize: 130, uppercase: true, highlightColor: "#FFFFFF", outlineWidth: 8,
             maxWords: 1, position: "middle", offset: 0 },
  clean:   { font: "Arial", fontSize: 58, highlightColor: "#35E1FF", outlineWidth: 3, shadow: 1,
             wordAnimation: "none", entryAnimation: "fade", maxWords: 6 },
  classic: { font: "Arial", fontSize: 52, highlightMode: "none", outlineWidth: 3, shadow: 1,
             wordAnimation: "none", entryAnimation: "none", maxWords: 0, offset: 8 },
};

export const PRESET_META: { id: SubtitleStyle; label: string; description: string }[] = [
  { id: "pop",     label: "Pop TikTok",        description: "Mayúsculas, palabra activa amarilla que rebota." },
  { id: "box",     label: "Caja",              description: "La palabra activa sobre un fondo de color." },
  { id: "karaoke", label: "Karaoke",           description: "El color avanza dentro de cada palabra." },
  { id: "neon",    label: "Neón",              description: "Palabra activa con brillo de neón." },
  { id: "reveal",  label: "Palabra a palabra", description: "Las palabras aparecen a medida que se dicen." },
  { id: "oneword", label: "Una palabra",       description: "Una sola palabra gigante en el centro." },
  { id: "clean",   label: "Limpio",            description: "Frase entera, resaltado sutil, sin rebote." },
  { id: "classic", label: "Clásico",           description: "Subtítulo tradicional por frase." },
];

/** Fonts that ship with Windows — what the burned video will use. */
export const FONT_OPTIONS = [
  "Arial Black", "Impact", "Arial", "Verdana", "Trebuchet MS",
  "Comic Sans MS", "Segoe UI Black", "Georgia", "Bahnschrift",
];

export function presetConfig(preset: SubtitleStyle, orientation: "vertical" | "horizontal"): SubtitleConfig {
  const cfg: SubtitleConfig = { ...BASE_CONFIG, ...PRESET_OVERRIDES[preset], preset };
  // Presets place captions above the TikTok/Reels buttons (22%). A horizontal
  // video has no such overlay, so keep them closer to the bottom edge.
  if (orientation === "horizontal" && cfg.position === "bottom") cfg.offset = Math.min(cfg.offset, 8);
  return cfg;
}

// ── Caption timing (same rules as build_chunks in subtitle_worker.py) ─────────
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
  color?: string;
  sizeMultiplier?: number;
  animation?: SubtitleConfig["wordAnimation"];
}
export interface Caption {
  start: number;
  end: number;
  words: CaptionWord[];
}

export function buildCaptions(segments: SubtitleSegment[], maxWords: number, uppercase: boolean): Caption[] {
  const clean = (t: string) => {
    const s = (t ?? "").trim();
    return uppercase ? s.toUpperCase() : s;
  };
  const groups: CaptionWord[][] = [];
  for (const seg of segments) {
    const words = seg.words.filter((w) => clean(w.word));
    let current: CaptionWord[] = [];
    words.forEach((w, idx) => {
      const word: CaptionWord = { ...w, text: clean(w.word) };
      if (current.length && ((maxWords && current.length >= maxWords) || w.start - current[current.length - 1].end > 1)) {
        groups.push(current);
        current = [];
      }
      current.push(word);
      if (maxWords && /[.?!…]$/.test(word.text) && idx < words.length - 1) {
        groups.push(current);
        current = [];
      }
    });
    if (current.length) groups.push(current);
  }
  const captions = groups.map((g) => ({ start: g[0].start, end: g[g.length - 1].end, words: g }));
  captions.forEach((c, i) => {
    const next = captions[i + 1]?.start;
    let hold = c.end + 0.3;
    if (next !== undefined) hold = next - c.end < 0.6 ? next : Math.min(hold, next);
    c.end = Math.max(hold, c.start + 0.1);
  });
  return captions;
}

/** Demo phrase used by the preview before the video is transcribed. */
export function demoSegments(): SubtitleSegment[] {
  const words = "Así se verán tus subtítulos en este video increíble".split(" ");
  const step = 0.42;
  return [{
    start: 0.3,
    end: 0.3 + words.length * step,
    text: words.join(" "),
    words: words.map((w, i) => ({ word: w, start: 0.3 + i * step, end: 0.3 + i * step + step * 0.85 })),
  }];
}
export const DEMO_LOOP_SECONDS = 0.3 + 9 * 0.42 + 1.2;
