#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { run } from "../src/pipeline.mjs";
import { spawnInfo } from "../src/sources/spawn.mjs";
import { capture } from "../src/capture.mjs";

const HELP = `autoreel: a bot plays your browser game, cuts the best moments into clips, and writes the devlog post.

usage:
  autoreel run <game.json|url> [--seconds 90] [--clips 3] [--length 10] [--out runs] [--headed] [--seed N]
  autoreel cut <game.json|url> --video footage.mp4 [--clips 3] [--length 10]   use footage you already have
  autoreel capture <game.json|url> [--seconds 90] [--out runs/x]                only play and record
  autoreel info <spawn game page url>                                           print a Spawn game's update notes

options:
  --headed          show the browser (use on a Mac for real GPU rendering)
  --channel chrome  drive your installed Chrome instead of Playwright's Chromium
  --no-notes        skip reading update notes
`;

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opts = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) opts[k] = true;
    else { opts[k] = /^\d+(\.\d+)?$/.test(next) ? +next : next; i++; }
  } else pos.push(a);
}

function loadGame(ref) {
  if (!ref) throw new Error("give a game file or URL");
  if (/^https?:\/\//.test(ref)) {
    const m = /spawn\.co\/(@[^/]+\/[^/?#]+)/.exec(ref);
    return { name: m ? m[1].split("/")[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : new URL(ref).hostname, url: ref, pageUrl: m ? `https://www.spawn.co/${m[1]}` : undefined };
  }
  const g = JSON.parse(readFileSync(ref, "utf8"));
  if (g.url && !/^https?:/.test(g.url)) g.url = "file://" + resolve(dirname(ref), g.url);
  return g;
}

try {
  if (!cmd || cmd === "help" || opts.help) console.log(HELP);
  else if (cmd === "info") console.log(JSON.stringify(await spawnInfo(pos[0], opts), null, 2));
  else if (cmd === "capture") {
    const g = loadGame(pos[0]);
    const r = await capture(g, { outDir: resolve(opts.out || "runs/capture"), seconds: opts.seconds, seed: opts.seed, headed: opts.headed, channel: opts.channel });
    console.log(r.video);
  } else if (cmd === "run" || cmd === "cut") {
    if (cmd === "cut" && !opts.video) throw new Error("cut needs --video");
    const { outDir } = await run(loadGame(pos[0]), { ...opts, noNotes: opts.notes === false || opts.noNotes });
    console.log(outDir);
  } else { console.log(HELP); process.exitCode = 1; }
} catch (e) {
  console.error(`autoreel: ${e.message}`);
  process.exitCode = 1;
}
