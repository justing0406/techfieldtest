CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'queued', 'researching', 'scripting', 'rendering', 'awaiting_approval', 'approved', 'published', 'failed')),
  manifest_key TEXT NOT NULL UNIQUE,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS videos_created_at ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS videos_status ON videos(status);
