import { chromium } from "playwright";
import { mkdirSync, renameSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runSteps } from "./steps.mjs";
import { explorer } from "./bots/explorer.mjs";
import { sleep } from "./util.mjs";

const BOTS = { explorer, script: async (page, { config, log }) => runSteps(page, config.steps || [], log) };

/**
 * Open a browser game, run its start steps, let a bot play it, and record the screen.
 * Returns { video, meta } with video at OUTDIR/capture.webm.
 */
export async function capture(game, { outDir, seconds, seed = Date.now() % 1e9, headed = false, channel, log = console.error }) {
  mkdirSync(outDir, { recursive: true });
  const [width, height] = game.viewport || [1280, 720];
  const dur = seconds ?? game.seconds ?? 90;
  const browser = await chromium.launch({
    headless: !headed,
    channel: channel || process.env.AUTOREEL_CHANNEL || undefined,
    executablePath: process.env.AUTOREEL_CHROME || undefined,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
    ],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: outDir, size: { width, height } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const t0 = Date.now();
  log(`opening ${game.url}`);
  await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(game.loadWait ?? 4000);
  await runSteps(page, game.start || [], log);
  const startOffset = (Date.now() - t0) / 1000;
  const bot = BOTS[game.bot?.type || "explorer"];
  if (!bot) throw new Error(`unknown bot ${game.bot?.type}`);
  log(`playing for ${dur}s with the ${game.bot?.type || "explorer"} bot (seed ${seed})`);
  await bot(page, { seconds: dur, seed, config: game.bot || {}, log });
  const shot = join(outDir, "last-frame.png");
  await page.screenshot({ path: shot }).catch(() => {});
  const video = page.video();
  await context.close();
  await browser.close();
  const raw = video ? await video.path() : readdirSync(outDir).find((f) => f.endsWith(".webm"));
  const dest = join(outDir, "capture.webm");
  renameSync(raw.startsWith("/") ? raw : join(outDir, raw), dest);
  const meta = {
    game: game.name, url: game.url, seed, seconds: dur,
    startOffset, // seconds of loading and menus before the bot took over
    capturedAt: new Date(t0).toISOString(),
    pageErrors: errors.slice(0, 20),
  };
  writeFileSync(join(outDir, "capture.json"), JSON.stringify(meta, null, 2));
  return { video: dest, meta };
}
