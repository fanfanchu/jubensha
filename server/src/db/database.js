import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(currentDir, "schema.sql");
const serverRoot = resolve(currentDir, "../..");

export function getDatabasePath() {
  const configuredPath = process.env.DATABASE_PATH ?? "./data/app.sqlite";

  if (isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return resolve(serverRoot, configuredPath);
}

export function openDatabase() {
  const databasePath = getDatabasePath();
  const databaseDir = dirname(databasePath);

  if (!existsSync(databaseDir)) {
    mkdirSync(databaseDir, { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  return database;
}

export function initializeDatabase(database = openDatabase()) {
  const schema = readFileSync(schemaPath, "utf8");
  database.exec(schema);
  migrateDatabase(database);
  seedSettings(database);
  return database;
}

export function migrateDatabase(database) {
  addColumnIfMissing(database, "schedules", "players_ready", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(database, "script_roles", "salary_cents", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(database, "schedule_roles", "salary_cents", "INTEGER NOT NULL DEFAULT 0");
  allowPendingScheduleDm(database);
}

export function seedSettings(database) {
  const insertSetting = database.prepare(`
    INSERT INTO settings (key, value, description)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  const defaults = [
    ["admin_password", "admin123", "管理密码：可查看、排班和维护后台配置"],
    ["viewer_password", "view123", "查看密码：只能查看日历排班"],
    ["room_cleaning_minutes", "10", "房间每场结束后的打扫占用分钟数"],
    ["business_day_start_hour", "8", "DM 每日一车的工作日刷新小时"],
  ];

  for (const setting of defaults) {
    insertSetting.run(...setting);
  }
}

export function getSchemaSummary(database) {
  return database
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
      `,
    )
    .all()
    .map((row) => row.name);
}

function addColumnIfMissing(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();

  if (columns.some((item) => item.name === column)) {
    return;
  }

  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

function allowPendingScheduleDm(database) {
  const columns = database.prepare("PRAGMA table_info(schedule_roles)").all();
  const dmColumn = columns.find((item) => item.name === "dm_id");

  if (!dmColumn?.notnull) {
    return;
  }

  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("BEGIN;");

  try {
    database.exec(`
      CREATE TABLE schedule_roles_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schedule_id INTEGER NOT NULL,
        role_name TEXT NOT NULL,
        dm_id INTEGER,
        salary_cents INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
        FOREIGN KEY (dm_id) REFERENCES dms(id),
        UNIQUE (schedule_id, role_name),
        UNIQUE (schedule_id, dm_id)
      );

      INSERT INTO schedule_roles_next (
        id,
        schedule_id,
        role_name,
        dm_id,
        salary_cents,
        sort_order,
        created_at,
        updated_at
      )
      SELECT
        id,
        schedule_id,
        role_name,
        dm_id,
        COALESCE(salary_cents, 0),
        sort_order,
        created_at,
        updated_at
      FROM schedule_roles;

      DROP TABLE schedule_roles;
      ALTER TABLE schedule_roles_next RENAME TO schedule_roles;

      CREATE INDEX IF NOT EXISTS idx_schedule_roles_schedule_id
        ON schedule_roles(schedule_id);

      CREATE INDEX IF NOT EXISTS idx_schedule_roles_dm_id
        ON schedule_roles(dm_id);
    `);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
}
