import { chromium } from "playwright";

/**
 * Read a Spawn game page (https://www.spawn.co/@creator/game): name, description, play stats and
 * the creator's update notes. These notes are the raw material for devlog posts.
 */
export async function spawnInfo(pageUrl, { channel } = {}) {
  const browser = await chromium.launch({ channel: channel || process.env.AUTOREEL_CHANNEL || undefined, executablePath: process.env.AUTOREEL_CHROME || undefined });
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const text = (el) => (el?.textContent || "").trim();
    const updates = [...document.querySelectorAll("h5,h4,h3")]
      .filter((h) => /update/i.test(h.textContent))
      .map((h) => {
        let ul = h.nextElementSibling;
        while (ul && ul.tagName !== "UL") ul = ul.nextElementSibling;
        const m = /update:?\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)/i.exec(text(h));
        return {
          title: m ? m[1] : text(h).replace(/^.*update:?\s*/i, ""),
          date: m ? m[2] : null,
          items: ul ? [...ul.querySelectorAll("li")].map(text) : [],
        };
      });
    const body = document.body.innerText;
    const plays = /([\d,]+) plays/.exec(body)?.[1];
    const likes = /([\d,]+) likes/.exec(body)?.[1];
    const desc = [...document.querySelectorAll("p")].map(text).find((t) => t.length > 80) || "";
    return { name: text(document.querySelector("h1,h2")) || document.title.split("|")[0].trim(), description: desc, plays, likes, updates };
  });
  await browser.close();
  return { url: pageUrl, ...info };
}
