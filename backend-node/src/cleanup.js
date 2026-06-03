const fs = require("fs");
const path = require("path");
const { getAllJobs, deleteJob } = require("./jobs");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "outputs";
const TTL_MS = parseInt(process.env.TEMP_FILE_TTL_MINUTES || "60") * 60 * 1000;

function cleanupJobFiles(jobId) {
  for (const base of [UPLOAD_DIR, OUTPUT_DIR]) {
    const dir = path.join(base, jobId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

function runCleanup() {
  const now = Date.now();
  for (const [jobId, job] of getAllJobs()) {
    if (now - job.created_at > TTL_MS) {
      cleanupJobFiles(jobId);
      deleteJob(jobId);
    }
  }
}

function startCleanupScheduler(intervalMs = 5 * 60 * 1000) {
  setInterval(runCleanup, intervalMs);
}

module.exports = { cleanupJobFiles, startCleanupScheduler };
