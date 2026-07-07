export function createAdminHandlers(database) {
  return {
    listScripts(_request, response) {
      response.json(getScripts(database));
    },

    createScript(request, response) {
      const payload = parseScriptPayload(request.body);

      if (payload.error) {
        response.status(400).json(payload.error);
        return;
      }

      try {
        const script = saveScript(database, payload.value);
        response.status(201).json(script);
      } catch (error) {
        handleDatabaseError(error, response);
      }
    },

    updateScript(request, response) {
      const id = parseId(request.params.id);
      const payload = parseScriptPayload(request.body);

      if (!id || payload.error) {
        response.status(400).json(payload.error ?? validationError("剧本不存在"));
        return;
      }

      try {
        if (!recordExists(database, "scripts", id)) {
          response.status(404).json({ error: "NOT_FOUND", message: "剧本不存在" });
          return;
        }

        const script = saveScript(database, payload.value, id);
        response.json(script);
      } catch (error) {
        handleDatabaseError(error, response);
      }
    },

    listDms(_request, response) {
      response.json(getDms(database));
    },

    createDm(request, response) {
      const payload = parseDmPayload(request.body);

      if (payload.error) {
        response.status(400).json(payload.error);
        return;
      }

      try {
        const dm = saveDm(database, payload.value);
        response.status(201).json(dm);
      } catch (error) {
        handleDatabaseError(error, response);
      }
    },

    updateDm(request, response) {
      const id = parseId(request.params.id);
      const payload = parseDmPayload(request.body);

      if (!id || payload.error) {
        response.status(400).json(payload.error ?? validationError("DM 不存在"));
        return;
      }

      try {
        if (!recordExists(database, "dms", id)) {
          response.status(404).json({ error: "NOT_FOUND", message: "DM 不存在" });
          return;
        }

        const dm = saveDm(database, payload.value, id);
        response.json(dm);
      } catch (error) {
        handleDatabaseError(error, response);
      }
    },

    listRooms(_request, response) {
      response.json(getRooms(database));
    },

    createRoom(request, response) {
      const payload = parseRoomPayload(request.body);

      if (payload.error) {
        response.status(400).json(payload.error);
        return;
      }

      try {
        const room = saveRoom(database, payload.value);
        response.status(201).json(room);
      } catch (error) {
        handleDatabaseError(error, response);
      }
    },

    updateRoom(request, response) {
      const id = parseId(request.params.id);
      const payload = parseRoomPayload(request.body);

      if (!id || payload.error) {
        response.status(400).json(payload.error ?? validationError("房间不存在"));
        return;
      }

      try {
        if (!recordExists(database, "rooms", id)) {
          response.status(404).json({ error: "NOT_FOUND", message: "房间不存在" });
          return;
        }

        const room = saveRoom(database, payload.value, id);
        response.json(room);
      } catch (error) {
        handleDatabaseError(error, response);
      }
    },
  };
}

function getScripts(database) {
  const scripts = database
    .prepare(
      `
      SELECT
        id,
        name,
        duration_hours AS durationHours,
        max_parallel_sessions AS maxParallelSessions,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM scripts
      ORDER BY is_active DESC, name ASC
      `,
    )
    .all();

  const roles = database
    .prepare(
      `
      SELECT
        id,
        script_id AS scriptId,
        name,
        sort_order AS sortOrder
      FROM script_roles
      ORDER BY script_id ASC, sort_order ASC, id ASC
      `,
    )
    .all();

  return scripts.map((script) => ({
    ...script,
    isActive: Boolean(script.isActive),
    roles: roles.filter((role) => role.scriptId === script.id),
  }));
}

function saveScript(database, payload, id = null) {
  runTransaction(database, () => {
    if (id) {
      database
        .prepare(
          `
          UPDATE scripts
          SET
            name = ?,
            duration_hours = ?,
            max_parallel_sessions = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
        )
        .run(
          payload.name,
          payload.durationHours,
          payload.maxParallelSessions,
          payload.isActive ? 1 : 0,
          id,
        );

      database.prepare("DELETE FROM script_roles WHERE script_id = ?").run(id);
    } else {
      const result = database
        .prepare(
          `
          INSERT INTO scripts (name, duration_hours, max_parallel_sessions, is_active)
          VALUES (?, ?, ?, ?)
          `,
        )
        .run(
          payload.name,
          payload.durationHours,
          payload.maxParallelSessions,
          payload.isActive ? 1 : 0,
        );

      id = Number(result.lastInsertRowid);
    }

    const insertRole = database.prepare(
      `
      INSERT INTO script_roles (script_id, name, sort_order)
      VALUES (?, ?, ?)
      `,
    );

    payload.roles.forEach((role, index) => {
      insertRole.run(id, role, index);
    });
  });

  return getScripts(database).find((script) => script.id === id);
}

function getDms(database) {
  const dms = database
    .prepare(
      `
      SELECT
        id,
        name,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM dms
      ORDER BY is_active DESC, name ASC
      `,
    )
    .all();

  const roles = database
    .prepare(
      `
      SELECT
        id,
        dm_id AS dmId,
        role_name AS roleName
      FROM dm_roles
      ORDER BY dm_id ASC, role_name ASC
      `,
    )
    .all();

  return dms.map((dm) => ({
    ...dm,
    isActive: Boolean(dm.isActive),
    roles: roles.filter((role) => role.dmId === dm.id),
  }));
}

function saveDm(database, payload, id = null) {
  runTransaction(database, () => {
    if (id) {
      database
        .prepare(
          `
          UPDATE dms
          SET
            name = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
        )
        .run(payload.name, payload.isActive ? 1 : 0, id);

      database.prepare("DELETE FROM dm_roles WHERE dm_id = ?").run(id);
    } else {
      const result = database
        .prepare(
          `
          INSERT INTO dms (name, is_active)
          VALUES (?, ?)
          `,
        )
        .run(payload.name, payload.isActive ? 1 : 0);

      id = Number(result.lastInsertRowid);
    }

    const insertRole = database.prepare(
      `
      INSERT INTO dm_roles (dm_id, role_name)
      VALUES (?, ?)
      `,
    );

    payload.roles.forEach((role) => {
      insertRole.run(id, role);
    });
  });

  return getDms(database).find((dm) => dm.id === id);
}

function getRooms(database) {
  return database
    .prepare(
      `
      SELECT
        id,
        name,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM rooms
      ORDER BY is_active DESC, name ASC
      `,
    )
    .all()
    .map((room) => ({
      ...room,
      isActive: Boolean(room.isActive),
    }));
}

function saveRoom(database, payload, id = null) {
  if (id) {
    database
      .prepare(
        `
        UPDATE rooms
        SET
          name = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
      )
      .run(payload.name, payload.isActive ? 1 : 0, id);
  } else {
    const result = database
      .prepare(
        `
        INSERT INTO rooms (name, is_active)
        VALUES (?, ?)
        `,
      )
      .run(payload.name, payload.isActive ? 1 : 0);

    id = Number(result.lastInsertRowid);
  }

  return getRooms(database).find((room) => room.id === id);
}

function parseScriptPayload(body) {
  const name = normalizeText(body?.name);
  const durationHours = Number(body?.durationHours);
  const maxParallelSessions = Number(body?.maxParallelSessions);
  const roles = normalizeList(body?.roles);

  if (!name) {
    return { error: validationError("请填写剧本名") };
  }

  if (!Number.isInteger(durationHours) || durationHours <= 0) {
    return { error: validationError("剧本时长必须是正整数小时") };
  }

  if (!Number.isInteger(maxParallelSessions) || maxParallelSessions <= 0) {
    return { error: validationError("最多开车数必须是正整数") };
  }

  if (roles.length === 0) {
    return { error: validationError("请至少填写一个角色") };
  }

  return {
    value: {
      name,
      durationHours,
      maxParallelSessions,
      roles,
      isActive: toBoolean(body?.isActive, true),
    },
  };
}

function parseDmPayload(body) {
  const name = normalizeText(body?.name);
  const roles = normalizeList(body?.roles);

  if (!name) {
    return { error: validationError("请填写 DM 名称") };
  }

  if (roles.length === 0) {
    return { error: validationError("请至少填写一个会的角色") };
  }

  return {
    value: {
      name,
      roles,
      isActive: toBoolean(body?.isActive, true),
    },
  };
}

function parseRoomPayload(body) {
  const name = normalizeText(body?.name);

  if (!name) {
    return { error: validationError("请填写房间名") };
  }

  return {
    value: {
      name,
      isActive: toBoolean(body?.isActive, true),
    },
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeList(value) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[,\n，、]/)
        .map((item) => item.trim());

  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function toBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 0 || value === "0" || value === "false") {
    return false;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  return fallback;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function recordExists(database, table, id) {
  return Boolean(database.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id));
}

function validationError(message) {
  return {
    error: "VALIDATION_ERROR",
    message,
  };
}

function handleDatabaseError(error, response) {
  if (error?.code === "ERR_SQLITE_CONSTRAINT_UNIQUE") {
    response.status(409).json({
      error: "DUPLICATE_RECORD",
      message: "名称已存在，请换一个",
    });
    return;
  }

  response.status(500).json({
    error: "INTERNAL_ERROR",
    message: "服务器处理失败",
  });
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
