import { look } from "../steps.mjs";
import { rng, sleep } from "../util.mjs";

const DEFAULT_KEYS = {
  forward: "w", back: "s", left: "a", right: "d",
  jump: "Space", interact: "e", sprint: "Shift",
};

/**
 * A cheap, model-free player: walks, looks around, jumps, interacts and attacks in weighted
 * random bursts. Good enough to film most 3D and top-down browser games. Deterministic per seed.
 *
 * config: { keys, mouseLook (bool), click (bool), weights: {walk, strafe, look, jump, interact, attack, idle} }
 */
export async function explorer(page, { seconds, seed, config = {}, log = () => {} }) {
  const r = rng(seed);
  const keys = { ...DEFAULT_KEYS, ...(config.keys || {}) };
  const mouseLook = config.mouseLook !== false;
  const w = { walk: 5, strafe: 1.5, look: 2, jump: 1, interact: 1, attack: 1, idle: 0.5, ...(config.weights || {}) };
  if (!config.click) w.attack = 0;
  const vp = page.viewportSize() || { width: 1280, height: 720 };
  const end = Date.now() + seconds * 1000;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const choose = () => {
    let x = r() * total;
    for (const [k, v] of Object.entries(w)) if ((x -= v) <= 0) return k;
    return "walk";
  };
  const hold = async (key, ms, during) => {
    if (!key) return sleep(ms);
    await page.keyboard.down(key);
    if (during) await during(ms); else await sleep(ms);
    await page.keyboard.up(key);
  };
  let n = 0;
  while (Date.now() < end) {
    const a = choose();
    n++;
    try {
      switch (a) {
        case "walk": {
          const ms = r.range(900, 3200);
          const sprint = r() < 0.3 && keys.sprint;
          if (sprint) await page.keyboard.down(keys.sprint);
          await hold(keys.forward, ms, mouseLook ? (t) => look(page, r.range(-260, 260), r.range(-30, 30), t) : null);
          if (sprint) await page.keyboard.up(keys.sprint);
          break;
        }
        case "strafe":
          await hold(r() < 0.5 ? keys.left : keys.right, r.range(400, 1200));
          break;
        case "look":
          if (mouseLook) await look(page, r.range(-500, 500), r.range(-60, 60), r.range(500, 1200));
          else await hold(r.pick([keys.left, keys.right, keys.back]), r.range(300, 900));
          break;
        case "jump":
          if (keys.jump) await page.keyboard.press(keys.jump);
          await sleep(r.range(200, 600));
          break;
        case "interact":
          if (keys.interact) await page.keyboard.press(keys.interact);
          await sleep(r.range(400, 1200));
          break;
        case "attack":
          await page.mouse.down();
          await sleep(r.range(80, 200));
          await page.mouse.up();
          await sleep(r.range(150, 500));
          break;
        default:
          await sleep(r.range(300, 900));
      }
    } catch (e) {
      log(`explorer action ${a} failed: ${e.message.split("\n")[0]}`);
      await sleep(300);
    }
    // escape menus the bot opened by accident, now and then
    if (config.escapeEvery && n % config.escapeEvery === 0) await page.keyboard.press("Escape").catch(() => {});
  }
  log(`explorer did ${n} actions`);
  void vp;
}
