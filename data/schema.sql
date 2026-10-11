-- Future server storage; current preview reads the versioned JSON catalogue.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS places (
 id TEXT PRIMARY KEY, city TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
 address TEXT, latitude REAL, longitude REAL,
 status TEXT NOT NULL CHECK(status IN ('candidate','catalogue','reviewed','closed')),
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, publisher TEXT NOT NULL,
 kind TEXT NOT NULL, rights_status TEXT NOT NULL, independent_family TEXT,
 retrieved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS place_sources (
 place_id TEXT NOT NULL REFERENCES places(id), source_id TEXT NOT NULL REFERENCES sources(id),
 PRIMARY KEY(place_id,source_id)
);
CREATE TABLE IF NOT EXISTS observations (
 id INTEGER PRIMARY KEY, place_id TEXT NOT NULL REFERENCES places(id),
 source_id TEXT NOT NULL REFERENCES sources(id), feature TEXT NOT NULL, value_json TEXT NOT NULL,
 scope TEXT, weekday TEXT, time_window TEXT, checked_at TEXT, valid_until TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending_review','documented','verified','conflicting','expired'))
);
CREATE TABLE IF NOT EXISTS image_licenses (
 id INTEGER PRIMARY KEY, place_id TEXT NOT NULL REFERENCES places(id), url TEXT NOT NULL,
 source_url TEXT NOT NULL, author TEXT NOT NULL, license TEXT NOT NULL,
 attribution TEXT NOT NULL, checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS places_city_category ON places(city,category);
CREATE INDEX IF NOT EXISTS observations_place_feature ON observations(place_id,feature,status);
