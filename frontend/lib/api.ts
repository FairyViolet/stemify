import type { Job, BackendStatus, VideoOptions, SubtitleSegment } from "@/types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function fetchBackendStatus(): Promise<BackendStatus> {
  const res = await fetch(`${BACKEND_URL}/api/status`);
  if (!res.ok) throw new Error("Backend unreachable");
  return res.json();
}

function friendlyError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch")
  ) {
    return new Error(
      "No se puede conectar al servidor backend. Asegúrate de que esté corriendo en el puerto 8000.\n\n" +
      "Ejecuta en una terminal:\n  cd backend && uvicorn app.main:app --port 8000"
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

export async function submitMusicJob(
  file: File,
  mode: string,
  quality: string = "high"
): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  form.append("quality", quality);

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/process/music`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    throw friendlyError(err);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail ?? `Error del servidor (${res.status})`;
    throw new Error(Array.isArray(detail) ? detail.map((d: {msg:string}) => d.msg).join(", ") : detail);
  }
  return res.json();
}

export async function submitVideoJob(
  file: File,
  options: VideoOptions
): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("extract_full_audio", String(options.extract_full_audio));
  form.append("remove_audio_track", String(options.remove_audio_track));
  form.append("separate_voice_music", String(options.separate_voice_music));
  form.append("separate_music_stems", String(options.separate_music_stems));

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/process/video`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    throw friendlyError(err);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail ?? `Error del servidor (${res.status})`;
    throw new Error(Array.isArray(detail) ? detail.map((d: {msg:string}) => d.msg).join(", ") : detail);
  }
  return res.json();
}

export async function submitTranscriptionJob(
  file: File,
  targetLanguage: string
): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("target_language", targetLanguage);

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/transcribe`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    throw friendlyError(err);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail ?? `Error del servidor (${res.status})`;
    throw new Error(Array.isArray(detail) ? detail.map((d: {msg:string}) => d.msg).join(", ") : detail);
  }
  return res.json();
}

export async function submitSubtitlesJob(
  file: File,
  style: string,
  orientation: string
): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("style", style);
  form.append("orientation", orientation);

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/subtitles`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    throw friendlyError(err);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail ?? `Error del servidor (${res.status})`;
    throw new Error(Array.isArray(detail) ? detail.map((d: {msg:string}) => d.msg).join(", ") : detail);
  }
  return res.json();
}

export async function submitTranscribeOnlyJob(file: File): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/subtitles/transcribe`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    throw friendlyError(err);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail ?? `Error del servidor (${res.status})`;
    throw new Error(Array.isArray(detail) ? detail.map((d: {msg:string}) => d.msg).join(", ") : detail);
  }
  return res.json();
}

export async function submitRenderJob(
  jobId: string,
  style: string,
  orientation: string,
  segments: SubtitleSegment[]
): Promise<{ job_id: string }> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/subtitles/render/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, orientation, segments }),
    });
  } catch (err) {
    throw friendlyError(err);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail ?? `Error del servidor (${res.status})`;
    throw new Error(Array.isArray(detail) ? detail.map((d: {msg:string}) => d.msg).join(", ") : detail);
  }
  return res.json();
}

export async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("Job not found");
  return res.json();
}

export async function deleteJob(jobId: string): Promise<void> {
  await fetch(`${BACKEND_URL}/api/jobs/${jobId}`, { method: "DELETE" });
}

export function getDownloadUrl(jobId: string, filename: string): string {
  return `${BACKEND_URL}/api/download/${jobId}/${encodeURIComponent(filename)}`;
}
