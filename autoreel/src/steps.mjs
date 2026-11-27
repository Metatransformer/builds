import { spawnSync } from "node:child_process";
import { sleep } from "./util.mjs";

/**
 * Run scripted steps on a page. A step is one of:
 *   { "wait": 2000 }                      wait ms
 *   { "click": "text=Play" }              click a Playwright selector (skipped if absent)
 *   { "clickAt": [0.5, 0.5] }             click at a fraction of the viewport
 *   { "key": "e" }                        tap a key
 *   { "hold": "w", "ms": 1500 }           hold a key
 *   { "type": "hello" }                   type text
 *   { "look": [dx, dy], "ms": 500 }       move the mouse by dx,dy pixels (mouse look)
 *   { "waitFor": "canvas", "timeout": 30000 }
 *   { "clickText": "Continue" }           click visible text in any frame (game UIs often live in iframes)
 *   { "waitText": "Goodbye", "timeout": 30000 }  wait until text shows in any frame (skips on timeout)
 *   { "walkTo": [x, z] }                  Spawn client only: turn and walk to a world position, read from
 *                                         the sim (`spawn client where`); "tolerance" m, "timeout" ms
 */
export async function runSteps(page, steps = [], log = () => {}, ctx = {}) {
  const vp = page.viewportSize() || ctx.viewport || { width: 1280, height: 720 };
  let i = 0;
  for (const s of steps) {
    i++;
    try {
      if (s.wait) await sleep(s.wait);
      else if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: s.timeout ?? 30000 });
      else if (s.click) {
        const loc = page.locator(s.click).first();
        if (await loc.count()) await loc.click({ timeout: s.timeout ?? 5000 });
        else log(`step skipped, not found: ${s.click}`);
      } else if (s.clickAt) await page.mouse.click(vp.width * s.clickAt[0], vp.height * s.clickAt[1]);
      else if (s.key) await page.keyboard.press(s.key);
      else if (s.hold) {
        await page.keyboard.down(s.hold);
        await sleep(s.ms ?? 1000);
        await page.keyboard.up(s.hold);
      } else if (s.type) await page.keyboard.type(s.type, { delay: 40 });
      else if (s.look) await look(page, s.look[0], s.look[1], s.ms ?? 400);
      else if (s.clickText) await clickText(page, s.clickText, s.timeout ?? 4000, log, s.exact);
      else if (s.waitText) await waitText(page, s.waitText, s.timeout ?? 30000, log);
      else if (s.walkTo) {
        if (!ctx.spawn) log("walkTo needs the spawn-client capture; skipped");
        else await walkTo(page, ctx.spawn.name, s.walkTo, s, log);
      }
    } catch (e) {
      log(`step failed ${JSON.stringify(s)}: ${e.message.split("\n")[0]}`);
    }
    // --step-shots: a picture after every start step, for tuning them
    if (ctx.shotDir && !s.wait) {
      await page.screenshot({ path: `${ctx.shotDir}/step-${String(i).padStart(2, "0")}.png` }).catch(() => {});
    }
  }
}

let cursor = null;
const cursorX = (w) => (cursor ? cursor.x : w / 2);

/**
 * Lift the mouse: let go of the pointer lock, put the cursor back in the middle, and take the lock
 * again. The click that takes the lock reaches no game (Spawn's client says so), so nothing swings.
 */
export async function recenter(page, width = 1280, height = 720) {
  await page.keyboard.press("Escape");
  await sleep(250);
  cursor = { x: width / 2, y: height / 2 };
  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.click(cursor.x, cursor.y);
  await sleep(250);
}
/** Smooth relative mouse movement, which first-person games read as looking around. */
export async function look(page, dx, dy, ms = 400) {
  const vp = page.viewportSize() || { width: 1280, height: 720 };
  if (!cursor) cursor = { x: vp.width / 2, y: vp.height / 2 };
  const steps = Math.max(4, Math.round(ms / 25));
  for (let i = 0; i < steps; i++) {
    cursor.x += dx / steps;
    cursor.y += dy / steps;
    // keep the real cursor inside the viewport; games under pointer lock only read movementX/Y.
    // Jumping back to the centre would read as a turn the other way, so a look stops at the edge.
    cursor.x = Math.min(vp.width - 2, Math.max(2, cursor.x));
    cursor.y = Math.min(vp.height - 2, Math.max(2, cursor.y));
    await page.mouse.move(cursor.x, cursor.y);
    await sleep(ms / steps);
  }
}

async function waitText(page, text, timeout, log) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const f of page.frames()) {
      // a locator pierces shadow DOM, which innerText does not
      if (await f.getByText(text).filter({ visible: true }).count().catch(() => 0)) return true;
    }
    await sleep(400);
  }
  log(`waitText timed out: ${text}`);
  return false;
}

async function clickText(page, text, timeout, log, exact = false) {
  for (const f of page.frames()) {
    const loc = f.getByText(text, { exact }).filter({ visible: true }).first();
    if (await loc.count().catch(() => 0)) return loc.click({ timeout });
  }
  log(`step skipped, text not found: ${text}`);
}

/** Where the Spawn body stands and looks: { x, z, yaw } in metres and degrees. */
export function spawnWhere(name) {
  const r = spawnSync(process.env.SPAWN_BIN || "spawn", ["client", "where", "--name", name], { encoding: "utf8" });
  const p = /position: \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/.exec(r.stdout || "");
  const y = /yaw (-?[\d.]+)°/.exec(r.stdout || "");
  if (!p || !y) return null;
  return { x: +p[1], y: +p[2], z: +p[3], yaw: +y[1] };
}

const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Closed-loop walk for Spawn bodies: read the sim, turn toward the target with the mouse (the
 * look is pointer-locked), walk a short burst, repeat. Yaw 0 faces -z and turning right lowers it.
 */
export async function walkTo(page, name, [tx, tz], { tolerance = 1.2, timeout = 20000, run = false } = {}, log = () => {}) {
  const end = Date.now() + timeout;
  let pxPerDeg = 5; // refined as we go
  while (Date.now() < end) {
    const w = spawnWhere(name);
    if (!w) { log("walkTo: could not read the body's position"); return false; }
    const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
    if (d <= tolerance) return true;
    const want = (Math.atan2(-dx, -dz) * 180) / Math.PI;
    const err = wrap(want - w.yaw);
    if (Math.abs(err) > 12) {
      let px = Math.max(-400, Math.min(400, -err * pxPerDeg));
      // the cursor cannot pass the viewport edge, so turn the long way round when it would
      const vw = page.viewportSize()?.width || 1280, cx = cursorX(vw);
      if (cx + px < 4 || cx + px > vw - 4) await recenter(page, vw);
      await look(page, px, 0, 250);
      await sleep(120);
      const w2 = spawnWhere(name);
      if (w2) {
        const turned = wrap(w2.yaw - w.yaw);
        if (Math.abs(turned) > 3 && Math.sign(turned) === Math.sign(err)) pxPerDeg = Math.min(8, Math.max(0.3, Math.abs(px / turned)));
      }
      continue;
    }
    if (run) await page.keyboard.down("Shift");
    await page.keyboard.down("w");
    await sleep(Math.min(900, 250 + d * 150));
    await page.keyboard.up("w");
    if (run) await page.keyboard.up("Shift");
  }
  log(`walkTo [${tx}, ${tz}] timed out`);
  return false;
}
