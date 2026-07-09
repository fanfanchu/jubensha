import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAdminHandlers } from "./admin.js";
import { authenticate, createAuthHandlers, requireAdmin } from "./auth.js";
import { createScheduleHandlers } from "./schedules.js";
import {
  getDatabasePath,
  getSchemaSummary,
  initializeDatabase,
  openDatabase,
} from "./db/database.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const currentDir = dirname(fileURLToPath(import.meta.url));
const clientDistPath = resolve(currentDir, "../../client/dist");
const clientOrigin = parseClientOrigin(process.env.CLIENT_ORIGIN);
const database = initializeDatabase(openDatabase());
const authHandlers = createAuthHandlers(database);
const adminHandlers = createAdminHandlers(database);
const scheduleHandlers = createScheduleHandlers(database);

app.use(
  cors({
    origin: clientOrigin,
  }),
);
app.use(express.json());

app.post("/api/auth/login", authHandlers.login);
app.get("/api/auth/me", authenticate, authHandlers.me);
app.get("/api/schedules", authenticate, scheduleHandlers.listSchedules);
app.use("/api/admin", authenticate, requireAdmin);
app.get("/api/admin/health", (_request, response) => {
  response.json({
    ok: true,
    role: "admin",
  });
});
app.get("/api/admin/scripts", adminHandlers.listScripts);
app.post("/api/admin/scripts", adminHandlers.createScript);
app.put("/api/admin/scripts/:id", adminHandlers.updateScript);
app.get("/api/admin/dms", adminHandlers.listDms);
app.post("/api/admin/dms", adminHandlers.createDm);
app.put("/api/admin/dms/:id", adminHandlers.updateDm);
app.get("/api/admin/rooms", adminHandlers.listRooms);
app.post("/api/admin/rooms", adminHandlers.createRoom);
app.put("/api/admin/rooms/:id", adminHandlers.updateRoom);
app.get("/api/admin/salary-lock", adminHandlers.getSalaryLock);
app.post("/api/admin/salary-lock", adminHandlers.lockSalaryMonth);
app.delete("/api/admin/salary-lock", adminHandlers.unlockSalaryMonth);
app.post("/api/admin/schedules/availability", scheduleHandlers.getAvailability);
app.post("/api/admin/schedules", scheduleHandlers.createSchedule);
app.put("/api/admin/schedules/:id", scheduleHandlers.updateSchedule);
app.delete("/api/admin/schedules/:id", scheduleHandlers.deleteSchedule);
app.get("/api/admin/reports/monthly.xlsx", scheduleHandlers.exportMonthlyExcel);
app.get("/api/admin/reports/dm-summary", scheduleHandlers.getDmSummary);

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "murder-mystery-scheduler-api",
    database: {
      path: getDatabasePath(),
      tables: getSchemaSummary(database),
    },
    timestamp: new Date().toISOString(),
  });
});

if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(resolve(clientDistPath, "index.html"));
  });
}

app.use((request, response) => {
  response.status(404).json({
    error: "NOT_FOUND",
    message: `未找到接口：${request.method} ${request.path}`,
  });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});

function parseClientOrigin(value) {
  if (!value || value === "true") {
    return true;
  }

  return value;
}
