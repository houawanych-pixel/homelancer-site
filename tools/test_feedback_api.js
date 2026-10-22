// API checks for worker/feedback.js against a running worker (local: npx wrangler dev --local, see README).
// usage: node tools/test_feedback_api.js http://localhost:8787 <ADMIN_KEY>
const BASE = process.argv[2] || 'http://localhost:8787';
const ADMIN = process.argv[3] || 'test-admin-key-0123456789abcdef';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  · ' + extra : ''}`) };
const player = n => 'test-player-' + n + '-' + Math.random().toString(36).slice(2) + 'xxxxxxxx';
async function api(path, { method = 'GET', body, p, admin, ip } = {}) {
  const h = { 'Content-Type': 'application/json', Origin: 'http://localhost:8080' };
  if (p) h['X-Player'] = p;
  if (admin) h.Authorization = 'Bearer ' + admin;
  if (ip) h['CF-Connecting-IP'] = ip;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json() } catch { }
  return { s: r.status, j, h: r.headers };
}
const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 73, 72, 68, 82]).toString('base64');
const FAKE = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
const PRIVATE = ['author', 'ip', 'video_url', 'flags', 'hidden'];

(async () => {
  const a = player('a'), b = player('b'), c = player('c'), d = player('d');
  const ipA = '10.0.0.' + Math.floor(Math.random() * 250);
  // validation
  let r = await api('/api/posts', { method: 'POST', p: a, ip: ipA, body: { cat: 'bug', title: 'x', body: 'short', t: 5000 } });
  ok('rejects a too-short title', r.s === 400, r.j?.error);
  r = await api('/api/posts', { method: 'POST', p: a, ip: ipA, body: { cat: 'bug', title: 'Ship vanishes after docking', body: 'It disappears every time.', t: 100 } });
  ok('rejects an instant (bot) submission', r.s === 400);
  r = await api('/api/posts', { method: 'POST', p: a, ip: ipA, body: { cat: 'bug', title: 'Ship vanishes after docking', body: 'It disappears every time.', t: 5000, website: 'http://spam' } });
  ok('rejects a filled honeypot', r.s === 400);
  r = await api('/api/posts', { method: 'POST', p: a, ip: ipA, body: { cat: 'bug', title: 'Cheap casino offer here', body: 'casino casino http://a http://b http://c http://d', t: 5000 } });
  ok('rejects spam', r.s === 400);
  r = await api('/api/posts', { method: 'POST', p: a, ip: ipA, body: { cat: 'bug', title: 'Ship vanishes after docking', body: 'It disappears every time.', t: 5000, image: FAKE } });
  ok('rejects a fake image (checked by its bytes)', r.s === 400, r.j?.error);
  r = await api('/api/posts', { method: 'POST', ip: ipA, body: { cat: 'bug', title: 'Ship vanishes after docking', body: 'It disappears every time.', t: 5000 } });
  ok('needs a player token', r.s === 400);
  // a real report
  r = await api('/api/posts', { method: 'POST', p: a, ip: ipA, body: { cat: 'bug', area: 'gates', title: 'Ship vanishes after docking at the jump gate', body: 'After docking at the Veranthos gate my ship disappears.', location: 'Solara gate', steps: '1. Dock\n2. Undock', device: 'Android Chrome', fix: '', video_url: 'https://example.com/clip.mp4', name: 'Ace<b>', t: 5000, image: PNG } });
  ok('posts a bug report', r.s === 201 && r.j?.id > 0, JSON.stringify(r.j?.error || ''));
  const id = r.j?.id;
  ok('no private fields in the reply', r.j && PRIVATE.every(k => !(k in r.j.post)) && r.j.post.has_image === true && r.j.post.name === 'Aceb', JSON.stringify(r.j?.post?.name));
  ok('starts as New Report with the reporter\'s vote, priority from the area', r.j?.post?.status === 'new' && r.j?.post?.votes === 1 && r.j?.post?.priority === 3);
  // list / get / similar
  r = await api('/api/posts?cat=bug&sort=new');
  ok('public list shows it', r.s === 200 && r.j.posts.some(p => p.id === id) && r.j.posts.every(p => PRIVATE.every(k => !(k in p))));
  r = await api('/api/similar?q=' + encodeURIComponent('ship disappears after docking') + '&cat=bug');
  ok('finds it as a possible duplicate', r.s === 200 && r.j.posts.some(p => p.id === id));
  // votes
  r = await api(`/api/posts/${id}/vote`, { method: 'POST', p: b });
  ok('another player upvotes', r.j?.votes === 2 && r.j?.voted === true);
  r = await api(`/api/posts/${id}/vote`, { method: 'POST', p: b });
  ok('a second tap takes the vote back (one per player)', r.j?.votes === 1 && r.j?.voted === false);
  await api(`/api/posts/${id}/vote`, { method: 'POST', p: b });
  // comments
  r = await api(`/api/posts/${id}/comments`, { method: 'POST', p: c, body: { body: 'Same here on iPhone.', name: 'Nova', t: 3000 } });
  ok('comments', r.s === 201 && r.j?.comment?.name === 'Nova');
  r = await api(`/api/posts/${id}/comments`, { method: 'POST', p: c, body: { body: 'buy now http://a http://b http://c http://d', t: 3000 } });
  ok('rejects a spam comment', r.s === 400);
  r = await api(`/api/posts/${id}`, { p: b });
  ok('details: comments, my vote, nothing private', r.j?.comments?.length === 1 && r.j?.voted === true && PRIVATE.every(k => !(k in r.j.post)));
  // admin auth
  r = await api('/api/admin/posts');
  ok('admin needs the key', r.s === 401);
  r = await api('/api/admin/posts', { admin: 'wrong-key-wrong-key-wrong' });
  ok('a wrong key is refused', r.s === 401);
  r = await api(`/api/admin/attachments/1`);
  ok('screenshots are not public', r.s === 401);
  // admin actions
  r = await api(`/api/admin/posts/${id}`, { method: 'PATCH', admin: ADMIN, body: { status: 'confirmed', priority: 1, dev_note: 'Thanks, we can see it.' } });
  ok('developer changes status and priority', r.s === 200 && r.j.post.status === 'confirmed' && r.j.post.priority === 1 && r.j.post.video_url === 'https://example.com/clip.mp4' && r.j.attachments.length === 1);
  r = await api(`/api/admin/posts/${id}`, { method: 'PATCH', admin: ADMIN, body: { status: 'bogus' } });
  ok('refuses an unknown status', r.s === 400);
  const att = (await api(`/api/admin/posts/${id}`, { admin: ADMIN })).j.attachments[0].id;
  const ar = await fetch(BASE + '/api/admin/attachments/' + att, { headers: { Authorization: 'Bearer ' + ADMIN } });
  ok('developer sees the screenshot', ar.status === 200 && ar.headers.get('content-type') === 'image/png');
  r = await api(`/api/admin/posts/${id}/reply`, { method: 'POST', admin: ADMIN, body: { body: 'Fix is coming in the next update.' } });
  ok('developer replies (shown as Developer)', r.j?.comment?.dev === true && r.j?.comment?.name === 'Developer');
  // duplicate + merge
  r = await api('/api/posts', { method: 'POST', p: d, ip: '10.1.1.1', body: { cat: 'bug', area: 'gates', title: 'Ship gone after gate docking', body: 'My ship is gone after I dock at a gate.', t: 5000 } });
  const dup = r.j?.id;
  r = await api(`/api/admin/posts/${dup}/merge`, { method: 'POST', admin: ADMIN, body: { into: id } });
  ok('merges a duplicate (its votes move over)', r.s === 200 && r.j.post.votes === 3);
  r = await api('/api/posts?cat=bug&sort=new');
  ok('the merged duplicate leaves the public list', !r.j.posts.some(p => p.id === dup));
  r = await api(`/api/posts/${dup}/vote`, { method: 'POST', p: player('e') });
  ok('a vote on the duplicate counts for the original', r.j?.id === id && r.j?.votes === 4);
  // flags -> auto-hide
  r = await api('/api/posts', { method: 'POST', p: d, ip: '10.1.1.2', body: { cat: 'discussion', title: 'Rude off topic post here', body: 'This post is abusive and should go.', t: 5000 } });
  const bad = r.j?.id;
  for (const p of [a, b, c]) await api('/api/flag', { method: 'POST', p, body: { kind: 'post', id: bad, reason: 'abuse' } });
  r = await api(`/api/posts/${bad}`);
  ok('three flags hide a post until the developer looks', r.s === 404);
  r = await api('/api/admin/posts?view=hidden', { admin: ADMIN });
  ok('the developer sees hidden posts', r.j.posts.some(p => p.id === bad && p.hidden === 2 && p.flags === 3));
  // fixed + patch notes
  r = await api(`/api/admin/posts/${id}`, { method: 'PATCH', admin: ADMIN, body: { status: 'released', fixed_in: 'v1.9q' } });
  ok('marks fixed and released in an update', r.j.post.status === 'released' && r.j.post.fixed_in === 'v1.9q');
  r = await api('/api/admin/patches', { method: 'POST', admin: ADMIN, body: { version: 'v1.9q-test', released: '2026-10-22', items: [{ type: 'fixed', text: 'Ship no longer vanishes after gate docking', post: id }], published: false } });
  ok('developer writes patch notes (draft)', r.s === 201);
  const pid = r.j?.id;
  r = await api('/api/patches');
  ok('drafts are not public; verified releases are', !r.j.patches.some(p => p.id === pid) && r.j.patches.some(p => p.version === 'v1.9p'));
  await api('/api/admin/patches/' + pid, { method: 'DELETE', admin: ADMIN });
  r = await api('/api/admin/patches', { method: 'POST', admin: ADMIN, body: { version: 'x', released: 'yesterday', items: [{ text: 'a' }] } });
  ok('patch notes need a real date', r.s === 400);
  // rate limit
  const spammer = player('spam'), sip = '10.9.9.' + Math.floor(Math.random() * 250);
  let last = 0;
  for (let i = 0; i < 7; i++) last = (await api('/api/posts', { method: 'POST', p: spammer, ip: sip, body: { cat: 'feedback', title: 'Feedback number ' + i + ' here', body: 'Some honest feedback text ' + i, t: 5000 } })).s;
  ok('rate limit stops a flood of posts', last === 429);
  // CORS
  ok('CORS answers the site', (await api('/api/health')).h.get('access-control-allow-origin') === 'http://localhost:8080');
  console.log(`RESULT ${pass}/${pass + fail} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
