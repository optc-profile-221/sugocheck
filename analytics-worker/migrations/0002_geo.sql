CREATE TABLE IF NOT EXISTS geo_daily_stats (
  date TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, country, region)
);

CREATE TABLE IF NOT EXISTS geo_daily_visitors (
  date TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (date, country, region, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_geo_daily_visitors_date
  ON geo_daily_visitors (date, country, region);
