require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const routes = require("./src/routes");
const { startCleanupScheduler } = require("./src/cleanup");

const app = express();
const PORT = parseInt(process.env.PORT || "8000");
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Ensure upload/output dirs exist
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "outputs";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

app.use(cors({
  origin: [FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Large limit: the subtitle editor posts every word of the video as JSON.
app.use(express.json({ limit: "20mb" }));

app.get("/health", (req, res) => res.json({ status: "ok", runtime: "node" }));

app.use("/api", routes);

// Global error handler
app.use((err, req, res, next) => {
  console.error("[error]", err.message);
  res.status(500).json({ detail: err.message || "Internal server error" });
});

startCleanupScheduler();

app.listen(PORT, () => {
  console.log(`\n🎵 Stemify backend (Node.js) corriendo en http://localhost:${PORT}`);
  console.log(`   FFmpeg: bundled via ffmpeg-static ✓`);
  const { checkDemucs } = require("./src/demucs");
  const demucs = checkDemucs();
  console.log(`   Demucs: ${demucs ? "disponible ✓" : "no disponible (instala Python + pip install demucs)"}`);
  if (demucs) {
    const { getAiInfo } = require("./src/demucs");
    const ai = getAiInfo();
    console.log(`   RoFormer: ${ai.roformer ? "disponible ✓" : "no instalado (ejecuta instalar_ia.bat)"}`);
    console.log(`   Aceleración: ${ai.gpu ? `GPU ${ai.gpu} ✓` : "CPU (sin GPU NVIDIA detectada)"}${ai.torch ? ` · PyTorch ${ai.torch}` : ""}`);
  }
  console.log();
});
