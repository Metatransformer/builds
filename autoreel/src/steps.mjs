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
 */
export async function runSteps(page, steps = [], log = () => {}) {
  const vp = page.viewportSize() || { width: 1280, height: 720 };
  for (const s of steps) {
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
    } catch (e) {
      log(`step failed ${JSON.stringify(s)}: ${e.message.split("\n")[0]}`);
    }
  }
}

let cursor = null;
/** Smooth relative mouse movement, which first-person games read as looking around. */
export async function look(page, dx, dy, ms = 400) {
  const vp = page.viewportSize() || { width: 1280, height: 720 };
  if (!cursor) cursor = { x: vp.width / 2, y: vp.height / 2 };
  const steps = Math.max(4, Math.round(ms / 25));
  for (let i = 0; i < steps; i++) {
    cursor.x += dx / steps;
    cursor.y += dy / steps;
    // keep the real cursor inside the viewport; games under pointer lock only read movementX/Y
    if (cursor.x < 20 || cursor.x > vp.width - 20) cursor.x = vp.width / 2;
    if (cursor.y < 20 || cursor.y > vp.height - 20) cursor.y = vp.height / 2;
    await page.mouse.move(cursor.x, cursor.y);
    await sleep(ms / steps);
  }
}
