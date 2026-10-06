# Homelancer — Mech Shopfront Scroll Demo (v02, not live)

Open `index.html` (works from file:// — data is embedded; `data/systems.json` is the editable source,
re-embed with: python3 -c "t=open('index.html.tpl').read();open('index.html','w').write(t.replace('__DATA__',open('data/systems.json').read()))").

* Frame = floor(scrollY / pxPerFrame) mod N → scroll down = walk forward, scroll up = walk in reverse.
* Mech x-position, title zoom (scale + opacity) and parallax layers are pure functions of section scroll progress, so they reverse too.
* Sprite sheets (WebP, PNG fallback) are lazy-loaded per section and pre-tinted once per faction ('color' blend).
* Prices / non-mech items are PLACEHOLDER.
* Assets per mech: assets/mechs/<clip>/ sheet.webp, sheet.png, walk.webm (VP9 alpha), walk_anim.webp, frames/*.png (keyed PNG sequence).
* tools/: Blender blue-screen render script, keyer, asset builder, headless test.
Add a system: append to data/systems.json → systems[] (faction must exist in factions{}, mech in mechs{}).

## v02
* Owner's blue-screen clips (light sky-blue screen) keyed with tools/key_owner.py (clean-plate + chroma-ratio matte, edge unmix, despill, soft floor shadow).
  clip1 → owner1 (frames 54–92), clip2 → owner2 (59–96), clip3 → owner3 (92–134); loops found with tools/find_loop.py.
* Front-facing clips use "motion": "toward" (mech grows/approaches on scroll down, recedes on scroll up). Side-on stand-ins use "across".
* Real clips: Veranthos, Dreadholm, Malachar. Stand-ins still used: Raptian Major (tan_navy), Cynthara (boss), Genesis (black_gold).
  To use a real clip there instead, set that system's "mech" to an owner_* id and a tintStrength (e.g. 0.7).
