const ffmpegPath = require("ffmpeg-static");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Extract audio from a video file → WAV
 */
function extractAudio(videoPath, outputWav) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("pcm_s16le")
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

module.exports = { extractAudio, removeAudio, wavToMp3, hasAudioStream, getDuration };
