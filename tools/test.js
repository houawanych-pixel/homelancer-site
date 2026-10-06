const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox','--hide-scrollbars'] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await pg.goto('http://localhost:8765/index.html?debug', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  const st = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__mechState)));
  const go = async y => { await pg.evaluate(y => window.scrollTo(0, y), y); await new Promise(r => setTimeout(r, 120)); return st(); };
  const sec0 = await pg.evaluate(() => { const t = document.querySelector('#veranthos .track'); return { top: t.offsetTop + t.offsetParent.offsetTop, h: t.offsetHeight }; });
  const total = await pg.evaluate(() => document.documentElement.scrollHeight);
  console.log('page height', total, 'veranthos track', sec0);
  // direction test inside Veranthos stage
  const base = sec0.top + 300; const down = [], up = [];
  for (let i = 0; i <= 10; i++) down.push(await go(base + i * 14));
  for (let i = 9; i >= 0; i--) up.push(await go(base + i * 14));
  const sv = s => s.sections.find(x => x.id === 'veranthos');
  const N = sv(down[0]).N, mv = s => sv(s).motion === 'toward' ? sv(s).mechScale : sv(s).x;
  console.log('motion', sv(down[0]).motion, 'N', N);
  console.log('DOWN frames', down.map(s => sv(s).frame).join(','), 'advance', down.map(mv).join(','));
  console.log('UP   frames', up.map(s => sv(s).frame).join(','), 'advance', up.map(mv).join(','));
  const okDown = down.every((s, i) => !i || sv(s).frame === (sv(down[i-1]).frame + 1) % N && mv(s) > mv(down[i-1]));
  const okUp = up.every((s, i) => { const prev = i ? up[i-1] : down[10]; return sv(s).frame === (sv(prev).frame + N - 1) % N && mv(s) < mv(prev); });
  console.log('forward-on-down', okDown, 'reverse-on-up', okUp);
  // wrap-around check: cross a loop boundary both ways
  const wrapBase = base - (sv(down[0]).frame) * 14 + 7; const w = [];
  for (const dy of [-28,-14,0,14,28,14,0,-14,-28]) w.push(sv(await go(wrapBase + dy)).frame);
  console.log('wrap frames (down then up across frame 0):', w.join(','));
  // title zoom both directions
  const zs = []; for (const f of [0.02,0.1,0.18,0.5,0.85,0.95]) { const s = await go(sec0.top + f * (sec0.h - 844)); zs.push(f+':'+sv(s).titleScale+'/'+sv(s).titleOpacity); }
  console.log('title zoom (p:scale/opacity)', zs.join('  '));
  // screenshots
  const shot = async (y, n) => { await go(y); await new Promise(r => setTimeout(r, 250)); await pg.screenshot({ path: `../test/shots/${n}.png` }); };
  await shot(0, 'phone_00_intro');
  const secs = await pg.evaluate(() => [...document.querySelectorAll('.sys')].map(s => ({ id: s.id, top: s.offsetTop, track: s.querySelector('.track').offsetHeight })));
  for (const [i, s] of secs.entries()) { await shot(s.top + s.track * 0.32, `phone_${String(i+1).padStart(2,'0')}_${s.id}`); }
  await shot(secs[0].top + secs[0].track, 'phone_catalog_veranthos');
  // GIF frames: down through Veranthos into Dreadholm, then back up
  const g0 = secs[0].top + 200, g1 = secs[1].top + secs[1].track * 0.3; const n = 36; let k = 0;
  for (let i = 0; i <= n; i++) { await go(g0 + (g1 - g0) * i / n); await pg.screenshot({ path: `../test/gif/${String(k++).padStart(3,'0')}.png` }); }
  for (let i = n - 1; i >= 0; i--) { await go(g0 + (g1 - g0) * i / n); await pg.screenshot({ path: `../test/gif/${String(k++).padStart(3,'0')}.png` }); }
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
