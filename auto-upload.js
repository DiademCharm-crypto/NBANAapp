/**
 * NBANA APP — auto upload to GitHub
 *
 * Watches this folder for changes to site files and automatically
 * commits + pushes them to https://github.com/DiademCharm-crypto/NBANAapp
 *
 * Usage:  node auto-upload.js
 * Stop:   Ctrl+C
 */
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const REMOTE = "origin";
const BRANCH = "main";
const IGNORED = new Set([".git", ".freebuff", "node_modules"]);
const DEBOUNCE_MS = 3000;

let busy = false;
let pending = false;
let timer = null;

function run(args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: ROOT, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) =>
        resolve({ ok: !err, stdout: stdout.trim(), stderr: stderr.trim() })
    );
  });
}

async function sync(reason) {
  if (busy) {
    pending = true;
    return;
  }
  busy = true;
  try {
    const staged = await run(["add", "-A"]);
    if (!staged.ok) {
      console.error("[auto-upload] git add failed:", staged.stderr);
      return;
    }

    const changes = await run(["diff", "--cached", "--quiet"]);
    // `git diff --cached --quiet` exits 1 when there ARE staged changes.
    if (changes.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] ${reason} — no changes to upload.`);
      return;
    }

    const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const commit = await run(["commit", "-m", `Auto-sync: ${reason} (${stamp} UTC)`]);
    if (!commit.ok) {
      console.error("[auto-upload] git commit failed:", commit.stderr);
      return;
    }

    const push = await run(["push", REMOTE, BRANCH]);
    if (push.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] ✔ Uploaded to GitHub (${reason}).`);
    } else {
      console.error("[auto-upload] push failed — will retry on next change:", push.stderr);
    }
  } finally {
    busy = false;
    if (pending) {
      pending = false;
      sync("queued changes");
    }
  }
}

function onChange(event, filename) {
  if (!filename) return;
  const top = filename.split(/[\\/]/)[0];
  if (IGNORED.has(top)) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync(filename), DEBOUNCE_MS);
}

fs.watch(ROOT, { recursive: true }, onChange);

console.log("NBANA auto-upload running.");
console.log("Watching for changes in:", ROOT);
console.log(`Will commit & push to ${REMOTE}/${BRANCH} after ${DEBOUNCE_MS / 1000}s of quiet.`);
console.log("Press Ctrl+C to stop.");
