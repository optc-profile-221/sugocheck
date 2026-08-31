CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, page)
);

CREATE TABLE IF NOT EXISTS daily_visitors (
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (date, page, visitor_hash)
);

CREATE TABLE IF NOT EXISTS visitors (
  visitor_hash TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_visitors_date_page
  ON daily_visitors (date, page);
