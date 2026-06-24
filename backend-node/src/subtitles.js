const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const { findPython } = require("./transcription");

const FFMPEG_DIR = path.dirname(ffmpegPath);

const WORKER_SCRIPT = path.resolve(
  __dirname, "..", "..", "backend", "subtitle_worker.py"
);

/**
 * Spawn subtitle_worker.py with the given CLI args and stream its JSON
 * progress lines back via onProgress. Resolves with the final "done" object.
 */
function runWorker(args, onProgress) {
  const python = findPython();
  if (!python) {
    throw new Error(
      "No se encontró un entorno Python con Whisper instalado. " +
      "Ejecuta: pip install openai-whisper torch"
    );
  }
  if (!fs.existsSync(WORKER_SCRIPT)) {
    throw new Error(`Worker script no encontrado: ${WORKER_SCRIPT}`);
  }

  console.log(`[subtitles] running: ${python} ${args.join(" ")}`);
  const isAbsolute = python.includes("\\") || python.includes("/");

  return new Promise((resolve, reject) => {
    const proc = spawn(python, args, {
      shell: !isAbsolute,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PATH: `${FFMPEG_DIR}${path.delimiter}${process.env.PATH || ""}`,
        STEMIFY_FFMPEG_PATH: ffmpegPath,
        STEMIFY_FFPROBE_PATH: ffprobePath,
      },
    });

    let stderrBuf = "";
    let stdoutBuf = "";
    let result = null;

    proc.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString("utf8");
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if (obj.error) return reject(new Error(obj.error));
          if (obj.done) {
            result = obj;
            if (onProgress) onProgress(100, "Completado");
          } else if (obj.progress !== undefined && onProgress) {
            onProgress(obj.progress, obj.stage || "Procesando...");
          }
        } catch {
          console.log(`[subtitles stdout] ${trimmed}`);
        }
      }
    });

    proc.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString("utf8");
    });

    proc.on("close", (code) => {
      if (stdoutBuf.trim()) {
        try {
          const obj = JSON.parse(stdoutBuf.trim());
          if (obj.done) result = obj;
        } catch {}
      }

      if (code !== 0) {
        return reject(new Error(`El proceso falló (código ${code}): ${stderrBuf.slice(-2000)}`));
      }
      if (!result) {
        return reject(new Error("El worker terminó sin retornar resultados."));
      }

      resolve(result);
    });

    proc.on("error", (err) => {
      reject(new Error(`No se pudo ejecutar el worker de subtítulos: ${err.message}`));
    });
  });
}

/**
 * Fast path: transcribe a video and burn karaoke-style subtitles in one shot.
 *
 * @param {{ style?: "pop"|"clean"|"classic", orientation?: "auto"|"horizontal"|"vertical", model?: string }} options
 */
async function runBurnSubtitles(inputPath, outputDir, options, onProgress) {
  const style = options.style || "pop";
  const orientation = options.orientation || "auto";
  const model = options.model || "large-v2";

  const result = await runWorker([
    WORKER_SCRIPT,
    "--mode", "full",
    "--input", inputPath,
    "--output_dir", outputDir,
    "--style", style,
    "--orientation", orientation,
    "--model", model,
  ], onProgress);

  return { files: result.files || [] };
}

/**
 * Transcribe only — returns word-level segments for the manual emphasis editor.
 *
 * @param {{ model?: string }} options
 */
async function runTranscribeOnly(inputPath, options, onProgress) {
  const model = options.model || "large-v2";

  const result = await runWorker([
    WORKER_SCRIPT,
    "--mode", "transcribe",
    "--input", inputPath,
    "--output_dir", path.dirname(inputPath), // unused in this mode, but required by argparse
    "--model", model,
  ], onProgress);

  return {
    segments: result.segments || [],
    detectedLanguage: result.detected_language || "unknown",
  };
}

/**
 * Render only — burn pre-supplied (possibly user-edited) segments into the
 * video, skipping transcription entirely.
 *
 * @param {Array} segments - word-level segments, words may carry
 *   { color: "#RRGGBB", sizeMultiplier: number } overrides
 * @param {{ style?: string, orientation?: string }} options
 */
async function runRenderOnly(inputPath, outputDir, segments, options, onProgress) {
  const style = options.style || "pop";
  const orientation = options.orientation || "auto";

  fs.mkdirSync(outputDir, { recursive: true });
  const segmentsPath = path.join(outputDir, "segments_input.json");
  fs.writeFileSync(segmentsPath, JSON.stringify(segments), "utf8");

  const result = await runWorker([
    WORKER_SCRIPT,
    "--mode", "render",
    "--input", inputPath,
    "--output_dir", outputDir,
    "--style", style,
    "--orientation", orientation,
    "--segments_json", segmentsPath,
  ], onProgress);

  return { files: result.files || [] };
}

module.exports = { runBurnSubtitles, runTranscribeOnly, runRenderOnly };
