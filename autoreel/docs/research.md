# Distribution for indie game devs: what the evidence says (Nov 2026)

Short version: discovery now runs on **short clips of real gameplay**, posted often, by the dev or by
curators who re-cut them. Tools exist for each step on its own, but nothing goes from
"here is my game" to "clips are posted with the devlog" without a person recording and editing.
The step nobody automates is the first one: **getting good footage out of the game.**

Sources are linked per claim. Most are vendor blogs with a stake in the answer, and most numbers
are small samples or self-reported. Treat them as direction, not as fact.

## 1. What drives discovery

| Channel | Evidence | Strength |
|---|---|---|
| X clips (dev or curator) | Indie Game Joe re-cuts trailers into ~1 minute clips. Across 8 dev-reported cases, a median of roughly 7 to 8 wishlists per 1K views, views and wishlists tightly correlated (Spearman 0.95). Best case: Retro Rewind, 13.7M views, while the dev's own reveal tweet had 129. Advice: "post clips of trailers", not trailers. [howtomarketagame, May 2026](https://howtomarketagame.com/2026/05/07/2026-tips-for-making-your-tweets-go-viral/) | Medium (small sample, real numbers) |
| TikTok / Shorts | Claimed 200 to 500 wishlists per 100K views, 2K to 8K per 1M. One campaign: 571K views gave about 2,900 wishlists. [Game Launch Guide](https://gamelaunchguide.com/blog/market-indie-game-tiktok-2026/), [The Game Marketer](https://www.thegamemarketer.com/insight-posts/tiktok-marketing-for-indie-games-turn-views-into-steam-wishlists) | Weak (unsourced, vendor) |
| Paid clipping | Creators paid per verified view, about $1 to $5 per 1K views, $1,000 minimum self-serve. Clip Mansion: 298M views over 7 campaigns. [Try Shoot](https://tryshoot.com/guides/how-to-market-an-indie-game) | Medium (vendor, but a real market exists) |
| Steam Next Fest | Called the single biggest free wishlist event by two sources, no numbers. [Try Shoot](https://tryshoot.com/guides/how-to-market-an-indie-game), [StraySpark](https://www.strayspark.studio/blog/indie-game-discoverability-strategies-2026) | Consensus, unquantified |
| Video creators vs streamers | Creators drive wishlists for months, streamers rarely drive direct sales. [StraySpark](https://www.strayspark.studio/blog/indie-game-discoverability-strategies-2026) | Weak |

Market context: 14,000+ new Steam releases in 2025 ([StraySpark](https://www.strayspark.studio/blog/indie-game-discoverability-strategies-2026)). Supply is not the problem, attention is.

**What it means:** the unit of distribution is a 5 to 15 second clip with a strong first two seconds, and
volume matters, because results are power-law (one clip in dozens carries the month). A dev who posts
one clip a week loses to one who posts one a day. That is a throughput problem, which is a tooling problem.

## 2. What the pain actually is

- Editing is the bottleneck: "It takes skill, time, and software most people don't want to learn." ([clipforge author](https://dev.to/lakshmisravyavedantham/i-built-an-ai-that-turns-raw-gameplay-into-tiktok-youtube-and-trailer-clips-automatically-373))
- Views that do not move wishlists. "Views are vanity." ([Game Launch Guide](https://gamelaunchguide.com/blog/market-indie-game-tiktok-2026/))
- Nick's own audience: his thread asking solo devs about their weaknesses drew 34 replies, with
  marketing, art and game feel named as weak spots next to strong concept and code. (His post, not re-verified here: Supabird search only reaches about the last day of X.)
- Nick himself builds daily (Valenfeld has 132 updates since release) and writes good update notes,
  but does not record or post demos. **The changelog exists, the footage does not.** That is the gap
  in one sentence, and probably true of most AI-assisted devs, who ship faster than ever and market no more than before. *(Guess, to test with his audience.)*

## 3. What existing tools cover

| Step | Existing tools | Gap |
|---|---|---|
| Record footage | OBS, Steam/NVIDIA/console capture, Playwright (for web) | A human has to sit and play. Nothing plays the game for you. |
| Find highlights | Streamlabs Highlighter, Eklipse, AutoShorts (OSS, needs NVIDIA GPU + OpenAI/Gemini), clipforge (OSS, audio-loudness only) | Built for streamers of other people's games: they look for kills and loud moments in long streams, not for "show off what I built this week". |
| Edit / caption | CapCut, VEED, Descript, Magic Hour ($24/mo), DaVinci | Manual, or generic AI. Generated video does not show the real game. |
| Write the post | Generic AI writers | Not tied to what actually changed in the build. |
| Publish | Buffer, Supabird, Typefully, platform schedulers | None of the clip tools above auto-post. |
| Measure | Steam wishlists (UTM links), platform analytics | Nobody connects clip to wishlist or play. |

## 4. The gap, and the bet

Nobody owns **"game in, posts out"**. The pieces exist, so the work is the glue plus the one hard new
part: an agent that plays the game well enough to film it. Browser games make that part tractable
today, because a headless browser can load, play and record them with no install. Spawn,
itch.io HTML5, Newgrounds, Poki, CrazyGames and web builds of Godot/Unity/Phaser games are all in reach.

Bet (to validate): **a free, open source tool that turns a game URL plus its changelog into a week of
captioned clips and devlog posts** is useful enough that devs try it, and visible enough (every clip
it makes is an ad for it) that it spreads. The managed service later is "we run it nightly on your
game and post for you".

## 5. Open questions (to ask, not guess)

1. Which platform matters most to his audience's wishlists or plays: X, TikTok, Shorts? (He is X-first; the tool renders 9:16 and 16:9 for all of them.)
2. Do devs want it to post on its own, or to queue drafts? Nick wants autopost; most devs may want review first.
3. Is a model-free bot enough footage for most games, or does it need a model in the loop (Claude computer use) to reach the good parts? First test on Valenfeld answers this for 3D RPGs.
4. Native (Steam/desktop) games need a different capture path (OBS + input injection, or a game SDK hook). Out of scope for v0.

*X research note: Supabird's search only returned posts from the last ~24 hours with low engagement, so X evidence here is thin. A deeper X scan (or his X export) would strengthen section 2.*
