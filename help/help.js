// Help Build Homelancer: the public community board (talks to worker/feedback.js). Everything players wrote is shown
// with textContent only. The API address comes from feedback.json ({"api": "https://…"}); empty = not switched on yet.
(() => {
  const $ = id => document.getElementById(id);
  const STATUS = { new: 'New Report', review: 'Under Review', confirmed: 'Confirmed', in_progress: 'Fix in Progress', fixed: 'Fixed', released: 'Released in Update', cannot_reproduce: 'Unable to Reproduce' };
  const CAT = { bug: 'Bug report', feedback: 'Gameplay feedback', suggestion: 'Feature suggestion', discussion: 'General discussion' };
  const AREA = { crash: 'Crash / freeze', loading: 'Not loading', models: '3D models', controls: 'Flight controls', combat: 'Combat / weapons', multiplayer: 'Multiplayer / PvP', gates: 'Jump gate / docking', mobile: 'Touchscreen', graphics: 'Graphics / sound', other: 'Other' };
  const PTYPE = { fixed: 'Fixed', improved: 'Improved', added: 'Added', in_progress: 'In progress' };
  let API = '', state = { cat: 'bug', status: '', sort: 'top', q: '', page: 0 }, voted = new Set(), opened = 0;

  // A random player token, kept on this device (it only lets the board count one vote per player).
  function playerToken() {
    let t = '';
    try { t = localStorage.getItem('hl-player') || '' } catch { }
    if (t.length < 16) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem('hl-player', t) } catch { }
    }
    return t;
  }
  const PLAYER = playerToken();
  async function call(path, opts = {}) {
    const r = await fetch(API + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', 'X-Player': PLAYER }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = {};
    try { j = await r.json() } catch { }
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
    return j;
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e };
  const ago = s => { const d = Math.max(0, Date.now() / 1000 - s); if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' min ago'; if (d < 86400) return Math.round(d / 3600) + ' h ago'; return new Date(s * 1000).toLocaleDateString() };
  function chip(status) { return el('span', 'chip st-' + status, STATUS[status] || status) }

  // ---------- the list ----------
  function voteBtn(p) {
    const b = el('button', 'vote');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(voted.has(p.id)));
    b.setAttribute('aria-label', (voted.has(p.id) ? 'Remove your vote for ' : 'Vote for ') + p.title);
    const n = el('span', '', String(p.votes));
    b.append(el('span', 'arrow', '▲'), n);
    b.addEventListener('click', async () => {
      if (!API) return;
      b.disabled = true;
      try {
        const r = await call(`/api/posts/${p.id}/vote`, { method: 'POST' });
        p.votes = r.votes;
        n.textContent = String(r.votes);
        if (r.voted) voted.add(p.id); else voted.delete(p.id);
        b.setAttribute('aria-pressed', String(r.voted));
      } catch (e) { alertMsg(e.message) } finally { b.disabled = false }
    });
    return b;
  }
  function row(p) {
    const box = el('article', 'post');
    const main = el('div');
    const h = el('h3');
    const t = el('button', '', p.title);
    t.type = 'button';
    t.addEventListener('click', () => openPost(p.id));
    h.append(t);
    const meta = el('div', 'meta');
    meta.append(chip(p.status));
    if (p.cat === 'bug') meta.append(el('span', 'chip' + (p.priority === 1 ? ' p1' : ''), AREA[p.area] || 'Other'));
    meta.append(el('span', '', `${p.comments} comment${p.comments === 1 ? '' : 's'} · ${p.name} · ${ago(p.created)}`));
    if (p.fixed_in) meta.append(el('span', 'chip st-released', 'Fixed in ' + p.fixed_in));
    main.append(h, meta, el('p', 'snippet', p.body.length > 180 ? p.body.slice(0, 180) + '…' : p.body));
    box.append(voteBtn(p), main);
    return box;
  }
  async function load(append) {
    const list = $('list');
    if (!API) { list.replaceChildren(el('div', 'empty', 'Reports will appear here once the board is switched on.')); return }
    if (!append) { state.page = 0; list.replaceChildren(el('div', 'empty', 'Loading…')) }
    try {
      const qs = new URLSearchParams({ cat: state.cat, sort: state.sort, page: String(state.page) });
      if (state.status) qs.set('status', state.status);
      if (state.q) qs.set('q', state.q);
      const r = await call('/api/posts?' + qs);
      if (r.posts.length) {
        const mv = await call('/api/myvotes?ids=' + r.posts.map(p => p.id).join(','));
        mv.voted.forEach(id => voted.add(id));
      }
      if (!append) list.replaceChildren();
      r.posts.forEach(p => list.append(row(p)));
      if (!list.children.length) list.append(el('div', 'empty', state.q || state.status ? 'Nothing matches. Try another search or status.' : 'Nothing here yet. Be the first to post!'));
      $('more').hidden = !r.more;
    } catch (e) { list.replaceChildren(el('div', 'empty', e.message)) }
  }

  // ---------- one post ----------
  async function openPost(id) {
    opened = id;
    const dlg = $('detail-dlg'), body = $('d-body');
    $('d-title').textContent = 'Loading…';
    body.replaceChildren();
    if (!dlg.open) dlg.showModal();
    try {
      const r = await call('/api/posts/' + id);
      const p = r.post;
      if (r.voted) voted.add(p.id);
      $('d-title').textContent = p.title;
      const meta = el('div', 'meta');
      meta.append(chip(p.status), el('span', 'chip', CAT[p.cat]));
      if (p.cat === 'bug') meta.append(el('span', 'chip', AREA[p.area] || 'Other'));
      meta.append(el('span', '', `${p.name} · ${ago(p.created)}`));
      const top = el('div');
      top.style.cssText = 'display:flex;gap:14px;align-items:flex-start;margin-bottom:10px';
      top.append(voteBtn(p), meta);
      body.append(top);
      if (p.merged_into) {
        const m = el('p', 'devnote');
        const b = el('button', 'linkish', 'Open report #' + p.merged_into);
        b.addEventListener('click', () => openPost(p.merged_into));
        m.append(el('span', '', 'This was a duplicate and is merged into another report. '), b);
        body.append(m);
      }
      if (p.dev_note) { const d = el('div', 'devnote'); d.append(el('b', '', 'Developer: '), el('span', '', p.dev_note)); body.append(d) }
      body.append(el('p', 'detail-body', p.body));
      const dl = el('dl', 'fields');
      for (const [k, v] of [['Where', p.location], ['Steps', p.steps], ['Device', p.device], ['Suggested fix', p.fix], ['Fixed in', p.fixed_in]]) {
        if (v) { dl.append(el('dt', '', k), el('dd', '', v)) }
      }
      if (p.has_image) dl.append(el('dt', '', 'Screenshot'), el('dd', '', 'Sent to the developer'));
      if (dl.children.length) body.append(dl);
      const flagP = el('button', 'linkish', 'Flag this post');
      flagP.addEventListener('click', () => flag('post', p.id, flagP));
      body.append(flagP);
      // comments
      const cs = el('div', 'comments');
      cs.append(el('h3', '', `Comments (${r.comments.length})`));
      r.comments.forEach(c => {
        const d = el('div', 'comment' + (c.dev ? ' dev' : ''));
        d.append(el('div', 'who', `${c.name} · ${ago(c.created)}`), el('p', '', c.body));
        if (!c.dev) { const f = el('button', 'linkish', 'Flag'); f.addEventListener('click', () => flag('comment', c.id, f)); d.append(f) }
        cs.append(d);
      });
      if (API) cs.append(commentForm(p.id));
      body.append(cs);
    } catch (e) { $('d-title').textContent = 'Not available'; body.replaceChildren(el('p', 'msg err', e.message)) }
  }
  function commentForm(id) {
    const f = el('form');
    const started = Date.now();
    const ta = el('textarea'); ta.maxLength = 2000; ta.required = true; ta.id = 'c-body'; ta.placeholder = 'Add details, or say it happens to you too';
    const lb = el('label', '', 'Add a comment'); lb.htmlFor = 'c-body';
    const nm = el('input'); nm.type = 'text'; nm.maxLength = 24; nm.id = 'c-name'; nm.placeholder = 'Your name (optional)'; nm.setAttribute('aria-label', 'Your name (optional)'); nm.style.marginTop = '8px';
    const hp = el('div', 'hp'); const hpi = el('input'); hpi.type = 'text'; hpi.tabIndex = -1; hpi.autocomplete = 'off'; hpi.setAttribute('aria-hidden', 'true'); hp.append(hpi);
    const msg = el('p', 'msg'); msg.setAttribute('role', 'status');
    const send = el('button', 'btn primary small', 'Post comment'); send.type = 'submit';
    const act = el('div', 'form-actions'); act.append(send);
    f.append(lb, ta, nm, hp, msg, act);
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      send.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending…';
      try {
        await call(`/api/posts/${id}/comments`, { method: 'POST', body: { body: ta.value, name: nm.value, website: hpi.value, t: Date.now() - started } });
        openPost(id);
        load(false);
      } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; send.disabled = false }
    });
    return f;
  }
  async function flag(kind, id, btn) {
    if (!API || !confirm('Flag this as spam or abuse? The developer will review it.')) return;
    try { await call('/api/flag', { method: 'POST', body: { kind, id, reason: 'flagged from the board' } }); btn.textContent = 'Flagged — thank you'; btn.disabled = true } catch (e) { alertMsg(e.message) }
  }
  function alertMsg(m) { const n = $('offline'); n.hidden = false; n.textContent = m; setTimeout(() => { if (API) n.hidden = true }, 5000) }

  // ---------- the report form ----------
  let started = 0, shot = '', dupTimer = 0;
  function openForm(cat) {
    if (!API) { $('offline').hidden = false; $('offline').scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    const f = $('post-form');
    f.reset(); shot = ''; $('dups').hidden = true; $('form-msg').textContent = ''; $('shot-hint').textContent = 'PNG, JPEG or WebP. Big pictures are shrunk before sending.';
    $('f-cat').value = cat;
    syncForm();
    started = Date.now();
    $('form-dlg').showModal();
    $('f-title').focus();
  }
  function syncForm() {
    const bug = $('f-cat').value === 'bug';
    $('area-wrap').hidden = !bug; $('bug-extra').hidden = !bug; $('fix-label').hidden = !bug; $('f-fix').hidden = !bug;
    $('form-title').textContent = bug ? 'Report a bug' : CAT[$('f-cat').value];
  }
  async function checkDups() {
    const q = $('f-title').value.trim();
    const box = $('dups');
    if (q.length < 8) { box.hidden = true; return }
    try {
      const r = await call('/api/similar?q=' + encodeURIComponent(q) + '&cat=' + $('f-cat').value);
      if (!r.posts.length) { box.hidden = true; return }
      box.replaceChildren(el('b', '', 'Is it one of these? Vote for it instead of posting it again:'));
      const ul = el('ul');
      r.posts.forEach(p => {
        const li = el('li'); const b = el('button', '', `${p.title} (${p.votes} vote${p.votes === 1 ? '' : 's'}, ${STATUS[p.status]})`);
        b.type = 'button';
        b.addEventListener('click', () => { $('form-dlg').close(); openPost(p.id) });
        li.append(b); ul.append(li);
      });
      box.append(ul); box.hidden = false;
    } catch { box.hidden = true }
  }
  // Shrink a screenshot in the browser (max 1600 px, WebP/JPEG) so it fits the 1.5 MB limit.
  function shrink(file) {
    return new Promise((res, rej) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return rej(new Error('Use a PNG, JPEG or WebP picture.'));
      if (file.size > 25e6) return rej(new Error('That picture is too big.'));
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        let q = 0.85, out = c.toDataURL('image/webp', q);
        if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', q);
        while (out.length * 0.75 > 1.45e6 && q > 0.35) { q -= 0.15; out = c.toDataURL(out.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', q) }
        out.length * 0.75 > 1.5e6 ? rej(new Error('That picture is still too big after shrinking.')) : res(out);
      };
      img.onerror = () => rej(new Error('Could not read that picture.'));
      img.src = URL.createObjectURL(file);
    });
  }
  async function submit(ev) {
    ev.preventDefault();
    const msg = $('form-msg'), send = $('f-send');
    const title = $('f-title').value.trim(), body = $('f-body').value.trim();
    msg.className = 'msg err';
    if (title.length < 6) { msg.textContent = 'Give it a short title (at least 6 letters).'; $('f-title').focus(); return }
    if (body.length < 10) { msg.textContent = 'Describe the problem (at least 10 letters).'; $('f-body').focus(); return }
    send.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending…';
    const bug = $('f-cat').value === 'bug';
    try {
      const r = await call('/api/posts', { method: 'POST', body: {
        cat: $('f-cat').value, area: bug ? $('f-area').value : 'other', title, body,
        location: bug ? $('f-location').value : '', steps: bug ? $('f-steps').value : '', device: bug ? $('f-device').value : '',
        fix: bug ? $('f-fix').value : '', video_url: bug ? $('f-video').value : '', image: bug ? shot : '', name: $('f-name').value,
        website: $('f-website').value, t: Date.now() - started } });
      msg.className = 'msg ok'; msg.textContent = 'Thank you! Your post is on the board.';
      voted.add(r.id);
      setTimeout(() => { $('form-dlg').close(); setTab(r.post.cat, false); state.sort = 'new'; $('sort').value = 'new'; load(false); openPost(r.id) }, 700);
    } catch (e) { msg.className = 'msg err'; msg.textContent = e.message } finally { send.disabled = false }
  }

  // ---------- patch notes ----------
  async function loadPatches() {
    const box = $('patch-list');
    if (!API) {
      try { const r = await fetch('patches.json', { cache: 'no-cache' }); if (r.ok) return drawPatches((await r.json()).patches || []) } catch { }
      return box.replaceChildren(el('div', 'empty', 'Patch notes will appear here.'));
    }
    try { drawPatches((await call('/api/patches')).patches) } catch (e) { box.replaceChildren(el('div', 'empty', e.message)) }
  }
  function drawPatches(list) {
    const box = $('patch-list');
    box.replaceChildren();
    if (!list.length) { box.append(el('div', 'empty', 'No published updates yet.')); return }
    list.slice(0, 12).forEach(p => {
      const a = el('article', 'patch');
      a.append(el('h3', '', `${p.title || 'Homelancer Beta'} — ${p.version}`), el('div', 'date', 'Released ' + new Date(p.released + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })));
      const ul = el('ul');
      p.items.forEach(i => { const li = el('li'); li.append(el('span', 'tag t-' + i.type, PTYPE[i.type] || i.type), el('span', '', i.text)); ul.append(li) });
      a.append(ul); box.append(a);
    });
  }

  // ---------- wiring ----------
  function setTab(cat, reload = true) {
    state.cat = cat;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
    if (reload) load(false);
  }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.cat)));
  $('status').addEventListener('change', e => { state.status = e.target.value; load(false) });
  $('sort').addEventListener('change', e => { state.sort = e.target.value; load(false) });
  let qt = 0;
  $('q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); load(false) }, 350) });
  $('more').addEventListener('click', () => { state.page++; load(true) });
  $('report-bug').addEventListener('click', () => openForm('bug'));
  $('post-feedback').addEventListener('click', () => openForm('feedback'));
  $('f-cat').addEventListener('change', () => { syncForm(); checkDups() });
  $('f-title').addEventListener('input', () => { clearTimeout(dupTimer); dupTimer = setTimeout(checkDups, 450) });
  $('f-shot').addEventListener('change', async e => {
    const f = e.target.files[0]; shot = '';
    if (!f) return;
    $('shot-hint').textContent = 'Preparing the picture…';
    try { shot = await shrink(f); $('shot-hint').textContent = 'Screenshot ready (' + Math.round(shot.length * 0.75 / 1024) + ' KB).' } catch (err) { e.target.value = ''; $('shot-hint').textContent = err.message }
  });
  $('post-form').addEventListener('submit', submit);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close() }));

  (async () => {
    try { const r = await fetch('feedback.json', { cache: 'no-cache' }); if (r.ok) API = String((await r.json()).api || '').replace(/\/+$/, '') } catch { }
    if (API) { try { await call('/api/health') } catch { API = '' } }
    $('offline').hidden = !!API;
    $('report-bug').disabled = false;
    load(false);
    loadPatches();
    const m = /^#post-(\d+)$/.exec(location.hash);
    if (m && API) openPost(+m[1]);
  })();
})();
