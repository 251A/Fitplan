-- FitPlan sync store (Cloudflare D1). Single user, protected by a bearer token.

-- Global change counter: every write batch gets the next sequence number.
CREATE TABLE IF NOT EXISTS meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seq INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta (id, seq) VALUES (1, 0);

-- User-edited records (profile, gym sessions, exercise tweaks…). Last write wins by updated_at.
CREATE TABLE IF NOT EXISTS records (
  store TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,               -- JSON; NULL when deleted
  updated_at INTEGER NOT NULL, -- client clock (ms)
  seq INTEGER NOT NULL,
  PRIMARY KEY (store, key)
);
CREATE INDEX IF NOT EXISTS records_seq ON records (seq);

-- Raw Health payloads sent by the iOS shortcut (or pasted in the app). Each device imports them.
CREATE TABLE IF NOT EXISTS health_payloads (
  seq INTEGER PRIMARY KEY,
  received_at INTEGER NOT NULL,
  body TEXT NOT NULL
);
