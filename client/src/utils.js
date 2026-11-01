// Format local calendar dates without UTC conversion so midnight stays on the day the user sees.
export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const dateFromKey = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const formatDay = (
  key,
  options = { weekday: "short", month: "short", day: "numeric" },
) => dateFromKey(key).toLocaleDateString(undefined, options);

export const startOfWeek = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
};

// Reports share this Monday-first date range; the end is exclusive for predictable grouping.
export const dateRangeFor = (period, anchor = new Date()) => {
  const start =
    period === "month"
      ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      : startOfWeek(anchor);
  const length =
    period === "month"
      ? new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
      : 7;
  const days = Array.from({ length }, (_, index) => {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + index,
    );
    return { key: localDateKey(date), date };
  });
  return {
    start,
    end: new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + length,
    ),
    days,
  };
};

export const sameLocalDay = (timestamp, key) => {
  if (!timestamp) return false;
  return localDateKey(new Date(timestamp)) === key;
};

export const focusMinutesOn = (sessions, key) =>
  sessions
    .filter((session) => sameLocalDay(session.endedAt, key))
    .reduce((total, session) => total + session.durationMinutes, 0);

export const tasksCompletedOn = (tasks, key) =>
  tasks.filter((task) => sameLocalDay(task.completedAt, key));

export const formatMinutes = (minutes) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export const taskIsOverdue = (task, today = localDateKey()) =>
  !task.completedAt && task.dueDate && task.dueDate < today;

export const dateLabel = (date) =>
  date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

export const timerStorageKey = (userId) => `daymark.timer.${userId}`;

export function readTimer(userId, preferences) {
  try {
    const saved = JSON.parse(
      localStorage.getItem(timerStorageKey(userId)) || "null",
    );
    if (saved) return saved;
  } catch {
    localStorage.removeItem(timerStorageKey(userId));
  }
  return {
    mode: "focus",
    running: false,
    remainingMs: preferences.focusMinutes * 60000,
    taskId: "",
    startedAt: null,
    endsAt: null,
    segmentStartedAt: null,
    elapsedBeforePause: 0,
    timerId: null,
  };
}
