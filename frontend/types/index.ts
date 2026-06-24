export type AppMode = "music" | "video" | "speech";

export type MusicMode = "2stem" | "4stem";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface JobFile {
  filename: string;
  label: string;
  size_bytes: number;
}

export interface Job {
  job_id: string;
  status: JobStatus;
  progress: number;
  stage: string;
  error: string | null;
  files: JobFile[];
}

export interface VideoOptions {
  extract_full_audio: boolean;
  remove_audio_track: boolean;
  separate_voice_music: boolean;
  separate_music_stems: boolean;
}

export interface BackendStatus {
  ffmpeg: boolean;
  demucs: boolean;
}
