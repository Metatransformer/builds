import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Find an ffmpeg binary: $FFMPEG, then the optional ffmpeg-static package, then PATH. */
export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    const p = require("ffmpeg-static");
    if (p && existsSync(p)) return p;
  } catch {}
  return "ffmpeg";
}

export function ffmpeg(args, { quiet = true } = {}) {
  const r = spawnSync(ffmpegPath(), ["-hide_banner", "-y", ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (r.error) throw new Error(`ffmpeg not found (${r.error.message}). Install ffmpeg or run npm i ffmpeg-static.`);
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed:\n${(r.stderr || "").split("\n").slice(-15).join("\n")}`);
  }
  if (!quiet) process.stderr.write(r.stderr);
  return r;
}

export function probeDuration(file) {
  const r = spawnSync(ffmpegPath(), ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr || "");
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

export function loadJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Small seeded RNG so a capture run can be replayed. */
export function rng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.range = (a, b) => a + next() * (b - a);
  return next;
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
