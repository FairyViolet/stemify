const fs = require("fs");
const path = require("path");
const { getAllJobs, deleteJob, isValidJobId } = require("./jobs");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "outputs";
const TTL_MS = parseInt(process.env.TEMP_FILE_TTL_MINUTES || "60") * 60 * 1000;

function cleanupJobFiles(jobId) {
  if (!isValidJobId(jobId)) return;
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
  // Also sweep folders that are not tracked in memory: uploads rejected by
  // validation, or jobs left behind by a previous server run.
  for (const base of [UPLOAD_DIR, OUTPUT_DIR]) {
    let entries = [];
    try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidJobId(entry.name)) continue;
      if (getAllJobs().has(entry.name)) continue;
      const dir = path.join(base, entry.name);
      try {
        if (now - fs.statSync(dir).mtimeMs > TTL_MS) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {}
    }
  }
}

function startCleanupScheduler(intervalMs = 5 * 60 * 1000) {
  runCleanup();
  setInterval(runCleanup, intervalMs);
}

module.exports = { cleanupJobFiles, startCleanupScheduler };
