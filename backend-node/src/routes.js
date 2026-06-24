const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const { getJob, updateJob, deleteJob: removeJob, getAllJobs, createJob } = require("./jobs");
const { cleanupJobFiles } = require("./cleanup");
const { processMusicJob, processVideoJob } = require("./processing");
const { checkDemucs } = require("./demucs");
const { runWhisperTranscription } = require("./transcription");
const { runBurnSubtitles } = require("./subtitles");

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "outputs";
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_MB || "500") * 1024 * 1024;

const ALLOWED_AUDIO = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);
const ALLOWED_VIDEO = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi"]);

function safeName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._\- ]/g, "_") || "upload";
}

function getExt(name) {
  return path.extname(name).toLowerCase();
}

// Multer: stream to disk into a temp upload dir per job
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = req.__jobId;
    const dir = path.join(UPLOAD_DIR, jobId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, safeName(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = getExt(file.originalname);
    const allowed = [...ALLOWED_AUDIO, ...ALLOWED_VIDEO];
    if (!allowed.includes(ext)) {
      return cb(new Error(`Tipo de archivo no soportado: ${ext}`));
    }
    cb(null, true);
  },
});

// Middleware: attach a fresh jobId before multer processes the body
function attachJobId(req, res, next) {
  req.__jobId = uuidv4();
  next();
}

// ──────────────────────────────────────────────
// GET /api/status
// ──────────────────────────────────────────────
router.get("/status", (req, res) => {
  res.json({
    ffmpeg: true,           // always true — ffmpeg-static is bundled
    demucs: checkDemucs(),
  });
});

// ──────────────────────────────────────────────
// POST /api/process/music
// ──────────────────────────────────────────────
router.post("/process/music", attachJobId, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "No se recibió ningún archivo." });

  const ext = getExt(req.file.originalname);
  if (!ALLOWED_AUDIO.has(ext)) {
    return res.status(400).json({ detail: `Tipo no soportado: ${ext}` });
  }

  const mode = req.body.mode || "2stem";
  if (!["2stem", "4stem"].includes(mode)) {
    return res.status(400).json({ detail: "El modo debe ser '2stem' o '4stem'." });
  }

  const jobId = req.__jobId;
  const job = createJob();
  job.job_id = jobId;
  getAllJobs().delete(job.job_id);
  getAllJobs().set(jobId, job);
  updateJob(jobId, { stage: "Preparing file", progress: 10 });

  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  processMusicJob(jobId, req.file.path, mode, outputDir).catch(() => {});

  res.json({ job_id: jobId });
});

// ──────────────────────────────────────────────
// POST /api/process/video
// ──────────────────────────────────────────────
router.post("/process/video", attachJobId, upload.single("file"), async (req, res) => {
  console.log("[video] req.file:", req.file ? `${req.file.path} (${req.file.size}B)` : "NULL");
  console.log("[video] UPLOAD_DIR:", UPLOAD_DIR);
  if (!req.file) return res.status(400).json({ detail: "No se recibió ningún archivo." });

  const ext = getExt(req.file.originalname);
  if (!ALLOWED_VIDEO.has(ext)) {
    return res.status(400).json({ detail: `Tipo no soportado: ${ext}. Usa MP4, MOV, MKV, WEBM o AVI.` });
  }

  const options = {
    extract_full_audio:   req.body.extract_full_audio   === "true",
    remove_audio_track:   req.body.remove_audio_track   === "true",
    separate_voice_music: req.body.separate_voice_music === "true",
    separate_music_stems: req.body.separate_music_stems === "true",
  };

  if (!Object.values(options).some(Boolean)) {
    return res.status(400).json({ detail: "Selecciona al menos una opción de procesamiento." });
  }

  const jobId = req.__jobId;
  const job = createJob();
  job.job_id = jobId;
  getAllJobs().delete(job.job_id);
  getAllJobs().set(jobId, job);
  updateJob(jobId, { stage: "Preparing file", progress: 5 });

  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  processVideoJob(jobId, req.file.path, options, outputDir).catch(() => {});

  res.json({ job_id: jobId });
});

// ──────────────────────────────────────────────
// GET /api/jobs/:id
// ──────────────────────────────────────────────
router.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ detail: "Job no encontrado." });
  res.json({
    job_id: job.job_id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
    files: job.files,
  });
});

// ──────────────────────────────────────────────
// GET /api/download/:id/:filename
// ──────────────────────────────────────────────
router.get("/download/:id/:filename", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ detail: "Job no encontrado. El servidor fue reiniciado — volvé a procesar el archivo." });
  if (job.status !== "completed") return res.status(400).json({ detail: "El job aún no ha terminado." });

  const safe = safeName(decodeURIComponent(req.params.filename));
  const allowed = new Set(job.files.map((f) => f.filename));
  if (!allowed.has(safe)) return res.status(403).json({ detail: "Acceso denegado." });

  const filePath = path.join(OUTPUT_DIR, req.params.id, safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ detail: "El archivo procesado ya no existe en disco (fue limpiado automáticamente). Volvé a subir el archivo." });

  // Explicit headers for cross-origin download support
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(safe)}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  res.sendFile(path.resolve(filePath));
});

// ──────────────────────────────────────────────
// DELETE /api/jobs/:id
// ──────────────────────────────────────────────
router.delete("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ detail: "Job no encontrado." });
  cleanupJobFiles(req.params.id);
  removeJob(req.params.id);
  res.json({ message: "Job eliminado." });
});

// ──────────────────────────────────────────────
// POST /api/transcribe
// ──────────────────────────────────────────────
async function processTranscriptionJob(jobId, inputPath, options, outputDir) {
  updateJob(jobId, { status: "processing", stage: "Iniciando Whisper...", progress: 5 });
  try {
    const result = await runWhisperTranscription(inputPath, outputDir, options, (pct, stage) => {
      updateJob(jobId, { progress: pct, stage });
    });
    updateJob(jobId, {
      status: "completed",
      progress: 100,
      stage: "Completado",
      files: result.files,
    });
  } catch (err) {
    console.error(`[transcribe] job ${jobId} failed:`, err.message);
    updateJob(jobId, { status: "failed", error: err.message });
  }
}

router.post("/transcribe", attachJobId, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "No se recibió ningún archivo." });

  const ext = getExt(req.file.originalname);
  const allowed = new Set([...ALLOWED_AUDIO, ...ALLOWED_VIDEO]);
  if (!allowed.has(ext)) {
    return res.status(400).json({ detail: `Tipo no soportado: ${ext}` });
  }

  const targetLanguage = req.body.target_language || "original";
  const validLanguages = new Set(["original", "en", "es", "pt", "fr"]);
  if (!validLanguages.has(targetLanguage)) {
    return res.status(400).json({ detail: `Idioma no válido: ${targetLanguage}` });
  }

  const jobId = req.__jobId;
  const job = createJob();
  job.job_id = jobId;
  getAllJobs().delete(job.job_id);
  getAllJobs().set(jobId, job);
  updateJob(jobId, { stage: "En cola...", progress: 0 });

  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  const options = { language: targetLanguage };
  processTranscriptionJob(jobId, req.file.path, options, outputDir).catch(() => {});

  res.json({ job_id: jobId });
});

// ──────────────────────────────────────────────
// POST /api/subtitles — burn dynamic word-level subtitles into a video
// ──────────────────────────────────────────────
async function processSubtitlesJob(jobId, inputPath, options, outputDir) {
  updateJob(jobId, { status: "processing", stage: "Iniciando Whisper...", progress: 5 });
  try {
    const result = await runBurnSubtitles(inputPath, outputDir, options, (pct, stage) => {
      updateJob(jobId, { progress: pct, stage });
    });
    updateJob(jobId, {
      status: "completed",
      progress: 100,
      stage: "Completado",
      files: result.files,
    });
  } catch (err) {
    console.error(`[subtitles] job ${jobId} failed:`, err.message);
    updateJob(jobId, { status: "failed", error: err.message });
  }
}

router.post("/subtitles", attachJobId, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "No se recibió ningún archivo." });

  const ext = getExt(req.file.originalname);
  if (!ALLOWED_VIDEO.has(ext)) {
    return res.status(400).json({ detail: `Tipo no soportado: ${ext}. Usa MP4, MOV, MKV, WEBM o AVI.` });
  }

  const style = req.body.style || "pop";
  const validStyles = new Set(["pop", "clean", "classic"]);
  if (!validStyles.has(style)) {
    return res.status(400).json({ detail: `Estilo no válido: ${style}` });
  }

  const orientation = req.body.orientation || "auto";
  const validOrientations = new Set(["auto", "horizontal", "vertical"]);
  if (!validOrientations.has(orientation)) {
    return res.status(400).json({ detail: `Orientación no válida: ${orientation}` });
  }

  const jobId = req.__jobId;
  getAllJobs().set(jobId, {
    job_id: jobId, status: "queued", progress: 0,
    stage: "En cola...", error: null, files: [], created_at: Date.now(),
  });

  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  const options = { style, orientation };
  processSubtitlesJob(jobId, req.file.path, options, outputDir).catch(() => {});

  res.json({ job_id: jobId });
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ detail: `El archivo supera el límite de ${process.env.MAX_UPLOAD_MB || 500} MB.` });
  }
  res.status(400).json({ detail: err.message || "Error de carga." });
});

module.exports = router;
