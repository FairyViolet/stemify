"use client";

import { useState } from "react";
import { Download, FileVideo, Loader2 } from "lucide-react";
import type { JobFile } from "@/types";
import { formatBytes, stemIcon, clsx } from "@/lib/utils";
import { getDownloadUrl } from "@/lib/api";

interface Props {
  jobId: string;
  file: JobFile;
  index: number;
}

function stemColors(label: string): { bg: string; border: string; text: string; btn: string } {
  const l = label.toLowerCase();
  if (l.includes("vocal") || l.includes("voice") || l.includes("dialogue"))
    return { bg: "bg-pink-500/10", border: "border-pink-500/25", text: "text-pink-300", btn: "bg-pink-600 hover:bg-pink-500" };
  if (l.includes("drum"))
    return { bg: "bg-orange-500/10", border: "border-orange-500/25", text: "text-orange-300", btn: "bg-orange-600 hover:bg-orange-500" };
  if (l.includes("bass"))
    return { bg: "bg-blue-500/10", border: "border-blue-500/25", text: "text-blue-300", btn: "bg-blue-600 hover:bg-blue-500" };
  if (l.includes("instrumental") || l.includes("background") || l.includes("other"))
    return { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-300", btn: "bg-emerald-600 hover:bg-emerald-500" };
  if (l.includes("muted") || l.includes("no-audio") || l.includes("no audio"))
    return { bg: "bg-slate-500/10", border: "border-slate-500/25", text: "text-slate-300", btn: "bg-slate-600 hover:bg-slate-500" };
  if (l.includes("full audio") || l.includes("audio"))
    return { bg: "bg-violet-500/10", border: "border-violet-500/25", text: "text-violet-300", btn: "bg-violet-600 hover:bg-violet-500" };
  return { bg: "bg-white/5", border: "border-white/15", text: "text-white/60", btn: "bg-violet-600 hover:bg-violet-500" };
}

/* Mini bar chart decoration */
function BarDeco({ color }: { color: string }) {
  const bars = [0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.5, 0.75];
  return (
    <div className="flex items-end gap-px h-5 opacity-50">
      {bars.map((h, i) => (
        <div key={i} className={clsx("w-1 rounded-sm", color)} style={{ height: `${h * 100}%` }} />
      ))}
    </div>
  );
}

export function StemResultCard({ jobId, file, index }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);

  const icon = stemIcon(file.label);
  const url = getDownloadUrl(jobId, file.filename);
  const colors = stemColors(file.label);
  const isVideo = file.filename.endsWith(".mp4") || file.filename.endsWith(".mov") ||
                  file.filename.endsWith(".mkv") || file.filename.endsWith(".webm");
  const ext = file.filename.split(".").pop()?.toUpperCase() ?? "WAV";

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    if (downloading) return;
    setDlError(null);
    setDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setDlError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className={clsx(
        "group flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-all duration-200",
        "hover:scale-[1.01] hover:shadow-lg",
        colors.bg, colors.border
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Emoji icon */}
      <div className="text-2xl w-10 text-center flex-shrink-0 select-none">
        {icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-semibold text-sm truncate">{file.label}</p>
          <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded border", colors.text, colors.border, colors.bg)}>
            {ext}
          </span>
        </div>
        <p className="text-white/35 text-[11px] truncate mt-0.5">{file.filename}</p>
        {file.size_bytes > 0 && (
          <p className={clsx("text-[11px] mt-0.5", colors.text)}>{formatBytes(file.size_bytes)}</p>
        )}
      </div>

      {/* Bar deco */}
      <div className="hidden sm:block">
        {isVideo
          ? <FileVideo className="w-5 h-5 text-white/20" />
          : <BarDeco color={colors.text.replace("text-", "bg-").replace("/60", "/40").replace("/30", "/40")} />
        }
      </div>

      {/* Download button */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className={clsx(
            "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-xs font-semibold",
            "transition-all duration-150 shadow-md disabled:opacity-60",
            downloading ? "cursor-wait" : "hover:scale-105 active:scale-95",
            colors.btn
          )}
        >
          {downloading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />
          }
          {downloading ? "Descargando…" : "Descargar"}
        </button>
        {dlError && (
          <p className="text-red-400 text-[10px] max-w-[140px] text-right leading-tight">{dlError}</p>
        )}
      </div>
    </div>
  );
}
