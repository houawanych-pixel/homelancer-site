// Browser checks for help/ (community board + developer dashboard) against a running feedback worker.
// usage: node tools/test_help.js http://localhost:8080 <outdir> <ADMIN_KEY>   (help/feedback.json must point at the worker)
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.argv[2], out = process.argv[3] || '/tmp/help-shots', KEY = process.argv[4] || 'test-admin-key-0123456789abcdef';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  · ' + x : ''}`) };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = '/opt/pw-browsers/chromium_headless_shell-1194';
  const exe = fs.readdirSync(dir).map(d => `${dir}/${d}/headless_shell`).find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe });
  const errors = [];
  for (const [w, h, name, mobile] of [[390, 844, 'mobile', true], [1280, 860, 'desktop', false]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|status of 4\d\d/.test(m.text())) errors.push(name + ': ' + m.text()) });
    page.on('dialog', d => d.accept());
    await page.goto(base + '/help/', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    ok(`${name}: page loads, board is on`, await page.locator('#offline').isHidden());
    ok(`${name}: verified patch notes are listed`, (await page.locator('#patch-list .patch').count()) >= 6);
    ok(`${name}: no sideways scrolling`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${out}/${name}-board.png` });
    // report a bug
    await page.click('#report-bug');
    await page.fill('#f-title', `Ship vanishes after docking at the jump gate ${name}`);
    await page.waitForTimeout(900);
    const dupShown = await page.locator('#dups').isVisible();
    await page.fill('#f-body', 'After docking at the Veranthos gate my ship disappears and I cannot undock.');
    await page.selectOption('#f-area', 'gates');
    await page.fill('#f-location', 'Solara, Veranthos gate');
    await page.fill('#f-steps', '1. Fly to the gate\n2. Dock\n3. Undock');
    await page.fill('#f-device', mobile ? 'Android phone, Chrome' : 'Windows PC, Edge');
    await page.setInputFiles('#f-shot', process.env.SHOT || '/tmp/claude-0/shot.png');
    await page.waitForTimeout(600);
    const shotReady = (await page.textContent('#shot-hint')).includes('ready');
    await page.fill('#f-name', 'Tester ' + name);
    await page.screenshot({ path: `${out}/${name}-form.png` });
    await page.waitForTimeout(2000);   // (the server ignores instant submissions)
    await page.click('#f-send');
    await page.waitForSelector('#detail-dlg[open]', { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(900);
    const title = await page.textContent('#d-title');
    ok(`${name}: a bug report is posted and opens`, title.includes('Ship vanishes') && shotReady, `dup box ${dupShown}`);
    ok(`${name}: shows as New Report with the reporter's vote`, (await page.locator('#d-body .chip.st-new').count()) === 1 && (await page.locator('#d-body .vote[aria-pressed="true"]').count()) === 1);
    // comment
    await page.fill('#c-body', 'Happens every time for me too.');
    await page.waitForTimeout(2600);
    await page.click('#d-body button[type=submit]');
    await page.waitForTimeout(1200);
    ok(`${name}: comments`, (await page.locator('#d-body .comment').count()) >= 1);
    await page.screenshot({ path: `${out}/${name}-detail.png` });
    await page.click('#detail-dlg [data-close]');
    // vote toggle in the list
    const firstVote = page.locator('#list .vote').first();
    const before = +(await firstVote.locator('span').nth(1).textContent());
    await firstVote.click(); await page.waitForTimeout(600);
    const after = +(await firstVote.locator('span').nth(1).textContent());
    await firstVote.click(); await page.waitForTimeout(600);
    ok(`${name}: upvote toggles`, Math.abs(after - before) === 1 && +(await firstVote.locator('span').nth(1).textContent()) === before);
    // tabs
    await page.click('.tabs button[data-cat="suggestion"]'); await page.waitForTimeout(500);
    ok(`${name}: category tabs switch`, (await page.getAttribute('.tabs button[data-cat="suggestion"]', 'aria-pressed')) === 'true');
    await ctx.close();
  }
  // developer dashboard
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('admin: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(base + '/help/admin.html');
  await page.fill('#key', 'wrong-key-wrong-key-wrong-key');
  await page.click('#signin'); await page.waitForTimeout(700);
  ok('admin: a wrong key is refused', await page.locator('#app').isHidden());
  await page.fill('#key', KEY);
  await page.click('#signin'); await page.waitForTimeout(900);
  ok('admin: signs in and lists reports by priority', await page.locator('#app').isVisible() && (await page.locator('#a-list .post').count()) > 0);
  await page.locator('#a-list .post', { hasText: 'Ship vanishes' }).first().click(); await page.waitForTimeout(900);
  await page.click('#a-pane .att button').catch(() => { });
  await page.waitForTimeout(700);
  ok('admin: sees the private screenshot', (await page.locator('#a-pane .att img').count()) === 1);
  await page.selectOption('#e-status', 'in_progress'); await page.selectOption('#e-prio', '1');
  await page.fill('#e-note', 'We are on it.');
  await page.click('#a-pane .btn.primary'); await page.waitForTimeout(700);
  ok('admin: changes status / priority / note', (await page.textContent('#a-pane .msg')).includes('Saved'));
  await page.fill('#e-reply', 'Thanks for the report!'); await page.click('#a-pane .btn.cyan'); await page.waitForTimeout(900);
  ok('admin: replies as Developer', (await page.locator('#a-pane .comment.dev').count()) >= 1);
  await page.screenshot({ path: `${out}/admin.png` });
  await page.fill('#pv', 'v0.0-test'); await page.fill('#pd', '2026-10-22'); await page.fill('#pi', 'fixed: Test change #1'); await page.uncheck('#ppub');
  await page.click('#psave'); await page.waitForTimeout(800);
  ok('admin: saves draft patch notes', (await page.locator('#plist .patch', { hasText: 'v0.0-test (draft)' }).count()) === 1);
  await page.locator('#plist .patch', { hasText: 'v0.0-test' }).getByText('Delete').click(); await page.waitForTimeout(800);
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`RESULT ${pass}/${pass + fail} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
