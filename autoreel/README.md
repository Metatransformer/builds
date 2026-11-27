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
`hold` + `ms`, `type`, `look` ([dx, dy] + `ms`), `clickText` (visible text in any frame, `exact`
optional), `waitText` (wait until text shows, `timeout`), and on Spawn `walkTo` ([x, z] world
position, steered by reading the body's position from the sim; experimental: it walks straight lines, so chain waypoints around walls).

A fixed body name (`"spawn": {"as": "autoreel-main"}`) keeps the game's save between runs, so
`games/valenfeld.json` rejoins where the last run left off and skips the intro; `games/valenfeld-intro.json`
plays the intro on a fresh body (`autoreel-{run}`).

Tuning start steps: `--step-shots` saves a screenshot after every step to `<run>/steps/`.

## Spawn worlds

Spawn does not let an automated browser into a creator's world as a guest, so autoreel plays
Spawn worlds through Spawn's own player client, the supported agent route
([spawn.co/llms.txt](https://www.spawn.co/llms.txt)):

1. Install the client: `bun add -g @spawnco/client` (needs [Bun](https://bun.sh)).
2. Get an agent token: `POST https://www.spawn.co/api/agent/v1/signup` with
   `{"username": "...", "name": "..."}` answers a `sak_…` token once. Keep it out of game files and
   commits: put it in your keychain and export it per run, e.g.
   `export SPAWN_TOKEN=$(security find-generic-password -s spawn-autoreel -w)`. The client also
   reads `~/.spawn/token`.
3. Run as usual. A spawn.co URL (or `"capture": "spawn-client"`) makes autoreel run
   `spawn client join @user/world --render gpu`, attach Playwright to the page it serves over CDP,
   run your start steps and the bot, record with a CDP screencast, and `spawn client leave` at the
   end, even on failure.

```json
"capture": "spawn-client",
"spawn": { "as": "autoreel-{run}", "room": "optional-room", "render": "gpu" }
```

`as` names the body. The game saves progress on the body, so `{run}` (a fresh body every run)
makes every run start from the same place, and a fixed name carries progress between runs. An
unlinked agent account stands 2 bodies at a time and 1000 distinct bodies a day; link it to your
Spawn account for more. See [games/valenfeld.json](games/valenfeld.json) for a full intro script.

## Commands

```
autoreel run <game.json|url> [--seconds 90] [--clips 3] [--length 10] [--headed] [--channel chrome]
autoreel cut <game.json|url> --video footage.mp4      # already have footage? skip the bot
autoreel capture <game.json|url> --seconds 60          # only record
autoreel info <spawn game page url>                    # print update notes
```

On a Mac, `--headed --channel chrome` uses your installed Chrome and real GPU, which 3D games need.
Spawn worlds render on your GPU through the Spawn client instead (see above).

Requires Node 20+ and ffmpeg (installed automatically via `ffmpeg-static`, or set `FFMPEG`).

MIT. Built by [@metatransformr](https://x.com/metatransformr).
