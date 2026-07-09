import { FormEvent, StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  DoorOpen,
  Edit3,
  Eye,
  KeyRound,
  LogOut,
  MapPin,
  Moon,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import "./styles.css";

type Role = "admin" | "viewer";
type ConfigTab = "scripts" | "dms" | "rooms";
type Theme = "light" | "dark";

type Session = {
  role: Role;
  token: string;
};

type ScriptRole = {
  id: number;
  scriptId: number;
  name: string;
  salaryCents: number;
  sortOrder: number;
};

type Script = {
  id: number;
  name: string;
  durationHours: number;
  maxParallelSessions: number;
  isActive: boolean;
  roles: ScriptRole[];
};

type DmRole = {
  id: number;
  dmId: number;
  roleName: string;
};

type Dm = {
  id: number;
  name: string;
  isActive: boolean;
  roles: DmRole[];
};

type Room = {
  id: number;
  name: string;
  isActive: boolean;
};

type ScheduleRole = {
  id: number;
  scheduleId: number;
  roleName: string;
  dmId: number | null;
  dmName: string;
  salaryCents: number;
  sortOrder: number;
};

type Schedule = {
  id: number;
  scriptId: number;
  scriptName: string;
  roomId: number;
  roomName: string;
  startAt: string;
  endAt: string;
  roomAvailableAt: string;
  businessDate: string;
  playersReady: boolean;
  note: string;
  roles: ScheduleRole[];
};

type AvailabilityRoom = {
  id: number;
  name: string;
  isActive: boolean;
  available: boolean;
  reason: string;
};

type AvailabilityDm = {
  id: number;
  name: string;
  isActive: boolean;
  available: boolean;
  selectedInPayload: boolean;
  reason: string;
};

type Availability = {
  startAt: string;
  endAt: string;
  roomAvailableAt: string;
  businessDate: string;
  playersReady: boolean;
  conflicts: Array<{ code: string; message: string }>;
  rooms: AvailabilityRoom[];
  dms: AvailabilityDm[];
};

type ScheduleFormState = {
  id?: number;
  date: string;
  scriptId: string;
  startTime: string;
  roomId: string;
  playersReady: boolean;
  note: string;
  assignments: Record<string, string>;
};

type ScheduleChange = {
  label: string;
  before: string;
  after: string;
};

type DmMonthlySummary = {
  id: number;
  name: string;
  isActive: boolean;
  total: number;
  totalSalaryCents: number;
  details: Array<{
    scheduleId: number;
    scriptName: string;
    roomName: string;
    startAt: string;
    endAt: string;
    businessDate: string;
    roleName: string;
    salaryCents: number;
  }>;
};

type ScriptRoleForm = {
  name: string;
  salaryYuan: string;
};

type ScriptFormState = {
  id?: number;
  name: string;
  durationHours: string;
  maxParallelSessions: string;
  roles: ScriptRoleForm[];
  isActive: boolean;
};

type DmFormState = {
  id?: number;
  name: string;
  rolesText: string;
  isActive: boolean;
};

type RoomFormState = {
  id?: number;
  name: string;
  isActive: boolean;
};

const sessionStorageKey = "scheduler-session";
const themeStorageKey = "scheduler-theme";
const pendingDmValue = "pending";

const emptyScriptForm: ScriptFormState = {
  name: "",
  durationHours: "6",
  maxParallelSessions: "1",
  roles: [{ name: "", salaryYuan: "0" }],
  isActive: true,
};

const emptyDmForm: DmFormState = {
  name: "",
  rolesText: "",
  isActive: true,
};

const emptyRoomForm: RoomFormState = {
  name: "",
  isActive: true,
};

function App() {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());
  const [checkingSession, setCheckingSession] = useState(Boolean(session));
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!session) {
      setCheckingSession(false);
      return;
    }

    let isCurrent = true;

    getCurrentUser(session.token)
      .then((role) => {
        if (isCurrent) {
          setSession({ ...session, role });
        }
      })
      .catch(() => {
        if (isCurrent) {
          clearStoredSession();
          setSession(null);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setCheckingSession(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  if (checkingSession) {
    return (
      <main className="app-shell">
        <div className="auth-actions">
          <ThemeToggle theme={theme} onToggle={() => setTheme(toggleTheme(theme))} />
        </div>
        <section className="login-panel">
          <p className="eyebrow">剧本杀排班系统</p>
          <h1>正在进入</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="app-shell auth-shell">
        <div className="auth-actions">
          <ThemeToggle theme={theme} onToggle={() => setTheme(toggleTheme(theme))} />
        </div>
        <LoginView onLogin={setSession} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-group">
          <div className="brand-mark" aria-hidden="true">
            <CalendarDays size={28} />
          </div>
          <div>
            <p className="eyebrow">剧本杀排班系统</p>
            <h1>排班工作台</h1>
          </div>
        </div>
        <div className="session-actions">
          <ThemeToggle theme={theme} onToggle={() => setTheme(toggleTheme(theme))} />
          <span className="role-badge">
            {session.role === "admin" ? <ShieldCheck size={16} /> : <Eye size={16} />}
            {session.role === "admin" ? "管理权限" : "查看权限"}
          </span>
          <button
            className="icon-button"
            type="button"
            title="退出登录"
            aria-label="退出登录"
            onClick={() => {
              clearStoredSession();
              setSession(null);
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <Dashboard session={session} />
    </main>
  );
}

function ThemeToggle({ onToggle, theme }: { onToggle: () => void; theme: Theme }) {
  const isDark = theme === "dark";

  return (
    <button
      className="icon-button"
      type="button"
      title={isDark ? "切换到日间模式" : "切换到夜间模式"}
      aria-label={isDark ? "切换到日间模式" : "切换到夜间模式"}
      onClick={onToggle}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function LoginView({ onLogin }: { onLogin: (session: Session) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const nextSession = await login(password);
      storeSession(nextSession);
      onLogin(nextSession);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-panel">
      <div className="brand-mark" aria-hidden="true">
        <KeyRound size={28} />
      </div>
      <p className="eyebrow">剧本杀排班系统</p>
      <h1>输入访问密码</h1>
      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="password">密码</label>
        <input
          id="password"
          autoComplete="current-password"
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="请输入密码"
        />
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={submitting || !password} type="submit">
          {submitting ? "登录中" : "进入系统"}
        </button>
      </form>
    </section>
  );
}

function Dashboard({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<ConfigTab>("scripts");

  return (
    <section className="workspace-grid">
      <CalendarPanel canManage={session.role === "admin"} token={session.token} />
      {session.role === "admin" ? (
        <aside className="workspace-panel side-panel">
          <div className="panel-title">
            <Settings size={20} />
            <h2>后台配置</h2>
          </div>
          <div className="admin-menu" role="tablist" aria-label="后台配置">
            <button
              className={activeTab === "scripts" ? "active" : ""}
              type="button"
              onClick={() => setActiveTab("scripts")}
            >
              剧本管理
            </button>
            <button
              className={activeTab === "dms" ? "active" : ""}
              type="button"
              onClick={() => setActiveTab("dms")}
            >
              DM 管理
            </button>
            <button
              className={activeTab === "rooms" ? "active" : ""}
              type="button"
              onClick={() => setActiveTab("rooms")}
            >
              房间管理
            </button>
          </div>
          <AdminConfig token={session.token} activeTab={activeTab} />
        </aside>
      ) : (
        <aside className="workspace-panel side-panel">
          <div className="panel-title">
            <DoorOpen size={20} />
            <h2>查看模式</h2>
          </div>
          <p className="muted">当前账号仅可查看排班。</p>
        </aside>
      )}
    </section>
  );
}

function CalendarPanel({ canManage, token }: { canManage: boolean; token: string }) {
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateOnly(new Date()));
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [dmSummary, setDmSummary] = useState<DmMonthlySummary[]>([]);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const monthLabel = `${monthStart.getFullYear()}年${monthStart.getMonth() + 1}月`;
  const monthFrom = toDateOnly(monthStart);
  const monthTo = toDateOnly(addMonths(monthStart, 1));
  const calendarDays = useMemo(() => getCalendarDays(monthStart), [monthStart]);
  const schedulesByDate = useMemo(() => groupSchedulesByDate(schedules), [schedules]);
  const selectedSchedules = schedulesByDate.get(selectedDate) ?? [];
  const pendingDmSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.roles.some((role) => role.dmId === null)),
    [schedules],
  );
  const playersNotReadySchedules = useMemo(
    () => schedules.filter((schedule) => !schedule.playersReady),
    [schedules],
  );

  useEffect(() => {
    loadMonthData();
  }, [monthFrom, monthTo, token, canManage]);

  async function loadMonthData() {
    await Promise.all([loadSchedules(), canManage ? loadDmSummary() : Promise.resolve()]);
  }

  async function loadSchedules() {
    setLoading(true);
    setError("");

    try {
      const result = await apiFetch<Schedule[]>(
        `/api/schedules?from=${monthFrom}&to=${monthTo}`,
        { token },
      );
      setSchedules(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "排班加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadDmSummary() {
    try {
      const result = await apiFetch<DmMonthlySummary[]>(
        `/api/admin/reports/dm-summary?from=${monthFrom}&to=${monthTo}`,
        { token },
      );
      setDmSummary(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "DM 统计加载失败");
    }
  }

  async function exportMonthlyExcel() {
    setExporting(true);
    setError("");

    try {
      await downloadFile({
        token,
        url: `/api/admin/reports/monthly.xlsx?from=${monthFrom}&to=${monthTo}`,
        filename: `剧本杀排班-${monthFrom.slice(0, 7)}.xlsx`,
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  function moveMonth(offset: number) {
    const nextMonth = addMonths(monthStart, offset);
    setMonthStart(nextMonth);
    setSelectedDate(toDateOnly(nextMonth));
  }

  function goToday() {
    const today = new Date();
    setMonthStart(startOfMonth(today));
    setSelectedDate(toDateOnly(today));
  }

  async function deleteSchedule(schedule: Schedule) {
    if (!window.confirm(`确认删除《${schedule.scriptName}》这场排班吗？`)) {
      return;
    }

    setError("");

    try {
      await apiFetch<{ ok: boolean }>(`/api/admin/schedules/${schedule.id}`, {
        token,
        method: "DELETE",
      });
      await loadMonthData();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "删除失败");
    }
  }

  return (
    <article className="workspace-panel main-panel calendar-panel">
      <div className="calendar-head">
        <div className="panel-title">
          <CalendarDays size={20} />
          <h2>日历排班</h2>
        </div>
        <div className="calendar-actions">
          {canManage ? (
            <button
              className="primary-button compact-button"
              type="button"
              onClick={() => setCreatingDate(selectedDate)}
            >
              <Plus size={16} />
              新增
            </button>
          ) : null}
          {canManage ? (
            <button
              className="ghost-button"
              type="button"
              onClick={exportMonthlyExcel}
              disabled={exporting}
            >
              <Download size={16} />
              {exporting ? "导出中" : "导出 Excel"}
            </button>
          ) : null}
          <button
            className="icon-button"
            type="button"
            title="上个月"
            aria-label="上个月"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button className="ghost-button" type="button" onClick={goToday}>
            今天
          </button>
          <button
            className="icon-button"
            type="button"
            title="下个月"
            aria-label="下个月"
            onClick={() => moveMonth(1)}
          >
            <ChevronRight size={18} />
          </button>
          <button className="ghost-button" type="button" onClick={loadMonthData} disabled={loading}>
            <RefreshCcw size={16} />
            刷新
          </button>
        </div>
      </div>
      <div className="month-title">
        <strong>{monthLabel}</strong>
        <span>{loading ? "加载中" : `${schedules.length} 场`}</span>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="calendar-content-grid">
        <div className="calendar-core">
          <div className="calendar-grid" aria-label={`${monthLabel}排班`}>
            {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => (
              <div className="weekday" key={weekday}>
                {weekday}
              </div>
            ))}
            {calendarDays.map((date) => {
              const dateKey = toDateOnly(date);
              const daySchedules = schedulesByDate.get(dateKey) ?? [];
              const isCurrentMonth = date.getMonth() === monthStart.getMonth();
              const isSelected = selectedDate === dateKey;
              const isToday = dateKey === toDateOnly(new Date());

              return (
                <button
                  className={[
                    "calendar-day",
                    isCurrentMonth ? "" : "muted-day",
                    isSelected ? "selected" : "",
                    isToday ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDate(dateKey)}
                >
                  <span className="day-number">{date.getDate()}</span>
                  <div className="day-events">
                    {daySchedules.slice(0, 3).map((schedule) => (
                      <span className="day-event" key={schedule.id}>
                        {formatTime(schedule.startAt)} {schedule.scriptName}
                      </span>
                    ))}
                    {daySchedules.length > 3 ? (
                      <span className="day-more">+{daySchedules.length - 3} 场</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          <section className="day-detail">
            <div className="day-detail-head">
              <h3>{formatDateLabel(selectedDate)}</h3>
              <span>{selectedSchedules.length} 场</span>
            </div>
            {selectedSchedules.length ? (
              <div className="schedule-list">
                {selectedSchedules.map((schedule) => (
                  <ScheduleCard
                    canManage={canManage}
                    key={schedule.id}
                    schedule={schedule}
                    onDelete={() => deleteSchedule(schedule)}
                    onEdit={() => setEditingSchedule(schedule)}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-list">当天暂无排班</p>
            )}
          </section>
          {canManage ? <DmSummaryPanel items={dmSummary} monthLabel={monthLabel} /> : null}
        </div>
        <ReminderPanel
          monthLabel={monthLabel}
          pendingDmSchedules={pendingDmSchedules}
          playersNotReadySchedules={playersNotReadySchedules}
        />
      </div>
      {canManage && (creatingDate || editingSchedule) ? (
        <ScheduleModal
          initialDate={creatingDate ?? selectedDate}
          schedule={editingSchedule}
          token={token}
          onClose={() => {
            setCreatingDate(null);
            setEditingSchedule(null);
          }}
          onSaved={async () => {
            setCreatingDate(null);
            setEditingSchedule(null);
            await loadMonthData();
          }}
        />
      ) : null}
    </article>
  );
}

function DmSummaryPanel({ items, monthLabel }: { items: DmMonthlySummary[]; monthLabel: string }) {
  const activeItems = items.filter((item) => item.total > 0 || item.isActive);

  return (
    <section className="dm-summary-panel">
      <div className="day-detail-head">
        <h3>DM 月统计</h3>
        <span>{monthLabel}</span>
      </div>
      {activeItems.length ? (
        <div className="dm-summary-list">
          {activeItems.map((item) => (
            <article className="dm-summary-card" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.isActive ? "在职" : "停用"}</span>
              </div>
              <b>{item.total} 车</b>
              <strong className="salary-total">工资 {formatMoney(item.totalSalaryCents)}</strong>
              {item.details.length ? (
                <p>
                  {item.details
                    .slice(0, 4)
                    .map(
                      (detail) =>
                        `${detail.startAt.slice(5, 10)} ${formatTime(detail.startAt)} ${detail.scriptName} ${detail.roleName} ${formatMoney(detail.salaryCents)}`,
                    )
                    .join("；")}
                  {item.details.length > 4 ? `；另 ${item.details.length - 4} 场` : ""}
                </p>
              ) : (
                <p>本月暂无排班</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-list">暂无 DM 统计</p>
      )}
    </section>
  );
}

function ReminderPanel({
  monthLabel,
  pendingDmSchedules,
  playersNotReadySchedules,
}: {
  monthLabel: string;
  pendingDmSchedules: Schedule[];
  playersNotReadySchedules: Schedule[];
}) {
  const hasReminders = pendingDmSchedules.length > 0 || playersNotReadySchedules.length > 0;

  return (
    <aside className="reminder-panel">
      <div className="panel-title">
        <AlertTriangle size={20} />
        <h2>本月待办</h2>
      </div>
      <p className="reminder-month">{monthLabel}</p>
      {hasReminders ? (
        <div className="reminder-list">
          <ReminderSection
            emptyText="没有 DM 待定的车次"
            icon={<AlertTriangle size={16} />}
            items={pendingDmSchedules}
            title="DM 待定"
            renderDetail={(schedule) =>
              schedule.roles
                .filter((role) => role.dmId === null)
                .map((role) => role.roleName)
                .join("、")
            }
          />
          <ReminderSection
            emptyText="没有需要摇玩家的车次"
            icon={<UsersRound size={16} />}
            items={playersNotReadySchedules}
            title="需要摇玩家"
            renderDetail={() => "玩家未摇齐"}
          />
        </div>
      ) : (
        <p className="empty-list">本月暂时没有待办</p>
      )}
    </aside>
  );
}

function ReminderSection({
  emptyText,
  icon,
  items,
  renderDetail,
  title,
}: {
  emptyText: string;
  icon: React.ReactNode;
  items: Schedule[];
  renderDetail: (schedule: Schedule) => string;
  title: string;
}) {
  return (
    <section className="reminder-section">
      <div className="reminder-section-head">
        <span>
          {icon}
          {title}
        </span>
        <b>{items.length}</b>
      </div>
      {items.length ? (
        <div className="reminder-items">
          {items.map((schedule) => (
            <article className="reminder-item" key={`${title}-${schedule.id}`}>
              <strong>{schedule.scriptName}</strong>
              <span>
                {schedule.startAt.slice(5, 10)} {formatTime(schedule.startAt)} · {schedule.roomName}
              </span>
              <em>{renderDetail(schedule)}</em>
            </article>
          ))}
        </div>
      ) : (
        <p className="reminder-empty">{emptyText}</p>
      )}
    </section>
  );
}

function ScheduleCard({
  canManage,
  onDelete,
  onEdit,
  schedule,
}: {
  canManage: boolean;
  onDelete: () => void;
  onEdit: () => void;
  schedule: Schedule;
}) {
  const [copied, setCopied] = useState(false);

  async function copySchedule() {
    try {
      await copyText(copyScheduleText(schedule));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.alert("复制失败，请稍后重试");
    }
  }

  return (
    <article className="schedule-card">
      <div className="schedule-card-head">
        <strong>{schedule.scriptName}</strong>
        <div className="schedule-card-actions">
          <span>{schedule.businessDate}</span>
          <button
            className="icon-button small-icon-button"
            type="button"
            title={copied ? "已复制" : "复制排班信息"}
            aria-label={copied ? "已复制" : "复制排班信息"}
            onClick={copySchedule}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          {canManage ? (
            <>
              <button
                className="icon-button small-icon-button"
                type="button"
                title="编辑排班"
                aria-label="编辑排班"
                onClick={onEdit}
              >
                <Edit3 size={15} />
              </button>
              <button
                className="icon-button small-icon-button danger-icon-button"
                type="button"
                title="删除排班"
                aria-label="删除排班"
                onClick={onDelete}
              >
                <Trash2 size={15} />
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="schedule-meta">
        <span>
          <Clock size={14} />
          {formatTime(schedule.startAt)} - {formatTime(schedule.endAt)}
        </span>
        <span>
          <MapPin size={14} />
          {schedule.roomName}
        </span>
        {!schedule.playersReady ? (
          <span className="warning-meta">
            <UsersRound size={14} />
            需摇玩家
          </span>
        ) : null}
        {schedule.roles.some((role) => role.dmId === null) ? (
          <span className="warning-meta">
            <AlertTriangle size={14} />
            DM 待定
          </span>
        ) : null}
      </div>
      <div className="role-grid">
        {schedule.roles.map((role) => (
          <span className={role.dmId === null ? "pending-role" : ""} key={role.id}>
            {role.roleName}：{role.dmName}
            {canManage && role.dmId !== null ? `（${formatMoney(role.salaryCents)}）` : ""}
          </span>
        ))}
      </div>
      {schedule.note ? <p className="schedule-note">{schedule.note}</p> : null}
    </article>
  );
}

function ScheduleModal({
  initialDate,
  onClose,
  onSaved,
  schedule,
  token,
}: {
  initialDate: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  schedule: Schedule | null;
  token: string;
}) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [dms, setDms] = useState<Dm[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState<ScheduleFormState>(() =>
    schedule ? formFromSchedule(schedule) : createEmptyScheduleForm(initialDate),
  );
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<ScheduleChange[] | null>(null);
  const [error, setError] = useState("");

  const selectedScript = scripts.find((script) => String(script.id) === form.scriptId);
  const selectedRoom = rooms.find((room) => String(room.id) === form.roomId);
  const roleNames = selectedScript?.roles.map((role) => role.name) ?? [];
  const rolesByName = new Map(selectedScript?.roles.map((role) => [role.name, role]) ?? []);
  const assignedDmIds = new Set(
    Object.values(form.assignments).filter((value) => value && value !== pendingDmValue),
  );
  const availabilityRooms = new Map(availability?.rooms.map((room) => [room.id, room]) ?? []);
  const availabilityDms = new Map(availability?.dms.map((dm) => [dm.id, dm]) ?? []);
  const missingSetupMessages = [
    scripts.length ? "" : "请先在右侧后台配置里添加剧本",
    rooms.length ? "" : "请先在右侧后台配置里添加房间",
  ].filter(Boolean);
  const canSaveSchedule =
    !saving &&
    !loadingConfig &&
    Boolean(selectedScript) &&
    Boolean(selectedRoom) &&
    roleNames.length > 0 &&
    roleNames.every((roleName) => form.assignments[roleName]);

  useEffect(() => {
    let isCurrent = true;

    async function loadConfig() {
      setLoadingConfig(true);
      setError("");

      try {
        const [nextScripts, nextDms, nextRooms] = await Promise.all([
          apiFetch<Script[]>("/api/admin/scripts", { token }),
          apiFetch<Dm[]>("/api/admin/dms", { token }),
          apiFetch<Room[]>("/api/admin/rooms", { token }),
        ]);

        if (!isCurrent) {
          return;
        }

        setScripts(nextScripts);
        setDms(nextDms);
        setRooms(nextRooms);

        setForm((current) => ({
          ...current,
          scriptId: current.scriptId || String(nextScripts.find((item) => item.isActive)?.id ?? ""),
          roomId: current.roomId || String(nextRooms.find((item) => item.isActive)?.id ?? ""),
        }));
      } catch (caughtError) {
        if (isCurrent) {
          setError(caughtError instanceof Error ? caughtError.message : "配置加载失败");
        }
      } finally {
        if (isCurrent) {
          setLoadingConfig(false);
        }
      }
    }

    loadConfig();

    return () => {
      isCurrent = false;
    };
  }, [token]);

  useEffect(() => {
    if (!selectedScript) {
      return;
    }

    setForm((current) => {
      const nextAssignments: Record<string, string> = {};

      for (const role of selectedScript.roles) {
        nextAssignments[role.name] = current.assignments[role.name] ?? "";
      }

      return {
        ...current,
        assignments: nextAssignments,
      };
    });
  }, [selectedScript?.id]);

  useEffect(() => {
    if (!form.scriptId || !form.roomId || !form.date || !form.startTime) {
      setAvailability(null);
      return;
    }

    let isCurrent = true;

    async function checkAvailability() {
      setCheckingAvailability(true);

      try {
        const result = await apiFetch<Availability>("/api/admin/schedules/availability", {
          token,
          method: "POST",
          body: buildSchedulePayload(form, schedule?.id),
        });

        if (isCurrent) {
          setAvailability(result);
        }
      } catch (caughtError) {
        if (isCurrent) {
          setAvailability(null);
          setError(caughtError instanceof Error ? caughtError.message : "可用性检查失败");
        }
      } finally {
        if (isCurrent) {
          setCheckingAvailability(false);
        }
      }
    }

    checkAvailability();

    return () => {
      isCurrent = false;
    };
  }, [form.scriptId, form.roomId, form.date, form.startTime, JSON.stringify(form.assignments), token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (schedule) {
      const changes = getScheduleChanges(schedule, form, scripts, rooms, dms);

      if (changes.length > 0) {
        setPendingChanges(changes);
        return;
      }
    }

    await saveSchedule();
  }

  async function saveSchedule() {
    setSaving(true);

    try {
      await apiFetch<Schedule>(`/api/admin/schedules${form.id ? `/${form.id}` : ""}`, {
        token,
        method: form.id ? "PUT" : "POST",
        body: buildSchedulePayload(form),
      });
      await onSaved();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存排班失败");
    } finally {
      setSaving(false);
      setPendingChanges(null);
    }
  }

  function updateScript(scriptId: string) {
    const nextScript = scripts.find((script) => String(script.id) === scriptId);
    const nextAssignments: Record<string, string> = {};

    for (const role of nextScript?.roles ?? []) {
      nextAssignments[role.name] = form.assignments[role.name] ?? "";
    }

    setForm({
      ...form,
      scriptId,
      assignments: nextAssignments,
    });
  }

  function updateAssignment(roleName: string, dmId: string) {
    setForm({
      ...form,
      assignments: {
        ...form.assignments,
        [roleName]: dmId,
      },
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label="排班表单">
        <div className="modal-head">
          <div>
            <p className="eyebrow">{form.id ? "编辑排班" : "新增排班"}</p>
            <h2>{selectedScript?.name ?? "选择剧本"}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {missingSetupMessages.length ? (
          <div className="setup-warning">
            {missingSetupMessages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        ) : null}
        <form className="schedule-form" onSubmit={handleSubmit}>
          <div className="form-row three-columns">
            <label>
              日期
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </label>
            <label>
              开场时间
              <select
                value={form.startTime}
                onChange={(event) => setForm({ ...form, startTime: event.target.value })}
              >
                {getHalfHourOptions().map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>
            <label>
              剧本
              <select
                disabled={loadingConfig || !scripts.length}
                value={form.scriptId}
                onChange={(event) => updateScript(event.target.value)}
              >
                <option value="">{scripts.length ? "请选择" : "暂无剧本，请先添加"}</option>
                {scripts.map((script) => (
                  <option
                    disabled={!script.isActive && String(script.id) !== form.scriptId}
                    key={script.id}
                    value={script.id}
                  >
                    {script.name}
                    {script.isActive ? "" : "（停用）"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              房间
              <select
                disabled={!rooms.length}
                value={form.roomId}
                onChange={(event) => setForm({ ...form, roomId: event.target.value })}
              >
                <option value="">{rooms.length ? "请选择" : "暂无房间，请先添加"}</option>
                {rooms.map((room) => {
                  const optionState = availabilityRooms.get(room.id);
                  const disabled =
                    (!room.isActive || optionState?.available === false) &&
                    String(room.id) !== form.roomId;

                  return (
                    <option disabled={disabled} key={room.id} value={room.id}>
                      {room.name}
                      {getOptionReason(room.isActive, optionState?.available, optionState?.reason)}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="computed-time">
              <span>结束时间</span>
              <strong>{availability ? formatTime(availability.endAt) : "--:--"}</strong>
              <small>
                房间占用至 {availability ? formatTime(availability.roomAvailableAt) : "--:--"}
              </small>
            </div>
          </div>
          <label className="player-ready-field">
            玩家是否摇齐
            <select
              value={form.playersReady ? "yes" : "no"}
              onChange={(event) =>
                setForm({ ...form, playersReady: event.target.value === "yes" })
              }
            >
              <option value="yes">是，玩家已摇齐</option>
              <option value="no">否，需要继续摇玩家</option>
            </select>
          </label>
          <div className="assignment-panel">
            <div className="assignment-head">
              <h3>角色 DM</h3>
              <span>{checkingAvailability ? "检查中" : `${roleNames.length} 个角色`}</span>
            </div>
            {roleNames.length ? (
              <div className="assignment-grid">
                {roleNames.map((roleName) => (
                  <label key={roleName}>
                    <span className="assignment-label">
                      {roleName}
                      <small>{formatMoney(rolesByName.get(roleName)?.salaryCents ?? 0)}</small>
                    </span>
                    <select
                      value={form.assignments[roleName] ?? ""}
                      onChange={(event) => updateAssignment(roleName, event.target.value)}
                    >
                      <option value="">请选择 DM</option>
                      <option value={pendingDmValue}>DM 待定</option>
                      {dms.map((dm) => {
                        const selectedByOtherRole =
                          assignedDmIds.has(String(dm.id)) &&
                          form.assignments[roleName] !== String(dm.id);
                        const dmState = availabilityDms.get(dm.id);
                        const canPlayRole = dm.roles.some((role) => role.roleName === roleName);
                        const disabled =
                          !dm.isActive ||
                          !canPlayRole ||
                          selectedByOtherRole ||
                          dmState?.available === false;

                        return (
                          <option disabled={disabled} key={dm.id} value={dm.id}>
                            {dm.name}
                            {getDmOptionReason({
                              canPlayRole,
                              dm,
                              dmState,
                              selectedByOtherRole,
                            })}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <p className="empty-list">
                {scripts.length ? "请先选择剧本" : "请先在后台配置里添加剧本和角色"}
              </p>
            )}
            {roleNames.length && !dms.length ? (
              <p className="empty-list">暂无 DM，可先选择 DM 待定</p>
            ) : null}
          </div>
          <label>
            备注
            <textarea
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="客户昵称、人数、电话、特殊要求等"
            />
          </label>
          {availability?.conflicts.length ? (
            <div className="conflict-list">
              {availability.conflicts.map((conflict) => (
                <p key={`${conflict.code}-${conflict.message}`}>{conflict.message}</p>
              ))}
            </div>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" disabled={!canSaveSchedule} type="submit">
              <Save size={16} />
              {saving ? "保存中" : "保存排班"}
            </button>
          </div>
        </form>
      </section>
      {pendingChanges ? (
        <ChangeConfirmDialog
          changes={pendingChanges}
          saving={saving}
          onCancel={() => setPendingChanges(null)}
          onConfirm={saveSchedule}
        />
      ) : null}
    </div>
  );
}

function ChangeConfirmDialog({
  changes,
  onCancel,
  onConfirm,
  saving,
}: {
  changes: ScheduleChange[];
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <div className="confirm-backdrop" role="presentation">
      <section className="confirm-panel" role="dialog" aria-modal="true" aria-label="确认保存修改">
        <div className="confirm-head">
          <div className="brand-mark small-brand-mark" aria-hidden="true">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="eyebrow">保存前确认</p>
            <h2>本次修改了 {changes.length} 项关键内容</h2>
          </div>
        </div>
        <div className="change-list">
          {changes.map((change) => (
            <article className="change-item" key={change.label}>
              <strong>{change.label}</strong>
              <div>
                <span>原来</span>
                <p>{change.before || "无"}</p>
              </div>
              <div>
                <span>改为</span>
                <p>{change.after || "无"}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel} disabled={saving}>
            返回检查
          </button>
          <button className="primary-button" type="button" onClick={onConfirm} disabled={saving}>
            <Save size={16} />
            {saving ? "保存中" : "确认保存"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminConfig({ token, activeTab }: { token: string; activeTab: ConfigTab }) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [dms, setDms] = useState<Dm[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scriptForm, setScriptForm] = useState<ScriptFormState>(emptyScriptForm);
  const [dmForm, setDmForm] = useState<DmFormState>(emptyDmForm);
  const [roomForm, setRoomForm] = useState<RoomFormState>(emptyRoomForm);

  const allScriptRoleNames = useMemo(() => {
    return Array.from(
      new Set(
        scripts
          .flatMap((script) => script.roles.map((role) => role.name))
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [scripts]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [nextScripts, nextDms, nextRooms] = await Promise.all([
        apiFetch<Script[]>("/api/admin/scripts", { token }),
        apiFetch<Dm[]>("/api/admin/dms", { token }),
        apiFetch<Room[]>("/api/admin/rooms", { token }),
      ]);
      setScripts(nextScripts);
      setDms(nextDms);
      setRooms(nextRooms);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      await apiFetch<Script>(`/api/admin/scripts${scriptForm.id ? `/${scriptForm.id}` : ""}`, {
        token,
        method: scriptForm.id ? "PUT" : "POST",
        body: {
          name: scriptForm.name,
          durationHours: Number(scriptForm.durationHours),
          maxParallelSessions: Number(scriptForm.maxParallelSessions),
          roles: normalizeScriptRoleForms(scriptForm.roles),
          isActive: scriptForm.isActive,
        },
      });
      setScriptForm(emptyScriptForm);
      setMessage("剧本已保存");
      await loadAll();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存失败");
    }
  }

  async function saveDm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      await apiFetch<Dm>(`/api/admin/dms${dmForm.id ? `/${dmForm.id}` : ""}`, {
        token,
        method: dmForm.id ? "PUT" : "POST",
        body: {
          name: dmForm.name,
          roles: splitTextList(dmForm.rolesText),
          isActive: dmForm.isActive,
        },
      });
      setDmForm(emptyDmForm);
      setMessage("DM 已保存");
      await loadAll();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存失败");
    }
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      await apiFetch<Room>(`/api/admin/rooms${roomForm.id ? `/${roomForm.id}` : ""}`, {
        token,
        method: roomForm.id ? "PUT" : "POST",
        body: roomForm,
      });
      setRoomForm(emptyRoomForm);
      setMessage("房间已保存");
      await loadAll();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存失败");
    }
  }

  return (
    <div className="config-panel">
      <div className="config-toolbar">
        <button className="ghost-button" type="button" onClick={loadAll} disabled={loading}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      {activeTab === "scripts" ? (
        <ScriptConfig
          form={scriptForm}
          scripts={scripts}
          loading={loading}
          onChange={setScriptForm}
          onSubmit={saveScript}
        />
      ) : null}
      {activeTab === "dms" ? (
        <DmConfig
          form={dmForm}
          dms={dms}
          loading={loading}
          scriptRoleNames={allScriptRoleNames}
          onChange={setDmForm}
          onSubmit={saveDm}
        />
      ) : null}
      {activeTab === "rooms" ? (
        <RoomConfig
          form={roomForm}
          rooms={rooms}
          loading={loading}
          onChange={setRoomForm}
          onSubmit={saveRoom}
        />
      ) : null}
    </div>
  );
}

function ScriptConfig({
  form,
  scripts,
  loading,
  onChange,
  onSubmit,
}: {
  form: ScriptFormState;
  scripts: Script[];
  loading: boolean;
  onChange: (form: ScriptFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function updateRole(index: number, patch: Partial<ScriptRoleForm>) {
    onChange({
      ...form,
      roles: form.roles.map((role, roleIndex) =>
        roleIndex === index ? { ...role, ...patch } : role,
      ),
    });
  }

  function addRole() {
    onChange({
      ...form,
      roles: [...form.roles, { name: "", salaryYuan: "0" }],
    });
  }

  function removeRole(index: number) {
    const nextRoles = form.roles.filter((_role, roleIndex) => roleIndex !== index);

    onChange({
      ...form,
      roles: nextRoles.length ? nextRoles : [{ name: "", salaryYuan: "0" }],
    });
  }

  return (
    <>
      <form className="config-form" onSubmit={onSubmit}>
        <h3>{form.id ? "编辑剧本" : "新增剧本"}</h3>
        <label>
          剧本名
          <input
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="例如：长安夜雨"
          />
        </label>
        <div className="form-row">
          <label>
            时长
            <input
              min="1"
              step="1"
              type="number"
              value={form.durationHours}
              onChange={(event) => onChange({ ...form, durationHours: event.target.value })}
            />
          </label>
          <label>
            最多车数
            <input
              min="1"
              step="1"
              type="number"
              value={form.maxParallelSessions}
              onChange={(event) =>
                onChange({ ...form, maxParallelSessions: event.target.value })
              }
            />
          </label>
        </div>
        <div className="role-salary-editor">
          <div className="role-salary-head">
            <h4>角色工资</h4>
            <button className="ghost-button compact-button" type="button" onClick={addRole}>
              <Plus size={15} />
              加角色
            </button>
          </div>
          <div className="role-salary-list">
            {form.roles.map((role, index) => (
              <div className="role-salary-row" key={`${index}-${role.name}`}>
                <label>
                  角色名
                  <input
                    value={role.name}
                    onChange={(event) => updateRole(index, { name: event.target.value })}
                    placeholder="例如：奥丁"
                  />
                </label>
                <label>
                  工资
                  <input
                    min="0"
                    step="1"
                    type="number"
                    value={role.salaryYuan}
                    onChange={(event) => updateRole(index, { salaryYuan: event.target.value })}
                    placeholder="例如：200"
                  />
                </label>
                <button
                  className="icon-button small-icon-button danger-icon-button"
                  type="button"
                  title="删除角色"
                  aria-label="删除角色"
                  onClick={() => removeRole(index)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <label className="switch-line">
          <input
            checked={form.isActive}
            type="checkbox"
            onChange={(event) => onChange({ ...form, isActive: event.target.checked })}
          />
          启用
        </label>
        <FormActions editing={Boolean(form.id)} loading={loading} onCancel={() => onChange(emptyScriptForm)} />
      </form>
      <RecordList
        emptyText="还没有剧本"
        items={scripts}
        renderItem={(script) => (
          <div className="record-card" key={script.id}>
            <div>
              <div className="record-title">
                {script.name}
                <StatusPill active={script.isActive} />
              </div>
              <p>
                {script.durationHours} 小时 · 同时最多 {script.maxParallelSessions} 车
              </p>
              <div className="tag-list">
                {script.roles.map((role) => (
                  <span key={role.id}>
                    {role.name} · {formatMoney(role.salaryCents)}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="icon-button"
              type="button"
              title="编辑剧本"
              aria-label="编辑剧本"
              onClick={() =>
                onChange({
                  id: script.id,
                  name: script.name,
                  durationHours: String(script.durationHours),
                  maxParallelSessions: String(script.maxParallelSessions),
                  roles: script.roles.map((role) => ({
                    name: role.name,
                    salaryYuan: centsToYuanInput(role.salaryCents),
                  })),
                  isActive: script.isActive,
                })
              }
            >
              <Edit3 size={16} />
            </button>
          </div>
        )}
      />
    </>
  );
}

function DmConfig({
  form,
  dms,
  loading,
  scriptRoleNames,
  onChange,
  onSubmit,
}: {
  form: DmFormState;
  dms: Dm[];
  loading: boolean;
  scriptRoleNames: string[];
  onChange: (form: DmFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <form className="config-form" onSubmit={onSubmit}>
        <h3>{form.id ? "编辑 DM" : "新增 DM"}</h3>
        <label>
          DM 名称
          <input
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="例如：小周"
          />
        </label>
        <label>
          会的角色
          <textarea
            value={form.rolesText}
            onChange={(event) => onChange({ ...form, rolesText: event.target.value })}
            placeholder="每行一个角色，也可以用逗号分隔"
          />
        </label>
        {scriptRoleNames.length ? (
          <div className="quick-roles">
            {scriptRoleNames.map((roleName) => (
              <button
                key={roleName}
                type="button"
                onClick={() =>
                  onChange({
                    ...form,
                    rolesText: mergeTextItem(form.rolesText, roleName),
                  })
                }
              >
                <Plus size={14} />
                {roleName}
              </button>
            ))}
          </div>
        ) : null}
        <label className="switch-line">
          <input
            checked={form.isActive}
            type="checkbox"
            onChange={(event) => onChange({ ...form, isActive: event.target.checked })}
          />
          在职/启用
        </label>
        <FormActions editing={Boolean(form.id)} loading={loading} onCancel={() => onChange(emptyDmForm)} />
      </form>
      <RecordList
        emptyText="还没有 DM"
        items={dms}
        renderItem={(dm) => (
          <div className="record-card" key={dm.id}>
            <div>
              <div className="record-title">
                {dm.name}
                <StatusPill active={dm.isActive} />
              </div>
              <div className="tag-list">
                {dm.roles.map((role) => (
                  <span key={role.id}>{role.roleName}</span>
                ))}
              </div>
            </div>
            <button
              className="icon-button"
              type="button"
              title="编辑 DM"
              aria-label="编辑 DM"
              onClick={() =>
                onChange({
                  id: dm.id,
                  name: dm.name,
                  rolesText: dm.roles.map((role) => role.roleName).join("\n"),
                  isActive: dm.isActive,
                })
              }
            >
              <Edit3 size={16} />
            </button>
          </div>
        )}
      />
    </>
  );
}

function RoomConfig({
  form,
  rooms,
  loading,
  onChange,
  onSubmit,
}: {
  form: RoomFormState;
  rooms: Room[];
  loading: boolean;
  onChange: (form: RoomFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <form className="config-form" onSubmit={onSubmit}>
        <h3>{form.id ? "编辑房间" : "新增房间"}</h3>
        <label>
          房间名
          <input
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="例如：一号房"
          />
        </label>
        <label className="switch-line">
          <input
            checked={form.isActive}
            type="checkbox"
            onChange={(event) => onChange({ ...form, isActive: event.target.checked })}
          />
          启用
        </label>
        <FormActions editing={Boolean(form.id)} loading={loading} onCancel={() => onChange(emptyRoomForm)} />
      </form>
      <RecordList
        emptyText="还没有房间"
        items={rooms}
        renderItem={(room) => (
          <div className="record-card" key={room.id}>
            <div className="record-title">
              {room.name}
              <StatusPill active={room.isActive} />
            </div>
            <button
              className="icon-button"
              type="button"
              title="编辑房间"
              aria-label="编辑房间"
              onClick={() =>
                onChange({
                  id: room.id,
                  name: room.name,
                  isActive: room.isActive,
                })
              }
            >
              <Edit3 size={16} />
            </button>
          </div>
        )}
      />
    </>
  );
}

function FormActions({
  editing,
  loading,
  onCancel,
}: {
  editing: boolean;
  loading: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="form-actions">
      <button className="primary-button" disabled={loading} type="submit">
        <Save size={16} />
        保存
      </button>
      {editing ? (
        <button className="ghost-button" type="button" onClick={onCancel}>
          取消编辑
        </button>
      ) : null}
    </div>
  );
}

function RecordList<T>({
  emptyText,
  items,
  renderItem,
}: {
  emptyText: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  if (!items.length) {
    return <p className="empty-list">{emptyText}</p>;
  }

  return <div className="record-list">{items.map(renderItem)}</div>;
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={active ? "status-pill active" : "status-pill"}>{active ? "启用" : "停用"}</span>;
}

async function login(password: string): Promise<Session> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message ?? "登录失败");
  }

  return result;
}

async function getCurrentUser(token: string): Promise<Role> {
  const response = await fetch("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("登录状态已失效");
  }

  const result = await response.json();
  return result.role;
}

async function apiFetch<T>(
  url: string,
  options: {
    token: string;
    method?: string;
    body?: unknown;
  },
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message ?? "请求失败");
  }

  return result;
}

async function downloadFile({
  filename,
  token,
  url,
}: {
  filename: string;
  token: string;
  url: string;
}) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message ?? "下载失败");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function splitTextList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n，、]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function mergeTextItem(text: string, item: string) {
  return Array.from(new Set([...splitTextList(text), item])).join("\n");
}

function normalizeScriptRoleForms(roles: ScriptRoleForm[]) {
  const seenNames = new Set<string>();

  return roles
    .map((role) => ({
      name: role.name.trim(),
      salaryYuan: Math.max(0, Number(role.salaryYuan || 0)),
    }))
    .filter((role) => {
      if (!role.name || seenNames.has(role.name)) {
        return false;
      }

      seenNames.add(role.name);
      return true;
    });
}

function formatMoney(cents: number) {
  const yuan = cents / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

function centsToYuanInput(cents: number) {
  const yuan = cents / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function createEmptyScheduleForm(date: string): ScheduleFormState {
  return {
    date,
    scriptId: "",
    startTime: "10:00",
    roomId: "",
    playersReady: true,
    note: "",
    assignments: {},
  };
}

function formFromSchedule(schedule: Schedule): ScheduleFormState {
  return {
    id: schedule.id,
    date: schedule.startAt.slice(0, 10),
    scriptId: String(schedule.scriptId),
    startTime: formatTime(schedule.startAt),
    roomId: String(schedule.roomId),
    playersReady: schedule.playersReady,
    note: schedule.note,
    assignments: Object.fromEntries(
      schedule.roles.map((role) => [
        role.roleName,
        role.dmId === null ? pendingDmValue : String(role.dmId),
      ]),
    ),
  };
}

function buildSchedulePayload(form: ScheduleFormState, excludeId?: number) {
  return {
    excludeId,
    scriptId: Number(form.scriptId),
    roomId: Number(form.roomId),
    date: form.date,
    startTime: form.startTime,
    playersReady: form.playersReady,
    note: form.note,
    assignments: Object.entries(form.assignments)
      .filter(([_roleName, dmId]) => dmId)
      .map(([roleName, dmId]) => ({
        roleName,
        dmId: dmId === pendingDmValue ? null : Number(dmId),
      })),
  };
}

function getScheduleChanges(
  schedule: Schedule,
  form: ScheduleFormState,
  scripts: Script[],
  rooms: Room[],
  dms: Dm[],
) {
  const changes: ScheduleChange[] = [];
  const nextScriptName =
    scripts.find((script) => String(script.id) === form.scriptId)?.name ?? "未选择剧本";
  const nextRoomName =
    rooms.find((room) => String(room.id) === form.roomId)?.name ?? "未选择房间";
  const nextTime = `${form.date} ${form.startTime}`;
  const currentTime = `${schedule.startAt.slice(0, 10)} ${formatTime(schedule.startAt)}`;

  if (schedule.scriptName !== nextScriptName) {
    changes.push({
      label: "剧本",
      before: schedule.scriptName,
      after: nextScriptName,
    });
  }

  if (currentTime !== nextTime) {
    changes.push({
      label: "开场时间",
      before: currentTime,
      after: nextTime,
    });
  }

  if (schedule.roomName !== nextRoomName) {
    changes.push({
      label: "房间",
      before: schedule.roomName,
      after: nextRoomName,
    });
  }

  if (schedule.playersReady !== form.playersReady) {
    changes.push({
      label: "玩家状态",
      before: formatPlayersReady(schedule.playersReady),
      after: formatPlayersReady(form.playersReady),
    });
  }

  for (const change of getRoleChanges(schedule.roles, form.assignments, dms)) {
    changes.push(change);
  }

  return changes;
}

function getRoleChanges(
  roles: ScheduleRole[],
  assignments: Record<string, string>,
  dms: Dm[],
) {
  const oldRoles = new Map(roles.map((role) => [role.roleName, role.dmName]));
  const roleNames = Array.from(new Set([...oldRoles.keys(), ...Object.keys(assignments)]));

  return roleNames
    .map((roleName) => {
      const nextValue = assignments[roleName] ?? "";
      const before = oldRoles.get(roleName) ?? "无";
      const after = formatAssignmentDmName(nextValue, dms);

      if (before === after) {
        return null;
      }

      return {
        label: `角色 DM：${roleName}`,
        before,
        after,
      };
    })
    .filter((item): item is ScheduleChange => Boolean(item));
}

function copyScheduleText(schedule: Schedule) {
  const lines = [
    `${schedule.startAt.slice(5, 10)} ${formatTime(schedule.startAt)}-${formatTime(
      schedule.endAt,
    )}`,
    `《${schedule.scriptName}》`,
    `房间：${schedule.roomName}`,
    `DM：${formatRoleText(schedule.roles) || "无"}`,
    `玩家：${formatPlayersReady(schedule.playersReady)}`,
  ];

  if (schedule.note) {
    lines.push(`备注：${schedule.note}`);
  }

  return lines.join("\n");
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("复制失败");
  }
}

function formatRoleText(roles: Array<Pick<ScheduleRole, "roleName" | "dmName" | "sortOrder">>) {
  return [...roles]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((role) => `${role.roleName}：${role.dmName}`)
    .join("；");
}

function formatFormRoleText(assignments: Record<string, string>, dms: Dm[]) {
  return Object.entries(assignments)
    .filter(([_roleName, value]) => value)
    .map(([roleName, value]) => {
      return `${roleName}：${formatAssignmentDmName(value, dms)}`;
    })
    .join("；");
}

function formatAssignmentDmName(value: string, dms: Dm[]) {
  if (!value) {
    return "未选择";
  }

  if (value === pendingDmValue) {
    return "DM 待定";
  }

  return dms.find((dm) => String(dm.id) === value)?.name ?? "未知 DM";
}

function formatPlayersReady(value: boolean) {
  return value ? "已摇齐" : "未摇齐";
}

function getHalfHourOptions() {
  const options: string[] = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of ["00", "30"]) {
      options.push(`${String(hour).padStart(2, "0")}:${minute}`);
    }
  }

  return options;
}

function getOptionReason(isActive: boolean, available?: boolean, reason?: string) {
  if (!isActive) {
    return "（停用）";
  }

  if (available === false) {
    return `（${reason || "不可用"}）`;
  }

  return "";
}

function getDmOptionReason({
  canPlayRole,
  dm,
  dmState,
  selectedByOtherRole,
}: {
  canPlayRole: boolean;
  dm: Dm;
  dmState?: AvailabilityDm;
  selectedByOtherRole: boolean;
}) {
  if (!dm.isActive) {
    return "（停用）";
  }

  if (!canPlayRole) {
    return "（不会该角色）";
  }

  if (selectedByOtherRole) {
    return "（本场已选）";
  }

  if (dmState?.available === false) {
    return `（${dmState.reason || "不可用"}）`;
  }

  return "";
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function addDays(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function getCalendarDays(monthStart: Date) {
  const firstDay = startOfMonth(monthStart);
  const mondayFirstOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = addDays(firstDay, -mondayFirstOffset);

  return Array.from({ length: 42 }, (_item, index) => addDays(gridStart, index));
}

function groupSchedulesByDate(schedules: Schedule[]) {
  const grouped = new Map<string, Schedule[]>();

  for (const schedule of schedules) {
    const dateKey = schedule.startAt.slice(0, 10);
    const current = grouped.get(dateKey) ?? [];
    current.push(schedule);
    grouped.set(dateKey, current);
  }

  for (const items of grouped.values()) {
    items.sort((left, right) => left.startAt.localeCompare(right.startAt));
  }

  return grouped;
}

function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: string) {
  return value.slice(11, 16);
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 周${weekday}`;
}

function readStoredSession(): Session | null {
  const value = localStorage.getItem(sessionStorageKey);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Session;
  } catch {
    clearStoredSession();
    return null;
  }
}

function readStoredTheme(): Theme {
  const storedTheme = localStorage.getItem(themeStorageKey);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

function storeSession(session: Session) {
  localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

function clearStoredSession() {
  localStorage.removeItem(sessionStorageKey);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
