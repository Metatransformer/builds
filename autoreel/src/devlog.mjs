/**
 * Write post copy for each clip from the game's latest update notes. Template based, so it is free
 * and deterministic; an LLM writer can replace `writePosts` (see docs/framework.md, "Writers").
 */
const trim = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const sentence = (s) => s.replace(/\s+/g, " ").trim().replace(/([^.!?…])$/, "$1.");

export function captionFor(game, update, i) {
  if (!update) return { tag: game.name, title: game.hook || game.name, sub: "" };
  const item = update.items[i % Math.max(1, update.items.length)] || "";
  return {
    tag: i === 0 ? `${game.name} · new update` : game.name,
    title: trim(update.title, 40),
    sub: trim(item.replace(/\.$/, ""), 90),
  };
}

export function writePosts(game, update, clips, { playUrl } = {}) {
  const url = playUrl || game.pageUrl || game.url;
  const items = update?.items || [];
  const posts = [];
  if (update) {
    const bullets = items.slice(0, 4).map((s) => `- ${trim(sentence(s), 110)}`).join("\n");
    posts.push({
      kind: "devlog",
      clip: clips.find((c) => c.format === "vertical")?.file || clips[0]?.file,
      text: `${game.name} devlog: ${update.title}\n\n${bullets}\n\nPlay it free in your browser: ${url}`,
    });
  }
  clips.filter((c) => c.format === "vertical").forEach((c, i) => {
    if (i === 0 && update) return;
    const line = items[i] ? sentence(items[i]) : game.hook || `New footage from ${game.name}.`;
    posts.push({ kind: "clip", clip: c.file, text: `${trim(line, 200)}\n\n${game.name}, free in your browser: ${url}` });
  });
  const montage = clips.find((c) => c.format === "montage");
  if (montage) posts.push({ kind: "montage", clip: montage.file, text: `${game.hook || game.name}\n\n${url}` });
  return posts;
}
