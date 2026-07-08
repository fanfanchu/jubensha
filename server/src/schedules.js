import ExcelJS from "exceljs";

const halfHourPattern = /^([01]\d|2[0-3]):(00|30)$/;

export function createScheduleHandlers(database) {
  return {
    listSchedules(request, response) {
      response.json(getSchedules(database, request.query));
    },

    createSchedule(request, response) {
      const payload = parseSchedulePayload(request.body);

      if (payload.error) {
        response.status(400).json(payload.error);
        return;
      }

      try {
        const schedule = saveSchedule(database, payload.value);
        response.status(201).json(schedule);
      } catch (error) {
        handleScheduleError(error, response);
      }
    },

    updateSchedule(request, response) {
      const id = parseId(request.params.id);
      const payload = parseSchedulePayload(request.body);

      if (!id || payload.error) {
        response.status(400).json(payload.error ?? validationError("排班不存在"));
        return;
      }

      try {
        if (!recordExists(database, "schedules", id)) {
          response.status(404).json({ error: "NOT_FOUND", message: "排班不存在" });
          return;
        }

        const schedule = saveSchedule(database, payload.value, id);
        response.json(schedule);
      } catch (error) {
        handleScheduleError(error, response);
      }
    },

    deleteSchedule(request, response) {
      const id = parseId(request.params.id);

      if (!id) {
        response.status(400).json(validationError("排班不存在"));
        return;
      }

      const result = database.prepare("DELETE FROM schedules WHERE id = ?").run(id);

      if (result.changes === 0) {
        response.status(404).json({ error: "NOT_FOUND", message: "排班不存在" });
        return;
      }

      response.json({ ok: true });
    },

    getAvailability(request, response) {
      const payload = parseSchedulePayload(request.body, { requireAssignments: false });

      if (payload.error) {
        response.status(400).json(payload.error);
        return;
      }

      try {
        response.json(getAvailability(database, payload.value, parseId(request.body?.excludeId)));
      } catch (error) {
        handleScheduleError(error, response);
      }
    },

    async exportMonthlyExcel(request, response) {
      try {
        const { from, to } = parseDateRange(request.query);
        const schedules = getSchedules(database, request.query);
        const workbook = buildMonthlyWorkbook(schedules, from, to);
        const filename = `schedule-${from.slice(0, 7)}.xlsx`;

        response.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        response.setHeader(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        );

        await workbook.xlsx.write(response);
        response.end();
      } catch (error) {
        handleScheduleError(error, response);
      }
    },

    getDmSummary(request, response) {
      try {
        response.json(getDmMonthlySummary(database, request.query));
      } catch (error) {
        handleScheduleError(error, response);
      }
    },
  };
}

function saveSchedule(database, payload, id = null) {
  const prepared = prepareSchedule(database, payload, id);
  validateSchedule(database, prepared, id);

  runTransaction(database, () => {
    if (id) {
      database
        .prepare(
          `
          UPDATE schedules
          SET
            script_id = ?,
            room_id = ?,
            start_at = ?,
            end_at = ?,
            room_available_at = ?,
            business_date = ?,
            note = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
        )
        .run(
          prepared.script.id,
          prepared.room.id,
          prepared.startAt,
          prepared.endAt,
          prepared.roomAvailableAt,
          prepared.businessDate,
          prepared.note,
          id,
        );

      database.prepare("DELETE FROM schedule_roles WHERE schedule_id = ?").run(id);
    } else {
      const result = database
        .prepare(
          `
          INSERT INTO schedules (
            script_id,
            room_id,
            start_at,
            end_at,
            room_available_at,
            business_date,
            note
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          prepared.script.id,
          prepared.room.id,
          prepared.startAt,
          prepared.endAt,
          prepared.roomAvailableAt,
          prepared.businessDate,
          prepared.note,
        );

      id = Number(result.lastInsertRowid);
    }

    const insertRole = database.prepare(
      `
      INSERT INTO schedule_roles (schedule_id, role_name, dm_id, sort_order)
      VALUES (?, ?, ?, ?)
      `,
    );

    prepared.assignments.forEach((assignment, index) => {
      insertRole.run(id, assignment.roleName, assignment.dmId, index);
    });
  });

  return getScheduleById(database, id);
}

function getAvailability(database, payload, excludeId = null) {
  const prepared = prepareSchedule(database, payload, excludeId);
  const conflicts = collectConflicts(database, prepared, excludeId);
  const assignedDmIds = new Set(prepared.assignments.map((assignment) => assignment.dmId));

  const rooms = database
    .prepare(
      `
      SELECT id, name, is_active AS isActive
      FROM rooms
      ORDER BY is_active DESC, name ASC
      `,
    )
    .all()
    .map((room) => {
      const conflict = getRoomConflict(database, prepared, room.id, excludeId);

      return {
        ...room,
        isActive: Boolean(room.isActive),
        available: Boolean(room.isActive) && !conflict,
        reason: !room.isActive ? "房间已停用" : conflict?.message ?? "",
      };
    });

  const dms = database
    .prepare(
      `
      SELECT id, name, is_active AS isActive
      FROM dms
      ORDER BY is_active DESC, name ASC
      `,
    )
    .all()
    .map((dm) => {
      const dailyConflict = getDmDailyConflict(database, prepared.businessDate, dm.id, excludeId);

      return {
        ...dm,
        isActive: Boolean(dm.isActive),
        available: Boolean(dm.isActive) && !dailyConflict,
        selectedInPayload: assignedDmIds.has(dm.id),
        reason: !dm.isActive ? "DM 已停用" : dailyConflict?.message ?? "",
      };
    });

  return {
    startAt: prepared.startAt,
    endAt: prepared.endAt,
    roomAvailableAt: prepared.roomAvailableAt,
    businessDate: prepared.businessDate,
    conflicts,
    rooms,
    dms,
  };
}

function validateSchedule(database, prepared, excludeId) {
  const conflicts = collectConflicts(database, prepared, excludeId);

  if (conflicts.length > 0) {
    const error = new Error(conflicts[0].message);
    error.statusCode = 409;
    error.code = conflicts[0].code;
    error.conflicts = conflicts;
    throw error;
  }
}

function collectConflicts(database, prepared, excludeId) {
  const conflicts = [];

  if (!prepared.script.isActive) {
    conflicts.push({
      code: "SCRIPT_INACTIVE",
      message: "剧本已停用，不能新增或编辑排班",
    });
  }

  if (!prepared.room.isActive) {
    conflicts.push({
      code: "ROOM_INACTIVE",
      message: "房间已停用，不能选择",
    });
  }

  const scriptOverlapCount = getScriptOverlapCount(database, prepared, excludeId);
  if (scriptOverlapCount >= prepared.script.maxParallelSessions) {
    conflicts.push({
      code: "SCRIPT_CAPACITY_CONFLICT",
      message: `该剧本同一时间最多 ${prepared.script.maxParallelSessions} 车，当前时间段已满`,
    });
  }

  const roomConflict = getRoomConflict(database, prepared, prepared.room.id, excludeId);
  if (roomConflict) {
    conflicts.push(roomConflict);
  }

  const seenDmIds = new Set();
  const seenRoleNames = new Set();
  const roleNames = new Set(prepared.scriptRoles.map((role) => role.name));
  const assignedRoleNames = new Set();

  for (const assignment of prepared.assignments) {
    if (seenRoleNames.has(assignment.roleName)) {
      conflicts.push({
        code: "ROLE_DUPLICATED_IN_SCHEDULE",
        message: `角色重复选择：${assignment.roleName}`,
      });
    }
    seenRoleNames.add(assignment.roleName);

    if (!roleNames.has(assignment.roleName)) {
      conflicts.push({
        code: "ROLE_NOT_IN_SCRIPT",
        message: `剧本不包含角色：${assignment.roleName}`,
      });
      continue;
    }
    assignedRoleNames.add(assignment.roleName);

    const dm = prepared.dmsById.get(assignment.dmId);

    if (!dm) {
      conflicts.push({
        code: "DM_NOT_FOUND",
        message: `DM 不存在：${assignment.dmId}`,
      });
      continue;
    }

    if (!dm.isActive) {
      conflicts.push({
        code: "DM_INACTIVE",
        message: `${dm.name} 已停用，不能选择`,
      });
    }

    if (seenDmIds.has(assignment.dmId)) {
      conflicts.push({
        code: "DM_DUPLICATED_IN_SCHEDULE",
        message: `${dm.name} 在同一场里只能扮演一个角色`,
      });
    }
    seenDmIds.add(assignment.dmId);

    if (!dm.roles.has(assignment.roleName)) {
      conflicts.push({
        code: "DM_ROLE_MISMATCH",
        message: `${dm.name} 不会角色：${assignment.roleName}`,
      });
    }

    const dailyConflict = getDmDailyConflict(
      database,
      prepared.businessDate,
      assignment.dmId,
      excludeId,
    );

    if (dailyConflict) {
      conflicts.push({
        ...dailyConflict,
        message: `${dm.name} 当前工作日已经有一车`,
      });
    }
  }

  const missingRoles = prepared.scriptRoles
    .map((role) => role.name)
    .filter((roleName) => !assignedRoleNames.has(roleName));

  if (missingRoles.length > 0) {
    conflicts.push({
      code: "ROLE_ASSIGNMENT_INCOMPLETE",
      message: `还有角色未选择 DM：${missingRoles.join("、")}`,
    });
  }

  return conflicts;
}

function prepareSchedule(database, payload) {
  const script = database
    .prepare(
      `
      SELECT
        id,
        name,
        duration_hours AS durationHours,
        max_parallel_sessions AS maxParallelSessions,
        is_active AS isActive
      FROM scripts
      WHERE id = ?
      `,
    )
    .get(payload.scriptId);

  if (!script) {
    throw notFoundError("剧本不存在");
  }

  const room = database
    .prepare(
      `
      SELECT id, name, is_active AS isActive
      FROM rooms
      WHERE id = ?
      `,
    )
    .get(payload.roomId);

  if (!room) {
    throw notFoundError("房间不存在");
  }

  const scriptRoles = database
    .prepare(
      `
      SELECT id, name, sort_order AS sortOrder
      FROM script_roles
      WHERE script_id = ?
      ORDER BY sort_order ASC, id ASC
      `,
    )
    .all(script.id);

  const dms = database
    .prepare(
      `
      SELECT
        dms.id,
        dms.name,
        dms.is_active AS isActive,
        dm_roles.role_name AS roleName
      FROM dms
      LEFT JOIN dm_roles ON dm_roles.dm_id = dms.id
      ORDER BY dms.id ASC
      `,
    )
    .all();

  const dmsById = new Map();
  for (const row of dms) {
    if (!dmsById.has(row.id)) {
      dmsById.set(row.id, {
        id: row.id,
        name: row.name,
        isActive: Boolean(row.isActive),
        roles: new Set(),
      });
    }

    if (row.roleName) {
      dmsById.get(row.id).roles.add(row.roleName);
    }
  }

  const startDate = parseStartDate(payload.date, payload.startTime);
  const endDate = addMinutes(startDate, Number(script.durationHours) * 60);
  const cleaningMinutes = getNumberSetting(database, "room_cleaning_minutes", 10);
  const businessDayStartHour = getNumberSetting(database, "business_day_start_hour", 8);

  return {
    script: {
      ...script,
      isActive: Boolean(script.isActive),
    },
    room: {
      ...room,
      isActive: Boolean(room.isActive),
    },
    scriptRoles,
    dmsById,
    startAt: toLocalIso(startDate),
    endAt: toLocalIso(endDate),
    roomAvailableAt: toLocalIso(addMinutes(endDate, cleaningMinutes)),
    businessDate: getBusinessDate(startDate, businessDayStartHour),
    note: payload.note,
    assignments: payload.assignments,
  };
}

function getSchedules(database, query) {
  const { from, to } = parseDateRange(query);
  const rows = database
    .prepare(
      `
      SELECT
        schedules.id,
        schedules.script_id AS scriptId,
        scripts.name AS scriptName,
        schedules.room_id AS roomId,
        rooms.name AS roomName,
        schedules.start_at AS startAt,
        schedules.end_at AS endAt,
        schedules.room_available_at AS roomAvailableAt,
        schedules.business_date AS businessDate,
        schedules.note,
        schedules.created_at AS createdAt,
        schedules.updated_at AS updatedAt
      FROM schedules
      JOIN scripts ON scripts.id = schedules.script_id
      JOIN rooms ON rooms.id = schedules.room_id
      WHERE schedules.start_at >= ?
        AND schedules.start_at < ?
      ORDER BY schedules.start_at ASC, schedules.id ASC
      `,
    )
    .all(from, to);

  if (rows.length === 0) {
    return [];
  }

  const roles = database
    .prepare(
      `
      SELECT
        schedule_roles.id,
        schedule_roles.schedule_id AS scheduleId,
        schedule_roles.role_name AS roleName,
        schedule_roles.dm_id AS dmId,
        dms.name AS dmName,
        schedule_roles.sort_order AS sortOrder
      FROM schedule_roles
      JOIN dms ON dms.id = schedule_roles.dm_id
      WHERE schedule_roles.schedule_id IN (${rows.map(() => "?").join(",")})
      ORDER BY schedule_roles.schedule_id ASC, schedule_roles.sort_order ASC
      `,
    )
    .all(...rows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    roles: roles.filter((role) => role.scheduleId === row.id),
  }));
}

function getScheduleById(database, id) {
  const schedule = database
    .prepare(
      `
      SELECT
        schedules.id,
        schedules.script_id AS scriptId,
        scripts.name AS scriptName,
        schedules.room_id AS roomId,
        rooms.name AS roomName,
        schedules.start_at AS startAt,
        schedules.end_at AS endAt,
        schedules.room_available_at AS roomAvailableAt,
        schedules.business_date AS businessDate,
        schedules.note,
        schedules.created_at AS createdAt,
        schedules.updated_at AS updatedAt
      FROM schedules
      JOIN scripts ON scripts.id = schedules.script_id
      JOIN rooms ON rooms.id = schedules.room_id
      WHERE schedules.id = ?
      `,
    )
    .get(id);

  if (!schedule) {
    return null;
  }

  const roles = database
    .prepare(
      `
      SELECT
        schedule_roles.id,
        schedule_roles.schedule_id AS scheduleId,
        schedule_roles.role_name AS roleName,
        schedule_roles.dm_id AS dmId,
        dms.name AS dmName,
        schedule_roles.sort_order AS sortOrder
      FROM schedule_roles
      JOIN dms ON dms.id = schedule_roles.dm_id
      WHERE schedule_roles.schedule_id = ?
      ORDER BY schedule_roles.sort_order ASC
      `,
    )
    .all(id);

  return {
    ...schedule,
    roles,
  };
}

function getDmMonthlySummary(database, query) {
  const { from, to } = parseDateRange(query);
  const dms = database
    .prepare(
      `
      SELECT id, name, is_active AS isActive
      FROM dms
      ORDER BY is_active DESC, name ASC
      `,
    )
    .all();

  const rows = database
    .prepare(
      `
      SELECT
        dms.id AS dmId,
        dms.name AS dmName,
        schedules.id AS scheduleId,
        scripts.name AS scriptName,
        rooms.name AS roomName,
        schedules.start_at AS startAt,
        schedules.end_at AS endAt,
        schedules.business_date AS businessDate,
        schedule_roles.role_name AS roleName
      FROM schedule_roles
      JOIN dms ON dms.id = schedule_roles.dm_id
      JOIN schedules ON schedules.id = schedule_roles.schedule_id
      JOIN scripts ON scripts.id = schedules.script_id
      JOIN rooms ON rooms.id = schedules.room_id
      WHERE schedules.start_at >= ?
        AND schedules.start_at < ?
      ORDER BY dms.name ASC, schedules.start_at ASC
      `,
    )
    .all(from, to);

  return dms.map((dm) => {
    const details = rows
      .filter((row) => row.dmId === dm.id)
      .map((row) => ({
        scheduleId: row.scheduleId,
        scriptName: row.scriptName,
        roomName: row.roomName,
        startAt: row.startAt,
        endAt: row.endAt,
        businessDate: row.businessDate,
        roleName: row.roleName,
      }));

    return {
      id: dm.id,
      name: dm.name,
      isActive: Boolean(dm.isActive),
      total: details.length,
      details,
    };
  });
}

function buildMonthlyWorkbook(schedules, from, to) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "剧本杀排班系统";
  workbook.created = new Date();

  const scheduleSheet = workbook.addWorksheet("月度排班");
  scheduleSheet.columns = [
    { header: "日期", key: "date", width: 14 },
    { header: "开始时间", key: "startTime", width: 12 },
    { header: "结束时间", key: "endTime", width: 12 },
    { header: "剧本", key: "scriptName", width: 24 },
    { header: "房间", key: "roomName", width: 16 },
    { header: "角色-DM", key: "roles", width: 42 },
    { header: "备注", key: "note", width: 32 },
  ];

  for (const schedule of schedules) {
    scheduleSheet.addRow({
      date: schedule.startAt.slice(0, 10),
      startTime: formatTime(schedule.startAt),
      endTime: formatTime(schedule.endAt),
      scriptName: schedule.scriptName,
      roomName: schedule.roomName,
      roles: schedule.roles.map((role) => `${role.roleName}-${role.dmName}`).join("；"),
      note: schedule.note,
    });
  }

  const summarySheet = workbook.addWorksheet("DM月统计");
  summarySheet.columns = [
    { header: "DM", key: "dmName", width: 18 },
    { header: "总排班数", key: "total", width: 12 },
    { header: "排班明细", key: "details", width: 80 },
  ];

  const summary = summarizeDmFromSchedules(schedules);
  for (const item of summary) {
    summarySheet.addRow({
      dmName: item.dmName,
      total: item.total,
      details: item.details
        .map(
          (detail) =>
            `${detail.startAt.slice(0, 10)} ${formatTime(detail.startAt)} ${detail.scriptName} ${detail.roleName}`,
        )
        .join("；"),
    });
  }

  styleWorksheet(scheduleSheet, `月度排班 ${from.slice(0, 10)} 至 ${to.slice(0, 10)}`);
  styleWorksheet(summarySheet, `DM月统计 ${from.slice(0, 7)}`);

  return workbook;
}

function summarizeDmFromSchedules(schedules) {
  const map = new Map();

  for (const schedule of schedules) {
    for (const role of schedule.roles) {
      if (!map.has(role.dmId)) {
        map.set(role.dmId, {
          dmId: role.dmId,
          dmName: role.dmName,
          total: 0,
          details: [],
        });
      }

      const item = map.get(role.dmId);
      item.total += 1;
      item.details.push({
        scheduleId: schedule.id,
        scriptName: schedule.scriptName,
        startAt: schedule.startAt,
        roleName: role.roleName,
      });
    }
  }

  return Array.from(map.values()).sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total;
    }

    return left.dmName.localeCompare(right.dmName, "zh-CN");
  });
}

function styleWorksheet(worksheet, title) {
  worksheet.insertRow(1, [title]);
  worksheet.mergeCells(1, 1, 1, worksheet.columnCount);

  const titleCell = worksheet.getCell(1, 1);
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };

  const headerRow = worksheet.getRow(2);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE9F3F2" },
  };

  worksheet.eachRow((row) => {
    row.alignment = { vertical: "middle", wrapText: true };
  });
}

function parseSchedulePayload(body, options = { requireAssignments: true }) {
  const scriptId = parseId(body?.scriptId);
  const roomId = parseId(body?.roomId);
  const date = normalizeText(body?.date);
  const startTime = normalizeText(body?.startTime);
  const assignments = normalizeAssignments(body?.assignments);

  if (!scriptId) {
    return { error: validationError("请选择剧本") };
  }

  if (!roomId) {
    return { error: validationError("请选择房间") };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: validationError("请选择有效日期") };
  }

  if (!halfHourPattern.test(startTime)) {
    return { error: validationError("开场时间必须精确到半小时") };
  }

  if (options.requireAssignments && assignments.length === 0) {
    return { error: validationError("请为角色选择 DM") };
  }

  return {
    value: {
      scriptId,
      roomId,
      date,
      startTime,
      note: normalizeText(body?.note),
      assignments,
    },
  };
}

function normalizeAssignments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((assignment) => ({
      roleName: normalizeText(assignment?.roleName),
      dmId: parseId(assignment?.dmId),
    }))
    .filter((assignment) => assignment.roleName && assignment.dmId);
}

function parseDateRange(query) {
  const today = toDateOnly(new Date());
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(String(query?.from ?? ""))
    ? String(query.from)
    : `${today.slice(0, 8)}01`;
  const toDate = /^\d{4}-\d{2}-\d{2}$/.test(String(query?.to ?? ""))
    ? String(query.to)
    : getNextMonthDate(fromDate);

  return {
    from: `${fromDate}T00:00:00`,
    to: `${toDate}T00:00:00`,
  };
}

function getScriptOverlapCount(database, prepared, excludeId) {
  return database
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM schedules
      WHERE script_id = ?
        AND id != ?
        AND start_at < ?
        AND end_at > ?
      `,
    )
    .get(prepared.script.id, excludeId ?? 0, prepared.endAt, prepared.startAt).count;
}

function getRoomConflict(database, prepared, roomId, excludeId) {
  const conflict = database
    .prepare(
      `
      SELECT
        schedules.id,
        scripts.name AS scriptName,
        schedules.start_at AS startAt,
        schedules.room_available_at AS roomAvailableAt
      FROM schedules
      JOIN scripts ON scripts.id = schedules.script_id
      WHERE schedules.room_id = ?
        AND schedules.id != ?
        AND schedules.start_at < ?
        AND schedules.room_available_at > ?
      ORDER BY schedules.start_at ASC
      LIMIT 1
      `,
    )
    .get(roomId, excludeId ?? 0, prepared.roomAvailableAt, prepared.startAt);

  if (!conflict) {
    return null;
  }

  return {
    code: "ROOM_TIME_CONFLICT",
    message: `房间时间冲突，已被《${conflict.scriptName}》占用到 ${formatTime(conflict.roomAvailableAt)}`,
    scheduleId: conflict.id,
  };
}

function getDmDailyConflict(database, businessDate, dmId, excludeId) {
  const conflict = database
    .prepare(
      `
      SELECT schedules.id
      FROM schedule_roles
      JOIN schedules ON schedules.id = schedule_roles.schedule_id
      WHERE schedule_roles.dm_id = ?
        AND schedules.business_date = ?
        AND schedules.id != ?
      LIMIT 1
      `,
    )
    .get(dmId, businessDate, excludeId ?? 0);

  if (!conflict) {
    return null;
  }

  return {
    code: "DM_DAILY_CONFLICT",
    message: "DM 当前工作日已经有一车",
    scheduleId: conflict.id,
  };
}

function getNumberSetting(database, key, fallback) {
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  const value = Number(row?.value);
  return Number.isFinite(value) ? value : fallback;
}

function parseStartDate(date, startTime) {
  const parsed = new Date(`${date}T${startTime}:00`);

  if (Number.isNaN(parsed.getTime())) {
    throw validationException("请选择有效开场时间");
  }

  return parsed;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getBusinessDate(startDate, businessDayStartHour) {
  const shifted = addMinutes(startDate, -businessDayStartHour * 60);
  return toDateOnly(shifted);
}

function toLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function toDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextMonthDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setMonth(date.getMonth() + 1);
  return toDateOnly(date);
}

function formatTime(value) {
  return value.slice(11, 16);
}

function validationError(message) {
  return {
    error: "VALIDATION_ERROR",
    message,
  };
}

function validationException(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "VALIDATION_ERROR";
  return error;
}

function notFoundError(message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  return error;
}

function handleScheduleError(error, response) {
  response.status(error.statusCode ?? 500).json({
    error: error.code ?? "INTERNAL_ERROR",
    message: error.message ?? "服务器处理失败",
    conflicts: error.conflicts ?? undefined,
  });
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function recordExists(database, table, id) {
  return Boolean(database.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id));
}

function runTransaction(database, callback) {
  database.exec("BEGIN");

  try {
    callback();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
