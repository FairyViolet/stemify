const { spawnSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const ffmpegPath = require("ffmpeg-static");

// Directory containing ffmpeg.exe — Whisper shells out to the `ffmpeg`
// command internally to decode audio, so it must be on PATH for the
// Python subprocess (we only bundle it for Node, not system-wide).
const FFMPEG_DIR = path.dirname(ffmpegPath);

// Venv Python takes priority — it has whisper + torch installed
const KNOWN_PYTHON_PATHS = [
  // Project venv (has whisper, torch, etc.)
  path.join(__dirname, "..", "..", "venv", "Scripts", "python.exe"),
  "S:\\Claude code\\stemify\\venv\\Scripts\\python.exe",
  // System Python fallbacks
  "C:\\Users\\User\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe",
  "C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python311\\python.exe",
  "C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
  "C:\\Python311\\python.exe",
  "C:\\Python312\\python.exe",
];

const WORKER_SCRIPT = path.resolve(
  __dirname, "..", "..", "backend", "whisper_worker.py"
);

// Cache: avoid re-running the (slow) import check on every job
let _cachedWhisperPython = undefined;

/**
 * Find a Python interpreter that can ACTUALLY run Whisper — i.e. has
 * torch and whisper importable. Just finding a python.exe that runs
 * `--version` is not enough: some envs have python but not the packages.
 */
function findPython() {
  if (_cachedWhisperPython !== undefined) return _cachedWhisperPython;

  const candidates = [...KNOWN_PYTHON_PATHS, "python", "python3", "py"];
  for (const p of candidates) {
    const isAbsolute = p.includes("\\") || p.includes("/");
    if (isAbsolute && !fs.existsSync(p)) continue;
    const r = spawnSync(
      p,
      // Quoted when it goes through a shell, or the space splits the code in two
      ["-c", isAbsolute ? "import torch, whisper" : '"import torch, whisper"'],
      { encoding: "utf8", timeout: 15000, shell: !isAbsolute }
    );
    if (r.status === 0) {
      _cachedWhisperPython = p;
      return p;
    }
  }
  _cachedWhisperPython = null;
  return null;
}

/**
 * Run Whisper transcription as a subprocess.
 *
 * @param {string} inputPath - Absolute path to the uploaded audio/video file
 * @param {string} outputDir - Absolute path to the output directory
 * @param {{ model?: string, language?: string }} options
 * @param {(progress: number, stage: string) => void} onProgress
 * @returns {Promise<{ detectedLanguage: string, text: string, files: Array }>}
 */
async function runWhisperTranscription(inputPath, outputDir, options, onProgress) {
  const python = findPython();
  if (!python) {
    throw new Error(
      "Python no está disponible. Asegurate de que el entorno virtual esté activo o que Python esté instalado."
    );
  }

  if (!fs.existsSync(WORKER_SCRIPT)) {
    throw new Error(`Worker script no encontrado: ${WORKER_SCRIPT}`);
  }

  const model = options.model || "large-v2";
  const language = options.language || "original";

  const args = [
    WORKER_SCRIPT,
    "--input", inputPath,
    "--output_dir", outputDir,
    "--model", model,
  ];

  if (language && language !== "original") {
    args.push("--language", language);
  }

  console.log(`[whisper] running: ${python} ${args.join(" ")}`);
  const isAbsolute = python.includes("\\") || python.includes("/");

  return new Promise((resolve, reject) => {
    // Through a shell, args are joined with spaces: quote the ones with spaces
    const finalArgs = isAbsolute ? args : args.map((a) => (/\s/.test(a) ? `"${a}"` : a));
    const proc = spawn(python, finalArgs, {
      shell: !isAbsolute,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PATH: `${FFMPEG_DIR}${path.delimiter}${process.env.PATH || ""}`,
      },
    });

    let stderrBuf = "";
    let stdoutBuf = "";
    let result = null;

    proc.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString("utf8");
      // Process complete JSON lines
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop(); // keep incomplete last line in buffer
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if (obj.error) {
            return reject(new Error(obj.error));
          }
          if (obj.done) {
            result = obj;
            if (onProgress) onProgress(100, "Completado");
          } else if (obj.progress !== undefined && onProgress) {
            onProgress(obj.progress, obj.stage || "Procesando...");
          }
        } catch {
          // Non-JSON line from Python — log for debugging
          console.log(`[whisper stdout] ${trimmed}`);
        }
      }
    });

    proc.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString("utf8");
    });

    proc.on("close", (code) => {
      // Flush remaining stdout buffer
      if (stdoutBuf.trim()) {
        try {
          const obj = JSON.parse(stdoutBuf.trim());
          if (obj.done) result = obj;
        } catch {}
      }

      if (code !== 0) {
        return reject(
          new Error(`Whisper falló (código ${code}): ${stderrBuf.slice(-2000)}`)
        );
      }

      if (!result) {
        return reject(new Error("El worker de Whisper terminó sin retornar resultados."));
      }

      resolve({
        detectedLanguage: result.detected_language || "unknown",
        text: result.text || "",
        files: result.files || [],
      });
    });

    proc.on("error", (err) => {
      reject(new Error(`No se pudo ejecutar el worker de Whisper: ${err.message}`));
    });
  });
}

module.exports = { runWhisperTranscription, findPython };
