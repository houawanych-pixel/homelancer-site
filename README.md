# Homelancer site (homelancergame.com)

`index.html` is the scroll film: a space battle behind rolling credits, a chase and explosion into Liberty Hub, a
spoiler warning, then the mechs. Everything on it is the game's own 3D model running live (three.js r128 from a CDN).

* `a/` pictures, planet maps, sound, and the flat stand-in sheets shown while a ship model downloads.
* `m/` the models, one `<name>.json` (glTF with its geometry inline) plus `<name>_N.jpg` textures.
  To swap a model: replace its files in `m/` under the same name (or add new ones and change the name in the
  `S.<thing>.m = { file: "..." }` lines near the top of the script in `index.html`).
* Everything on the stage is a function of the scroll position, so scrolling back runs it in reverse.
* "Test the beta" links to https://houawanych-pixel.github.io/homelancer-digital/
* `v02/` is the earlier mech shopfront scroll demo, kept as it was: https://homelancergame.com/v02/
