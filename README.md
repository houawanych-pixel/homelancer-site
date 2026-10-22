# Homelancer site (homelancergame.com)

One static page, `index.html`: no 3D model loading, no build step. GitHub Pages serves it from `main`.

Sections: hero (fixed **Start Game** button in the header, plus hero and final buttons) · the game · galaxy chart ·
ships · mechs (arms / core / legs) · fourteen factions · stations · in-game screenshots · play.

* Every "Start Game" link goes to https://houawanych-pixel.github.io/homelancer-digital/ — keep the header button.
* Galleries are side-scrolling rails (`.horizontal-gallery`, swipe on phones, ← → buttons on desktop).
* Parallax on the hero and the two image bands; all of it off when the visitor asks for reduced motion.
* Fonts: Barlow Condensed (display), Space Grotesk (body), Chakra Petch (labels), from Google Fonts.

## Pictures (`a/`)

| folder | what | source |
| --- | --- | --- |
| `a/hero2.webp` | Veranthos Senate Station with the Lancer | rendered from the game's 3D models |
| `a/ship/` | 5 player ships + 9 faction ships | rendered from the game's 3D models |
| `a/mech/` | 12 mech frames, the arms/core/legs split, mixed mechs | rendered from the game's 3D models |
| `a/st/` | 14 stations | rendered from the game's 3D station models |
| `assets/factions/` | 14 faction concept-art banners (all 1600×900, 16:9) used by the faction showcase; Elyza, Unity, Solarion, Imperium, Covenant, Orion, Savagers and Liberator are the v2 artwork, previous versions kept as `<slug>_v1.webp` | Homelancer_Faction_Web_Artwork_14.zip (concept art, pending owner review) |
| `a/fac/` | 14 faction pictures (the "Fourteen factions" rail) | the game's faction interface art (`assets/hub_bg`) |
| `a/play/` | screenshots of the beta | the game's route test |
| `a/galaxy_map.webp` | galaxy chart | drawn from the game's system data |
| `a/room_*.jpg` | Liberty Hub rooms | owner's station art |

Each picture has a full size and a smaller one (`-800`, `-450`, `-640`, `-960`); the page picks one with `srcset`.
The renders are made in the game repo with `tools/shipkit/beauty.gd` (run from an empty Godot project).
Older files (`a/hero.webp`, `a/cadet.webp` ... stand-in sprite sheets) are no longer used by the page.

* `m/` the models of the old 3D scroll film (not used by the page any more).
* `v02/` the earlier mech shopfront scroll demo, kept as it was: https://homelancergame.com/v02/

## Tests

`node tools/test_site.js <url> <outdir> [label]` (Playwright): 360 / 390 / 768 / 1440 wide, with and without reduced
motion — no sideways page scroll, header Start Game always visible and on top, every image loads, every gallery moves
with its arrows and with a swipe, in-page links exist, buttons at least 44 px, no console errors.

## Help Build Homelancer (`help/`)

The community page: **Report a Bug**, a public board (Bug Reports · Gameplay Feedback · Feature Suggestions · General
Discussion) with statuses, upvotes, duplicate hints and comments, plus **Latest fixes & updates**. No account, email or
donation needed. `help/admin.html` is the developer dashboard (not linked, `noindex`): review, prioritise, change status,
reply, merge duplicates, hide spam, mark fixed in a version, write patch notes.

* **Server:** `worker/feedback.js`, a Cloudflare Worker with a D1 database (`worker/schema.sql`). Stores reports, votes,
  comments, flags, statuses and patch notes. Rate limits, honeypot + time-to-fill checks, spam filter, auto-hide after 3
  flags, screenshots checked by their bytes (PNG/JPEG/WebP, 1.5 MB) and visible to the developer only. Player identity =
  a random token in the browser, stored only as a salted hash. Video links, screenshots and hashes never leave the admin API.
* **Switching it on (once):** add repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit + D1: Edit),
  `CLOUDFLARE_ACCOUNT_ID` and `FEEDBACK_ADMIN_KEY` (20+ characters), then run *Actions → Deploy feedback server*. It
  creates the database, deploys the worker, sets the secrets and writes the address into `help/feedback.json`.
  Until then the page says reports are being switched on and shows the verified patch notes from `help/patches.json`.
* **Patch notes:** only changes that shipped in a real game update. `worker/seed-patches.sql` holds the verified
  v1.9k–v1.9p releases; new ones are written in the dashboard.
* **Tests:** local server `cd worker && npx wrangler d1 execute homelancer-feedback --local --file schema.sql && npx wrangler dev --local`
  (secrets in `worker/.dev.vars`, git-ignored), then `node tools/test_feedback_api.js http://localhost:8787 <key>` (34 checks) and,
  with `help/feedback.json` pointed at it, `node tools/test_help.js http://localhost:8080 <outdir> <key>` (23 checks).
