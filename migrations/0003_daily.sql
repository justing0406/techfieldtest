CREATE TABLE IF NOT EXISTS daily_slots (
  day TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
  video_id TEXT NOT NULL UNIQUE,
  seed_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(day, slot)
);
CREATE TABLE IF NOT EXISTS render_runs (
  video_id TEXT PRIMARY KEY REFERENCES videos(id),
  status TEXT NOT NULL CHECK(status IN ('pending', 'leased', 'complete', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  lease_until TEXT,
  upload_key TEXT,
  video_key TEXT,
  poster_key TEXT,
  qa_key TEXT,
  review TEXT CHECK(review IN ('approved', 'rejected')),
  review_note TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS render_runs_status ON render_runs(status, lease_until);
