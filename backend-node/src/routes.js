const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const { getJob, updateJob, deleteJob: removeJob, createJob, isValidJobId } = require("./jobs");
const { cleanupJobFiles } = require("./cleanup");
const { processMusicJob, processVideoJob, processConvertJob } = require("./processing");
const { AUDIO_FORMATS, DEFAULT_AUDIO_FORMAT } = require("./ffmpeg");
const { checkDemucs, getAiInfo, QUALITY_PRESETS, DEFAULT_QUALITY } = require("./demucs");
const { runWhisperTranscription } = require("./transcription");
const { runBurnSubtitles, runTranscribeOnly, runRenderOnly } = require("./subtitles");

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "outputs";
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_MB || "500") * 1024 * 1024;

const ALLOWED_AUDIO = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif"]);
const ALLOWED_VIDEO = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi"]);

// Spaces are replaced too: Python workers are spawned through a shell when
// "python" is on PATH, and a space would split the file path in two.
function safeName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._\-]/g, "_") || "upload";
}

function parseQuality(value) {
  const quality = value || DEFAULT_QUALITY;
  return Object.hasOwn(QUALITY_PRESETS, quality) ? quality : null;
}

function parseFormat(value) {
  const format = value || DEFAULT_AUDIO_FORMAT;
  return Object.hasOwn(AUDIO_FORMATS, format) ? format : null;
}
const BAD_FORMAT = `Formato no válido. Usa: ${Object.keys(AUDIO_FORMATS).join(", ")}.`;

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
  // If the request is rejected after multer saved the file, drop it right
  // away instead of leaving it orphaned in uploads/.
  res.on("finish", () => {
    if (res.statusCode >= 400) cleanupJobFiles(req.__jobId);
  });
  next();
}

// Reject anything that is not a UUID before it reaches a filesystem path.
function validateJobIdParam(req, res, next, id) {
  if (!isValidJobId(id)) return res.status(400).json({ detail: "ID de job inválido." });
  next();
}
router.param("id", validateJobIdParam);
router.param("jobId", validateJobIdParam);

// ──────────────────────────────────────────────
// GET /api/status
// ──────────────────────────────────────────────
router.get("/status", (req, res) => {
  const ai = getAiInfo();
  res.json({
    ffmpeg: true,           // always true — ffmpeg-static is bundled
    demucs: checkDemucs(),
    roformer: ai.roformer,  // audio-separator installed
    gpu: ai.gpu,            // e.g. "NVIDIA GeForce RTX 4060", or null = CPU
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

  const quality = parseQuality(req.body.quality);
  if (!quality) return res.status(400).json({ detail: "La calidad debe ser 'roformer', 'high' o 'standard'." });

  const outputFormat = parseFormat(req.body.output_format);
  if (!outputFormat) return res.status(400).json({ detail: BAD_FORMAT });

  const jobId = req.__jobId;
  createJob(jobId, { stage: "Preparing file", progress: 10 });

  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  processMusicJob(jobId, req.file.path, mode, outputDir, quality, outputFormat).catch(() => {});

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
    quality: parseQuality(req.body.quality),
    output_format: parseFormat(req.body.output_format),
  };

  if (!options.output_format) {
    return res.status(400).json({ detail: BAD_FORMAT });
  }

  if (!options.quality) {
    return res.status(400).json({ detail: "La calidad debe ser 'roformer', 'high' o 'standard'." });
  }

  if (![options.extract_full_audio, options.remove_audio_track, options.separate_voice_music, options.separate_music_stems].some(Boolean)) {
    return res.status(400).json({ detail: "Selecciona al menos una opción de procesamiento." });
  }

  const jobId = req.__jobId;
  createJob(jobId, { stage: "Preparing file", progress: 5 });

  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  processVideoJob(jobId, req.file.path, options, outputDir).catch(() => {});

  res.json({ job_id: jobId });
});

// ──────────────────────────────────────────────
// POST /api/convert — audio converter (any audio/video → chosen format)
// ──────────────────────────────────────────────
router.post("/convert", attachJobId, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "No se recibió ningún archivo." });

  const outputFormat = parseFormat(req.body.output_format);
  if (!outputFormat) return res.status(400).json({ detail: BAD_FORMAT });

  const jobId = req.__jobId;
  createJob(jobId, { stage: "En cola..." });

  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  processConvertJob(jobId, req.file.path, outputFormat, outputDir).catch(() => {});

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
    segments: job.segments ?? null,
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

  // CORS origin is already handled by the cors() middleware in server.js
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Content-Disposition", `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
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
  createJob(jobId, { stage: "En cola...", progress: 0 });

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
  createJob(jobId, { stage: "En cola..." });

  const outputDir = path.join(OUTPUT_DIR, jobId);
  fs.mkdirSync(outputDir, { recursive: true });

  const options = { style, orientation };
  processSubtitlesJob(jobId, req.file.path, options, outputDir).catch(() => {});

  res.json({ job_id: jobId });
});

// ──────────────────────────────────────────────
// POST /api/subtitles/transcribe — transcribe only (for the manual emphasis editor)
// ──────────────────────────────────────────────
async function processTranscribeOnlyJob(jobId, inputPath, options) {
  updateJob(jobId, { status: "processing", stage: "Iniciando Whisper...", progress: 5 });
  try {
    const result = await runTranscribeOnly(inputPath, options, (pct, stage) => {
      updateJob(jobId, { progress: pct, stage });
    });
    updateJob(jobId, {
      status: "completed",
      progress: 100,
      stage: "Transcripción lista",
      segments: result.segments,
      files: [],
    });
  } catch (err) {
    console.error(`[subtitles/transcribe] job ${jobId} failed:`, err.message);
    updateJob(jobId, { status: "failed", error: err.message });
  }
}

router.post("/subtitles/transcribe", attachJobId, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "No se recibió ningún archivo." });

  const ext = getExt(req.file.originalname);
  if (!ALLOWED_VIDEO.has(ext)) {
    return res.status(400).json({ detail: `Tipo no soportado: ${ext}. Usa MP4, MOV, MKV, WEBM o AVI.` });
  }

  const jobId = req.__jobId;
  createJob(jobId, { stage: "En cola...", segments: null });

  // No outputDir needed yet — the uploaded video stays in uploads/{jobId}/
  // and is reused by /subtitles/render/:jobId below.
  processTranscribeOnlyJob(jobId, req.file.path, {}).catch(() => {});

  res.json({ job_id: jobId });
});

// ──────────────────────────────────────────────
// POST /api/subtitles/render/:jobId — burn (possibly edited) segments
// into the SAME video uploaded during the /transcribe step above.
// ──────────────────────────────────────────────
async function processRenderJob(jobId, inputPath, segments, options, outputDir) {
  updateJob(jobId, { status: "processing", stage: "Generando subtítulos...", progress: 10, files: [] });
  try {
    const result = await runRenderOnly(inputPath, outputDir, segments, options, (pct, stage) => {
      updateJob(jobId, { progress: pct, stage });
    });
    updateJob(jobId, {
      status: "completed",
      progress: 100,
      stage: "Completado",
      files: result.files,
    });
  } catch (err) {
    console.error(`[subtitles/render] job ${jobId} failed:`, err.message);
    updateJob(jobId, { status: "failed", error: err.message });
  }
}

router.post("/subtitles/render/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  const job = getJob(jobId);
  if (!job) return res.status(404).json({ detail: "Job no encontrado. Volvé a subir el video." });
  if (job.status === "queued" || job.status === "processing") {
    return res.status(409).json({ detail: "Este video todavía se está procesando. Esperá a que termine." });
  }

  const uploadDir = path.join(UPLOAD_DIR, jobId);
  if (!fs.existsSync(uploadDir)) {
    return res.status(404).json({ detail: "El video original ya no está disponible. Volvé a subirlo." });
  }
  const uploadedFiles = fs.readdirSync(uploadDir);
  if (uploadedFiles.length === 0) {
    return res.status(404).json({ detail: "El video original ya no está disponible. Volvé a subirlo." });
  }
  const inputPath = path.join(uploadDir, uploadedFiles[0]);

  const { style, orientation, segments } = req.body || {};

  const validStyles = new Set(["pop", "clean", "classic"]);
  const finalStyle = style || "pop";
  if (!validStyles.has(finalStyle)) {
    return res.status(400).json({ detail: `Estilo no válido: ${finalStyle}` });
  }

  const validOrientations = new Set(["auto", "horizontal", "vertical"]);
  const finalOrientation = orientation || "auto";
  if (!validOrientations.has(finalOrientation)) {
    return res.status(400).json({ detail: `Orientación no válida: ${finalOrientation}` });
  }

  if (!Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ detail: "Faltan los segmentos de texto a quemar." });
  }

  const outputDir = path.join(OUTPUT_DIR, jobId);
  const options = { style: finalStyle, orientation: finalOrientation };
  processRenderJob(jobId, inputPath, segments, options, outputDir).catch(() => {});

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
