"use client";

import type { VideoOptions } from "@/types";
import { clsx } from "@/lib/utils";

interface Props {
  options: VideoOptions;
  onChange: (opts: VideoOptions) => void;
}

interface OptionItem {
  key: keyof VideoOptions;
  title: string;
  description: string;
  outputs: string[];
  needsDemucs?: boolean;
}

const items: OptionItem[] = [
  {
    key: "extract_full_audio",
    title: "Extract Full Audio",
    description: "Output the original soundtrack as a WAV file",
    outputs: ["video_full-audio.wav"],
  },
  {
    key: "remove_audio_track",
    title: "Remove Audio (Muted Video)",
    description: "Export a silent version of the video",
    outputs: ["video_no-audio.mp4"],
  },
  {
    key: "separate_voice_music",
    title: "Separate Voices & Music",
    description: "Split into dialogue/vocals and background music using AI",
    outputs: ["video_vocals.wav", "video_no_vocals.wav"],
    needsDemucs: true,
  },
  {
    key: "separate_music_stems",
    title: "4-Stem Music Separation",
    description: "Separate soundtrack into vocals, drums, bass, and other using AI",
    outputs: ["video_vocals.wav", "video_drums.wav", "video_bass.wav", "video_other.wav"],
    needsDemucs: true,
  },
];

export function VideoSeparationOptions({ options, onChange }: Props) {
  const toggle = (key: keyof VideoOptions) => {
    onChange({ ...options, [key]: !options[key] });
  };

  const hasAnySelected = Object.values(options).some(Boolean);

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold mb-3">
        Step 3 — Opciones de procesamiento
      </p>
      <p className="text-xs text-white/30 mb-3">Selecciona al menos una opción.</p>

      {items.map((item) => {
        const active = options[item.key];
        return (
          <button
            key={item.key}
            onClick={() => toggle(item.key)}
            className={clsx(
              "w-full text-left rounded-xl border p-4 transition-all duration-150 cursor-pointer",
              active
                ? "border-cyan-500/60 bg-cyan-500/10 ring-1 ring-cyan-500/30"
                : "border-white/10 hover:border-white/20 bg-white/3 hover:bg-white/5"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={clsx(
                  "mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 transition-colors",
                  active
                    ? "bg-cyan-500 border-cyan-500"
                    : "border-white/30"
                )}
              >
                {active && (
                  <svg viewBox="0 0 10 10" className="w-full h-full text-white">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium text-sm">{item.title}</p>
                  {item.needsDemucs && (
                    <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full">
                      AI
                    </span>
                  )}
                </div>
                <p className="text-white/40 text-xs mt-0.5">{item.description}</p>
              </div>
            </div>
          </button>
        );
      })}

      {!hasAnySelected && (
        <p className="text-xs text-amber-400/70 text-center pt-1">
          Select at least one option to continue.
        </p>
      )}

      <p className="text-xs text-white/30 text-center pt-1">
        AI separation is not always perfect. Voices, dialogue, effects, and music may overlap depending on the original mix.
      </p>
    </div>
  );
}
