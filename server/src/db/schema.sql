PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  duration_hours INTEGER NOT NULL CHECK (duration_hours > 0),
  max_parallel_sessions INTEGER NOT NULL CHECK (max_parallel_sessions > 0),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  player_count INTEGER NOT NULL DEFAULT 0 CHECK (player_count >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS script_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  salary_cents INTEGER NOT NULL DEFAULT 0 CHECK (salary_cents >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
  UNIQUE (script_id, name)
);

CREATE TABLE IF NOT EXISTS dms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dm_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dm_id INTEGER NOT NULL,
  role_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dm_id) REFERENCES dms(id) ON DELETE CASCADE,
  UNIQUE (dm_id, role_name)
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL,
  room_id INTEGER NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  room_available_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  players_ready INTEGER NOT NULL DEFAULT 1 CHECK (players_ready IN (0, 1)),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  player_count INTEGER NOT NULL DEFAULT 0 CHECK (player_count >= 0),
  revenue_cents INTEGER NOT NULL DEFAULT 0 CHECK (revenue_cents >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (script_id) REFERENCES scripts(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS schedule_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  role_name TEXT NOT NULL,
  dm_id INTEGER,
  salary_cents INTEGER NOT NULL DEFAULT 0 CHECK (salary_cents >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (dm_id) REFERENCES dms(id),
  UNIQUE (schedule_id, role_name),
  UNIQUE (schedule_id, dm_id)
);

CREATE TABLE IF NOT EXISTS salary_locks (
  month TEXT PRIMARY KEY,
  locked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_script_roles_script_id
  ON script_roles(script_id);

CREATE INDEX IF NOT EXISTS idx_dm_roles_dm_id
  ON dm_roles(dm_id);

CREATE INDEX IF NOT EXISTS idx_dm_roles_role_name
  ON dm_roles(role_name);

CREATE INDEX IF NOT EXISTS idx_schedules_start_end
  ON schedules(start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_schedules_script_time
  ON schedules(script_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_schedules_room_time
  ON schedules(room_id, start_at, room_available_at);

CREATE INDEX IF NOT EXISTS idx_schedules_business_date
  ON schedules(business_date);

CREATE INDEX IF NOT EXISTS idx_schedule_roles_schedule_id
  ON schedule_roles(schedule_id);

CREATE INDEX IF NOT EXISTS idx_schedule_roles_dm_id
  ON schedule_roles(dm_id);
