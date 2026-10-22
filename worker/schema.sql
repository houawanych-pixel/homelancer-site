-- Homelancer community feedback (Cloudflare D1). Apply: npx wrangler d1 execute homelancer-feedback --remote --file worker/schema.sql
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat TEXT NOT NULL CHECK (cat IN ('bug','feedback','suggestion','discussion')),
  area TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  fix TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',      -- private (developer only)
  name TEXT NOT NULL DEFAULT '',           -- public display name (optional, no contact details)
  author TEXT NOT NULL DEFAULT '',         -- private: hash of the player's device token
  ip TEXT NOT NULL DEFAULT '',             -- private: hash of the address (rate limits / abuse only)
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','review','confirmed','in_progress','fixed','released','cannot_reproduce')),
  priority INTEGER NOT NULL DEFAULT 3,     -- 1 game-breaking .. 5 suggestion
  votes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  flags INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,       -- 1 = hidden by the developer, 2 = auto-hidden by flags awaiting review
  merged_into INTEGER,                     -- duplicate of this post
  fixed_in TEXT NOT NULL DEFAULT '',       -- game version that fixed it
  dev_note TEXT NOT NULL DEFAULT '',       -- the developer's public reply on the report
  has_image INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_list ON posts (hidden, cat, status, votes DESC, created DESC);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  dev INTEGER NOT NULL DEFAULT 0,          -- 1 = written by the developer
  flags INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_post ON comments (post_id, created);
CREATE TABLE IF NOT EXISTS votes (post_id INTEGER NOT NULL, voter TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (post_id, voter));
CREATE TABLE IF NOT EXISTS flags (kind TEXT NOT NULL, item_id INTEGER NOT NULL, voter TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, PRIMARY KEY (kind, item_id, voter));
CREATE TABLE IF NOT EXISTS attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created INTEGER NOT NULL);  -- private (developer only)
CREATE TABLE IF NOT EXISTS hits (key TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL);   -- rate limits
CREATE TABLE IF NOT EXISTS patches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  released TEXT NOT NULL,                  -- YYYY-MM-DD
  title TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,                     -- JSON [{type: fixed|improved|added|in_progress, text, post?}]
  published INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL
);
