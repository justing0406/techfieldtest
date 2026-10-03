CREATE TABLE IF NOT EXISTS production_runs (
  video_id TEXT PRIMARY KEY REFERENCES videos(id),
  workflow_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  research_key TEXT,
  script_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS production_runs_created_at ON production_runs(created_at);
