"use client";

import { Music2, Wand2 } from "lucide-react";

export function AppHeader() {
  return (
    <header className="border-b border-white/8 sticky top-0 z-50"
      style={{ background: "rgba(7,7,13,0.7)", backdropFilter: "blur(20px)" }}>
      <div className="max-w-3xl mx-auto px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-violet-500/40 blur-md" />
            <div className="relative p-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg">
              <Music2 className="w-5 h-5 text-white" />
            </div>
          </div>
          <div>
            <span className="text-lg font-bold text-white tracking-tight">Stemify</span>
            <span className="hidden sm:inline text-[11px] text-white/35 ml-2 font-medium tracking-widest uppercase">
              AI Stem Separator
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-violet-300/60 font-medium">
          <Wand2 className="w-3 h-3" />
          <span>Powered by Demucs</span>
        </div>
      </div>
    </header>
  );
}
