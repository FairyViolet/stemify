"use client";

import { Music2, Video, Mic, Captions, Check } from "lucide-react";
import type { AppMode } from "@/types";
import { clsx } from "@/lib/utils";

interface Props {
  selected: AppMode | null;
  onChange: (mode: AppMode) => void;
}

/* Mini decorative waveform SVG */
function Waveform({ color }: { color: string }) {
  const bars = [0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.3, 0.7, 0.5, 0.9, 0.6, 0.4, 0.8, 1, 0.5];
  return (
    <svg viewBox={`0 0 ${bars.length * 5} 24`} className="w-full h-6 opacity-50" preserveAspectRatio="none">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 5}
          y={(1 - h) * 24}
          width={3}
          height={h * 24}
          rx={1.5}
          fill={color}
        />
      ))}
    </svg>
  );
}

/* Mini speech waveform decoration */
function SpeechWave() {
  const heights = [0.3, 0.5, 0.8, 1, 0.9, 0.6, 0.4, 0.7, 1, 0.8, 0.5, 0.3, 0.6, 0.9, 0.7, 0.4];
  return (
    <svg viewBox={`0 0 ${heights.length * 5} 24`} className="w-full h-6 opacity-50" preserveAspectRatio="none">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 5}
          y={(1 - h) * 24}
          width={3}
          height={h * 24}
          rx={1.5}
          fill="#34d399"
        />
      ))}
    </svg>
  );
}

/* Mini film strip decoration */
function FilmStrip() {
  return (
    <svg viewBox="0 0 80 24" className="w-full h-6 opacity-40">
      <rect x="0" y="2" width="80" height="20" rx="3" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
      {[5, 14, 23, 32, 41, 50, 59, 68].map((x) => (
        <rect key={x} x={x} y="0" width="5" height="4" rx="1" fill="#22d3ee" />
      ))}
      {[5, 14, 23, 32, 41, 50, 59, 68].map((x) => (
        <rect key={`b${x}`} x={x} y="20" width="5" height="4" rx="1" fill="#22d3ee" />
      ))}
    </svg>
  );
}

/* Mini karaoke-word decoration — simulates active-word highlight */
function KaraokeWords() {
  return (
    <svg viewBox="0 0 90 24" className="w-full h-6 opacity-70">
      <text x="2" y="17" fontSize="10" fontWeight="700" fill="#ffffff" opacity="0.6">this</text>
      <text x="22" y="17" fontSize="13" fontWeight="800" fill="#fbbf24">IS</text>
      <text x="38" y="17" fontSize="10" fontWeight="700" fill="#ffffff" opacity="0.6">so</text>
      <text x="54" y="17" fontSize="10" fontWeight="700" fill="#ffffff" opacity="0.6">cool</text>
    </svg>
  );
}

const modes = [
  {
    id: "music" as AppMode,
    icon: <Music2 className="w-7 h-7" />,
    title: "Music Mode",
    subtitle: "For songs, beats, demos, and audio tracks.",
    tags: ["Vocals", "Drums", "Bass", "Instruments"],
    decoration: <Waveform color="#a78bfa" />,
    activeGlow: "shadow-[0_0_40px_rgba(139,92,246,0.3)]",
    activeBorder: "border-violet-500/70",
    activeBg: "from-violet-900/40 to-fuchsia-900/20",
    idleBg: "from-violet-900/10 to-fuchsia-900/5",
    iconBg: "bg-violet-500/20",
    iconColor: "text-violet-300",
    tagBg: "bg-violet-500/15 text-violet-300",
    checkBg: "bg-violet-500",
  },
  {
    id: "video" as AppMode,
    icon: <Video className="w-7 h-7" />,
    title: "Video Mode",
    subtitle: "For videos, music videos, and interviews.",
    tags: ["Extract Audio", "Muted Video", "Voice/Music Split"],
    decoration: <FilmStrip />,
    activeGlow: "shadow-[0_0_40px_rgba(34,211,238,0.25)]",
    activeBorder: "border-cyan-500/70",
    activeBg: "from-cyan-900/40 to-blue-900/20",
    idleBg: "from-cyan-900/10 to-blue-900/5",
    iconBg: "bg-cyan-500/20",
    iconColor: "text-cyan-300",
    tagBg: "bg-cyan-500/15 text-cyan-300",
    checkBg: "bg-cyan-500",
  },
  {
    id: "speech" as AppMode,
    icon: <Mic className="w-7 h-7" />,
    title: "Speech to Text",
    subtitle: "Transcribe audio or video to text with timestamps.",
    tags: ["Transcripción", "Subtítulos SRT", "Traducción"],
    decoration: <SpeechWave />,
    activeGlow: "shadow-[0_0_40px_rgba(52,211,153,0.25)]",
    activeBorder: "border-emerald-500/70",
    activeBg: "from-emerald-900/40 to-teal-900/20",
    idleBg: "from-emerald-900/10 to-teal-900/5",
    iconBg: "bg-emerald-500/20",
    iconColor: "text-emerald-300",
    tagBg: "bg-emerald-500/15 text-emerald-300",
    checkBg: "bg-emerald-500",
  },
  {
    id: "subtitles" as AppMode,
    icon: <Captions className="w-7 h-7" />,
    title: "Subtítulos Dinámicos",
    subtitle: "Quema subtítulos animados estilo TikTok sobre tu video.",
    tags: ["Karaoke", "Word-by-word", "Quemado en video"],
    decoration: <KaraokeWords />,
    activeGlow: "shadow-[0_0_40px_rgba(251,191,36,0.25)]",
    activeBorder: "border-amber-500/70",
    activeBg: "from-amber-900/40 to-orange-900/20",
    idleBg: "from-amber-900/10 to-orange-900/5",
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-300",
    tagBg: "bg-amber-500/15 text-amber-300",
    checkBg: "bg-amber-500",
  },
] as const;

export function ModeSelector({ selected, onChange }: Props) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold mb-3 text-center">
        Step 1 — Choose mode
      </p>
      <div className="grid grid-cols-2 gap-4">
        {modes.map((m) => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              className={clsx(
                "relative group text-left rounded-2xl border p-5 transition-all duration-300 cursor-pointer overflow-hidden",
                "bg-gradient-to-br",
                active
                  ? `${m.activeBorder} ${m.activeBg} ${m.activeGlow} scale-[1.02]`
                  : `border-white/10 ${m.idleBg} hover:border-white/20 hover:scale-[1.01]`
              )}
            >
              {/* Top row */}
              <div className="flex items-start justify-between mb-4">
                <div className={clsx("p-2.5 rounded-xl transition-colors", m.iconBg)}>
                  <span className={m.iconColor}>{m.icon}</span>
                </div>
                {active && (
                  <div className={clsx("w-6 h-6 rounded-full flex items-center justify-center", m.checkBg)}>
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>

              <h3 className="text-base font-bold text-white mb-1">{m.title}</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-4">{m.subtitle}</p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {m.tags.map((tag) => (
                  <span key={tag} className={clsx("text-[10px] px-2 py-0.5 rounded-full font-medium", m.tagBg)}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Decoration */}
              <div className="opacity-60 group-hover:opacity-80 transition-opacity">
                {m.decoration}
              </div>

              {/* Hover shine */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 70%)" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
