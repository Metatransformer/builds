import { spawnSync } from "node:child_process";

/** Turn recent commit subjects in a game's repo into one "update" (for devs not on Spawn). */
export function gitUpdate(repoDir, { since = "7 days ago", max = 6 } = {}) {
  const r = spawnSync("git", ["-C", repoDir, "log", `--since=${since}`, "--no-merges", "--pretty=%s"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const items = r.stdout.split("\n").map((s) => s.trim())
    .filter((s) => s && !/^(wip|merge|chore|bump|fix typo)/i.test(s))
    .slice(0, max);
  if (!items.length) return null;
  return { title: "This week's build", date: new Date().toISOString().slice(0, 10), items };
}
