import { openDatabase } from "../server/src/db/database.js";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? "admin123";
const viewerPassword = process.env.SMOKE_VIEWER_PASSWORD ?? "view123";
const unique = Date.now();
const lockTestMonth = `2099-${String((unique % 12) + 1).padStart(2, "0")}`;

const created = {
  scripts: [],
  dms: [],
  rooms: [],
  schedules: [],
};

async function main() {
  const health = await request("/api/health");

  assert(health.ok, "健康检查失败");

  const admin = await request("/api/auth/login", {
    method: "POST",
    body: {
      password: adminPassword,
    },
  });
  const viewer = await request("/api/auth/login", {
    method: "POST",
    body: {
      password: viewerPassword,
    },
  });

  assert(admin.role === "admin", "管理密码没有返回 admin 权限");
  assert(viewer.role === "viewer", "查看密码没有返回 viewer 权限");

  const adminHeaders = authHeaders(admin.token);
  const viewerHeaders = authHeaders(viewer.token);

  await expectHttpError(
    "/api/auth/login",
    {
      method: "POST",
      body: {
        password: `wrong-${unique}`,
      },
    },
    401,
  );

  const scriptA = await createScript(
    adminHeaders,
    "冒烟测试剧本A",
    [
      {
        name: "侦探",
        salaryYuan: 120,
      },
      {
        name: "凶手",
        salaryYuan: 80,
      },
    ],
    1,
    10,
  );
  const scriptB = await createScript(adminHeaders, "冒烟测试剧本B", ["侦探", "凶手"], 3, 4);
  const room1 = await createRoom(adminHeaders, "冒烟测试一号房");
  const room2 = await createRoom(adminHeaders, "冒烟测试二号房");
  const dm1 = await createDm(adminHeaders, "冒烟测试DM1", ["侦探"]);
  const dm2 = await createDm(adminHeaders, "冒烟测试DM2", ["凶手"]);
  const dm3 = await createDm(adminHeaders, "冒烟测试DM3", ["侦探"]);
  const dm4 = await createDm(adminHeaders, "冒烟测试DM4", ["凶手"]);
  const dm5 = await createDm(adminHeaders, "冒烟测试DM5", ["侦探"]);
  const dm6 = await createDm(adminHeaders, "冒烟测试DM6", ["凶手"]);

  const availability = await request("/api/admin/schedules/availability", {
    method: "POST",
    headers: adminHeaders,
    body: {
      scriptId: scriptA.id,
      roomId: room1.id,
      date: "2026-07-08",
      startTime: "10:00",
      assignments: [],
    },
  });

  assert(availability.endAt === "2026-07-08T20:00:00", "可用性接口结束时间计算错误");
  assert(
    availability.roomAvailableAt === "2026-07-08T20:10:00",
    "可用性接口房间清扫时间计算错误",
  );

  const firstSchedule = await createSchedule(adminHeaders, {
    scriptId: scriptA.id,
    roomId: room1.id,
    date: "2026-07-08",
    startTime: "10:00",
    note: "冒烟测试首场",
    assignments: [
      {
        roleName: "侦探",
        dmId: dm1.id,
      },
      {
        roleName: "凶手",
        dmId: dm2.id,
      },
    ],
  });

  assert(firstSchedule.businessDate === "2026-07-08", "工作日计算错误");
  assert(
    firstSchedule.roles.find((role) => role.roleName === "侦探")?.salaryCents === 12000,
    "排班没有保存侦探角色工资快照",
  );
  assert(
    firstSchedule.roles.find((role) => role.roleName === "凶手")?.salaryCents === 8000,
    "排班没有保存凶手角色工资快照",
  );

  const updatedSchedule = await request(`/api/admin/schedules/${firstSchedule.id}`, {
    method: "PUT",
    headers: adminHeaders,
    body: {
      scriptId: scriptA.id,
      roomId: room1.id,
      date: "2026-07-08",
      startTime: "10:00",
      note: "冒烟测试编辑自身",
      assignments: [
        {
          roleName: "侦探",
          dmId: dm1.id,
        },
        {
          roleName: "凶手",
          dmId: dm2.id,
        },
      ],
    },
  });

  assert(updatedSchedule.note === "冒烟测试编辑自身", "编辑排班失败");

  const pendingSchedule = await createSchedule(adminHeaders, {
    scriptId: scriptB.id,
    roomId: room2.id,
    date: "2026-07-12",
    startTime: "12:00",
    note: "冒烟测试待定DM和摇玩家",
    playersReady: false,
    assignments: [
      {
        roleName: "侦探",
        dmId: null,
      },
      {
        roleName: "凶手",
        dmId: null,
      },
    ],
  });

  assert(pendingSchedule.playersReady === false, "玩家未摇齐状态没有保存");
  assert(
    pendingSchedule.roles.every((role) => role.dmId === null && role.dmName === "DM 待定"),
    "DM 待定角色没有保存",
  );

  await expectConflict(
    "剧本最大车数限制",
    "/api/admin/schedules",
    {
      method: "POST",
      headers: adminHeaders,
      body: {
        scriptId: scriptA.id,
        roomId: room2.id,
        date: "2026-07-08",
        startTime: "11:00",
        assignments: [
          {
            roleName: "侦探",
            dmId: dm3.id,
          },
          {
            roleName: "凶手",
            dmId: dm4.id,
          },
        ],
      },
    },
    "SCRIPT_CAPACITY_CONFLICT",
  );

  await expectConflict(
    "房间清扫时间限制",
    "/api/admin/schedules",
    {
      method: "POST",
      headers: adminHeaders,
      body: {
        scriptId: scriptB.id,
        roomId: room1.id,
        date: "2026-07-08",
        startTime: "20:00",
        assignments: [
          {
            roleName: "侦探",
            dmId: dm3.id,
          },
          {
            roleName: "凶手",
            dmId: dm4.id,
          },
        ],
      },
    },
    "ROOM_TIME_CONFLICT",
  );

  await expectConflict(
    "DM 每日一车限制",
    "/api/admin/schedules",
    {
      method: "POST",
      headers: adminHeaders,
      body: {
        scriptId: scriptB.id,
        roomId: room2.id,
        date: "2026-07-08",
        startTime: "21:00",
        assignments: [
          {
            roleName: "侦探",
            dmId: dm1.id,
          },
          {
            roleName: "凶手",
            dmId: dm4.id,
          },
        ],
      },
    },
    "DM_DAILY_CONFLICT",
  );

  await expectConflict(
    "凌晨按前一工作日计算",
    "/api/admin/schedules",
    {
      method: "POST",
      headers: adminHeaders,
      body: {
        scriptId: scriptB.id,
        roomId: room2.id,
        date: "2026-07-09",
        startTime: "02:00",
        assignments: [
          {
            roleName: "侦探",
            dmId: dm1.id,
          },
          {
            roleName: "凶手",
            dmId: dm4.id,
          },
        ],
      },
    },
    "DM_DAILY_CONFLICT",
  );

  await expectConflict(
    "DM 角色不匹配限制",
    "/api/admin/schedules",
    {
      method: "POST",
      headers: adminHeaders,
      body: {
        scriptId: scriptB.id,
        roomId: room2.id,
        date: "2026-07-10",
        startTime: "12:00",
        assignments: [
          {
            roleName: "侦探",
            dmId: dm4.id,
          },
          {
            roleName: "凶手",
            dmId: dm6.id,
          },
        ],
      },
    },
    "DM_ROLE_MISMATCH",
  );

  await expectConflict(
    "同场重复角色限制",
    "/api/admin/schedules",
    {
      method: "POST",
      headers: adminHeaders,
      body: {
        scriptId: scriptB.id,
        roomId: room2.id,
        date: "2026-07-11",
        startTime: "12:00",
        assignments: [
          {
            roleName: "侦探",
            dmId: dm5.id,
          },
          {
            roleName: "侦探",
            dmId: dm6.id,
          },
        ],
      },
    },
    "ROLE_DUPLICATED_IN_SCHEDULE",
  );

  const viewerSchedules = await request("/api/schedules?from=2026-07-01&to=2026-08-01", {
    headers: viewerHeaders,
  });
  assert(
    viewerSchedules.some((schedule) => schedule.id === firstSchedule.id),
    "查看权限没有读取到排班",
  );

  const dmSummary = await request("/api/admin/reports/dm-summary?from=2026-07-01&to=2026-08-01", {
    headers: adminHeaders,
  });
  const dm1Summary = dmSummary.find((item) => item.id === dm1.id);
  const dm2Summary = dmSummary.find((item) => item.id === dm2.id);
  assert(dm1Summary?.total === 1, "DM 月统计没有统计到侦探 DM");
  assert(dm2Summary?.total === 1, "DM 月统计没有统计到凶手 DM");
  assert(dm1Summary?.totalSalaryCents === 12000, "DM 月统计没有统计侦探工资");
  assert(dm2Summary?.totalSalaryCents === 8000, "DM 月统计没有统计凶手工资");

  const excel = await request("/api/admin/reports/monthly.xlsx?from=2026-07-01&to=2026-08-01", {
    headers: adminHeaders,
    responseType: "buffer",
  });
  assert(excel.contentType.includes("spreadsheetml"), "Excel 导出响应类型错误");
  assert(excel.buffer.subarray(0, 2).toString("utf8") === "PK", "Excel 导出文件格式错误");

  const unlockedSalary = await request(`/api/admin/salary-lock?month=${lockTestMonth}`, {
    headers: adminHeaders,
  });
  assert(unlockedSalary.locked === false, "工资锁定初始状态错误");

  const lockedSalary = await request("/api/admin/salary-lock", {
    method: "POST",
    headers: adminHeaders,
    body: {
      month: lockTestMonth,
    },
  });
  assert(lockedSalary.locked === true, "工资锁定失败");

  const unlockedAgain = await request("/api/admin/salary-lock", {
    method: "DELETE",
    headers: adminHeaders,
    body: {
      month: lockTestMonth,
    },
  });
  assert(unlockedAgain.locked === false, "工资解锁失败");

  await expectHttpError(
    `/api/admin/schedules/${firstSchedule.id}`,
    {
      method: "DELETE",
      headers: viewerHeaders,
    },
    403,
  );

  await request(`/api/admin/schedules/${firstSchedule.id}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  created.schedules = created.schedules.filter((id) => id !== firstSchedule.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        checked: [
          "health",
          "auth",
          "admin config",
          "availability",
          "create schedule",
          "update schedule",
          "pending dm schedule",
          "players not ready status",
          "delete schedule",
          "script capacity conflict",
          "room cleaning conflict",
          "dm daily conflict",
          "business day starts at 08:00",
          "dm role mismatch",
          "duplicate role conflict",
          "viewer read",
          "viewer forbidden write",
          "dm monthly summary",
          "dm salary summary",
          "monthly excel export",
          "salary month lock",
        ],
      },
      null,
      2,
    ),
  );
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (options.responseType === "buffer") {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      const error = new Error("请求失败");
      error.status = response.status;
      throw error;
    }

    return {
      buffer,
      contentType: response.headers.get("content-type") ?? "",
    };
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(body?.message ?? "请求失败");
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function expectHttpError(path, options, status) {
  try {
    await request(path, options);
  } catch (error) {
    if (error.status === status) {
      return error.body;
    }

    throw error;
  }

  throw new Error(`接口应返回 ${status}：${path}`);
}

async function expectConflict(label, path, options, code) {
  const body = await expectHttpError(path, options, 409);
  const conflictCode = body?.conflicts?.[0]?.code ?? body?.error;

  assert(conflictCode === code, `${label} 返回错误代码不符：${conflictCode}`);
}

async function createScript(headers, name, roles, maxParallelSessions, durationHours) {
  const script = await request("/api/admin/scripts", {
    method: "POST",
    headers,
    body: {
      name: `${name}${unique}`,
      durationHours,
      maxParallelSessions,
      roles,
      isActive: true,
    },
  });

  created.scripts.push(script.id);
  return script;
}

async function createDm(headers, name, roles) {
  const dm = await request("/api/admin/dms", {
    method: "POST",
    headers,
    body: {
      name: `${name}${unique}`,
      roles,
      isActive: true,
    },
  });

  created.dms.push(dm.id);
  return dm;
}

async function createRoom(headers, name) {
  const room = await request("/api/admin/rooms", {
    method: "POST",
    headers,
    body: {
      name: `${name}${unique}`,
      isActive: true,
    },
  });

  created.rooms.push(room.id);
  return room;
}

async function createSchedule(headers, payload) {
  const schedule = await request("/api/admin/schedules", {
    method: "POST",
    headers,
    body: payload,
  });

  created.schedules.push(schedule.id);
  return schedule;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanup() {
  const database = openDatabase();

  try {
    for (const id of created.schedules) {
      database.prepare("DELETE FROM schedules WHERE id = ?").run(id);
    }

    for (const id of created.scripts) {
      database.prepare("DELETE FROM script_roles WHERE script_id = ?").run(id);
      database.prepare("DELETE FROM scripts WHERE id = ?").run(id);
    }

    for (const id of created.dms) {
      database.prepare("DELETE FROM dm_roles WHERE dm_id = ?").run(id);
      database.prepare("DELETE FROM dms WHERE id = ?").run(id);
    }

    for (const id of created.rooms) {
      database.prepare("DELETE FROM rooms WHERE id = ?").run(id);
    }
  } finally {
    database.close();
  }
}

try {
  await main();
} finally {
  cleanup();
}
