const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const ffmpegPath = require("ffmpeg-static");
const { findPython } = require("./transcription");

const FFMPEG_DIR = path.dirname(ffmpegPath);

const WORKER_SCRIPT = path.resolve(
  __dirname, "..", "..", "backend", "subtitle_worker.py"
);

/**
 * Transcribe a video with word-level timestamps, build a karaoke-style
 * .ass subtitle file, and burn it into the video with FFmpeg.
 *
 * @param {string} inputPath - Absolute path to the uploaded video
 * @param {string} outputDir - Absolute path to the output directory
 * @param {{ style?: "pop"|"clean"|"classic", model?: string }} options
 * @param {(progress: number, stage: string) => void} onProgress
 * @returns {Promise<{ files: Array }>}
 */
async function runBurnSubtitles(inputPath, outputDir, options, onProgress) {
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

  const style = options.style || "pop";
  const model = options.model || "large-v2";

  const args = [
    WORKER_SCRIPT,
    "--input", inputPath,
    "--output_dir", outputDir,
    "--style", style,
    "--model", model,
  ];

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

      resolve({ files: result.files || [] });
    });

    proc.on("error", (err) => {
      reject(new Error(`No se pudo ejecutar el worker de subtítulos: ${err.message}`));
    });
  });
}

module.exports = { runBurnSubtitles };
