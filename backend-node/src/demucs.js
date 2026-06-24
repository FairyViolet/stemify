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

// Known demucs.exe paths
const KNOWN_DEMUCS_PATHS = [
  "C:\\Users\\User\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\demucs.exe",
  "C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\demucs.exe",
];

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
      ["-c", "import torch, torchaudio, soundfile, demucs"],
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

/**
 * Run Demucs separation.
 * Returns list of output .wav file paths.
 */
async function runDemucs(audioPath, outputDir, mode, onProgress) {
  // Use the wrapper script that patches torchaudio to avoid TorchCodec requirement
  const WRAPPER = "C:\\stemify\\demucs_wrapper.py";
  const python = findDemucsPython();
  if (!python) {
    throw new Error(
      "No se encontró un entorno Python con Demucs instalado correctamente. " +
      "Ejecuta: pip install demucs soundfile torch torchaudio"
    );
  }

  const isAbsolute = python.includes("\\") || python.includes("/");
  const executable = python;
  const args = fs.existsSync(WRAPPER) ? [WRAPPER] : ["-m", "demucs"];

  const model = "htdemucs";
  args.push("--out", outputDir, "--name", model, "--filename", "{track}_{stem}.{ext}");
  if (mode === "2stem") args.push("--two-stems", "vocals");
  args.push(audioPath);

  console.log(`[demucs] running: ${executable} ${args.join(" ")}`);

  // Force torchaudio to use soundfile backend (avoids TorchCodec requirement on Windows)
  const env = {
    ...process.env,
    TORCHAUDIO_BACKEND: "soundfile",
    PYTORCH_ENABLE_MPS_FALLBACK: "1",
  };

  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { encoding: "utf8", env, shell: !isAbsolute });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
      // Parse progress from demucs stderr output like "Separating track 45%"
      const pct = stderr.match(/(\d+)%/g);
      if (pct && onProgress) {
        onProgress(parseInt(pct[pct.length - 1]));
      }
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Demucs falló (código ${code}): ${stderr.slice(-1000)}`)
        );
      }

      // Find output files
      const baseName = path.basename(audioPath, path.extname(audioPath));
      const stemDir = findStemDir(outputDir, model, baseName);
      if (!stemDir) {
        // Flat fallback
        const flat = walkWav(outputDir);
        return resolve(flat);
      }
      resolve(walkWav(stemDir));
    });

    proc.on("error", (err) => {
      reject(new Error(`No se pudo ejecutar Demucs: ${err.message}`));
    });
  });
}

function findStemDir(baseDir, model, trackName) {
  const candidates = [
    path.join(baseDir, model, trackName),
    path.join(baseDir, trackName),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Walk up to 3 levels deep
  function walk(dir, depth) {
    if (depth <= 0) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === trackName) return path.join(dir, entry.name);
        const found = walk(path.join(dir, entry.name), depth - 1);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(baseDir, 3);
}

function walkWav(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".wav")) results.push(full);
    else if (entry.isDirectory()) results.push(...walkWav(full));
  }
  return results;
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

module.exports = { checkDemucs, runDemucs, stemLabel, extractStemSuffix };
