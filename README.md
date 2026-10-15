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
