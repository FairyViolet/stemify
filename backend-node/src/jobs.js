const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const OUTPUT_DIR = process.env.OUTPUT_DIR || "outputs";

function jobFile(id) {
  return path.join(OUTPUT_DIR, id, "_job.json");
}

function persistJob(job) {
  try {
    const dir = path.join(OUTPUT_DIR, job.job_id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(jobFile(job.job_id), JSON.stringify(job), "utf8");
  } catch {}
}

function loadJobFromDisk(id) {
  try {
    const raw = fs.readFileSync(jobFile(id), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @type {Map<string, Job>} */
const jobs = new Map();

/**
 * @typedef {Object} JobFile
 * @property {string} filename
 * @property {string} label
 * @property {number} size_bytes
 */

/**
 * @typedef {Object} Job
 * @property {string} job_id
 * @property {"queued"|"processing"|"completed"|"failed"} status
 * @property {number} progress
 * @property {string} stage
 * @property {string|null} error
 * @property {JobFile[]} files
 * @property {number} created_at
 */

function createJob() {
  const job = {
    job_id: uuidv4(),
    status: "queued",
    progress: 0,
    stage: "queued",
    error: null,
    files: [],
    created_at: Date.now(),
  };
  jobs.set(job.job_id, job);
  return job;
}

function getJob(id) {
  // Check in-memory first
  if (jobs.has(id)) return jobs.get(id);
  // Fall back to disk (survives server restarts)
  const diskJob = loadJobFromDisk(id);
  if (diskJob) {
    jobs.set(id, diskJob);   // cache it
    return diskJob;
  }
  return null;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  // Persist to disk on every status change so jobs survive server restarts
  if (patch.status) {
    persistJob(job);
  }
  return job;
}

function deleteJob(id) {
  // Remove disk record too
  try { fs.unlinkSync(jobFile(id)); } catch {}
  return jobs.delete(id);
}

function getAllJobs() {
  return jobs;
}

module.exports = { createJob, getJob, updateJob, deleteJob, getAllJobs, persistJob };
