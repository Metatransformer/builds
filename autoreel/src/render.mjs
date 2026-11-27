import { launchBrowser } from "./util.mjs";
import { join } from "node:path";
import { ffmpeg } from "./util.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Draw caption overlays as transparent PNGs with a real browser, so no ffmpeg font setup is needed. */
export async function captionPngs(items, { channel } = {}) {
  const browser = await launchBrowser(channel);
  const page = await browser.newPage();
  for (const it of items) {
    const { w, h, path, layout, title, sub, tag } = it;
    const vertical = layout === "vertical";
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;background:transparent;width:${w}px;height:${h}px;overflow:hidden;font-family:-apple-system,"Helvetica Neue",Inter,Arial,sans-serif}
      .wrap{position:absolute;left:0;right:0;${vertical ? "top:150px" : "bottom:70px"};display:flex;flex-direction:column;align-items:center;gap:${vertical ? 22 : 12}px;padding:0 ${vertical ? 70 : 90}px}
      .tag{font-size:${vertical ? 34 : 22}px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#111;background:#ffd84d;padding:8px 18px;border-radius:10px}
      .title{font-size:${vertical ? 76 : 50}px;line-height:1.08;font-weight:800;color:#fff;text-align:center;text-shadow:0 4px 0 #000,0 0 24px rgba(0,0,0,.8);-webkit-text-stroke:2px #000}
      .sub{font-size:${vertical ? 40 : 28}px;line-height:1.25;font-weight:600;color:#fff;text-align:center;text-shadow:0 2px 0 #000,0 0 16px rgba(0,0,0,.9)}
      .foot{position:absolute;left:0;right:0;bottom:${vertical ? 170 : 26}px;text-align:center;font-size:${vertical ? 38 : 24}px;font-weight:700;color:#fff;text-shadow:0 2px 0 #000,0 0 14px #000}
    </style></head><body><div class="wrap">
      ${tag ? `<div class="tag">${esc(tag)}</div>` : ""}
      ${title ? `<div class="title">${esc(title)}</div>` : ""}
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
    </div>${it.foot ? `<div class="foot">${esc(it.foot)}</div>` : ""}</body></html>`);
    await page.screenshot({ path, omitBackground: true });
  }
  await browser.close();
}

const ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart"];
// a silent stereo track keeps every platform's uploader happy (browser capture has no audio)
const SILENT = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];
const AAC = ["-c:a", "aac", "-b:a", "96k", "-shortest"];

/** 1080x1920 short: blurred fill behind the gameplay, caption on top. */
export function renderVertical({ video, start, length, overlay, out, crop = 0.8 }) {
  // crop: width/height of the centre cut shown in the middle (0.8 = 4:5). 0 shows the full frame.
  const fade = Math.max(0, length - 0.35);
  ffmpeg([
    "-ss", String(start), "-t", String(length), "-i", video,
    "-i", overlay, ...SILENT,
    "-filter_complex",
    `[0:v]split[a][b];` +
      `[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.12[bg];` +
      (crop ? `[b]crop='min(iw,ih*${crop})':ih,scale=1080:-2[fg];` : `[b]scale=1080:-2[fg];`) +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2[v];[v][1:v]overlay=0:0,fade=t=out:st=${fade}:d=0.35[out]`,
    "-map", "[out]", "-map", "2:a", ...ENC, ...AAC, "-t", String(length), out,
  ]);
  return out;
}

/** 16:9 clip at the capture's size with a lower-third caption. */
export function renderLandscape({ video, start, length, overlay, out, width = 1280, height = 720 }) {
  const fade = Math.max(0, length - 0.35);
  ffmpeg([
    "-ss", String(start), "-t", String(length), "-i", video,
    "-i", overlay, ...SILENT,
    "-filter_complex", `[0:v]scale=${width}:${height}[v];[v][1:v]overlay=0:0,fade=t=out:st=${fade}:d=0.35[out]`,
    "-map", "[out]", "-map", "2:a", ...ENC, ...AAC, "-t", String(length), out,
  ]);
  return out;
}

/** A short montage of the best moments, hard cuts, for a trailer-ish post or a Steam/itch page. */
export function renderMontage({ video, moments, each = 4, out, width = 1280, height = 720 }) {
  const parts = moments.map((m, i) => `[0:v]trim=start=${m.start}:duration=${each},setpts=PTS-STARTPTS,scale=${width}:${height}[p${i}]`);
  const concat = moments.map((_, i) => `[p${i}]`).join("") + `concat=n=${moments.length}:v=1:a=0[out]`;
  ffmpeg(["-i", video, ...SILENT, "-filter_complex", parts.join(";") + ";" + concat, "-map", "[out]", "-map", "1:a", ...ENC, ...AAC, "-t", String(each * moments.length), out]);
  return out;
}

export function thumbnail({ video, at, out }) {
  ffmpeg(["-ss", String(at), "-i", video, "-frames:v", "1", "-q:v", "3", out]);
  return out;
}

export function contactSheet({ video, moments, out, dir }) {
  void dir;
  const ins = moments.flatMap((m) => ["-ss", String(m.start + 1), "-i", video]);
  const n = moments.length;
  const f = moments.map((_, i) => `[${i}:v]scale=480:270,trim=end_frame=1[s${i}]`).join(";") + ";" + moments.map((_, i) => `[s${i}]`).join("") + `hstack=inputs=${n}[out]`;
  if (n < 2) return thumbnail({ video, at: moments[0].start + 1, out });
  ffmpeg([...ins, "-filter_complex", f, "-map", "[out]", "-frames:v", "1", out]);
  return out;
}

export { join };
