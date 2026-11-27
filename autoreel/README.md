# autoreel

**Distribution for game devs.** A bot plays your browser game, finds the best moments, cuts them
into captioned shorts and clips, and writes the devlog post from your update notes. Free, local,
no API keys.

```
npx autoreel run https://www.spawn.co/@you/your-game
```

What you get in `runs/<game>-<time>/`:

- `short-N.mp4`: 1080x1920 shorts for X, TikTok, YouTube Shorts and Reels, with your latest update as the caption
- `clip-N.mp4`: 16:9 clips with a lower-third caption
- `montage.mp4`: 4-second cuts of the best moments back to back
- `thumb.jpg`, `sheet.jpg`: thumbnail and a contact sheet of the picks
- `run.json`: the moments, clips and ready-to-post copy (devlog post plus one post per clip)
- `index.html`: a preview page of all of it

## Why

Indie discovery now runs on short gameplay clips posted often ([research](docs/research.md)).
Devs ship faster than ever and still have to sit down, record, edit and caption by hand. Most
don't, so their changelogs never become posts. autoreel does the part nobody automates: it plays
the game for you.

## How it works

1. **Capture.** Playwright opens the game, runs your start steps (click Play, skip intro), then a
   player bot takes over: the `explorer` walks, looks around, jumps, interacts and attacks in random
   bursts. Or replay your own `script` of steps.
2. **Analyze.** ffmpeg measures motion, visual events and blank frames across the recording,
   scored against the game itself so dark and bright games both work.
3. **Cut.** The best windows (with a strong first two seconds) become shorts, clips and a montage.
4. **Write.** Update notes come from the game's Spawn page, your git log, or notes in the game file.

See [docs/framework.md](docs/framework.md) for the full design and roadmap (a model-driven player,
publishers, a metrics loop).

## Game file

```json
{
  "name": "Ember Drift",
  "url": "https://example.com/play",
  "pageUrl": "https://www.spawn.co/@you/ember-drift",
  "viewport": [1280, 720],
  "seconds": 90,
  "start": [{ "click": "text=Play" }, { "wait": 2000 }, { "key": "Enter" }],
  "bot": { "type": "explorer", "mouseLook": true, "click": true, "keys": { "interact": "e" } },
  "hook": "One line for the montage post",
  "cta": "Free in your browser"
}
```

Steps: `wait`, `waitFor`, `click` (Playwright selector), `clickAt` ([x, y] as fractions), `key`,
`hold` + `ms`, `type`, `look` ([dx, dy] + `ms`).

## Commands

```
autoreel run <game.json|url> [--seconds 90] [--clips 3] [--length 10] [--headed] [--channel chrome]
autoreel cut <game.json|url> --video footage.mp4      # already have footage? skip the bot
autoreel capture <game.json|url> --seconds 60          # only record
autoreel info <spawn game page url>                    # print update notes
```

On a Mac, `--headed --channel chrome` uses your installed Chrome and real GPU, which 3D games need.

Requires Node 20+ and ffmpeg (installed automatically via `ffmpeg-static`, or set `FFMPEG`).

MIT. Built by [@metatransformr](https://x.com/metatransformr).
