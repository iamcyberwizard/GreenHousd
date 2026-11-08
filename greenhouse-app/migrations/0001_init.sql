CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  tenant TEXT NOT NULL DEFAULT '',
  rent REAL NOT NULL DEFAULT 0,
  meter_start REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  meter_prev REAL NOT NULL,
  meter_curr REAL NOT NULL,
  electric_rate REAL NOT NULL,
  water REAL NOT NULL,
  rent REAL NOT NULL,
  extras TEXT NOT NULL DEFAULT '[]',
  paid INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (room_id, month)
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('dormName', 'Green House'),
  ('address', ''),
  ('phone', ''),
  ('paymentInfo', ''),
  ('electricRate', '8'),
  ('waterFlat', '100'),
  ('dueDay', '5'),
  ('extraCharges', '[]');
