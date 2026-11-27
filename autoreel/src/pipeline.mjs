import { mkdirSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, resolve, basename, relative } from "node:path";
import { capture } from "./capture.mjs";
import { analyze, pickMoments } from "./analyze.mjs";
import { captionPngs, renderVertical, renderLandscape, renderMontage, thumbnail, contactSheet } from "./render.mjs";
import { spawnInfo } from "./sources/spawn.mjs";
import { gitUpdate } from "./sources/git.mjs";
import { captionFor, writePosts } from "./devlog.mjs";
import { slug } from "./util.mjs";

/** Where the update notes come from: a Spawn page, a git repo, or notes written in the game file. */
export async function latestUpdate(game, opts = {}) {
  if (game.notes?.length) return { title: game.notesTitle || "What's new", date: null, items: game.notes };
  if (game.pageUrl && /spawn\.co\//.test(game.pageUrl)) {
    try {
      const info = await spawnInfo(game.pageUrl, opts);
      return { ...(info.updates[0] || null), info };
    } catch (e) {
      opts.log?.(`could not read Spawn page: ${e.message.split("\n")[0]}`);
    }
  }
  if (game.repo) return gitUpdate(game.repo);
  return null;
}

/**
 * Full run: play and record (or reuse a video), find the best moments, cut shorts + landscape
 * clips + a montage, and write post copy. Everything lands in one folder with a preview page.
 */
export async function run(game, o = {}) {
  const log = o.log || console.error;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const outDir = resolve(o.out || "runs", `${slug(game.name)}-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  let video, meta = { startOffset: 0 };
  if (o.video) {
    video = join(outDir, "capture" + (o.video.match(/\.\w+$/)?.[0] || ".mp4"));
    copyFileSync(o.video, video);
    log(`using existing footage ${o.video}`);
  } else {
    ({ video, meta } = await capture(game, { outDir, seconds: o.seconds, seed: o.seed, headed: o.headed, channel: o.channel, log }));
  }
  const [update, analysis] = await Promise.all([
    o.noNotes ? null : latestUpdate(game, { channel: o.channel, log }),
    Promise.resolve(analyze(video, { workDir: outDir })),
  ]);
  const length = o.length ?? game.clipSeconds ?? 10;
  const { picked } = pickMoments(analysis, { length, count: o.clips ?? 3, skipStart: (meta.startOffset || 0) + 2 });
  if (!picked.length) throw new Error(`capture too short or blank: ${analysis.duration}s`);
  const moving = analysis.frames.filter((f) => f.ydif > 0.5).length / Math.max(1, analysis.frames.length);
  if (moving < 0.1 || picked[0].mean < 0.05) {
    throw new Error(`nothing moved in the capture (${Math.round(moving * 100)}% of frames changed). See ${join(outDir, "last-frame.png")}: a menu, sign-in wall or error screen is likely.`);
  }
  log(`best moments: ${picked.map((p) => `${p.start.toFixed(1)}s (${p.score})`).join(", ")}`);

  const [vw, vh] = game.viewport || [1280, 720];
  const overlays = [];
  picked.forEach((p, i) => {
    const cap = captionFor(game, update, i);
    overlays.push({ ...cap, w: 1080, h: 1920, layout: "vertical", foot: game.cta || "Free in your browser", path: join(outDir, `cap-v${i + 1}.png`) });
    overlays.push({ ...cap, w: vw, h: vh, layout: "landscape", path: join(outDir, `cap-l${i + 1}.png`) });
  });
  await captionPngs(overlays, { channel: o.channel });

  const clips = [];
  picked.forEach((p, i) => {
    const v = renderVertical({ video, start: p.start, length, overlay: join(outDir, `cap-v${i + 1}.png`), out: join(outDir, `short-${i + 1}.mp4`), crop: game.verticalCrop ?? 0.8 });
    clips.push({ format: "vertical", file: basename(v), start: p.start, score: p.score });
    const l = renderLandscape({ video, start: p.start, length, overlay: join(outDir, `cap-l${i + 1}.png`), out: join(outDir, `clip-${i + 1}.mp4`), width: vw, height: vh });
    clips.push({ format: "landscape", file: basename(l), start: p.start, score: p.score });
  });
  const mom = pickMoments(analysis, { length: 4, count: 5, skipStart: (meta.startOffset || 0) + 2, gap: 1 }).picked.sort((a, b) => a.start - b.start);
  if (mom.length >= 3) {
    renderMontage({ video, moments: mom, each: 4, out: join(outDir, "montage.mp4"), width: vw, height: vh });
    clips.push({ format: "montage", file: "montage.mp4" });
  }
  thumbnail({ video, at: picked[0].start + Math.min(2, length / 2), out: join(outDir, "thumb.jpg") });
  contactSheet({ video, moments: picked, out: join(outDir, "sheet.jpg") });

  const posts = writePosts(game, update, clips, { playUrl: game.pageUrl || game.url });
  const result = {
    game: game.name, url: game.url, pageUrl: game.pageUrl, createdAt: new Date().toISOString(),
    capture: { ...meta, file: basename(video), duration: analysis.duration },
    update: update ? { title: update.title, date: update.date, items: update.items } : null,
    moments: picked, clips, posts,
  };
  writeFileSync(join(outDir, "run.json"), JSON.stringify(result, null, 2));
  writeFileSync(join(outDir, "index.html"), preview(result));
  log(`done: ${relative(process.cwd(), outDir) || outDir}`);
  return { outDir, result };
}

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
function preview(r) {
  const vids = r.clips.map((c) => `<figure><video src="${c.file}" controls muted loop playsinline preload="metadata" class="${c.format}"></video><figcaption>${c.format} · ${esc(c.file)}${c.start != null ? ` · from ${c.start.toFixed(1)}s` : ""}</figcaption></figure>`).join("");
  const posts = r.posts.map((p) => `<article><b>${p.kind}</b> · ${esc(p.clip)}<pre>${esc(p.text)}</pre></article>`).join("");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.game)} autoreel</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px;background:#111;color:#eee}
.grid{display:flex;flex-wrap:wrap;gap:14px}figure{margin:0}video.vertical{height:420px}video.landscape,video.montage{width:420px}
figcaption{font-size:12px;color:#aaa}pre{white-space:pre-wrap;background:#1c1c1c;padding:12px;border-radius:8px}img{max-width:100%}</style>
<h1>${esc(r.game)}</h1><p>Captured ${esc(r.capture.capturedAt || r.createdAt)} · ${Math.round(r.capture.duration)}s of play · update: ${esc(r.update?.title || "none")}</p>
<img src="sheet.jpg" alt="best moments"><h2>Clips</h2><div class="grid">${vids}</div><h2>Posts</h2>${posts}`;
}

export { existsSync };
