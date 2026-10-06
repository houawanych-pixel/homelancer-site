/* Homelancer mech scroll demo — no frameworks.
   Frame index is derived from scroll position: frame = floor(scrollY / pxPerFrame) mod N,
   so scrolling down plays the walk forward and scrolling up plays it in reverse. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  async function loadData() {
    const inline = document.getElementById('systems-data');
    if (inline && inline.textContent.trim()) return JSON.parse(inline.textContent);
    const r = await fetch('data/systems.json'); return r.json();
  }
  const webpOK = (() => { try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } })();
  const imgCache = {};
  function loadImg(src) {
    return imgCache[src] ||= new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  // Pre-tint a whole sprite sheet once (faction livery): keep alpha, wash colour over the mech.
  async function tintedSheet(mech, tint, strength) {
    const img = await loadImg(webpOK ? mech.sheet.webp : mech.sheet.png);
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    // 'color' blend keeps the mech's own light/shade (panel detail) and swaps in the faction hue;
    // 'destination-in' then restores the keyed alpha so the background stays transparent.
    g.globalCompositeOperation = 'color'; g.globalAlpha = strength; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0);
    return c;
  }
  function drawFrame(ctx, sheet, s, f) {
    const sx = (f % s.cols) * s.frameW, sy = Math.floor(f / s.cols) * s.frameH;
    ctx.clearRect(0, 0, s.frameW, s.frameH);
    ctx.drawImage(sheet, sx, sy, s.frameW, s.frameH, 0, 0, s.frameW, s.frameH);
  }

  function sectionHTML(sys, fac, mech) {
    const facLine = fac.enemy ? `Enemy home system · threat: ${fac.threat}` : fac.theme;
    const cards = sys.catalog.map((it, i) => `
      <article class="card">
        <div class="art">${it.kind === 'mech' ? `<canvas data-thumb="${i}"></canvas>` : `<span class="kind">${it.kind}</span>`}</div>
        <div class="body"><b>${it.title}</b><span class="price">${it.price}</span>
        <button disabled title="Shop not live">Buy — PLACEHOLDER</button></div>
      </article>`).join('');
    return `
      <div class="track"><div class="stage">
        <div class="layer stars1"></div><div class="layer stars2"></div><div class="planet"></div>
        <div class="title"><span class="fac"><i></i>${sys.faction}</span><h2>${sys.name}</h2>
          <p class="meta">${facLine} · Tile ${sys.tile} · ${sys.role} · ${sys.planets} planets · ${sys.stations} stations</p></div>
        <div class="ground"></div>
        <span class="badge">${sys.faction} · ${mech.label}</span>
        <canvas class="mech" aria-label="${mech.label} in ${sys.faction} colours walking"></canvas>
      </div></div>
      <div class="catalog"><span class="eyebrow">${sys.name} shopfront</span><h3>${sys.faction} catalog</h3>
        <p class="ph">PLACEHOLDER — no shop or item data yet. Items and prices are not real.</p>
        <div class="grid">${cards}</div></div>`;
  }

  async function init() {
    const data = await loadData();
    const root = $('#systems'); const ppf = data.pxPerFrame || 14;
    const secs = [];
    for (const sys of data.systems) {
      const fac = data.factions[sys.faction], mech = data.mechs[sys.mech];
      const el = document.createElement('section'); el.className = 'sys'; el.id = sys.id;
      el.style.setProperty('--c1', fac.primary); el.style.setProperty('--c2', fac.secondary); el.style.setProperty('--tint', fac.tint);
      el.innerHTML = sectionHTML(sys, fac, mech); root.appendChild(el);
      if (mech.motion === 'toward') el.classList.add('toward');
      const cv = $('canvas.mech', el); cv.width = mech.sheet.frameW; cv.height = mech.sheet.frameH;
      secs.push({ sys, fac, mech, el, track: $('.track', el), cv, ctx: cv.getContext('2d'), badge: $('.badge', el),
        title: $('.title', el), l1: $('.stars1', el), l2: $('.stars2', el), planet: $('.planet', el), sheet: null, lastF: -1 });
    }
    // Lazy-load: tint + attach sheets as sections approach the viewport (first one immediately).
    const ready = async s => {
      if (s.loading) return; s.loading = true;
      s.sheet = await tintedSheet(s.mech, s.fac.tint, s.sys.tintStrength ?? 0.4);
      s.el.querySelectorAll('canvas[data-thumb]').forEach(t => { t.width = s.mech.sheet.frameW; t.height = s.mech.sheet.frameH; drawFrame(t.getContext('2d'), s.sheet, s.mech.sheet, 0); });
      s.lastF = -1; dirty = true;
    };
    ready(secs[0]);
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) ready(secs.find(s => s.el === e.target)); }), { rootMargin: '150% 0px' });
    secs.forEach(s => io.observe(s.el));

    let hud = document.querySelector('.hud'); if (hud && !/debug/.test(location.search)) { hud.remove(); hud = null; }
    let dirty = true, lastY = -1;
    const state = window.__mechState = { scrollY: 0, frame: 0, dir: 0, sections: [] };
    function frame() {
      const y = window.scrollY;
      if (y !== lastY || dirty) {
        const vw = innerWidth, vh = innerHeight;
        const step = Math.floor(y / ppf);
        state.dir = y > lastY ? 1 : y < lastY ? -1 : 0; lastY = y; dirty = false;
        state.scrollY = y; state.sections = [];
        for (const s of secs) {
          const r = s.track.getBoundingClientRect();
          const span = r.height - vh; const p = clamp(-r.top / span);
          const visible = r.bottom > 0 && r.top < vh;
          const N = s.mech.sheet.frames, f = mod(step, N);
          if (visible) {
            if (s.sheet && f !== s.lastF) { drawFrame(s.ctx, s.sheet, s.mech.sheet, f); s.lastF = f; }
            const mw = s.cv.offsetWidth || 250;
            let x;
            if (s.mech.motion === 'toward') {
              // front-facing clip: mech walks toward the viewer — grows and comes down as you scroll, shrinks back on scroll up
              const sc = 0.62 + 0.55 * p; x = (vw - mw) / 2; s._sc = sc;
              s.cv.style.transform = `translate3d(${x}px,${(p * 5).toFixed(2)}svh,0) scale(${sc.toFixed(3)})`;
              s.badge.style.transform = `translate3d(${x + mw * 0.2}px,${(-(sc - 1) * s.cv.offsetHeight + p * 5 * vh / 100).toFixed(1)}px,0)`;
            } else {
              x = -mw * 0.7 + p * (vw + mw * 0.4);              // side-on clip: walks in from the left, out to the right
              s.cv.style.transform = `translate3d(${x}px,0,0)`;
              s.badge.style.transform = `translate3d(${x + mw * 0.15}px,0,0)`;
            }
            // system name zoom: grows in (0–20%), holds, zooms past (80–100%); reversible by construction
            let sc = 1, op = 1;
            if (p < 0.2) { const t = p / 0.2; sc = 0.55 + 0.45 * t; op = t; }
            else if (p > 0.8) { const t = (p - 0.8) / 0.2; sc = 1 + 0.9 * t; op = 1 - t; }
            s.title.style.transform = `scale(${sc.toFixed(3)})`; s.title.style.opacity = op.toFixed(3);
            s.l1.style.transform = `translate3d(0,${(-p * 50).toFixed(1)}px,0)`;
            s.l2.style.transform = `translate3d(0,${(-p * 150).toFixed(1)}px,0)`;
            s.planet.style.transform = `translate3d(${(-p * 40).toFixed(1)}px,${(-p * 260).toFixed(1)}px,0)`;
            state.sections.push({ id: s.sys.id, p: +p.toFixed(3), frame: f, N, motion: s.mech.motion, mechScale: +(s._sc || 1).toFixed(4), x: Math.round(x), titleScale: +sc.toFixed(3), titleOpacity: +op.toFixed(3) });
          }
        }
        state.frame = mod(step, secs[0].mech.sheet.frames);
        if (hud) hud.textContent = `step ${step} · ${state.dir > 0 ? '▼ fwd' : state.dir < 0 ? '▲ rev' : '■'}`;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    addEventListener('resize', () => { dirty = true; });
  }
  init();
})();
