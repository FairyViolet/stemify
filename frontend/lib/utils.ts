export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function stemIcon(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("vocal") || lower.includes("voice") || lower.includes("dialogue")) return "🎤";
  if (lower.includes("drum")) return "🥁";
  if (lower.includes("bass")) return "🎸";
  if (lower.includes("instrumental") || lower.includes("background") || lower.includes("music")) return "🎵";
  if (lower.includes("other")) return "🎹";
  if (lower.includes("muted") || lower.includes("no-audio") || lower.includes("no audio")) return "🎬";
  if (lower.includes("full audio") || lower.includes("audio")) return "🔊";
  return "🎧";
}

export function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
