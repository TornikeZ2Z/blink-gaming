-- The demo-request inbox (D1 database "brainer-inbox"). Apply with:
--   npx wrangler d1 execute brainer-inbox --remote --file schema.sql
-- Every statement is safe to run again.

-- One row per form sent from brainer.games/contact.html. The fixed columns are what the list shows and filters on;
-- every other answer of the form is kept in `data` (JSON), so the form can change without a migration.
CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,                 -- ISO time, UTC
  updated_at   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new',   -- new, talking, qualified, won, closed, spam
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  company      TEXT NOT NULL,
  company_type TEXT,
  data         TEXT NOT NULL DEFAULT '{}',
  page         TEXT,                          -- the page the form was sent from
  country      TEXT,                          -- Cloudflare's guess from the sender's IP
  ip_hash      TEXT,                          -- salted hash of the IP, only for the rate limit; the IP itself is never stored
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS requests_status ON requests (status, created_at);
CREATE INDEX IF NOT EXISTS requests_ip ON requests (ip_hash, created_at);

-- Notes the team adds to a request, oldest first.
CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_request ON notes (request_id, created_at);

-- One-time sign-in links. Only a hash of the token is kept; a link works once, for 15 minutes.
CREATE TABLE IF NOT EXISTS logins (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL,                -- ms since 1970
  used       INTEGER NOT NULL DEFAULT 0
);
