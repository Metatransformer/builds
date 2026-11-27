# autoreel framework design

Goal: **game in, posts out.** A dev points autoreel at a game once. Every day (or every build) it
plays the game, films the best moments, writes the post from what changed, publishes, and learns
which clips worked. Open source core, runnable for free on a laptop or in CI. A managed service can
run the same pipeline on a schedule for devs who want zero setup.

## Pipeline

```
 game.json ─┬─► CAPTURE ──► ANALYZE ──► CUT ──► WRITE ──► PUBLISH ──► MEASURE
            │   (players)   (scorers)   (renderers) (writers) (publishers) (metrics)
            └─► NOTES (sources: Spawn page, git log, CHANGELOG, manual) ───┘
```

Each stage is a small module with one job and a plain file contract, so any stage can be swapped or
run alone (`autoreel cut --video obs.mp4` skips capture for devs who already record).

| Stage | v0 (this PR) | Next |
|---|---|---|
| **Players** play the game | `explorer`: model-free weighted random walk/look/jump/interact/attack; `script`: replay steps | `director`: a model (Claude computer use) looks at a screenshot every few seconds and picks a goal ("go outside", "fight the wolf"); `replay`: record a human's inputs once and replay with variations; engine hooks (Spawn agent API, Phaser/Godot debug hooks) to teleport to showcase spots |
| **Capture** | Playwright `recordVideo` at the game's viewport, headless or headed | CDP screencast at higher bitrate; tab audio capture; OBS websocket for native games |
| **Scorers** find moments | ffmpeg signal stats: motion (YDIF), scene events, brightness and flatness penalties, a bonus for a strong first 2 seconds | vision model ranks the top 10 candidates ("which of these would stop a scroll?"); per-game learned weights from MEASURE |
| **Renderers** cut | 9:16 short with blurred fill + caption, 16:9 clip with lower third, 4s-cut montage, thumbnail, contact sheet | Hyperframes templates (shared with the Metatransformer daily video), music beds, end cards, GIF for Steam/itch pages |
| **Sources** say what changed | Spawn update notes, git log, notes in game.json | CHANGELOG.md, itch.io devlogs, Steam event posts, Discord #changelog |
| **Writers** write copy | template: devlog post from the latest update + one line per clip | LLM writer in the dev's voice (Supabird `write_in_my_style`, or Claude with the dev's past posts) |
| **Publishers** post | `run.json` has posts with clip paths; Claude posts them with the Supabird connector | adapters: X API, YouTube Shorts, TikTok, Bluesky, Reddit (draft only: communities punish promotion), Discord webhook, itch devlog |
| **Metrics** close the loop | none | per-clip views → plays/wishlists via tagged links; feed results back into scorer weights and posting times |

## File contracts

- `games/<name>.json`: the game profile. `name`, `url` (what the player loads), `pageUrl` (store or
  Spawn page for notes and links), `viewport`, `seconds`, `start` (scripted steps to get past menus),
  `bot` (player config), `notes` (optional manual changelog), `hook`, `cta`, `clipSeconds`.
- `runs/<game>-<time>/`: one folder per run. `capture.webm`, `capture.json`, `short-N.mp4`,
  `clip-N.mp4`, `montage.mp4`, `thumb.jpg`, `sheet.jpg`, `run.json` (moments, clips, posts), `index.html` (preview).
- `run.json.posts[]`: `{ kind: devlog|clip|montage, clip, text }`. Publishers read only this.

## Principles

1. **Free by default.** No API keys needed for the core path. Models are optional upgrades.
2. **Every output is an ad for the tool.** Optional tiny "made with autoreel" end card. Distribution for the tool comes from the tool.
3. **Dev stays in control of tone, not of labor.** Autopost is a flag; the default for other devs is draft and review.
4. **Browser first.** Web games are the easy case and the growing one (Spawn, itch HTML5, Poki, CrazyGames). Native games come through the `--video` path until a capture adapter exists.

## Managed service (later)

Same pipeline, run nightly per game on a shared runner, with a page per game (clips, queue, results)
and posting through the dev's connected accounts. Cost driver is browser minutes plus rendering:
roughly a few cents per run on CPU *(estimate, not measured at scale)*. Pricing idea: free for one
game with a watermark, paid for more games and the model `director` player.

## Roadmap

1. v0 (now): explorer + script players, signal scorer, renderers, Spawn/git notes, template posts. Nick's Spawn games as the first users.
2. v0.1: run nightly for Nick's games from the Metatransformer loop; post 1 clip/day per game via Supabird; log which clips get views.
3. v0.2: `director` player with Claude; vision re-ranking; Hyperframes templates.
4. v0.3: publishers for YouTube Shorts and TikTok; metrics loop.
5. Own repo (`Metatransformer/autoreel`) once it is worth starring; launch post with before/after numbers from Nick's games.
