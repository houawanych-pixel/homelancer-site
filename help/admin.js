// Developer dashboard for worker/feedback.js. The admin key is kept in sessionStorage (this tab only). All text written
// by players is shown with textContent.
(() => {
  const $ = id => document.getElementById(id);
  const STATUS = { new: 'New Report', review: 'Under Review', confirmed: 'Confirmed', in_progress: 'Fix in Progress', fixed: 'Fixed', released: 'Released in Update', cannot_reproduce: 'Unable to Reproduce' };
  const PRIO = { 1: '1 · Game-breaking', 2: '2 · Multiplayer', 3: '3 · Major gameplay', 4: '4 · Visual', 5: '5 · Suggestion' };
  const CAT = { bug: 'Bug report', feedback: 'Gameplay feedback', suggestion: 'Feature suggestion', discussion: 'General discussion' };
  let API = '', KEY = '', page = 0, sel = 0, editPatch = 0;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e };
  const when = s => new Date(s * 1000).toLocaleString();
  async function call(path, opts = {}) {
    const r = await fetch(API + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (opts.raw) { if (!r.ok) throw new Error('Could not load.'); return r }
    let j = {}; try { j = await r.json() } catch { }
    if (r.status === 401) { signOut(); throw new Error('The admin key was not accepted.') }
    if (!r.ok) throw new Error(j.error || 'Something went wrong.');
    return j;
  }
  function signOut() { try { sessionStorage.removeItem('hl-admin') } catch { } KEY = ''; $('app').hidden = true; $('login').hidden = false; $('logout').hidden = true }
  async function signIn(k) {
    KEY = k.trim();
    try {
      await call('/api/admin/posts?page=0');
      try { sessionStorage.setItem('hl-admin', KEY) } catch { }
      $('login').hidden = true; $('app').hidden = false; $('logout').hidden = false; $('key').value = '';
      load(false); loadPatches();
    } catch (e) { $('login-msg').className = 'msg err'; $('login-msg').textContent = e.message }
  }

  // ---------- reports ----------
  function row(p) {
    const box = el('article', 'post' + (p.id === sel ? ' sel' : ''));
    box.tabIndex = 0;
    box.append(el('div', 'pr p' + p.priority, String(p.priority)));
    const m = el('div');
    m.append(el('h3', '', `#${p.id} ${p.title}`));
    const meta = el('div', 'meta');
    meta.append(el('span', 'chip st-' + p.status, STATUS[p.status]), el('span', '', `${CAT[p.cat]} · ▲${p.votes} · 💬${p.comments} · ${when(p.created)}`));
    if (p.hidden) meta.append(el('span', 'hiddenmark', p.hidden === 2 ? `Auto-hidden (${p.flags} flags)` : 'Hidden'));
    else if (p.flags) meta.append(el('span', 'hiddenmark', `${p.flags} flag${p.flags === 1 ? '' : 's'}`));
    if (p.merged_into) meta.append(el('span', 'chip', 'Merged into #' + p.merged_into));
    m.append(meta);
    box.append(m);
    const go = () => { sel = p.id; document.querySelectorAll('#a-list .post').forEach(x => x.classList.remove('sel')); box.classList.add('sel'); openPost(p.id) };
    box.addEventListener('click', go);
    box.addEventListener('keydown', e => { if (e.key === 'Enter') go() });
    return box;
  }
  async function load(append) {
    if (!append) page = 0;
    const qs = new URLSearchParams({ page: String(page), sort: $('a-sort').value });
    for (const [k, id] of [['view', 'a-view'], ['cat', 'a-cat'], ['status', 'a-status'], ['q', 'a-q']]) if ($(id).value.trim()) qs.set(k, $(id).value.trim());
    try {
      const r = await call('/api/admin/posts?' + qs);
      const list = $('a-list');
      if (!append) list.replaceChildren();
      r.posts.forEach(p => list.append(row(p)));
      if (!list.children.length) list.append(el('div', 'empty', 'Nothing here.'));
      $('a-more').hidden = !r.more;
    } catch (e) { $('a-list').replaceChildren(el('div', 'empty', e.message)) }
  }
  function field(label, node) { const w = el('div'); const l = el('label', '', label); if (node.id) l.htmlFor = node.id; w.append(l, node); return w }
  function select(id, opts, val) { const s = el('select', 'full'); s.id = id; for (const [k, v] of Object.entries(opts)) { const o = el('option', '', v); o.value = k; if (String(k) === String(val)) o.selected = true; s.append(o) } return s }
  async function openPost(id) {
    const pane = $('a-pane');
    pane.replaceChildren(el('p', 'hint', 'Loading…'));
    try {
      const r = await call('/api/admin/posts/' + id);
      const p = r.post;
      pane.replaceChildren();
      pane.append(el('h2', '', `#${p.id} ${p.title}`));
      const meta = el('div', 'meta'); meta.append(el('span', '', `${CAT[p.cat]} · ${p.area} · by ${p.name} · ${when(p.created)} · ▲${p.votes}`)); pane.append(meta);
      pane.append(el('p', 'detail-body', p.body));
      const dl = el('dl', 'fields');
      for (const [k, v] of [['Where', p.location], ['Steps', p.steps], ['Device', p.device], ['Suggested fix', p.fix], ['Video (private)', p.video_url]]) if (v) dl.append(el('dt', '', k), el('dd', '', v));
      if (dl.children.length) pane.append(dl);
      for (const a of r.attachments || []) {   // private screenshots, fetched with the key
        const box = el('div', 'att'); const b = el('button', 'btn small', 'Show screenshot');
        b.addEventListener('click', async () => { try { const res = await call('/api/admin/attachments/' + a.id, { raw: true }); const img = el('img'); img.alt = 'Screenshot sent with this report'; img.src = URL.createObjectURL(await res.blob()); b.replaceWith(img) } catch (e) { b.textContent = e.message } });
        box.append(b); pane.append(box);
      }
      // edit
      const st = select('e-status', STATUS, p.status), pr = select('e-prio', PRIO, p.priority), ct = select('e-cat', CAT, p.cat);
      const fx = el('input'); fx.type = 'text'; fx.id = 'e-fixed'; fx.value = p.fixed_in; fx.placeholder = 'e.g. v1.9q';
      const note = el('textarea'); note.id = 'e-note'; note.value = p.dev_note; note.rows = 3; note.placeholder = 'Public note from you, shown on the report';
      const g = el('div', 'grid2'); g.append(field('Status', st), field('Priority', pr), field('Category', ct), field('Fixed in version', fx));
      pane.append(g, field('Developer note (public)', note));
      const msg = el('p', 'msg'); msg.setAttribute('role', 'status');
      const save = el('button', 'btn primary', 'Save');
      save.addEventListener('click', async () => {
        try { await call('/api/admin/posts/' + id, { method: 'PATCH', body: { status: st.value, priority: +pr.value, cat: ct.value, fixed_in: fx.value, dev_note: note.value } }); msg.className = 'msg ok'; msg.textContent = 'Saved.'; load(false) } catch (e) { msg.className = 'msg err'; msg.textContent = e.message }
      });
      const hide = el('button', 'btn', p.hidden ? 'Unhide (approve)' : 'Hide (spam / abuse)');
      hide.addEventListener('click', async () => { try { await call('/api/admin/posts/' + id, { method: 'PATCH', body: { hidden: !p.hidden } }); load(false); openPost(id) } catch (e) { msg.className = 'msg err'; msg.textContent = e.message } });
      const mi = el('input'); mi.type = 'text'; mi.inputMode = 'numeric'; mi.placeholder = 'Report # to merge into'; mi.setAttribute('aria-label', 'Report number to merge into');
      const mb = el('button', 'btn', 'Merge as duplicate');
      mb.addEventListener('click', async () => { if (!+mi.value) return; if (!confirm(`Merge #${id} into #${mi.value}? Its votes move over.`)) return; try { await call(`/api/admin/posts/${id}/merge`, { method: 'POST', body: { into: +mi.value } }); load(false); openPost(+mi.value) } catch (e) { msg.className = 'msg err'; msg.textContent = e.message } });
      const acts = el('div', 'form-actions'); acts.style.justifyContent = 'flex-start'; acts.append(save, hide);
      const mrow = el('div', 'row'); mrow.style.marginTop = '10px'; mrow.append(mi, mb);
      pane.append(acts, mrow, msg);
      // comments + reply
      const cs = el('div', 'comments'); cs.append(el('h3', '', `Comments (${r.comments.length})`));
      r.comments.forEach(c => {
        const d = el('div', 'comment' + (c.dev ? ' dev' : ''));
        d.append(el('div', 'who', `${c.name} · ${when(c.created)}${c.hidden ? ' · HIDDEN' : ''}${c.flags ? ` · ${c.flags} flags` : ''}`), el('p', '', c.body));
        const hb = el('button', 'linkish', c.hidden ? 'Unhide' : 'Hide');
        hb.addEventListener('click', async () => { try { await call('/api/admin/comments/' + c.id, { method: 'PATCH', body: { hidden: !c.hidden } }); openPost(id) } catch (e) { alert(e.message) } });
        d.append(hb); cs.append(d);
      });
      const ta = el('textarea'); ta.id = 'e-reply'; ta.rows = 3; ta.placeholder = 'Reply to players (shown as Developer)';
      const rb = el('button', 'btn cyan small', 'Post reply');
      rb.addEventListener('click', async () => { if (!ta.value.trim()) return; try { await call(`/api/admin/posts/${id}/reply`, { method: 'POST', body: { body: ta.value } }); openPost(id); load(false) } catch (e) { alert(e.message) } });
      cs.append(field('Respond', ta), rb);
      pane.append(cs);
    } catch (e) { pane.replaceChildren(el('p', 'msg err', e.message)) }
  }

  // ---------- patch notes ----------
  const TYPES = { 'fixed': 'fixed', 'improved': 'improved', 'added': 'added', 'in progress': 'in_progress', 'in_progress': 'in_progress' };
  function parseItems(txt) {
    return txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = /^(fixed|improved|added|in[ _]progress)\s*:\s*(.+)$/i.exec(l);
      const type = m ? TYPES[m[1].toLowerCase().replace('_', ' ')] || 'fixed' : 'fixed';
      let text = m ? m[2] : l, post;
      const ref = /\s#(\d+)\s*$/.exec(text);
      if (ref) { post = +ref[1]; text = text.slice(0, ref.index) }
      return { type, text: text.trim(), post };
    });
  }
  async function loadPatches() {
    try {
      const r = await call('/api/admin/patches');
      const box = $('plist'); box.replaceChildren();
      r.patches.forEach(p => {
        const a = el('article', 'patch');
        a.append(el('h3', '', `${p.version}${p.published ? '' : ' (draft)'}`), el('div', 'date', `${p.released} · ${p.title}`));
        const ul = el('ul'); p.items.forEach(i => ul.append(el('li', '', `${i.type}: ${i.text}${i.post ? ' #' + i.post : ''}`))); a.append(ul);
        const ed = el('button', 'btn small', 'Edit'), del = el('button', 'btn small', 'Delete');
        ed.addEventListener('click', () => { editPatch = p.id; $('pv').value = p.version; $('pd').value = p.released; $('pt').value = p.title; $('pi').value = p.items.map(i => `${i.type.replace('_', ' ')}: ${i.text}${i.post ? ' #' + i.post : ''}`).join('\n'); $('ppub').checked = p.published; $('pv').scrollIntoView({ behavior: 'smooth' }) });
        del.addEventListener('click', async () => { if (confirm('Delete patch notes ' + p.version + '?')) { await call('/api/admin/patches/' + p.id, { method: 'DELETE' }); loadPatches() } });
        const act = el('div', 'form-actions'); act.style.justifyContent = 'flex-start'; act.append(ed, del); a.append(act);
        box.append(a);
      });
    } catch (e) { $('pmsg').className = 'msg err'; $('pmsg').textContent = e.message }
  }
  $('psave').addEventListener('click', async () => {
    const body = { version: $('pv').value, released: $('pd').value, title: $('pt').value, items: parseItems($('pi').value), published: $('ppub').checked };
    try {
      await call(editPatch ? '/api/admin/patches/' + editPatch : '/api/admin/patches', { method: editPatch ? 'PATCH' : 'POST', body });
      $('pmsg').className = 'msg ok'; $('pmsg').textContent = 'Saved.'; editPatch = 0; loadPatches();
    } catch (e) { $('pmsg').className = 'msg err'; $('pmsg').textContent = e.message }
  });
  $('pnew').addEventListener('click', () => { editPatch = 0; $('pv').value = ''; $('pd').value = new Date().toISOString().slice(0, 10); $('pi').value = ''; $('ppub').checked = true });

  // ---------- wiring ----------
  ['a-view', 'a-cat', 'a-status', 'a-sort'].forEach(id => $(id).addEventListener('change', () => load(false)));
  let qt = 0; $('a-q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => load(false), 350) });
  $('a-more').addEventListener('click', () => { page++; load(true) });
  $('signin').addEventListener('click', () => signIn($('key').value));
  $('key').addEventListener('keydown', e => { if (e.key === 'Enter') signIn($('key').value) });
  $('logout').addEventListener('click', signOut);
  (async () => {
    try { const r = await fetch('feedback.json', { cache: 'no-cache' }); if (r.ok) API = String((await r.json()).api || '').replace(/\/+$/, '') } catch { }
    if (!API) { $('login-msg').className = 'msg err'; $('login-msg').textContent = 'The feedback server is not switched on yet (help/feedback.json has no address).'; $('signin').disabled = true; return }
    let k = ''; try { k = sessionStorage.getItem('hl-admin') || '' } catch { }
    if (k) signIn(k);
  })();
})();
