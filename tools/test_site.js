// Homelancer site checks at 4 viewports. usage: node test_site.js <baseURL> <outdir> [label]
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.argv[2], out = process.argv[3], label = process.argv[4] || 'after';
const GAME = 'https://houawanych-pixel.github.io/homelancer-digital/';
const sizes = [[360, 780, 'android-360', true], [390, 844, 'mobile-390', true], [768, 1024, 'tablet-768', true], [1440, 900, 'desktop-1440', false]];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: require('fs').readdirSync('/opt/pw-browsers/chromium_headless_shell-1194').map(d => '/opt/pw-browsers/chromium_headless_shell-1194/' + d + '/headless_shell').find(p => require('fs').existsSync(p)) });
  const report = [];
  for (const [w, h, name, touch] of sizes) {
    for (const motion of ['no-preference', 'reduce']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 700, reducedMotion: motion, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errors.push(m.text()); });   // (the sandbox can't reach Google Fonts; those are counted apart)
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      const fontFails = []; page.on('requestfailed', r => { const u = r.url(); if (/fonts\.(googleapis|gstatic)\.com/.test(u)) fontFails.push(u); else errors.push('failed: ' + u); });
      await page.goto(base, { waitUntil: 'load' });
      if (motion === 'no-preference' && label) await page.screenshot({ path: `${out}/${label}-${name}-top.png` });
      // scroll the whole page so lazy images load, checking the fixed Start Game button on the way
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      let startOk = true, overflow = 0, heroMoved = false;
      for (let y = 0; y <= total; y += Math.round(h * 0.8)) {
        await page.evaluate(yy => window.scrollTo(0, yy), y);
        await page.waitForTimeout(120);
        const st = await page.evaluate(g => { const b = document.getElementById('start-top'); const r = b.getBoundingClientRect(); return { vis: r.top >= 0 && r.bottom <= innerHeight && r.width > 0 && getComputedStyle(b).visibility !== 'hidden', href: b.href === g, top: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) ?.closest('#start-top') != null }; }, GAME);
        if (!st.vis || !st.href || !st.top) startOk = false;
        overflow = Math.max(overflow, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
        if (y > 0 && y < h) heroMoved = heroMoved || await page.evaluate(() => getComputedStyle(document.querySelector('.hero-bg')).transform);
      }
      await page.waitForTimeout(400);
      const imgs = await page.evaluate(async () => { const all = [...document.images]; for (const i of all) { i.loading = 'eager'; } await Promise.all(all.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); return all.map(i => ({ src: i.currentSrc || i.src, ok: i.naturalWidth > 0 })); });
      const badImgs = imgs.filter(i => !i.ok).map(i => i.src);
      // rails: arrows move them, and they scroll sideways (swipe)
      const rails = await page.evaluate(() => [...document.querySelectorAll('.horizontal-gallery')].map(r => r.id));
      const railRes = {};
      for (const id of rails) {
        await page.evaluate(i => document.getElementById(i).scrollIntoView({ block: 'center', behavior: 'instant' }), id); await page.waitForTimeout(300);
        const before = await page.evaluate(i => document.getElementById(i).scrollLeft, id);
        const btn = page.locator(`button[data-rail="${id}"][data-dir="1"]`);
        await btn.click();
        await page.waitForTimeout(1400);
        const after = await page.evaluate(i => document.getElementById(i).scrollLeft, id);
        const box = await page.locator('#' + id).boundingBox();
        let swiped = false;
        if (touch) { // a real touch swipe through CDP
          const cdp = await ctx.newCDPSession(page);
          const y0 = box.y + box.height / 2, x0 = box.x + box.width * 0.2, x1 = box.x + box.width * 0.8;   // (back towards the start: the arrow just moved it forward)
          const s0 = await page.evaluate(i => document.getElementById(i).scrollLeft, id);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
          for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / 8, y: y0 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForTimeout(1200);
          swiped = (await page.evaluate(i => document.getElementById(i).scrollLeft, id)) !== s0;
        } else {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          const s0 = await page.evaluate(i => document.getElementById(i).scrollLeft, id);
          await page.mouse.wheel(-400, 0); await page.waitForTimeout(900);
          swiped = (await page.evaluate(i => document.getElementById(i).scrollLeft, id)) !== s0;
        }
        railRes[id] = { arrow: after > before, swipe: swiped };
      }
      // links: in-page anchors exist; the game links all point at the game
      const links = await page.evaluate(g => { const bad = []; let game = 0; for (const a of document.querySelectorAll('a[href]')) { const h = a.getAttribute('href'); if (h.startsWith('#')) { if (h.length > 1 && !document.getElementById(h.slice(1))) bad.push(h); } else if (h === g) game++; } return { bad, game }; }, GAME);
      // touch targets and text size
      const small = await page.evaluate(() => { const s = []; for (const e of document.querySelectorAll('a.play-btn,a.secondary-btn,.rail-controls button,.desktop-nav a')) { const r = e.getBoundingClientRect(); if (r.width && (r.height < 44 && !e.closest('.desktop-nav'))) s.push(e.textContent.trim() + ' ' + Math.round(r.height)); } return s; });
      const tinyText = await page.evaluate(() => { let n = []; for (const e of document.querySelectorAll('p,li,figcaption,span,a,small')) { if (e.offsetParent && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 11) n.push(e.textContent.trim().slice(0,30) + ' ' + getComputedStyle(e).fontSize); } return n; });
      const r = { fontFails: fontFails.length, name, motion, overflow, startOk, heroMotion: motion === 'reduce' ? !heroMoved || heroMoved === 'none' : true, badImgs, images: imgs.length, rails: railRes, links, small, tinyText, errors };
      report.push(r);
      if (motion === 'no-preference' && label) await (async () => { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/${label}-${name}-full.png`, fullPage: true }); })();
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(`${out}/${label}-report.json`, JSON.stringify(report, null, 1));
  for (const r of report) {
    const railsOk = Object.values(r.rails).every(x => x.arrow && x.swipe);
    console.log(`${r.name.padEnd(13)} ${r.motion.padEnd(13)} overflow=${r.overflow} start=${r.startOk} imgs=${r.images - r.badImgs.length}/${r.images} rails=${railsOk ? 'ok' : JSON.stringify(r.rails)} links=${r.links.bad.length ? r.links.bad : 'ok'}(game ${r.links.game}) small=${r.small.length ? r.small : 'ok'} tiny=${r.tinyText.length ? JSON.stringify(r.tinyText) : 0} fontsBlocked=${r.fontFails} errors=${r.errors.length ? r.errors.slice(0, 3) : 0} reduce=${r.heroMotion}`);
  }
})();
