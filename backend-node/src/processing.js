const path = require("path");
const fs = require("fs");
const { updateJob } = require("./jobs");
const { extractAudio, removeAudio, hasAudioStream } = require("./ffmpeg");
const { runDemucs, stemLabel, extractStemSuffix } = require("./demucs");

function fileSize(p) {
  try { return fs.statSync(p).size; } catch { return 0; }
}

function safeDest(outputDir, srcPath, label) {
  const ext = path.extname(srcPath);
  const name = `${label}${ext}`;
  const dest = path.join(outputDir, name);
  if (srcPath !== dest) {
    try { fs.renameSync(srcPath, dest); } catch {}
  }
  return dest;
}

/**
 * Music separation job runner
 */
async function processMusicJob(jobId, uploadPath, mode, outputDir) {
  try {
    updateJob(jobId, { status: "processing", stage: "Validating audio", progress: 5 });

    const hasAudio = await hasAudioStream(uploadPath);
    if (!hasAudio) throw new Error("El archivo no tiene pista de audio. Asegúrate de que el archivo de audio es válido.");

    updateJob(jobId, { stage: "Running AI separation", progress: 20 });

    const baseName = path.basename(uploadPath, path.extname(uploadPath));
    const stemFiles = await runDemucs(uploadPath, outputDir, mode, (pct) => {
      // Map demucs 0-100 to our 20-85 range
      updateJob(jobId, { progress: Math.round(20 + pct * 0.65) });
    });

    if (!stemFiles.length) throw new Error("Demucs no generó archivos de salida.");

    updateJob(jobId, { stage: "Exporting files", progress: 88 });

    const jobFiles = [];
    for (const src of stemFiles) {
      const suffix = extractStemSuffix(src, baseName);   // e.g. "vocals", "no_vocals"
      const destName = `${baseName}_${suffix}.wav`;
      const dest = path.join(outputDir, destName);
      try { if (src !== dest) fs.renameSync(src, dest); } catch {}
      jobFiles.push({
        filename: destName,
        label: stemLabel(src),
        size_bytes: fileSize(dest),
      });
    }

    updateJob(jobId, { status: "completed", progress: 100, stage: "Completed", files: jobFiles });
  } catch (err) {
    updateJob(jobId, { status: "failed", stage: "Failed", error: err.message });
  }
}

/**
 * Video processing job runner
 */
async function processVideoJob(jobId, uploadPath, options, outputDir) {
  const {
    extract_full_audio,
    remove_audio_track,
    separate_voice_music,
    separate_music_stems,
  } = options;

  try {
    updateJob(jobId, { status: "processing", stage: "Validating video", progress: 5 });

    const baseName = path.basename(uploadPath, path.extname(uploadPath));
    const videoExt = path.extname(uploadPath);
    const jobFiles = [];

    const needsAudio = extract_full_audio || separate_voice_music || separate_music_stems;

    let extractedAudio = null;

    if (needsAudio) {
      const hasAudio = await hasAudioStream(uploadPath);
      if (!hasAudio) throw new Error("El vídeo no tiene pista de audio. Intenta con un archivo de vídeo diferente.");

      updateJob(jobId, { stage: "Extracting audio", progress: 15 });
      extractedAudio = path.join(outputDir, `${baseName}_full-audio.wav`);
      await extractAudio(uploadPath, extractedAudio);

      if (extract_full_audio) {
        jobFiles.push({
          filename: `${baseName}_full-audio.wav`,
          label: "Full Audio",
          size_bytes: fileSize(extractedAudio),
        });
      }
    }

    if (remove_audio_track) {
      updateJob(jobId, { stage: "Removing audio track", progress: 30 });
      const mutedName = `${baseName}_no-audio${videoExt}`;
      const mutedPath = path.join(outputDir, mutedName);
      await removeAudio(uploadPath, mutedPath);
      jobFiles.push({
        filename: mutedName,
        label: "Muted Video",
        size_bytes: fileSize(mutedPath),
      });
    }

    if (separate_voice_music && extractedAudio) {
      updateJob(jobId, { stage: "Separating voices and music", progress: 45 });
      const stemFiles = await runDemucs(extractedAudio, outputDir, "2stem", (pct) => {
        updateJob(jobId, { progress: Math.round(45 + pct * 0.3) });
      });
      for (const src of stemFiles) {
        const suffix = extractStemSuffix(src, path.basename(extractedAudio, ".wav"));
        const destName = `${baseName}_${suffix}.wav`;
        const dest = path.join(outputDir, destName);
        try { if (src !== dest) fs.renameSync(src, dest); } catch {}
        if (!destName.includes("full-audio")) {
          jobFiles.push({ filename: destName, label: stemLabel(src), size_bytes: fileSize(dest) });
        }
      }
    }

    if (separate_music_stems && extractedAudio) {
      updateJob(jobId, { stage: "Running 4-stem AI separation", progress: 60 });
      const stemFiles = await runDemucs(extractedAudio, outputDir, "4stem", (pct) => {
        updateJob(jobId, { progress: Math.round(60 + pct * 0.28) });
      });
      for (const src of stemFiles) {
        const suffix = extractStemSuffix(src, path.basename(extractedAudio, ".wav"));
        const destName = `${baseName}_${suffix}.wav`;
        const dest = path.join(outputDir, destName);
        try { if (src !== dest) fs.renameSync(src, dest); } catch {}
        if (!destName.includes("full-audio")) {
          jobFiles.push({ filename: destName, label: stemLabel(src), size_bytes: fileSize(dest) });
        }
      }
    }

    // Deduplicate
    const seen = new Set();
    const unique = jobFiles.filter((f) => { if (seen.has(f.filename)) return false; seen.add(f.filename); return true; });

    updateJob(jobId, { stage: "Completed", progress: 100, status: "completed", files: unique });
  } catch (err) {
    updateJob(jobId, { status: "failed", stage: "Failed", error: err.message });
  }
}

module.exports = { processMusicJob, processVideoJob };
