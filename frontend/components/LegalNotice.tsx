"use client";

import { ShieldCheck } from "lucide-react";

export function LegalNotice() {
  return (
    <div className="flex items-start gap-2 text-xs text-white/40 bg-white/5 border border-white/10 rounded-xl px-4 py-3 max-w-2xl mx-auto">
      <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400/70" />
      <span>
        Only process media files that you own or have explicit permission to use.
        This tool does not support downloading from YouTube, Spotify, TikTok,
        Instagram, SoundCloud, or any external URLs.
      </span>
    </div>
  );
}
