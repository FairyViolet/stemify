"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SubtitleConfig, SubtitleSegment } from "@/types";
import { buildCaptions, demoSegments, DEMO_LOOP_SECONDS, type Caption, type CaptionWord } from "@/lib/subtitlePresets";

interface Props {
  config: SubtitleConfig;
  /** width / height of the frame (the real video's, when known) */
  aspect: number;
  videoUrl?: string | null;
  /** Real transcript: the preview follows the video's playback time. */
  segments?: SubtitleSegment[] | null;
  showSafeZone?: boolean;
  /** Max height of the frame in CSS px */
  maxHeight?: number;
}

// libass font sizes are ~15% larger than CSS font-size for the same text
const ASS_TO_CSS = 0.87;

/** Ring of text-shadows that imitates an ASS outline. */
function outlineShadows(width: number, color: string): string[] {
  if (width <= 0) return [];
  const steps = 16;
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return `${(Math.cos(a) * width).toFixed(2)}px ${(Math.sin(a) * width).toFixed(2)}px 0 ${color}`;
  });
}

const KEYFRAMES = `
@keyframes stmPop   { 0% { transform: scale(1) } 44% { transform: scale(1.18) } 100% { transform: scale(1) } }
@keyframes stmZoom  { from { transform: scale(1) } to { transform: scale(1.25) } }
@keyframes stmShake { 0% { transform: rotate(0) } 22% { transform: rotate(-6deg) } 50% { transform: rotate(6deg) } 78% { transform: rotate(-4deg) } 100% { transform: rotate(0) } }
@keyframes stmFlash { from { opacity: .45 } to { opacity: 1 } }
@keyframes stmFade  { from { opacity: 0 } to { opacity: 1 } }
@keyframes stmGrow  { from { transform: scale(.8) } to { transform: scale(1) } }
@keyframes stmSlide { from { transform: translateY(var(--stm-slide)); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
`;

const WORD_ANIMATION: Record<string, string> = {
  pop: "stmPop 180ms ease-out",
  zoom: "stmZoom 120ms ease-out forwards",
  shake: "stmShake 180ms linear",
  flash: "stmFlash 120ms linear",
};
const ENTRY_ANIMATION: Record<string, string> = {
  fade: "stmFade 150ms ease-out",
  pop: "stmGrow 140ms ease-out",
  slide: "stmSlide 180ms ease-out",
};

export function SubtitlePreview({ config, aspect, videoUrl, segments, showSafeZone, maxHeight = 460 }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [time, setTime] = useState(0);
  const synced = !!(segments && segments.length);

  // Frame size → scale factor relative to the 1080 px design
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clock: the video's time when previewing the real transcript, a looping demo otherwise
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      if (synced && videoRef.current) setTime(videoRef.current.currentTime);
      else setTime(((performance.now() - t0) / 1000) % DEMO_LOOP_SECONDS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [synced]);

  const captions = useMemo(
    () => buildCaptions(synced ? segments! : demoSegments(), config.maxWords, config.uppercase),
    [synced, segments, config.maxWords, config.uppercase]
  );

  const capIdx = captions.findIndex((c) => time >= c.start && time < c.end);
  const caption: Caption | undefined = captions[capIdx];
  const wordIdx = caption
    ? caption.words.reduce((acc, w, i) => (time >= (i === 0 ? caption.start : w.start) ? i : acc), 0)
    : -1;

  const k = Math.min(size.w, size.h) / 1080;
  const fontPx = config.fontSize * k * ASS_TO_CSS;
  const outlinePx = config.outlineWidth * k;
  const shadowPx = config.shadow * k;
  const baseShadow = [
    ...outlineShadows(outlinePx, config.outlineColor),
    ...(shadowPx > 0 ? [`${shadowPx}px ${shadowPx}px 0 rgba(0,0,0,.5)`] : []),
  ];

  const isVertical = aspect < 1;
  const frameStyle: React.CSSProperties = isVertical
    ? { height: maxHeight, width: maxHeight * aspect }
    : { width: "100%", aspectRatio: String(aspect), maxHeight };

  const posStyle: React.CSSProperties = { left: "6%", right: "6%" };
  if (config.position === "top") posStyle.top = `${config.offset}%`;
  else if (config.position === "middle") { posStyle.top = "50%"; posStyle.transform = "translateY(-50%)"; }
  else posStyle.bottom = `${config.offset}%`;

  function renderWord(w: CaptionWord, j: number) {
    const mode = config.highlightMode;
    const active = j === wordIdx && mode !== "none";
    const hidden = config.revealWords && j > wordIdx;
    const mult = w.sizeMultiplier ?? 1;
    const style: React.CSSProperties = {
      display: "inline-block",
      fontSize: fontPx * mult,
      color: config.textColor,
      textShadow: baseShadow.join(","),
      visibility: hidden ? "hidden" : "visible",
      whiteSpace: "pre",
    };

    if (mode === "karaoke") {
      const end = caption!.words[j + 1]?.start ?? w.end;
      const start = j === 0 ? caption!.start : w.start;
      const p = time >= end ? 1 : time <= start ? 0 : (time - start) / (end - start);
      style.backgroundImage = `linear-gradient(90deg, ${config.highlightColor} ${p * 100}%, ${config.textColor} ${p * 100}%)`;
      style.WebkitBackgroundClip = "text";
      style.backgroundClip = "text";
      style.color = "transparent";
      return <span key={j} style={style}>{w.text}</span>;
    }

    if (active) {
      const anim = w.animation ?? config.wordAnimation;
      if (mode === "box") {
        const pad = Math.max(4 * k, config.fontSize * k * 0.16);
        style.background = w.color ?? config.boxColor;
        style.textShadow = "none";
        style.padding = `0 ${pad}px`;
        style.margin = `0 ${-pad}px`;
        style.boxShadow = `0 0 0 ${pad * 0.4}px ${w.color ?? config.boxColor}`;
      } else if (anim === "glow") {
        const glow = w.color ?? config.highlightColor;
        style.color = config.textColor;
        style.textShadow = [`0 0 ${fontPx * 0.12}px ${glow}`, `0 0 ${fontPx * 0.3}px ${glow}`, `0 0 ${fontPx * 0.5}px ${glow}`].join(",");
      } else {
        style.color = w.color ?? config.highlightColor;
      }
      if (WORD_ANIMATION[anim]) style.animation = WORD_ANIMATION[anim];
      return <span key={`${capIdx}-${j}-a`} style={style}>{w.text}</span>;
    }
    return <span key={j} style={style}>{w.text}</span>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <style>{KEYFRAMES}</style>
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-violet-950 shadow-2xl"
        style={frameStyle}
      >
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted={!synced}
            autoPlay={!synced}
            loop
            playsInline
            controls={synced}
          />
        )}

        {showSafeZone && isVertical && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute right-0 top-[38%] bottom-[18%] w-[16%] bg-red-500/20 border-l border-dashed border-red-400/60" />
            <div className="absolute left-0 right-0 bottom-0 h-[18%] bg-red-500/20 border-t border-dashed border-red-400/60" />
            <span className="absolute right-1 bottom-[19%] text-[9px] text-red-200/80 font-semibold">Botones TikTok / Reels</span>
          </div>
        )}

        {caption && size.w > 0 && (
          <div className="pointer-events-none absolute text-center" style={{ ...posStyle, lineHeight: 1.15 }}>
            <div
              key={capIdx}
              style={{
                animation: ENTRY_ANIMATION[config.entryAnimation],
                ["--stm-slide" as string]: `${size.h * 0.03}px`,
                fontFamily: `"${config.font}", "Arial Black", Arial, sans-serif`,
                fontWeight: 900,
              }}
            >
              {caption.words.map((w, j) => (
                <span key={j}>
                  {renderWord(w, j)}
                  {j < caption.words.length - 1 ? " " : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="text-[10px] text-white/30">
        {synced ? "Reproduce el video para ver tus subtítulos reales" : "Vista previa con frase de ejemplo"}
      </p>
    </div>
  );
}
