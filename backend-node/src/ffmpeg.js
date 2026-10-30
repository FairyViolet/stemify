const ffmpegPath = require("ffmpeg-static");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Output audio formats offered for downloads (separation and converter).
 * "wav32" is 32-bit float: the only one that can hold peaks above 0 dBFS,
 * so separated stems keep their exact level. The rest are standard formats.
 */
const AUDIO_FORMATS = {
  wav32:   { ext: "wav",  label: "WAV 32-bit float", args: ["-c:a", "pcm_f32le"], float: true },
  wav24:   { ext: "wav",  label: "WAV 24-bit",       args: ["-c:a", "pcm_s24le"] },
  wav16:   { ext: "wav",  label: "WAV 16-bit",       args: ["-c:a", "pcm_s16le"] },
  flac:    { ext: "flac", label: "FLAC 24-bit",      args: ["-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24"] },
  mp3_320: { ext: "mp3",  label: "MP3 320 kbps",     args: ["-c:a", "libmp3lame", "-b:a", "320k"] },
  mp3_192: { ext: "mp3",  label: "MP3 192 kbps",     args: ["-c:a", "libmp3lame", "-b:a", "192k"] },
  m4a:     { ext: "m4a",  label: "M4A (AAC 256 kbps)", args: ["-c:a", "aac", "-b:a", "256k"] },
  ogg:     { ext: "ogg",  label: "OGG Vorbis",       args: ["-c:a", "libvorbis", "-q:a", "6"] },
  opus:    { ext: "opus", label: "Opus 160 kbps",    args: ["-c:a", "libopus", "-b:a", "160k"] },
};
const DEFAULT_AUDIO_FORMAT = "wav32";

// Look-ahead peak limiter that only acts on samples above -0.09 dBFS.
// Below that it leaves the audio untouched (no auto-level, delay
// compensated), so stems keep their level; above it, peaks are smoothed
// instead of hard-clipped (which is what 16/24-bit and lossy formats do).
const PEAK_GUARD = "alimiter=limit=0.99:attack=1:release=50:level=disabled:latency=1";

/**
 * Convert the first audio stream of any audio/video file to `formatId`.
 * Metadata is kept; cover art and video are dropped.
 *
 * @param {{ peakGuard?: boolean }} opts - peakGuard: smooth peaks above
 *   0 dBFS (use for float stems going to a non-float format)
 */
function convertAudio(inputPath, outputPath, formatId, opts = {}) {
  const fmt = AUDIO_FORMATS[formatId];
  if (!fmt) return Promise.reject(new Error(`Formato no soportado: ${formatId}`));
  const args = ["-v", "error", "-nostdin", "-y", "-i", inputPath, "-map", "0:a:0", "-vn", "-map_metadata", "0"];
  if (opts.peakGuard && !fmt.float) args.push("-af", PEAK_GUARD);
  args.push(...fmt.args, outputPath);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr = (stderr + c).slice(-2000); });
    proc.on("error", (err) => reject(new Error(`FFmpeg convert: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg no pudo convertir el audio: ${stderr.trim().split("\n").pop()}`));
    });
  });
}

/**
 * Extract audio from a video file → 32-bit float WAV (no clipping, so it is
 * also a lossless input for the AI separation).
 */
function extractAudio(videoPath, outputWav) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("pcm_f32le")
      .audioFrequency(44100)
      .audioChannels(2)
      .output(outputWav)
      .on("end", resolve)
      .on("error", (err) => reject(new Error(`FFmpeg extract audio: ${err.message}`)))
      .run();
  });
}

/**
 * Remove audio from a video → muted video (copy video codec)
 */
function removeAudio(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noAudio()
      .videoCodec("copy")
      .output(outputPath)
      .on("end", resolve)
      .on("error", (err) => reject(new Error(`FFmpeg remove audio: ${err.message}`)))
      .run();
  });
}

/**
 * Convert WAV → MP3
 */
function wavToMp3(wavPath, mp3Path, bitrate = "320k") {
  return new Promise((resolve, reject) => {
    ffmpeg(wavPath)
      .audioCodec("libmp3lame")
      .audioBitrate(bitrate)
      .output(mp3Path)
      .on("end", resolve)
      .on("error", (err) => reject(new Error(`FFmpeg WAV→MP3: ${err.message}`)))
      .run();
  });
}

/**
 * Check file has an audio stream using ffprobe
 */
function hasAudioStream(filePath) {
  return new Promise((resolve, reject) => {
    console.log("[ffprobe] checking:", filePath);
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) {
        console.log("[ffprobe] error:", err.message);
        return reject(new Error(`No se pudo analizar el archivo: ${err.message}`));
      }
      const streams = meta?.streams ?? [];
      const hasAudio = streams.some((s) => s.codec_type === "audio");
      console.log("[ffprobe] streams:", streams.map(s=>s.codec_type), "hasAudio:", hasAudio);
      resolve(hasAudio);
    });
  });
}

/**
 * Get duration in seconds
 */
function getDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return resolve(0);
      resolve(meta?.format?.duration ?? 0);
    });
  });
}

module.exports = { AUDIO_FORMATS, DEFAULT_AUDIO_FORMAT, convertAudio, extractAudio, removeAudio, wavToMp3, hasAudioStream, getDuration };
