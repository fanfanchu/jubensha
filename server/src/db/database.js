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
  seedSettings(database);
  return database;
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
