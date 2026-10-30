const { spawnSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Order matters: more specific keys first to avoid "vocals" matching "no_vocals"
const STEM_LABELS = [
  ["no_vocals", "Instrumental"],
  ["vocals",    "Vocals"],
  ["drums",     "Drums"],
  ["bass",      "Bass"],
  ["guitar",    "Guitar"],
  ["piano",     "Piano"],
  ["other",     "Other Instruments"],
];

// Separation quality presets.
// - roformer: BS-RoFormer (the model behind Ultimate Vocal Remover) for the
//   vocals — about +2.4 dB cleaner than htdemucs_ft on audio-separator's
//   benchmark. In 4-stem mode Demucs then splits the instrumental.
//   Needs `audio-separator` (instalar_ia.bat). Weights (~640 MB) download
//   on first use into models/.
// - high: htdemucs_ft — 4 models each fine-tuned on one source — run twice
//   with random time shifts and averaged. ~8x slower than standard.
//   Weights (~320 MB) download on first use.
// - standard: the original htdemucs model, one pass (fastest).
const QUALITY_PRESETS = {
  roformer: { engine: "roformer", model: "htdemucs_ft", shifts: 1 },
  high:     { engine: "demucs",   model: "htdemucs_ft", shifts: 2 },
  standard: { engine: "demucs",   model: "htdemucs",    shifts: 1 },
};
const DEFAULT_QUALITY = "high";
const ROFORMER_MODEL = "model_bs_roformer_ep_317_sdr_12.9755.ckpt";
const MODELS_DIR = path.resolve(__dirname, "..", "..", "models");

// Known Python install paths on this machine (checked first for reliability)
// IMPORTANT: venv paths come first — they have torch/demucs installed
const KNOWN_PYTHON_PATHS = [
  // Project venv (has torch, demucs, whisper — always try this first)
  "S:\\Claude code\\stemify\\venv\\Scripts\\python.exe",
  path.join(__dirname, "..", "..", "venv", "Scripts", "python.exe"),
  // System Python fallbacks
  "C:\\Users\\User\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe",
  "C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python311\\python.exe",
  "C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
  "C:\\Python311\\python.exe",
  "C:\\Python312\\python.exe",
];

// With `shell: true` Node joins args with spaces, so any arg containing a
// space (Python code, "S:\\Claude code\\..." paths) must be quoted to stay whole.
function shellArgs(args, viaShell) {
  return viaShell ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
}

function findPython() {
  // Try known absolute paths first (Windows App Aliases don't work with child_process)
  for (const p of KNOWN_PYTHON_PATHS) {
    if (fs.existsSync(p)) {
      const r = spawnSync(p, ["--version"], { encoding: "utf8", timeout: 3000 });
      if (r.status === 0) return p;
    }
  }
  // Fall back to PATH search
  for (const cmd of ["python", "python3", "py"]) {
    try {
      const r = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 3000, shell: true });
      if (r.status === 0) return cmd;
    } catch {}
  }
  return null;
}

// Cache: avoid re-running the (slow) import check on every job
let _cachedDemucsPython = undefined;

/**
 * Find a Python interpreter that can ACTUALLY run Demucs — i.e. has
 * torch, torchaudio, soundfile and demucs all importable. A Python
 * existing and running `--version` successfully is not enough: some
 * envs (e.g. a venv set up only for Whisper) have torch but not demucs.
 */
function findDemucsPython() {
  if (_cachedDemucsPython !== undefined) return _cachedDemucsPython;

  const candidates = [...KNOWN_PYTHON_PATHS, "python", "python3", "py"];
  for (const p of candidates) {
    const isAbsolute = p.includes("\\") || p.includes("/");
    if (isAbsolute && !fs.existsSync(p)) continue;
    const r = spawnSync(
      p,
      shellArgs(["-c", "import torch, torchaudio, soundfile, demucs"], !isAbsolute),
      { encoding: "utf8", timeout: 15000, shell: !isAbsolute }
    );
    if (r.status === 0) {
      _cachedDemucsPython = p;
      return p;
    }
  }
  _cachedDemucsPython = null;
  return null;
}

function checkDemucs() {
  return findDemucsPython() !== null;
}

// Cache: what the AI Python env can do (RoFormer installed? GPU visible?)
let _cachedAiInfo = undefined;

/**
 * @returns {{ roformer: boolean, gpu: string|null, torch: string|null }}
 */
function getAiInfo() {
  if (_cachedAiInfo !== undefined) return _cachedAiInfo;
  const fallback = { roformer: false, gpu: null, torch: null };
  const python = findDemucsPython();
  if (!python) return (_cachedAiInfo = fallback);

  const isAbsolute = python.includes("\\") || python.includes("/");
  // No double quotes inside: the whole snippet gets quoted for the shell.
  const code =
    "import json, importlib.util as u, torch; " +
    "print(json.dumps({'roformer': u.find_spec('audio_separator') is not None and u.find_spec('onnxruntime') is not None, " +
    "'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None, " +
    "'torch': torch.__version__}))";
  const r = spawnSync(python, shellArgs(["-c", code], !isAbsolute), {
    encoding: "utf8", timeout: 30000, shell: !isAbsolute,
  });
  try {
    _cachedAiInfo = { ...fallback, ...JSON.parse(r.stdout.trim().split("\n").pop()) };
  } catch {
    _cachedAiInfo = fallback;
  }
  return _cachedAiInfo;
}

const ffmpegPath = require("ffmpeg-static");

const WORKER_SCRIPT = path.resolve(__dirname, "..", "..", "backend", "separation_worker.py");

/**
 * Run Demucs separation through backend/separation_worker.py.
 * Returns list of output .wav file paths (32-bit float, original loudness).
 *
 * @param {"standard"|"high"} quality - see QUALITY_PRESETS
 */
async function runDemucs(audioPath, outputDir, mode, onProgress, quality = DEFAULT_QUALITY) {
  const python = findDemucsPython();
  if (!python) {
    throw new Error(
      "No se encontró un entorno Python con Demucs instalado correctamente. " +
      "Ejecuta: pip install demucs soundfile torch torchaudio"
    );
  }
  if (!fs.existsSync(WORKER_SCRIPT)) {
    throw new Error(`Worker script no encontrado: ${WORKER_SCRIPT}`);
  }

  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS[DEFAULT_QUALITY];
  const args = [
    WORKER_SCRIPT,
    "--input", audioPath,
    "--output_dir", outputDir,
    "--engine", preset.engine,
    "--roformer_model", ROFORMER_MODEL,
    "--model_dir", MODELS_DIR,
    "--model", preset.model,
    "--shifts", String(preset.shifts),
    "--overlap", "0.25",
  ];
  if (mode === "2stem") args.push("--two_stems", "vocals");

  console.log(`[demucs] running: ${python} ${args.join(" ")}`);
  const isAbsolute = python.includes("\\") || python.includes("/");

  return new Promise((resolve, reject) => {
    const proc = spawn(python, shellArgs(args, !isAbsolute), {
      shell: !isAbsolute,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTORCH_ENABLE_MPS_FALLBACK: "1",
        STEMIFY_FFMPEG_PATH: ffmpegPath,
        // audio-separator refuses to start unless `ffmpeg` is on PATH
        PATH: `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH || ""}`,
      },
    });

    let stderr = "";
    let stdoutBuf = "";
    let result = null;
    let workerError = null;

    proc.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString("utf8");
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg;
        try { msg = JSON.parse(trimmed); } catch { continue; }
        if (msg.error) workerError = msg.error;
        else if (msg.done) result = msg;
        else if (typeof msg.progress === "number" && onProgress) onProgress(msg.progress, msg.stage);
      }
    });

    proc.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-4000);
    });

    proc.on("close", (code) => {
      if (workerError) return reject(new Error(`Demucs falló: ${workerError}`));
      if (code !== 0 || !result) {
        return reject(new Error(`Demucs falló (código ${code}): ${stderr.slice(-1000)}`));
      }
      console.log(`[demucs] ${preset.engine} done on ${result.device}: ${result.files.length} pistas`);
      resolve(result.files);
    });

    proc.on("error", (err) => {
      reject(new Error(`No se pudo ejecutar Demucs: ${err.message}`));
    });
  });
}

function stemLabel(filename) {
  const base = path.basename(filename, ".wav").toLowerCase();
  for (const [key, label] of STEM_LABELS) {
    if (base.includes(key)) return label;
  }
  return base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract just the stem suffix from a demucs output filename.
 * e.g. "my-song_vocals" with trackBaseName "my-song" → "vocals"
 */
function extractStemSuffix(demucsFilename, trackBaseName) {
  const base = path.basename(demucsFilename, path.extname(demucsFilename));
  const prefix = trackBaseName + "_";
  if (base.startsWith(prefix)) {
    return base.slice(prefix.length);
  }
  return base;
}

module.exports = { QUALITY_PRESETS, DEFAULT_QUALITY, checkDemucs, getAiInfo, runDemucs, stemLabel, extractStemSuffix };
