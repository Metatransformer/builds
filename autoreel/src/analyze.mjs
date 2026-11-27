import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ffmpeg, probeDuration } from "./util.mjs";

/**
 * Score every moment of a capture. Samples the video at `fps`, and for each sample reads
 *   ydif  - mean luma change from the previous frame (motion)
 *   scene - ffmpeg's scene-change score (big visual events, hits, explosions, cuts)
 *   yavg  - brightness (to skip black loading screens)
 *   range - YHIGH - YLOW (to skip flat menus and blank frames)
 */
export function analyze(video, { fps = 4, workDir } = {}) {
  const out = join(workDir, "frames.txt");
  ffmpeg([
    "-i", video, "-an",
    "-vf", `fps=${fps},scale=320:180,signalstats,select='gte(scene\\,0)',metadata=print:file=${out}`,
    "-f", "null", "-",
  ]);
  const frames = [];
  let cur = null;
  for (const line of readFileSync(out, "utf8").split("\n")) {
    const f = /pts_time:([\d.]+)/.exec(line);
    if (f) { cur = { t: +f[1] }; frames.push(cur); continue; }
    const m = /lavfi\.(?:signalstats\.)?(\w+)=([-\d.]+)/.exec(line);
    if (m && cur) cur[m[1]] = +m[2];
  }
  rmSync(out, { force: true });
  return {
    duration: probeDuration(video) ?? (frames.at(-1)?.t || 0),
    fps,
    frames: frames.map((f) => ({
      t: f.t, ydif: f.YDIF ?? 0, scene: f.scene_score ?? 0, yavg: f.YAVG ?? 0, range: (f.YHIGH ?? 0) - (f.YLOW ?? 0),
    })),
  };
}

const pct = (arr, q) => {
  const a = [...arr].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0;
};

/**
 * Score frames relative to this capture, so a dark dungeon crawler and a bright arcade game are
 * both judged against themselves. Returns a 0..1 score per frame.
 */
export function frameScores(frames) {
  const m95 = Math.max(pct(frames.map((f) => f.ydif), 0.95), 0.5);
  const e95 = Math.max(pct(frames.map((f) => f.scene), 0.95), 0.02);
  const still = 0.08 * Math.max(pct(frames.map((f) => f.ydif), 0.5), 0.2);
  return frames.map((f) => {
    const motion = Math.min(f.ydif / m95, 1);
    const event = Math.min(f.scene / e95, 1);
    let s = 0.7 * motion + 0.3 * event;
    if (f.ydif < still) s = 0;                      // frozen: loading, paused, menu
    if (f.yavg < 8 && f.range < 4) s = 0;           // black screen
    if (f.scene > 0.85) s *= 0.5;                   // a hard cut is usually a loading flash
    return s;
  });
}

/**
 * Pick the N best non-overlapping windows of `length` seconds.
 * A window's score is its mean frame score, plus a bonus when its first two seconds are strong
 * (short-form viewers decide in the first second or two).
 */
export function pickMoments(analysis, { length = 10, count = 3, skipStart = 3, gap = 2 } = {}) {
  const { frames, fps } = analysis;
  const scores = frameScores(frames);
  const win = Math.max(1, Math.round(length * fps));
  const hook = Math.max(1, Math.round(2 * fps));
  const cands = [];
  for (let i = 0; i + win <= frames.length; i++) {
    if (frames[i].t < skipStart) continue;
    let sum = 0, h = 0, dead = 0;
    for (let j = i; j < i + win; j++) {
      sum += scores[j];
      if (scores[j] < 0.05) dead++;
    }
    for (let j = i; j < i + hook; j++) h += scores[j];
    const mean = sum / win;
    const score = mean + 0.25 * (h / hook) - 0.3 * (dead / win);
    cands.push({ start: frames[i].t, end: frames[i].t + length, score: +score.toFixed(4), mean: +mean.toFixed(4) });
  }
  cands.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of cands) {
    if (picked.length >= count) break;
    if (picked.every((p) => c.end + gap <= p.start || c.start >= p.end + gap)) picked.push(c);
  }
  return { picked, best: cands[0] ?? null, candidates: cands.length };
}
