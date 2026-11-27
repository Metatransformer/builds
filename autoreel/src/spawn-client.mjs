import { spawn as run, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ffmpeg, sleep } from "./util.mjs";

/**
 * Spawn's own player client (https://www.spawn.co/llms.txt): `spawn client join` stands a real
 * player body in the world under your agent account and serves its page over CDP. Spawn does not
 * let an automated browser visit a world as a guest, so this is the supported way to film one.
 *
 * Needs the client (`bun add -g @spawnco/client`) and an agent token: SPAWN_TOKEN=sak_… in the
 * environment, or the client's own ~/.spawn/token. The token never goes in a game file.
 */

const BIN = process.env.SPAWN_BIN || "spawn";

/** "@alice/world" from a game: game.spawn.world, or the spawn.co URL. */
export function spawnAddress(game) {
  if (game.spawn?.world) return game.spawn.world;
  const m = /spawn\.co\/(@[^/]+\/[^/?#]+)/.exec(game.url || game.pageUrl || "");
  if (!m) throw new Error("spawn-client capture needs a spawn.co URL or spawn.world in the game file");
  return m[1];
}

export function usesSpawnClient(game) {
  if (game.capture) return game.capture === "spawn-client";
  return /(^|\.)spawn\.co\//.test(game.url || "");
}

/**
 * Stand a body and return { cdp, name, leave() }.
 * game.spawn: { world?, as? (body name; one name keeps its save between runs), room?, render? }
 */
export async function joinSpawn(game, { seconds, log = console.error } = {}) {
  const [width, height] = game.viewport || [1280, 720];
  const s = game.spawn || {};
  const name = s.session || "autoreel";
  const args = [
    "client", "join", spawnAddress(game),
    "--name", name,
    // "{run}" in the body name gives every run a fresh body (and a fresh save); a fixed name keeps progress
    "--as", (s.as || "autoreel").replace("{run}", Date.now().toString(36).slice(-6)),
    "--render", s.render || "gpu",
    "--width", String(width), "--height", String(height),
    "--ttl", String(Math.ceil((seconds || 120) + 600)),
  ];
  if (s.room) args.push("--room", s.room);
  // a session left over from a crashed run would refuse the join
  spawnSync(BIN, ["client", "leave", "--name", name], { encoding: "utf8" });
  log(`spawn ${args.join(" ")}`);
  const out = await new Promise((resolve, reject) => {
    const p = run(BIN, args, { env: process.env });
    let buf = "";
    p.stdout.on("data", (d) => (buf += d));
    p.stderr.on("data", (d) => (buf += d));
    p.on("error", (e) => reject(new Error(`could not run the Spawn client (${e.message}). Install it: bun add -g @spawnco/client`)));
    p.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`spawn client join failed:\n${buf.trim().split("\n").slice(-8).join("\n")}`))));
  });
  const cdp = /page\s*:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(out)?.[1];
  for (const l of out.split("\n").filter((l) => /^(joined|boot|placed):/.test(l))) log(l.trim());
  const leave = () => {
    const r = spawnSync(BIN, ["client", "leave", "--name", name], { encoding: "utf8" });
    log(`spawn client leave: ${(r.stdout || r.stderr || "").trim().split("\n")[0] || r.status}`);
  };
  if (!cdp) {
    leave();
    throw new Error(`spawn client join printed no page address (needs --render gpu|cpu):\n${out.slice(-600)}`);
  }
  return { cdp, name, leave };
}

/**
 * Record a CDP-attached page. Playwright's recordVideo does not work on a connected context, so
 * this takes Page.startScreencast frames with their timestamps and lets ffmpeg lay them out on a
 * constant 30 fps timeline. stop() returns the mp4 path.
 */
export async function screencast(page, { outDir, width = 1280, height = 720, quality = 80 }) {
  const dir = join(outDir, "frames");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const session = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0;
  session.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(n++).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
    session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await session.send("Page.startScreencast", { format: "jpeg", quality, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  return {
    async stop(out = join(outDir, "capture.mp4")) {
      const tEnd = Date.now() / 1000;
      await session.send("Page.stopScreencast").catch(() => {});
      await sleep(200);
      await session.detach().catch(() => {});
      if (frames.length < 2) throw new Error(`screencast caught ${frames.length} frames; is the page drawing?`);
      // concat list: each frame holds until the next one arrived
      const lines = [];
      frames.sort((a, b) => a.t - b.t);
      const first = Math.min(frames[0].t, t0);
      if (frames[0].t > first) lines.push(`file '${frames[0].file}'`, `duration ${(frames[0].t - first).toFixed(3)}`);
      frames.forEach((f, i) => {
        const next = frames[i + 1]?.t ?? Math.max(tEnd, f.t + 1 / 30);
        lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`);
      });
      lines.push(`file '${frames.at(-1).file}'`);
      const list = join(dir, "list.txt");
      writeFileSync(list, lines.join("\n") + "\n");
      ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-vf", `fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", out]);
      rmSync(dir, { recursive: true, force: true });
      return { file: out, frames: frames.length, fps: +(frames.length / Math.max(1, tEnd - t0)).toFixed(1) };
    },
  };
}

