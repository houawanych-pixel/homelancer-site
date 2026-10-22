// Homelancer community feedback — a Cloudflare Worker with a D1 database.
//
// Players report bugs, post feedback / suggestions / discussion, upvote and comment. No account, no email, no donation
// needed. Each browser keeps a random player token (sent as X-Player); only a salted hash of it is stored, and only to
// count one vote per player and to rate-limit. The developer reviews, prioritises, changes statuses, replies, merges
// duplicates, hides abuse and publishes patch notes from the admin page (Bearer ADMIN_KEY).
//
// Private, never sent to the public API: player/address hashes, video links, screenshots, flags.
//
// Bindings (worker/wrangler.toml):  DB (D1)  ·  ORIGINS (var)  ·  ADMIN_KEY, SALT (secrets)
//
// Public routes:
//   GET  /api/health                 GET /api/posts?cat=&status=&sort=top|new|recent&q=&page=
//   GET  /api/posts/:id              GET /api/similar?q=            GET /api/patches        GET /api/meta
//   POST /api/posts                  POST /api/posts/:id/vote       POST /api/posts/:id/comments
//   POST /api/flag {kind: post|comment, id, reason}
// Admin routes (Authorization: Bearer ADMIN_KEY):
//   GET  /api/admin/posts?...        PATCH /api/admin/posts/:id     POST /api/admin/posts/:id/merge {into}
//   POST /api/admin/posts/:id/reply  PATCH /api/admin/comments/:id  GET /api/admin/attachments/:id
//   GET  /api/admin/patches          POST /api/admin/patches        PATCH|DELETE /api/admin/patches/:id

const VERSION = 'feedback-1';
const CATS = ['bug', 'feedback', 'suggestion', 'discussion'];
const STATUSES = ['new', 'review', 'confirmed', 'in_progress', 'fixed', 'released', 'cannot_reproduce'];
// What a bug is about -> its starting priority (1 game-breaking, 2 multiplayer, 3 major gameplay, 4 visual, 5 suggestion)
const AREAS = {
  crash: 1, loading: 1, models: 4, controls: 3, combat: 3, multiplayer: 2, gates: 3, mobile: 3, graphics: 4, other: 3,
};
const LIMITS = {
  title: [6, 120], body: [10, 4000], short: 300, steps: 2000, fix: 2000, name: 24, comment: [2, 2000],
  maxBody: 2_200_000, image: 1_600_000, pageSize: 20, minFillMs: 2500,
  // per player+address: [how many, per seconds]
  post: [5, 3600], postDay: [15, 86400], comment: [20, 3600], vote: [120, 3600], flag: [30, 3600], read: [600, 60],
};

const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
function eq(a, b) {   // constant-time string compare
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}
// Plain text only: strip control characters, trim, cap the length. (The page always renders with textContent.)
function clean(v, max) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}
function linkCount(s) { return (String(s).match(/https?:\/\//gi) || []).length }
function looksSpam(text) {
  const t = String(text);
  if (linkCount(t) > 3) return true;
  if (/(.)\1{24,}/.test(t)) return true;                     // aaaaaaaaaaaaaaaaaaaaaaaaa
  if (/\b(viagra|casino|crypto ?giveaway|bitcoin doubler|porn|escort service|loan offer)\b/i.test(t)) return true;
  return false;
}
function safeUrl(u) {
  const s = clean(u, 400);
  if (!s) return '';
  try { const x = new URL(s); return x.protocol === 'https:' ? x.toString() : '' } catch { return '' }
}

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || allowed.includes('*');
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || ''),
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Player',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(data, status, h) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
class Fail extends Error { constructor(status, msg) { super(msg); this.status = status } }

async function who(req, env) {
  const salt = env.SALT || 'dev-salt';
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'local';
  const tok = clean(req.headers.get('X-Player') || '', 80);
  return { ip: await sha(salt + '|ip|' + ip), player: tok.length >= 16 ? await sha(salt + '|p|' + tok) : '' };
}
// Fixed-window rate limit stored in D1. Throws 429 when over.
async function limit(env, key, [n, secs]) {
  const t = now();
  const row = await env.DB.prepare('SELECT n, reset FROM hits WHERE key = ?').bind(key).first();
  if (!row || row.reset <= t) {
    await env.DB.prepare('INSERT INTO hits (key, n, reset) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = 1, reset = excluded.reset').bind(key, t + secs).run();
    return;
  }
  if (row.n >= n) throw new Fail(429, 'Slow down a little: too many in a short time. Try again later.');
  await env.DB.prepare('UPDATE hits SET n = n + 1 WHERE key = ?').bind(key).run();
}
async function body(req) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > LIMITS.maxBody) throw new Fail(413, 'That is too big.');
  const txt = await req.text();
  if (txt.length > LIMITS.maxBody) throw new Fail(413, 'That is too big.');
  try { return JSON.parse(txt || '{}') } catch { throw new Fail(400, 'Bad request.') }
}
function human(b) {   // honeypot + time-to-fill (bots fill the hidden field or submit instantly)
  if (clean(b.website, 200) !== '') throw new Fail(400, 'Could not send that.');
  if (!(Number(b.t) >= LIMITS.minFillMs)) throw new Fail(400, 'Could not send that. Take a moment and try again.');
}

// What the public sees of a post (nothing private).
function pub(p) {
  return {
    id: p.id, cat: p.cat, area: p.area, title: p.title, body: p.body, location: p.location, steps: p.steps, device: p.device,
    fix: p.fix, name: p.name || 'Pilot', status: p.status, priority: p.priority, votes: p.votes, comments: p.comments,
    merged_into: p.merged_into, fixed_in: p.fixed_in, dev_note: p.dev_note, has_image: !!p.has_image, created: p.created, updated: p.updated,
  };
}
function pubComment(c) { return { id: c.id, body: c.body, name: c.dev ? 'Developer' : (c.name || 'Pilot'), dev: !!c.dev, created: c.created } }

// Image check by its first bytes (not by what the browser claims): PNG, JPEG or WebP only.
function imageType(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return '';
}
function decodeImage(s) {
  if (!s) return null;
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(s));
  if (!m) throw new Fail(400, 'The screenshot must be a PNG, JPEG or WebP picture.');
  const bin = atob(m[2]);
  if (bin.length > LIMITS.image) throw new Fail(413, 'The screenshot is too big (1.5 MB at most).');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = imageType(bytes);
  if (!mime) throw new Fail(400, 'The screenshot must be a PNG, JPEG or WebP picture.');
  return { mime, bytes };
}

function words(s) {
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'it', 'in', 'on', 'of', 'to', 'my', 'i', 'when', 'not', 'no', 'with', 'after', 'for', 'at', 'game', 'bug']);
  return [...new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w)))].slice(0, 8);
}
async function similar(env, q, cat) {
  const ws = words(q);
  if (!ws.length) return [];
  const where = ws.map(() => '(LOWER(title) LIKE ? OR LOWER(body) LIKE ?)').join(' OR ');
  const args = ws.flatMap(w => ['%' + w + '%', '%' + w + '%']);
  const rows = (await env.DB.prepare(`SELECT * FROM posts WHERE hidden = 0 AND merged_into IS NULL ${cat ? 'AND cat = ?' : ''} AND (${where}) ORDER BY votes DESC LIMIT 60`).bind(...(cat ? [cat] : []), ...args).all()).results;
  const score = p => { const t = String(p.title).toLowerCase(); return ws.reduce((s, w) => s + (t.includes(w) ? 2 : 0) + (String(p.body).toLowerCase().includes(w) ? 1 : 0), 0) };
  return rows.map(p => ({ p, s: score(p) })).filter(x => x.s >= Math.min(3, ws.length * 2)).sort((a, b) => b.s - a.s || b.p.votes - a.p.votes).slice(0, 5).map(x => pub(x.p));
}

async function listPosts(env, url, admin) {
  const cat = url.searchParams.get('cat');
  const status = url.searchParams.get('status');
  const sort = url.searchParams.get('sort') || 'top';
  const q = clean(url.searchParams.get('q') || '', 80).toLowerCase();
  const page = Math.max(0, Math.min(200, Number(url.searchParams.get('page') || 0) | 0));
  const conds = [], args = [];
  if (!admin) conds.push('hidden = 0 AND merged_into IS NULL');
  else if (url.searchParams.get('view') === 'hidden') conds.push('hidden > 0');
  else if (url.searchParams.get('view') !== 'all') conds.push('hidden = 0');
  if (cat && CATS.includes(cat)) { conds.push('cat = ?'); args.push(cat) }
  if (status && STATUSES.includes(status)) { conds.push('status = ?'); args.push(status) }
  if (q) { conds.push('(LOWER(title) LIKE ? OR LOWER(body) LIKE ?)'); args.push('%' + q + '%', '%' + q + '%') }
  const order = admin && sort === 'priority' ? 'priority ASC, votes DESC, created DESC'
    : sort === 'new' ? 'created DESC' : sort === 'recent' ? 'updated DESC' : 'votes DESC, created DESC';
  const sql = `SELECT * FROM posts ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const rows = (await env.DB.prepare(sql).bind(...args, LIMITS.pageSize + 1, page * LIMITS.pageSize).all()).results;
  const more = rows.length > LIMITS.pageSize;
  return { posts: rows.slice(0, LIMITS.pageSize).map(p => admin ? { ...pub(p), hidden: p.hidden, flags: p.flags, video_url: p.video_url } : pub(p)), more, page };
}

async function getPost(env, id, admin) {
  const p = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!p || (!admin && p.hidden)) throw new Fail(404, 'Not found.');
  const cs = (await env.DB.prepare(`SELECT * FROM comments WHERE post_id = ? ${admin ? '' : 'AND hidden = 0'} ORDER BY created ASC LIMIT 500`).bind(id).all()).results;
  const out = { post: admin ? { ...pub(p), hidden: p.hidden, flags: p.flags, video_url: p.video_url } : pub(p), comments: cs.map(c => admin ? { ...pubComment(c), hidden: c.hidden, flags: c.flags } : pubComment(c)) };
  if (admin) out.attachments = (await env.DB.prepare('SELECT id, mime, created FROM attachments WHERE post_id = ?').bind(id).all()).results;
  return out;
}

async function createPost(req, env, w) {
  const b = await body(req);
  human(b);
  if (!w.player) throw new Fail(400, 'Please reload the page and try again.');
  await limit(env, 'post:' + w.player, LIMITS.post);
  await limit(env, 'post:' + w.ip, LIMITS.postDay);
  const cat = CATS.includes(b.cat) ? b.cat : 'bug';
  const title = clean(b.title, LIMITS.title[1]);
  const text = clean(b.body, LIMITS.body[1]);
  if (title.length < LIMITS.title[0]) throw new Fail(400, 'Give it a short title (at least 6 letters).');
  if (text.length < LIMITS.body[0]) throw new Fail(400, 'Describe what happened (at least 10 letters).');
  const area = Object.hasOwn(AREAS, b.area) ? b.area : 'other';
  const fields = { location: clean(b.location, LIMITS.short), steps: clean(b.steps, LIMITS.steps), device: clean(b.device, LIMITS.short), fix: clean(b.fix, LIMITS.fix) };
  if (looksSpam(title + '\n' + text + '\n' + fields.steps + '\n' + fields.fix)) throw new Fail(400, 'That looks like spam, so it was not posted.');
  const img = decodeImage(b.image);
  const prio = cat === 'bug' ? AREAS[area] : (cat === 'suggestion' ? 5 : 4);
  const t = now();
  const r = await env.DB.prepare(`INSERT INTO posts (cat, area, title, body, location, steps, device, fix, video_url, name, author, ip, priority, has_image, created, updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(cat, area, title, text, fields.location, fields.steps, fields.device, fields.fix,
    safeUrl(b.video_url), clean(b.name, LIMITS.name).replace(/[@<>]/g, ''), w.player, w.ip, prio, img ? 1 : 0, t, t).run();
  const id = r.meta.last_row_id;
  if (img) await env.DB.prepare('INSERT INTO attachments (post_id, mime, data, created) VALUES (?, ?, ?, ?)').bind(id, img.mime, img.bytes, t).run();
  // the reporter's own vote
  await env.DB.prepare('INSERT OR IGNORE INTO votes (post_id, voter, created) VALUES (?, ?, ?)').bind(id, w.player, t).run();
  await env.DB.prepare('UPDATE posts SET votes = 1 WHERE id = ?').bind(id).run();
  return { id, post: pub(await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first()) };
}

async function vote(env, id, w) {
  if (!w.player) throw new Fail(400, 'Please reload the page and try again.');
  await limit(env, 'vote:' + w.player, LIMITS.vote);
  const p = await env.DB.prepare('SELECT id, hidden, merged_into FROM posts WHERE id = ?').bind(id).first();
  if (!p || p.hidden) throw new Fail(404, 'Not found.');
  const target = p.merged_into || p.id;   // a vote on a duplicate counts for the report it was merged into
  const had = await env.DB.prepare('SELECT 1 FROM votes WHERE post_id = ? AND voter = ?').bind(target, w.player).first();
  if (had) await env.DB.prepare('DELETE FROM votes WHERE post_id = ? AND voter = ?').bind(target, w.player).run();
  else await env.DB.prepare('INSERT INTO votes (post_id, voter, created) VALUES (?, ?, ?)').bind(target, w.player, now()).run();
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE post_id = ?').bind(target).first()).n;
  await env.DB.prepare('UPDATE posts SET votes = ? WHERE id = ?').bind(n, target).run();
  return { id: target, votes: n, voted: !had };
}

async function addComment(req, env, id, w, dev) {
  const b = await body(req);
  if (!dev) {
    human(b);
    if (!w.player) throw new Fail(400, 'Please reload the page and try again.');
    await limit(env, 'comment:' + w.player, LIMITS.comment);
  }
  const p = await env.DB.prepare('SELECT id, hidden FROM posts WHERE id = ?').bind(id).first();
  if (!p || (!dev && p.hidden)) throw new Fail(404, 'Not found.');
  const text = clean(b.body, LIMITS.comment[1]);
  if (text.length < LIMITS.comment[0]) throw new Fail(400, 'Write a little more.');
  if (!dev && looksSpam(text)) throw new Fail(400, 'That looks like spam, so it was not posted.');
  const t = now();
  const r = await env.DB.prepare('INSERT INTO comments (post_id, body, name, author, ip, dev, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, text, dev ? 'Developer' : clean(b.name, LIMITS.name).replace(/[@<>]/g, ''), w.player, w.ip, dev ? 1 : 0, t).run();
  await env.DB.prepare('UPDATE posts SET comments = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND hidden = 0), updated = ? WHERE id = ?').bind(id, t, id).run();
  return { comment: pubComment(await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(r.meta.last_row_id).first()) };
}

// Flag abuse. Three different players flagging the same item hides it until the developer looks.
const AUTO_HIDE_FLAGS = 3;
async function flag(req, env, w) {
  const b = await body(req);
  if (!w.player) throw new Fail(400, 'Please reload the page and try again.');
  await limit(env, 'flag:' + w.player, LIMITS.flag);
  const kind = b.kind === 'comment' ? 'comment' : 'post';
  const id = Number(b.id) | 0;
  const table = kind === 'comment' ? 'comments' : 'posts';
  const it = await env.DB.prepare(`SELECT id, flags, hidden FROM ${table} WHERE id = ?`).bind(id).first();
  if (!it) throw new Fail(404, 'Not found.');
  const r = await env.DB.prepare('INSERT OR IGNORE INTO flags (kind, item_id, voter, reason, created) VALUES (?, ?, ?, ?, ?)').bind(kind, id, w.player, clean(b.reason, 200), now()).run();
  if (r.meta.changes) {
    const n = it.flags + 1;
    await env.DB.prepare(`UPDATE ${table} SET flags = ?, hidden = CASE WHEN hidden = 0 AND ? >= ? THEN 2 ELSE hidden END WHERE id = ?`).bind(n, n, AUTO_HIDE_FLAGS, id).run();
  }
  return { ok: true };
}

async function adminUpdatePost(req, env, id) {
  const b = await body(req);
  const p = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!p) throw new Fail(404, 'Not found.');
  const set = {};
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) throw new Fail(400, 'Unknown status.'); set.status = b.status }
  if (b.priority !== undefined) { const n = Number(b.priority) | 0; if (n < 1 || n > 5) throw new Fail(400, 'Priority is 1 to 5.'); set.priority = n }
  if (b.cat !== undefined) { if (!CATS.includes(b.cat)) throw new Fail(400, 'Unknown category.'); set.cat = b.cat }
  if (b.hidden !== undefined) set.hidden = b.hidden ? 1 : 0;
  if (b.fixed_in !== undefined) set.fixed_in = clean(b.fixed_in, 40);
  if (b.dev_note !== undefined) set.dev_note = clean(b.dev_note, 2000);
  if (b.hidden === false) set.flags = 0;
  if (!Object.keys(set).length) throw new Fail(400, 'Nothing to change.');
  set.updated = now();
  const keys = Object.keys(set);
  await env.DB.prepare(`UPDATE posts SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).bind(...keys.map(k => set[k]), id).run();
  return getPost(env, id, true);
}
async function adminMerge(req, env, id) {
  const b = await body(req);
  const into = Number(b.into) | 0;
  if (into === id) throw new Fail(400, 'A report cannot be merged into itself.');
  const a = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  const t = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(into).first();
  if (!a || !t) throw new Fail(404, 'Not found.');
  if (t.merged_into) throw new Fail(400, 'That report is itself merged; merge into ' + t.merged_into + ' instead.');
  // the duplicate's voters now count for the original
  await env.DB.prepare('INSERT OR IGNORE INTO votes (post_id, voter, created) SELECT ?, voter, created FROM votes WHERE post_id = ?').bind(into, id).run();
  await env.DB.prepare('DELETE FROM votes WHERE post_id = ?').bind(id).run();
  await env.DB.prepare('UPDATE posts SET merged_into = ? WHERE merged_into = ?').bind(into, id).run();
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE post_id = ?').bind(into).first()).n;
  const ts = now();
  await env.DB.prepare('UPDATE posts SET merged_into = ?, votes = 0, updated = ? WHERE id = ?').bind(into, ts, id).run();
  await env.DB.prepare('UPDATE posts SET votes = ?, updated = ? WHERE id = ?').bind(n, ts, into).run();
  return getPost(env, into, true);
}
async function adminComment(req, env, id) {
  const b = await body(req);
  const c = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
  if (!c) throw new Fail(404, 'Not found.');
  await env.DB.prepare('UPDATE comments SET hidden = ?, flags = CASE WHEN ? = 0 THEN 0 ELSE flags END WHERE id = ?').bind(b.hidden ? 1 : 0, b.hidden ? 1 : 0, id).run();
  await env.DB.prepare('UPDATE posts SET comments = (SELECT COUNT(*) FROM comments WHERE post_id = ? AND hidden = 0) WHERE id = ?').bind(c.post_id, c.post_id).run();
  return { ok: true };
}

const PATCH_TYPES = ['fixed', 'improved', 'added', 'in_progress'];
function patchIn(b) {
  const version = clean(b.version, 40);
  const released = clean(b.released, 10);
  if (!version) throw new Fail(400, 'Version is needed.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(released)) throw new Fail(400, 'Release date is YYYY-MM-DD.');
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60).map(i => ({ type: PATCH_TYPES.includes(i.type) ? i.type : 'fixed', text: clean(i.text, 300), post: Number(i.post) | 0 || undefined })).filter(i => i.text);
  if (!items.length) throw new Fail(400, 'Add at least one confirmed change.');
  return { version, released, title: clean(b.title, 120), items: JSON.stringify(items), published: b.published === false ? 0 : 1 };
}
async function patches(env, admin) {
  const rows = (await env.DB.prepare(`SELECT * FROM patches ${admin ? '' : 'WHERE published = 1'} ORDER BY released DESC, id DESC LIMIT 40`).all()).results;
  return { patches: rows.map(r => ({ id: r.id, version: r.version, released: r.released, title: r.title, items: JSON.parse(r.items), published: !!r.published })) };
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    try {
      const w = await who(req, env);
      // ---------- admin ----------
      if (path.startsWith('/api/admin/')) {
        const auth = req.headers.get('Authorization') || '';
        if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 20 || !eq(auth, 'Bearer ' + env.ADMIN_KEY)) {
          await limit(env, 'adminfail:' + w.ip, [10, 600]);   // slows guessing
          throw new Fail(401, 'Admin key needed.');
        }
        let m;
        if (req.method === 'GET' && path === '/api/admin/posts') return json(await listPosts(env, url, true), 200, h);
        if ((m = /^\/api\/admin\/posts\/(\d+)$/.exec(path))) {
          if (req.method === 'GET') return json(await getPost(env, +m[1], true), 200, h);
          if (req.method === 'PATCH') return json(await adminUpdatePost(req, env, +m[1]), 200, h);
        }
        if (req.method === 'POST' && (m = /^\/api\/admin\/posts\/(\d+)\/merge$/.exec(path))) return json(await adminMerge(req, env, +m[1]), 200, h);
        if (req.method === 'POST' && (m = /^\/api\/admin\/posts\/(\d+)\/reply$/.exec(path))) return json(await addComment(req, env, +m[1], w, true), 200, h);
        if (req.method === 'PATCH' && (m = /^\/api\/admin\/comments\/(\d+)$/.exec(path))) return json(await adminComment(req, env, +m[1]), 200, h);
        if (req.method === 'GET' && (m = /^\/api\/admin\/attachments\/(\d+)$/.exec(path))) {
          const a = await env.DB.prepare('SELECT mime, data FROM attachments WHERE id = ?').bind(+m[1]).first();
          if (!a) throw new Fail(404, 'Not found.');
          return new Response(new Uint8Array(a.data), { headers: { ...h, 'Content-Type': a.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
        }
        if (path === '/api/admin/patches') {
          if (req.method === 'GET') return json(await patches(env, true), 200, h);
          if (req.method === 'POST') {
            const p = patchIn(await body(req));
            const r = await env.DB.prepare('INSERT INTO patches (version, released, title, items, published, created) VALUES (?, ?, ?, ?, ?, ?)').bind(p.version, p.released, p.title, p.items, p.published, now()).run();
            return json({ id: r.meta.last_row_id }, 201, h);
          }
        }
        if ((m = /^\/api\/admin\/patches\/(\d+)$/.exec(path))) {
          if (req.method === 'PATCH') {
            const p = patchIn(await body(req));
            await env.DB.prepare('UPDATE patches SET version = ?, released = ?, title = ?, items = ?, published = ? WHERE id = ?').bind(p.version, p.released, p.title, p.items, p.published, +m[1]).run();
            return json({ ok: true }, 200, h);
          }
          if (req.method === 'DELETE') { await env.DB.prepare('DELETE FROM patches WHERE id = ?').bind(+m[1]).run(); return json({ ok: true }, 200, h) }
        }
        throw new Fail(404, 'Not found.');
      }
      // ---------- public ----------
      if (req.method === 'GET') {
        await limit(env, 'read:' + w.ip, LIMITS.read);
        if (path === '/api/health') return json({ ok: true, version: VERSION }, 200, h);
        if (path === '/api/meta') return json({ cats: CATS, statuses: STATUSES, areas: Object.keys(AREAS), limits: { title: LIMITS.title, body: LIMITS.body, image: LIMITS.image } }, 200, h);
        if (path === '/api/posts') return json(await listPosts(env, url, false), 200, h);
        let m;
        if ((m = /^\/api\/posts\/(\d+)$/.exec(path))) {
          const out = await getPost(env, +m[1], false);
          if (w.player) out.voted = !!(await env.DB.prepare('SELECT 1 FROM votes WHERE post_id = ? AND voter = ?').bind(out.post.merged_into || out.post.id, w.player).first());
          return json(out, 200, h);
        }
        if (path === '/api/similar') return json({ posts: await similar(env, clean(url.searchParams.get('q'), 120), CATS.includes(url.searchParams.get('cat')) ? url.searchParams.get('cat') : '') }, 200, h);
        if (path === '/api/patches') return json(await patches(env, false), 200, h);
        if (path === '/api/myvotes') {   // which of these posts this player has voted for
          const ids = String(url.searchParams.get('ids') || '').split(',').map(n => Number(n) | 0).filter(n => n > 0).slice(0, 50);
          if (!w.player || !ids.length) return json({ voted: [] }, 200, h);
          const rows = (await env.DB.prepare(`SELECT post_id FROM votes WHERE voter = ? AND post_id IN (${ids.map(() => '?').join(',')})`).bind(w.player, ...ids).all()).results;
          return json({ voted: rows.map(r => r.post_id) }, 200, h);
        }
      }
      if (req.method === 'POST') {
        if (path === '/api/posts') return json(await createPost(req, env, w), 201, h);
        let m;
        if ((m = /^\/api\/posts\/(\d+)\/vote$/.exec(path))) return json(await vote(env, +m[1], w), 200, h);
        if ((m = /^\/api\/posts\/(\d+)\/comments$/.exec(path))) return json(await addComment(req, env, +m[1], w, false), 201, h);
        if (path === '/api/flag') return json(await flag(req, env, w), 200, h);
      }
      throw new Fail(404, 'Not found.');
    } catch (e) {
      if (e instanceof Fail) return json({ error: e.message }, e.status, h);
      console.error(e);
      return json({ error: 'Something went wrong. Please try again.' }, 500, h);
    }
  },
};
