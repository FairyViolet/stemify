export type AppMode = "music" | "video" | "speech" | "subtitles" | "convert";

export type AudioFormat =
  | "wav32" | "wav24" | "wav16" | "flac"
  | "mp3_320" | "mp3_192" | "m4a" | "ogg" | "opus";

export type MusicMode = "2stem" | "4stem";
export type SeparationQuality = "roformer" | "high" | "standard";

export type SubtitleStyle = "pop" | "clean" | "classic";

export type SubtitleOrientation = "auto" | "horizontal" | "vertical";

export type SubtitleAnimation = "pop" | "shake" | "flash" | "none";

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
  color?: string;               // hex "#RRGGBB" manual override
  sizeMultiplier?: number;      // e.g. 1.5 = 150% size, manual override
  animation?: SubtitleAnimation; // manual override of the active-word animation
}

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
  words: SubtitleWord[];
}

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
  segments?: SubtitleSegment[] | null;
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
  roformer?: boolean;    // BS-RoFormer (audio-separator) installed
  gpu?: string | null;   // GPU name used for AI, null = CPU only
}
