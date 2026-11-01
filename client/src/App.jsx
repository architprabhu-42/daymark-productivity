import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Coffee,
  Compass,
  FileText,
  Flag,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { api, download, jsonBody } from "./api.js";
import {
  dateFromKey,
  dateLabel,
  dateRangeFor,
  focusMinutesOn,
  formatDay,
  formatMinutes,
  localDateKey,
  readTimer,
  sameLocalDay,
  taskIsOverdue,
  tasksCompletedOn,
  timerStorageKey,
} from "./utils.js";

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "My tasks", icon: ListTodo },
  { id: "focus", label: "Focus timer", icon: AlarmClock },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "reports", label: "Reports", icon: BarChart3 },
];

const idOf = (item) => String(item?._id || item?.id || "");
const initialTaskForm = {
  title: "",
  note: "",
  priority: "medium",
  category: "",
  dueDate: "",
};
const timerDefaults = (user) => ({
  mode: "focus",
  running: false,
  remainingMs: user.focusMinutes * 60000,
  taskId: "",
  startedAt: null,
  endsAt: null,
  segmentStartedAt: null,
  elapsedBeforePause: 0,
  timerId: null,
});

// Shared records and timer state live here so switching screens does not interrupt the user’s work.
export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [page, setPage] = useState("overview");
  const [dataLoading, setDataLoading] = useState(false);
  const [appError, setAppError] = useState("");
  const [toast, setToast] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [focus, setFocus] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const completingTimer = useRef(null);
  const notify = useCallback((message, title = "Saved", type = "success") => {
    setToast({ message, title, type });
  }, []);

  const showTimerNotification = useCallback(
    (title, message) => {
      notify(message, title, "timer");
      if (!("Notification" in window) || window.Notification.permission !== "granted")
        return;
      try {
        const desktopNotification = new window.Notification(title, {
          body: message,
          tag: `daymark-timer-${Date.now()}`,
          requireInteraction: true,
        });
        desktopNotification.onclick = () => {
          window.focus();
          desktopNotification.close();
        };
      } catch {
        // Keep the in-app alert if this browser cannot display a desktop notification.
      }
    },
    [notify],
  );

  const loadWorkspace = useCallback(
    async (quiet = false) => {
      if (!user?.id) return;
      if (!quiet) setDataLoading(true);
      setAppError("");
      try {
        const [taskResult, sessionResult, noteResult] = await Promise.all([
          api("/tasks"),
          api("/sessions"),
          api("/notes"),
        ]);
        setTasks(taskResult.tasks || []);
        setSessions(sessionResult.sessions || []);
        setNotes(noteResult.notes || []);
      } catch (error) {
        setAppError(error.message);
      } finally {
        setDataLoading(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    api("/auth/me")
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch((error) => setAppError(error.message))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setTasks([]);
      setSessions([]);
      setNotes([]);
      setFocus(null);
      return;
    }
    setFocus(readTimer(user.id, user));
    loadWorkspace();
  }, [user?.id]); // Load account data once for each signed-in account.

  useEffect(() => {
    if (!user?.id || !focus) return;
    localStorage.setItem(timerStorageKey(user.id), JSON.stringify(focus));
  }, [focus, user?.id]);

  useEffect(() => {
    if (!focus?.running) return undefined;
    const interval = window.setInterval(() => setClockNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, [focus?.running]);

  const remainingMs = focus?.running
    ? Math.max(0, focus.endsAt - clockNow)
    : focus?.remainingMs || 0;

  useEffect(() => {
    if (!user || !focus?.running || remainingMs > 0 || !focus.timerId) return;
    if (completingTimer.current === focus.timerId) return;
    completingTimer.current = focus.timerId;

    // The timer uses absolute timestamps for its display, then records one session only after a full focus block.
    if (focus.mode === "focus") {
      const completedAt = focus.endsAt || Date.now();
      showTimerNotification(
        "Focus block complete",
        "Your focus time is over. Take a little break.",
      );
      api("/sessions", {
        method: "POST",
        ...jsonBody({
          taskId: focus.taskId || null,
          timerId: focus.timerId,
          startedAt: new Date(focus.startedAt).toISOString(),
          endedAt: new Date(completedAt).toISOString(),
          durationMinutes: Math.max(
            1,
            Math.round(
              (focus.elapsedBeforePause +
                (focus.segmentStartedAt
                  ? focus.endsAt - focus.segmentStartedAt
                  : 0)) /
                60000,
            ),
          ),
        }),
      })
        .then(({ session }) => {
          setSessions((current) => [session, ...current]);
          setFocus((current) => ({
            ...current,
            mode: "break",
            running: false,
            remainingMs: user.breakMinutes * 60000,
            taskId: "",
            startedAt: null,
            endsAt: null,
            segmentStartedAt: null,
            elapsedBeforePause: 0,
            timerId: null,
          }));
        })
        .catch((error) => {
          setFocus((current) => ({
            ...current,
            running: false,
            remainingMs: 0,
            pendingSession: {
              taskId: current.taskId || null,
              timerId: current.timerId,
              startedAt: new Date(current.startedAt).toISOString(),
              endedAt: new Date(current.endsAt).toISOString(),
              durationMinutes: Math.max(
                1,
                Math.round(
                  (current.elapsedBeforePause +
                    (current.segmentStartedAt
                      ? current.endsAt - current.segmentStartedAt
                      : 0)) /
                    60000,
                ),
              ),
            },
          }));
          setAppError(
            `${error.message} Your completed block is saved in this browser. Choose “Retry saving block” when the connection is back.`,
          );
          completingTimer.current = null;
        });
    } else {
      setFocus((current) => ({
        ...timerDefaults(user),
        remainingMs: user.focusMinutes * 60000,
      }));
      showTimerNotification("Break complete", "Ready when you are.");
      completingTimer.current = null;
    }
  }, [focus, notify, remainingMs, showTimerNotification, user]);

  useEffect(() => {
    if (!toast || toast.type === "timer") return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function signIn(credentials, mode) {
    setAppError("");
    const result = await api(`/auth/${mode}`, {
      method: "POST",
      ...jsonBody(credentials),
    });
    setUser(result.user);
    setPage("overview");
  }

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      setAppError(
        `Sign out could not reach the server. Try again when you are connected. ${error.message}`,
      );
      return;
    }
    setUser(null);
    setPage("overview");
    setAppError("");
  }

  async function createTask(values) {
    const result = await api("/tasks", { method: "POST", ...jsonBody(values) });
    setTasks((current) => [result.task, ...current]);
    notify("Task added to your list.");
    return result.task;
  }

  async function updateTask(taskId, values) {
    const result = await api(`/tasks/${taskId}`, {
      method: "PUT",
      ...jsonBody(values),
    });
    setTasks((current) =>
      current.map((task) => (idOf(task) === taskId ? result.task : task)),
    );
    setSessions((current) =>
      current.map((session) =>
        String(session.taskId) === taskId
          ? { ...session, taskTitle: result.task.title }
          : session,
      ),
    );
    notify("Task updated.");
  }

  async function saveTaskCompletion(task, completed) {
    try {
      const result = await api(`/tasks/${idOf(task)}/completion`, {
        method: "PATCH",
        ...jsonBody({ completed }),
      });
      setTasks((current) =>
        current.map((item) => (idOf(item) === idOf(task) ? result.task : item)),
      );
      setAppError("");
      notify(
        completed
          ? "Nice work — task completed."
          : "Task moved back to your active list.",
      );
    } catch (error) {
      setAppError(error.message);
    }
  }

  function setTaskCompletion(task, completed) {
    if (!completed) {
      void saveTaskCompletion(task, false);
      return;
    }
    setConfirmation({
      title: "Mark this task as done?",
      message: `“${task.title}” will move to your completed tasks.`,
      confirmLabel: "Mark as done",
      onConfirm: () => saveTaskCompletion(task, true),
    });
  }

  function removeTask(task) {
    setConfirmation({
      title: "Delete this task?",
      message: `“${task.title}” and its linked focus history will be permanently deleted.`,
      confirmLabel: "Delete task",
      danger: true,
      onConfirm: () => deleteTask(task),
    });
  }

  async function deleteTask(task) {
    try {
      await api(`/tasks/${idOf(task)}`, { method: "DELETE" });
      setTasks((current) =>
        current.filter((item) => idOf(item) !== idOf(task)),
      );
      setSessions((current) =>
        current.filter((session) => String(session.taskId) !== idOf(task)),
      );
      setFocus((current) =>
        current?.taskId === idOf(task) ? timerDefaults(user) : current,
      );
      setAppError("");
      notify("Task and linked focus history deleted.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function confirmPendingAction() {
    if (!confirmation || confirmationBusy) return;
    setConfirmationBusy(true);
    try {
      await confirmation.onConfirm();
    } catch (error) {
      setAppError(error.message);
    } finally {
      setConfirmation(null);
      setConfirmationBusy(false);
    }
  }

  function cancelPendingAction() {
    if (!confirmationBusy) setConfirmation(null);
  }

  async function saveNote(dateKey, content) {
    try {
      const result = await api(`/notes/${dateKey}`, {
        method: "PUT",
        ...jsonBody({ content }),
      });
      setNotes((current) =>
        result.note
          ? [result.note, ...current.filter((note) => note.dateKey !== dateKey)]
          : current.filter((note) => note.dateKey !== dateKey),
      );
      setAppError("");
      notify(content.trim() ? "Note saved." : "Note removed.");
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function loadSampleWorkspace() {
    setSampleLoading(true);
    setAppError("");
    try {
      const result = await api("/demo/sample-data", {
        method: "POST",
        ...jsonBody({
          todayKey: localDateKey(),
          timezoneOffset: new Date().getTimezoneOffset(),
        }),
      });
      setUser((current) => ({ ...current, sampleDataLoaded: true }));
      await loadWorkspace(true);
      notify(
        `Sample workspace added: ${result.counts.tasks} tasks, ${result.counts.focusSessions} focus blocks, and ${result.counts.dayNotes} notes.`,
      );
    } catch (error) {
      setAppError(error.message);
    } finally {
      setSampleLoading(false);
    }
  }

  async function saveSettings(values) {
    const result = await api("/auth/settings", {
      method: "PATCH",
      ...jsonBody(values),
    });
    setUser(result.user);
    setFocus((current) =>
      current &&
      !current.running &&
      !current.pendingSession &&
      !current.startedAt
        ? {
            ...current,
            remainingMs:
              (current.mode === "break"
                ? result.user.breakMinutes
                : result.user.focusMinutes) * 60000,
          }
        : current,
    );
    notify("Your preferences are saved.");
  }

  function startFocus(taskId = "", startBreak = false) {
    if (focus?.pendingSession) {
      api("/sessions", { method: "POST", ...jsonBody(focus.pendingSession) })
        .then(({ session }) => {
          setSessions((current) => [
            session,
            ...current.filter((item) => item.timerId !== session.timerId),
          ]);
          setFocus({
            ...timerDefaults(user),
            mode: "break",
            remainingMs: user.breakMinutes * 60000,
          });
          setAppError("");
          notify("Your completed focus block is saved.");
        })
        .catch((error) => setAppError(error.message));
      return;
    }
    if (!("Notification" in window)) {
      notify(
        "This browser cannot show desktop alerts. The timer alert will stay in Daymark.",
        "Desktop alerts unavailable",
        "timer",
      );
    } else if (window.Notification.permission === "default") {
      window.Notification.requestPermission()
        .then((permission) => {
          if (permission !== "granted") {
            notify(
              "Allow notifications for Daymark in your browser settings to get desktop timer alerts.",
              "Desktop alerts are off",
              "timer",
            );
          }
        })
        .catch(() => {
          notify(
            "Allow notifications for Daymark in your browser settings to get desktop timer alerts.",
            "Desktop alerts are off",
            "timer",
          );
        });
    } else if (window.Notification.permission === "denied") {
      notify(
        "Allow notifications for Daymark in your browser settings to get desktop timer alerts.",
        "Desktop alerts are off",
        "timer",
      );
    }
    const now = Date.now();
    if (focus?.mode === "break" && (startBreak || !taskId)) {
      setFocus({
        ...focus,
        running: true,
        endsAt: now + focus.remainingMs,
        segmentStartedAt: now,
        timerId: focus.timerId || crypto.randomUUID(),
      });
      return;
    }
    const duration = focus?.remainingMs || user.focusMinutes * 60000;
    setFocus({
      ...(focus || timerDefaults(user)),
      mode: "focus",
      running: true,
      remainingMs: duration,
      taskId: focus?.startedAt ? focus.taskId : taskId || focus?.taskId || "",
      startedAt: focus?.startedAt || now,
      endsAt: now + duration,
      segmentStartedAt: now,
      elapsedBeforePause: focus?.elapsedBeforePause || 0,
      timerId: focus?.timerId || crypto.randomUUID(),
    });
  }

  function pauseFocus() {
    if (!focus?.running) return;
    const activeSegment = Math.max(
      0,
      Date.now() - (focus.segmentStartedAt || Date.now()),
    );
    setFocus({
      ...focus,
      running: false,
      remainingMs: Math.max(0, focus.endsAt - Date.now()),
      endsAt: null,
      segmentStartedAt: null,
      elapsedBeforePause:
        focus.mode === "focus"
          ? focus.elapsedBeforePause + activeSegment
          : focus.elapsedBeforePause,
    });
  }

  function resetFocus() {
    completingTimer.current = null;
    setFocus(timerDefaults(user));
  }

  if (booting) return <LoadingScreen />;
  if (!user) return <AuthScreen onSubmit={signIn} error={appError} />;

  const today = localDateKey();
  const todaysTasks = tasks
    .filter(
      (task) => !task.completedAt && (!task.dueDate || task.dueDate <= today),
    )
    .sort((a, b) => Number(taskIsOverdue(b)) - Number(taskIsOverdue(a)))
    .slice(0, 5);
  const currentFocus = focus || timerDefaults(user);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
            >
              <Icon size={18} strokeWidth={1.8} /> <span>{label}</span>
              {id === "tasks" &&
                tasks.filter((task) => !task.completedAt).length > 0 && (
                  <span className="nav-count">
                    {tasks.filter((task) => !task.completedAt).length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <div className="tip-icon">
              <Sparkles size={16} />
            </div>
            <p>
              A little progress
              <br />
              adds up.
            </p>
            <span>Keep showing up for your work.</span>
          </div>
          <button
            data-settings-link
            className={`nav-link ${page === "settings" ? "active" : ""}`}
            onClick={() => setPage("settings")}
          >
            <Settings2 size={18} />
            <span>Settings & export</span>
          </button>
          <div className="profile-row">
            <div className="avatar">{user.email.slice(0, 1).toUpperCase()}</div>
            <div className="profile-copy">
              <strong>{user.email.split("@")[0]}</strong>
              <span>Personal space</span>
            </div>
            <button
              className="icon-button subtle"
              aria-label="Sign out"
              title="Sign out"
              onClick={signOut}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand compact />
          </div>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>
              {NAV.find((item) => item.id === page)?.label || "Settings"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="today-chip">
              <span className="online-dot" />{" "}
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </span>
            <button
              className="avatar avatar-small"
              aria-label="Account settings"
              onClick={() => setPage("settings")}
            >
              {user.email.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        {appError && (
          <div className="inline-alert">
            <span>{appError}</span>
            <button onClick={() => setAppError("")} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="page-content">
          {page === "overview" && (
            <Dashboard
              user={user}
              tasks={tasks}
              sessions={sessions}
              notes={notes}
              todaysTasks={todaysTasks}
              sampleLoading={sampleLoading}
              onPage={setPage}
              onComplete={setTaskCompletion}
              onLoadSamples={loadSampleWorkspace}
              onStartFocus={() => {
                setPage("focus");
                if (!focus?.running && focus?.mode !== "break") startFocus();
              }}
              onSaveNote={saveNote}
            />
          )}
          {page === "tasks" && (
            <TasksPage
              tasks={tasks}
              loading={dataLoading}
              onCreate={createTask}
              onUpdate={updateTask}
              onComplete={setTaskCompletion}
              onDelete={removeTask}
              onFocus={(task) => {
                setPage("focus");
                if (!focus?.running) startFocus(idOf(task));
              }}
            />
          )}
          {page === "focus" && (
            <FocusPage
              user={user}
              tasks={tasks}
              sessions={sessions}
              focus={currentFocus}
              remainingMs={remainingMs}
              onStart={startFocus}
              onPause={pauseFocus}
              onReset={resetFocus}
              onTaskChange={(taskId) =>
                setFocus((current) => ({ ...current, taskId }))
              }
            />
          )}
          {page === "calendar" && (
            <CalendarPage
              tasks={tasks}
              sessions={sessions}
              notes={notes}
              onSaveNote={saveNote}
            />
          )}
          {page === "reports" && (
            <ReportsPage tasks={tasks} sessions={sessions} />
          )}
          {page === "settings" && (
            <SettingsPage
              user={user}
              onSave={saveSettings}
              onDownload={download}
            />
          )}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Main navigation">
        {NAV.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => setPage(id)}
          >
            <Icon size={19} />
            <span>{label.replace("My ", "")}</span>
          </button>
        ))}
      </nav>
      {confirmation && (
        <ConfirmationDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          danger={confirmation.danger}
          busy={confirmationBusy}
          onCancel={cancelPendingAction}
          onConfirm={confirmPendingAction}
        />
      )}
      {toast && (
        <div
          className={`toast toast-${toast.type}`}
          role="status"
          aria-live="polite"
        >
          <span className="toast-icon">
            {toast.type === "timer" ? (
              <AlarmClock size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
          </span>
          <span className="toast-copy">
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </span>
          <button
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
          {toast.type !== "timer" && <span className="toast-progress" />}
        </div>
      )}
    </div>
  );
}

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <div className="brand-mark">
        <span />
        <span />
        <span />
      </div>
      <span>daymark</span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="brand-mark">
        <span />
        <span />
        <span />
      </div>
      <p>Getting your workspace ready…</p>
    </div>
  );
}

function ConfirmationDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector("[data-confirm-cancel]")?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const buttons = dialog?.querySelectorAll("button:not(:disabled)");
      if (!buttons?.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className="confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        tabIndex={-1}
      >
        <span className={`confirm-mark ${danger ? "danger" : ""}`}>
          {danger ? <Trash2 size={19} /> : <CheckCircle2 size={19} />}
        </span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button
            className="confirm-cancel"
            data-confirm-cancel
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`confirm-submit ${danger ? "danger" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

// This screen owns only sign-in form state; the server creates and protects the account session.
function AuthScreen({ onSubmit, error }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLocalError("");
    setBusy(true);
    try {
      await onSubmit({ email, password }, mode);
    } catch (submitError) {
      setLocalError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-art">
        <div className="auth-art-top">
          <Brand />
          <span className="mini-badge">
            <Sparkles size={13} /> YOUR SPACE TO FOCUS
          </span>
        </div>
        <div className="auth-quote">
          <span className="quote-mark">“</span>
          <h1>
            Make room for
            <br />
            <em>what matters.</em>
          </h1>
          <p>
            Small steps, thoughtful breaks, and a clearer picture of your
            progress.
          </p>
        </div>
        <div className="auth-preview">
          <div className="preview-head">
            <span className="preview-dot" />
            <span className="preview-dot" />
            <span className="preview-dot" />
            <div>Today at a glance</div>
          </div>
          <div className="preview-body">
            <div className="preview-check">
              <Check size={13} />
              <span>Plan the week ahead</span>
              <small>DONE</small>
            </div>
            <div className="preview-check">
              <Circle size={13} />
              <span>Finish project outline</span>
              <small>HIGH PRIORITY</small>
            </div>
            <div className="preview-timer">
              <div className="preview-ring">
                <span>
                  24<small>:18</small>
                </span>
              </div>
              <div>
                <strong>A little focus goes a long way</strong>
                <span>One thing at a time.</span>
              </div>
            </div>
          </div>
        </div>
        <div className="auth-footer">
          <span>PRIVATE BY DESIGN</span>
          <span>DAYMARK · 2026</span>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-wrap">
          <div className="eyebrow">WELCOME TO YOUR WORKSPACE</div>
          <h2>
            {mode === "login"
              ? "Pick up where you left off."
              : "A calmer way to get things done."}
          </h2>
          <p className="muted auth-subtitle">
            {mode === "login"
              ? "Sign in to see your tasks, notes, and focus history."
              : "Create an account to keep your work in sync."}
          </p>
          <form onSubmit={submit} className="auth-form">
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
            {(localError || error) && (
              <div className="form-error">{localError || error}</div>
            )}
            <button
              className="button button-primary auth-submit"
              disabled={busy}
            >
              {busy
                ? "One moment…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="auth-switch">
            {mode === "login" ? "New to Daymark?" : "Already have an account?"}
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setLocalError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>
          <div className="auth-privacy">
            <span className="lock-icon">⌑</span>Your workspace is private to
            your account.
          </div>
        </div>
        <div className="auth-panel-bottom">A little progress adds up.</div>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone = "mint" }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className="stat-label">{label}</div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  );
}

// Dashboard numbers are derived from the same task and session records used by Calendar and Reports.
function Dashboard({
  user,
  tasks,
  sessions,
  notes,
  todaysTasks,
  sampleLoading,
  onPage,
  onComplete,
  onStartFocus,
  onLoadSamples,
  onSaveNote,
}) {
  const today = localDateKey();
  const todayFocus = focusMinutesOn(sessions, today);
  const completedToday = tasksCompletedOn(tasks, today).length;
  const todayNote = notes.find((note) => note.dateKey === today);
  const range = dateRangeFor("week");
  const weekFocus = range.days.map(({ key }) => focusMinutesOn(sessions, key));
  const maxFocus = Math.max(30, ...weekFocus);
  const overdue = tasks.filter((task) => taskIsOverdue(task)).length;
  const greetings =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  return (
    <>
      <PageHeading
        eyebrow="YOUR DAILY SPACE"
        title={`${greetings}, ${user.email.split("@")[0]}.`}
        description="A small step is still a step. Here’s where you are today."
        action={
          user.isAdmin &&
          !user.sampleDataLoaded &&
          tasks.length === 0 &&
          sessions.length === 0 &&
          notes.length === 0 ? (
            <button
              className="button button-quiet"
              onClick={onLoadSamples}
              disabled={sampleLoading}
            >
              <Sparkles size={15} />
              {sampleLoading ? "Adding samples…" : "Load sample workspace"}
            </button>
          ) : (
            <button
              className="button button-quiet"
              onClick={() => onPage("calendar")}
            >
              <CalendarDays size={16} /> Open calendar
            </button>
          )
        }
      />
      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="hero-kicker-dot" /> YOUR NEXT GOOD STEP
          </div>
          <h2>
            Make a little
            <br />
            room to <em>focus.</em>
          </h2>
          <p>One thoughtful block can change the shape of your day.</p>
          <button className="button button-light" onClick={onStartFocus}>
            <Play size={15} fill="currentColor" /> Start a focus block{" "}
            <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="hero-decoration">
          <div className="hero-ring ring-one" />
          <div className="hero-ring ring-two" />
          <div className="hero-sun">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>
      <div className="stats-grid">
        <StatCard
          label="Focused today"
          value={formatMinutes(todayFocus)}
          detail={`${user.dailyGoalMinutes ? `${Math.min(100, Math.round((todayFocus / user.dailyGoalMinutes) * 100))}% of your daily goal` : "Set a focus goal in settings"}`}
          icon={Clock3}
          tone="mint"
        />
        <StatCard
          label="Tasks completed"
          value={completedToday}
          detail="A good day's progress"
          icon={CheckCircle2}
          tone="lavender"
        />
        <StatCard
          label="On your plate"
          value={tasks.filter((task) => !task.completedAt).length}
          detail={
            overdue
              ? `${overdue} overdue · take them one at a time`
              : "Active tasks to work through"
          }
          icon={ListTodo}
          tone="peach"
        />
        <StatCard
          label="Focus blocks"
          value={
            sessions.filter((session) => sameLocalDay(session.endedAt, today))
              .length
          }
          detail="Completed today"
          icon={Zap}
          tone="blue"
        />
      </div>
      <div className="dashboard-columns">
        <section className="panel task-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">A GOOD PLACE TO START</div>
              <h3>Today’s tasks</h3>
            </div>
            <button className="text-link" onClick={() => onPage("tasks")}>
              See all <ArrowRight size={14} />
            </button>
          </div>
          {todaysTasks.length ? (
            <div className="compact-task-list">
              {todaysTasks.slice(0, 4).map((task) => (
                <TaskRow
                  key={idOf(task)}
                  task={task}
                  compact
                  onComplete={onComplete}
                />
              ))}
            </div>
          ) : (
            <div className="small-empty">
              <div className="empty-icon">
                <CheckCircle2 size={19} />
              </div>
              <strong>You’re clear for now</strong>
              <span>Add a task whenever something comes to mind.</span>
              <button className="text-link" onClick={() => onPage("tasks")}>
                Open your list <ArrowRight size={14} />
              </button>
            </div>
          )}
        </section>
        <section className="panel weekly-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">YOUR RHYTHM</div>
              <h3>This week</h3>
            </div>
            <button
              className="icon-button"
              aria-label="View reports"
              onClick={() => onPage("reports")}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="mini-chart">
            {range.days.map(({ key, date }, index) => (
              <div className="mini-chart-col" key={key}>
                <div className="mini-chart-track">
                  <div
                    className={`mini-chart-bar ${key === today ? "today" : ""}`}
                    style={{
                      height: `${Math.max(5, (weekFocus[index] / maxFocus) * 100)}%`,
                    }}
                  />
                </div>
                <span>
                  {date.toLocaleDateString(undefined, { weekday: "narrow" })}
                </span>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span>
              <i /> Focus time
            </span>
            <strong>
              {formatMinutes(weekFocus.reduce((sum, value) => sum + value, 0))}
              <small> total</small>
            </strong>
          </div>
        </section>
      </div>
      <div className="dashboard-columns second-row">
        <section className="panel note-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">A THOUGHT FOR TODAY</div>
              <h3>Your daily note</h3>
            </div>
            <button className="text-link" onClick={() => onPage("calendar")}>
              Open <ArrowRight size={14} />
            </button>
          </div>
          <DailyNoteQuick
            note={todayNote?.content || ""}
            onSave={(content) => onSaveNote(today, content)}
          />
        </section>
        <section className="panel upcoming-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">LOOKING AHEAD</div>
              <h3>Coming up</h3>
            </div>
            <button className="text-link" onClick={() => onPage("tasks")}>
              View list <ArrowRight size={14} />
            </button>
          </div>
          <UpcomingList tasks={tasks} />
        </section>
      </div>
    </>
  );
}

function DailyNoteQuick({ note, onSave }) {
  const [value, setValue] = useState(note);
  useEffect(() => setValue(note), [note]);
  return (
    <div className="quick-note">
      <div className="note-prompt">“</div>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="What’s on your mind today? Jot down a thought, a win, or a reminder…"
        maxLength={10000}
      />
      <div className="note-footer">
        <span>
          {value.length
            ? `${value.length} characters`
            : "Only you can see this note"}
        </span>
        <button
          className="button button-small button-outline"
          onClick={() => onSave(value)}
        >
          Save note <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

function UpcomingList({ tasks }) {
  const upcoming = tasks
    .filter((task) => !task.completedAt && task.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  if (!upcoming.length)
    return (
      <div className="upcoming-empty">
        <span className="upcoming-calendar">
          <CalendarDays size={17} />
        </span>
        <span>
          No due dates on the horizon.
          <br />
          Add one to a task to see it here.
        </span>
      </div>
    );
  return (
    <div className="upcoming-list">
      {upcoming.map((task) => (
        <div className="upcoming-item" key={idOf(task)}>
          <div className="upcoming-date">
            <strong>{dateFromKey(task.dueDate).getDate()}</strong>
            <span>
              {dateFromKey(task.dueDate).toLocaleDateString(undefined, {
                month: "short",
              })}
            </span>
          </div>
          <div className="upcoming-info">
            <strong>{task.title}</strong>
            <span>{task.category || "Task"}</span>
          </div>
          <span
            className={`priority-dot ${task.priority}`}
            title={`${task.priority} priority`}
          />
        </div>
      ))}
    </div>
  );
}

// Search, filters, and the open editor are temporary UI state; saved task changes go through App callbacks.
function TasksPage({
  tasks,
  loading,
  onCreate,
  onUpdate,
  onComplete,
  onDelete,
  onFocus,
}) {
  const [view, setView] = useState("active");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formError, setFormError] = useState("");
  const filtered = tasks
    .filter((task) => {
      const inView =
        view === "active" ? !task.completedAt : Boolean(task.completedAt);
      const matchesQuery = `${task.title} ${task.note} ${task.category}`
        .toLowerCase()
        .includes(query.toLowerCase());
      return (
        inView &&
        matchesQuery &&
        (priorityFilter === "all" || task.priority === priorityFilter)
      );
    })
    .sort((a, b) => {
      if (view === "completed")
        return new Date(b.completedAt) - new Date(a.completedAt);
      return (
        Number(taskIsOverdue(b)) - Number(taskIsOverdue(a)) ||
        Number(b.priority === "high") - Number(a.priority === "high") ||
        (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
      );
    });

  async function submitTask(values) {
    setFormError("");
    try {
      if (editingTask) await onUpdate(idOf(editingTask), values);
      else await onCreate(values);
      setEditingTask(null);
      setComposerOpen(false);
    } catch (error) {
      setFormError(error.message);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="YOUR LIST, YOUR PACE"
        title="My tasks"
        description="Keep the important things close, and give them your attention one at a time."
        action={
          <button
            className="button button-primary"
            onClick={() => {
              setEditingTask(null);
              setComposerOpen(!composerOpen);
              setFormError("");
            }}
          >
            <Plus size={16} /> Add a task
          </button>
        }
      />
      {composerOpen && (
        <TaskEditor
          key={editingTask?._id || "new-task"}
          initial={editingTask || initialTaskForm}
          onSubmit={submitTask}
          onCancel={() => {
            setComposerOpen(false);
            setEditingTask(null);
          }}
          error={formError}
        />
      )}
      <section className="panel tasks-panel">
        <div className="task-toolbar">
          <div className="segmented-control">
            <button
              className={view === "active" ? "selected" : ""}
              onClick={() => setView("active")}
            >
              Active{" "}
              <span>{tasks.filter((task) => !task.completedAt).length}</span>
            </button>
            <button
              className={view === "completed" ? "selected" : ""}
              onClick={() => setView("completed")}
            >
              Completed{" "}
              <span>{tasks.filter((task) => task.completedAt).length}</span>
            </button>
          </div>
          <div className="task-filters">
            <label className="search-field">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your tasks"
              />
            </label>
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              aria-label="Filter by priority"
            >
              <option value="all">All priorities</option>
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
          </div>
        </div>
        {loading ? (
          <LoadingRows />
        ) : filtered.length ? (
          <div className="task-list">
            {filtered.map((task) => (
              <TaskRow
                key={idOf(task)}
                task={task}
                onComplete={onComplete}
                onDelete={onDelete}
                onFocus={onFocus}
                onEdit={() => {
                  setEditingTask(task);
                  setComposerOpen(true);
                  setFormError("");
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={view === "active" ? ListTodo : CheckCircle2}
            title={
              view === "active"
                ? "Your list is open."
                : "Nothing completed just yet."
            }
            text={
              view === "active"
                ? query
                  ? "No tasks match your search. Try another word or filter."
                  : "Add a task to give your next step a home."
                : "When you finish a task, it will be kept here and on your calendar."
            }
            action={
              view === "active" && !query ? (
                <button
                  className="button button-primary button-small"
                  onClick={() => setComposerOpen(true)}
                >
                  <Plus size={14} /> Add your first task
                </button>
              ) : null
            }
          />
        )}
      </section>
    </>
  );
}

function TaskEditor({ initial, onSubmit, onCancel, error }) {
  const [form, setForm] = useState({ ...initialTaskForm, ...initial });
  const [busy, setBusy] = useState(false);
  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSubmit(form);
    setBusy(false);
  }
  return (
    <form className="panel task-editor" onSubmit={submit}>
      <div className="editor-heading">
        <div>
          <div className="eyebrow">
            {initial._id ? "UPDATE TASK" : "MAKE A NOTE OF IT"}
          </div>
          <h3>{initial._id ? "Edit task" : "New task"}</h3>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onCancel}
          aria-label="Close"
        >
          <X size={17} />
        </button>
      </div>
      <label className="field-label">
        What needs doing?
        <input
          autoFocus
          value={form.title}
          onChange={(event) => change("title", event.target.value)}
          placeholder="e.g. Draft the project outline"
          maxLength={160}
          required
        />
      </label>
      <label className="field-label">
        A few details <span className="optional-label">OPTIONAL</span>
        <textarea
          value={form.note || ""}
          onChange={(event) => change("note", event.target.value)}
          placeholder="Add a helpful note or context…"
          rows="2"
          maxLength={4000}
        />
      </label>
      <div className="editor-grid">
        <label className="field-label">
          Priority
          <select
            value={form.priority}
            onChange={(event) => change("priority", event.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="field-label">
          Due date<span className="optional-label">OPTIONAL</span>
          <input
            type="date"
            value={form.dueDate || ""}
            onChange={(event) => change("dueDate", event.target.value)}
          />
        </label>
        <label className="field-label">
          Category<span className="optional-label">OPTIONAL</span>
          <input
            value={form.category || ""}
            onChange={(event) => change("category", event.target.value)}
            placeholder="Work, personal…"
            maxLength={40}
          />
        </label>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="editor-actions">
        <button
          type="button"
          className="button button-quiet"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="button button-primary" disabled={busy}>
          {busy ? "Saving…" : initial._id ? "Save changes" : "Add task"}
          <ArrowRight size={14} />
        </button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  compact = false,
  onComplete,
  onDelete,
  onFocus,
  onEdit,
}) {
  const completed = Boolean(task.completedAt);
  const overdue = taskIsOverdue(task);
  const [showNote, setShowNote] = useState(false);
  return (
    <div
      className={`task-row ${compact ? "compact" : ""} ${completed ? "completed" : ""}`}
    >
      <button
        className={`task-check ${completed ? "checked" : ""}`}
        onClick={() => onComplete?.(task, !completed)}
        aria-label={completed ? "Reopen task" : "Complete task"}
      >
        {completed ? <Check size={14} /> : <span />}
      </button>
      <div className="task-main">
        <div className="task-title-line">
          <strong>{task.title}</strong>
          {task.priority === "high" && (
            <span className="priority-pill high">
              <Flag size={11} fill="currentColor" /> High
            </span>
          )}
        </div>
        {(task.category || task.dueDate || task.note) && (
          <div className="task-meta">
            {task.category && (
              <span className="category-pill">{task.category}</span>
            )}
            {task.dueDate && (
              <span className={`due-label ${overdue ? "overdue" : ""}`}>
                {overdue ? "Overdue · " : "Due "}
                {dateFromKey(task.dueDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {task.note && (
              <button
                className="note-toggle"
                onClick={() => setShowNote(!showNote)}
              >
                {showNote ? "Hide note" : "View note"}
              </button>
            )}
          </div>
        )}
        {showNote && <p className="task-note-preview">{task.note}</p>}
        {completed && (
          <span className="completion-date">
            Completed{" "}
            {formatDay(localDateKey(new Date(task.completedAt)), {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
      <div className="task-actions">
        {!completed && onFocus && (
          <button
            className="icon-button task-action"
            title="Focus on this task"
            aria-label="Focus on this task"
            onClick={() => onFocus(task)}
          >
            <Clock3 size={15} />
          </button>
        )}
        {onEdit && (
          <button
            className="icon-button task-action"
            title="Edit task"
            aria-label="Edit task"
            onClick={onEdit}
          >
            <Settings2 size={15} />
          </button>
        )}
        {onDelete && (
          <button
            className="icon-button task-action delete-action"
            title="Permanently delete"
            aria-label="Permanently delete task"
            onClick={() => onDelete(task)}
          >
            <Trash2 size={15} />
          </button>
        )}
        <button
          className="icon-button task-action more-action"
          title={completed ? "Reopen task" : "Complete task"}
          aria-label={completed ? "Reopen task" : "Complete task"}
          onClick={() => onComplete?.(task, !completed)}
        >
          {completed ? <ArrowLeft size={15} /> : <MoreHorizontal size={17} />}
        </button>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="loading-rows">
      <span />
      <span />
      <span />
    </div>
  );
}

function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon large">
        <Icon size={22} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

// App owns the countdown and persistence; this screen only renders controls and the selected task.
function FocusPage({
  user,
  tasks,
  sessions,
  focus,
  remainingMs,
  onStart,
  onPause,
  onReset,
  onTaskChange,
}) {
  const isBreak = focus.mode === "break";
  const ready = !focus.running && remainingMs > 0;
  const runningOrReady = focus.running || ready;
  const totalMs = (isBreak ? user.breakMinutes : user.focusMinutes) * 60000;
  const progress = totalMs
    ? Math.max(0, Math.min(1, remainingMs / totalMs))
    : 1;
  const minutes = Math.floor(remainingMs / 60000)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor((remainingMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const todaySessions = sessions.filter((session) =>
    sameLocalDay(session.endedAt, localDateKey()),
  );
  const circumference = 2 * Math.PI * 128;
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE TIME, JUST FOR YOU"
        title="Focus timer"
        description="Give one thing your attention. You can pause whenever you need to."
        action={
          <div className="today-chip">
            <span className="online-dot" /> {todaySessions.length} blocks
            completed today
          </div>
        }
      />
      <div className="focus-layout">
        <section className={`focus-card ${isBreak ? "break-mode" : ""}`}>
          <div className="timer-topline">
            <span className="timer-mode">
              <span className="timer-mode-dot" />
              {isBreak ? "A MOMENT TO RESET" : "FOCUS SESSION"}
            </span>
            <span className="timer-cycle">
              {focus.running
                ? "IN PROGRESS"
                : isBreak
                  ? "BREAK READY"
                  : "READY WHEN YOU ARE"}
            </span>
          </div>
          <div className="timer-face">
            <svg
              className="timer-progress"
              viewBox="0 0 280 280"
              aria-hidden="true"
            >
              <circle className="timer-track" cx="140" cy="140" r="128" />
              <circle
                className="timer-value"
                cx="140"
                cy="140"
                r="128"
                style={{
                  strokeDasharray: circumference,
                  strokeDashoffset: circumference * (1 - progress),
                }}
              />
            </svg>
            <div className="timer-center">
              <span className="timer-label">
                {isBreak ? <Coffee size={17} /> : <Target size={17} />}
                {isBreak ? "REST" : "FOCUS"}
              </span>
              <strong>
                {minutes}
                <span>:</span>
                {seconds}
              </strong>
              <span className="timer-subtitle">
                {isBreak
                  ? "You’ve earned a pause"
                  : focus.taskId
                    ? `Working on ${tasks.find((task) => idOf(task) === focus.taskId)?.title || "your task"}`
                    : "One thing at a time"}
              </span>
            </div>
          </div>
          <div className="timer-controls">
            {focus.running ? (
              <button className="button button-light" onClick={onPause}>
                <Pause size={15} fill="currentColor" /> Pause
              </button>
            ) : (
              <button
                className="button button-light"
                onClick={() => onStart(focus.taskId, isBreak)}
              >
                <Play size={15} fill="currentColor" />{" "}
                {focus.pendingSession
                  ? "Retry saving block"
                  : isBreak
                    ? "Start your break"
                    : ready
                      ? "Start focusing"
                      : "Start focus"}
              </button>
            )}
            {(focus.running ||
              (!focus.pendingSession && focus.timerId && remainingMs > 0)) && (
              <button className="timer-reset" onClick={onReset}>
                <X size={15} /> Reset
              </button>
            )}
          </div>
          <p className="timer-footnote">
            A completed focus block is saved to your calendar and reports.
          </p>
        </section>
        <div className="focus-side">
          <section className="panel focus-task-panel">
            <div className="eyebrow">GIVE YOUR BLOCK A HOME</div>
            <h3>What are you working on?</h3>
            <p>Choose a task, or leave this blank for an open focus session.</p>
            <select
              value={focus.taskId || ""}
              onChange={(event) => onTaskChange(event.target.value)}
              disabled={focus.running || Boolean(focus.startedAt)}
            >
              <option value="">No task selected</option>
              {tasks
                .filter((task) => !task.completedAt)
                .map((task) => (
                  <option key={idOf(task)} value={idOf(task)}>
                    {task.title}
                  </option>
                ))}
            </select>
            {focus.running && (
              <span className="field-help">
                Pause the timer to switch tasks.
              </span>
            )}
            {!focus.running && focus.startedAt && (
              <span className="field-help">
                Reset this block to choose another task.
              </span>
            )}
          </section>
          <section className="panel focus-settings-card">
            <div className="eyebrow">YOUR RHYTHM</div>
            <h3>A gentle rhythm</h3>
            <div className="rhythm-row">
              <span>
                <Target size={16} /> Focus
              </span>
              <strong>{user.focusMinutes} min</strong>
            </div>
            <div className="rhythm-divider" />
            <div className="rhythm-row">
              <span>
                <Coffee size={16} /> Break
              </span>
              <strong>{user.breakMinutes} min</strong>
            </div>
            <button
              className="text-link"
              onClick={() =>
                document.querySelector("[data-settings-link]")?.click()
              }
            >
              Adjust timer settings <ArrowRight size={14} />
            </button>
          </section>
          <section className="soft-tip">
            <div className="tip-icon">
              <Sparkles size={16} />
            </div>
            <div>
              <strong>Keep it kind.</strong>
              <p>
                It’s okay if your focus is interrupted. Start again when you’re
                ready.
              </p>
            </div>
          </section>
        </div>
      </div>
      <section className="panel recent-sessions">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">YOUR RECENT MOMENTS</div>
            <h3>Focus history</h3>
          </div>
          <span className="session-total">
            {formatMinutes(
              sessions.reduce(
                (sum, session) => sum + session.durationMinutes,
                0,
              ),
            )}{" "}
            total
          </span>
        </div>
        {sessions.length ? (
          <div className="session-list">
            {sessions.slice(0, 5).map((session) => (
              <div className="session-row" key={idOf(session)}>
                <div className="session-icon">
                  <Zap size={15} />
                </div>
                <div className="session-name">
                  <strong>{session.taskTitle || "Focus session"}</strong>
                  <span>
                    {formatDay(localDateKey(new Date(session.endedAt)))}
                  </span>
                </div>
                <strong className="session-duration">
                  {session.durationMinutes} min
                </strong>
                <span className="session-check">
                  <Check size={13} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="session-empty">
            Your completed focus blocks will show up here.
          </div>
        )}
      </section>
    </>
  );
}

// Calendar dates are local browser days, while stored timestamps remain shared UTC instants.
function CalendarPage({ tasks, sessions, notes, onSaveNote }) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedKey, setSelectedKey] = useState(localDateKey());
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const offset =
    (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const selectedNote =
    notes.find((note) => note.dateKey === selectedKey)?.content || "";
  const tasksForDate = (dateKey) =>
    tasks.filter(
      (task) =>
        task.dueDate === dateKey ||
        (task.completedAt && sameLocalDay(task.completedAt, dateKey)),
    );
  const selectedTasks = tasksForDate(selectedKey);
  const selectedSessions = sessions.filter((session) =>
    sameLocalDay(session.endedAt, selectedKey),
  );
  useEffect(() => setNoteDraft(selectedNote), [selectedKey, selectedNote]);
  const cells = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  function shiftMonth(offset) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedKey(localDateKey(next));
  }

  function selectDate(dateKey) {
    if (!dateKey) return;
    const date = dateFromKey(dateKey);
    setSelectedKey(dateKey);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  async function save() {
    setNoteSaving(true);
    try {
      await onSaveNote(selectedKey, noteDraft);
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="YOUR DAYS, WITH A LITTLE MORE CLARITY"
        title="Calendar"
        description="Choose any date to see its tasks, focus time, and private note."
      />
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="calendar-toolbar">
            <button
              className="icon-button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              <ArrowLeft size={17} />
            </button>
            <h3>{dateLabel(month)}</h3>
            <button
              className="icon-button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              <ArrowRight size={17} />
            </button>
            <button
              className="text-link calendar-today"
              onClick={() => selectDate(localDateKey())}
            >
              Today
            </button>
            <label className="calendar-jump">
              Go to date
              <input
                type="date"
                value={selectedKey}
                onChange={(event) => selectDate(event.target.value)}
                aria-label="Go to date"
              />
            </label>
          </div>
          <div className="calendar-grid">
            <div className="calendar-weekdays">
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-days">
              {cells.map((day, index) => {
                if (!day)
                  return (
                    <div className="calendar-blank" key={`blank-${index}`} />
                  );
                const key = localDateKey(
                  new Date(month.getFullYear(), month.getMonth(), day),
                );
                const taskCount = tasksForDate(key).length;
                const focusMinutes = focusMinutesOn(sessions, key);
                const noteExists = notes.some((note) => note.dateKey === key);
                return (
                  <button
                    key={key}
                    className={`calendar-day ${key === selectedKey ? "selected" : ""} ${key === localDateKey() ? "is-today" : ""}`}
                    onClick={() => selectDate(key)}
                  >
                    <span className="calendar-day-number">{day}</span>
                    <div className="calendar-markers">
                      {focusMinutes > 0 && (
                        <span className="calendar-focus-mark">
                          <i />
                          {formatMinutes(focusMinutes)}
                        </span>
                      )}
                      {taskCount > 0 && (
                        <span className="calendar-task-mark">
                          <i />
                          {taskCount} {taskCount === 1 ? "task" : "tasks"}
                        </span>
                      )}
                      {noteExists && (
                        <span className="calendar-note-mark">
                          <FileText size={10} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="calendar-legend">
            <span>
              <i className="legend-focus" /> Focus time
            </span>
            <span>
              <i className="legend-task" /> Tasks due or completed
            </span>
            <span>
              <i className="legend-note" /> Has a note
            </span>
          </div>
        </section>
        <aside className="calendar-detail">
          <section className="panel day-summary">
            <div className="eyebrow">YOUR DAY</div>
            <h3>
              {formatDay(selectedKey, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>
            <div className="day-summary-stats">
              <div>
                <strong>
                  {formatMinutes(focusMinutesOn(sessions, selectedKey))}
                </strong>
                <span>Focus time</span>
              </div>
              <div>
                <strong>{selectedTasks.length}</strong>
                <span>Tasks this day</span>
              </div>
            </div>
            <div className="day-section-label">TASKS FOR THIS DAY</div>
            {selectedTasks.length ? (
              <ul className="day-activity-list">
                {selectedTasks.map((task) => (
                  <li key={idOf(task)}>
                    {task.completedAt ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <Circle size={14} />
                    )}
                    <span>{task.title}</span>
                    <small>{task.completedAt ? "Done" : "Due"}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="day-empty-line">
                No tasks were due or completed on this day.
              </p>
            )}
            <div className="day-section-label focus-day-label">
              FOCUS BLOCKS
            </div>
            {selectedSessions.length ? (
              <ul className="day-activity-list">
                {selectedSessions.map((session) => (
                  <li key={idOf(session)}>
                    <Clock3 size={14} />
                    <span>{session.taskTitle || "Focus session"}</span>
                    <small>{session.durationMinutes}m</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="day-empty-line">No focus blocks recorded.</p>
            )}
          </section>
          <section className="panel day-note-panel">
            <div className="day-note-title">
              <div>
                <div className="eyebrow">YOUR PRIVATE JOURNAL</div>
                <h3>Daily note</h3>
              </div>
              <FileText size={17} />
            </div>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="A thought, a small win, a reminder for later…"
              rows="5"
              maxLength={10000}
            />
            <div className="day-note-footer">
              <span>
                {noteDraft.length
                  ? `${noteDraft.length} characters`
                  : "Only you can see this note"}
              </span>
              <button
                className="button button-small button-primary"
                onClick={save}
                disabled={noteSaving}
              >
                {noteSaving ? "Saving…" : "Save note"}
                <Check size={13} />
              </button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

// Reports use the shared local-day helpers so totals match the Calendar view.
function ReportsPage({ tasks, sessions }) {
  const [period, setPeriod] = useState("week");
  const [anchor, setAnchor] = useState(new Date());
  const range = dateRangeFor(period, anchor);
  const focusByDay = range.days.map(({ key }) => focusMinutesOn(sessions, key));
  const completedByDay = range.days.map(
    ({ key }) => tasksCompletedOn(tasks, key).length,
  );
  const totalFocus = focusByDay.reduce((sum, value) => sum + value, 0);
  const totalTasks = completedByDay.reduce((sum, value) => sum + value, 0);
  const elapsedDays = range.days.filter(
    ({ key }) => key <= localDateKey(),
  ).length;
  const avg = Math.round(totalFocus / Math.max(1, elapsedDays));
  const maxFocus = Math.max(30, ...focusByDay);
  const title =
    period === "month"
      ? dateLabel(range.start)
      : `${range.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(range.end - 1).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  function move(delta) {
    setAnchor((current) =>
      period === "month"
        ? new Date(current.getFullYear(), current.getMonth() + delta, 1)
        : new Date(
            current.getFullYear(),
            current.getMonth(),
            current.getDate() + 7 * delta,
          ),
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="NOTICE YOUR PROGRESS"
        title="Reports"
        description="A gentle look at how you spent your time and what you moved forward."
        action={
          <div className="period-switch">
            <button
              className={period === "week" ? "selected" : ""}
              onClick={() => setPeriod("week")}
            >
              Week
            </button>
            <button
              className={period === "month" ? "selected" : ""}
              onClick={() => setPeriod("month")}
            >
              Month
            </button>
          </div>
        }
      />
      <section className="panel report-period">
        <button
          className="icon-button"
          aria-label="Previous period"
          onClick={() => move(-1)}
        >
          <ArrowLeft size={16} />
        </button>
        <strong>{title}</strong>
        <button
          className="icon-button"
          aria-label="Next period"
          onClick={() => move(1)}
        >
          <ArrowRight size={16} />
        </button>
        <button className="text-link" onClick={() => setAnchor(new Date())}>
          Current {period}
        </button>
      </section>
      <div className="stats-grid report-stats">
        <StatCard
          label="Time in focus"
          value={formatMinutes(totalFocus)}
          detail="Completed blocks in this period"
          icon={Clock3}
          tone="mint"
        />
        <StatCard
          label="Tasks moved forward"
          value={totalTasks}
          detail="Completed in this period"
          icon={CheckCircle2}
          tone="lavender"
        />
        <StatCard
          label="Daily focus average"
          value={formatMinutes(avg)}
          detail={
            elapsedDays
              ? `Across ${elapsedDays} elapsed day${elapsedDays === 1 ? "" : "s"}`
              : "This period has not started yet"
          }
          icon={TrendingUp}
          tone="peach"
        />
        <StatCard
          label="Most focused day"
          value={
            focusByDay.some(Boolean)
              ? formatDay(
                  range.days[focusByDay.indexOf(Math.max(...focusByDay))].key,
                  { weekday: "short" },
                )
              : "—"
          }
          detail={
            focusByDay.some(Boolean)
              ? formatMinutes(Math.max(...focusByDay)) + " of focus"
              : "Your next block can start it"
          }
          icon={Zap}
          tone="blue"
        />
      </div>
      <section className="panel report-chart-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">A VIEW OF YOUR TIME</div>
            <h3>Focus minutes by day</h3>
          </div>
          <span className="chart-unit">MINUTES</span>
        </div>
        <div className={`report-chart ${period === "month" ? "monthly" : ""}`}>
          {range.days.map(({ key, date }, index) => (
            <div className="report-bar-column" key={key}>
              <div className="report-bar-area">
                {focusByDay[index] > 0 && (
                  <span className="bar-tooltip">
                    {formatMinutes(focusByDay[index])}
                  </span>
                )}
                <div
                  className={`report-bar ${key === localDateKey() ? "today" : ""}`}
                  style={{
                    height: `${Math.max(focusByDay[index] ? 6 : 0, (focusByDay[index] / maxFocus) * 100)}%`,
                  }}
                />
              </div>
              {(period === "week" ||
                date.getDate() === 1 ||
                date.getDate() % 5 === 0 ||
                date.getDate() === range.days.length) && (
                <span className="report-bar-label">
                  {period === "week"
                    ? date.toLocaleDateString(undefined, { weekday: "short" })
                    : date.getDate()}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="report-chart-footer">
          <span>
            <i /> Focus time
          </span>
          <span>
            {formatMinutes(totalFocus)} across {range.days.length} days
          </span>
        </div>
      </section>
      <div className="report-bottom">
        <section className="panel report-task-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">MOMENTUM</div>
              <h3>Tasks completed by day</h3>
            </div>
            <CheckCircle2 size={17} className="section-icon" />
          </div>
          {range.days.some((_, index) => completedByDay[index]) ? (
            <div className="completion-list">
              {range.days
                .filter(({ key }) => tasksCompletedOn(tasks, key).length)
                .map(({ key }) => (
                  <div className="completion-day" key={key}>
                    <span>
                      {formatDay(key, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <div className="completion-stack">
                      {tasksCompletedOn(tasks, key)
                        .slice(0, 3)
                        .map((task) => (
                          <i key={idOf(task)} title={task.title} />
                        ))}
                    </div>
                    <strong>{tasksCompletedOn(tasks, key).length}</strong>
                  </div>
                ))}
            </div>
          ) : (
            <div className="report-empty">
              Completed tasks will gather here as you work.
            </div>
          )}
        </section>
        <section className="report-note">
          <div className="report-note-icon">
            <Compass size={18} />
          </div>
          <div>
            <strong>Progress is personal.</strong>
            <p>
              These numbers are here to help you notice your rhythm, not to
              judge it. Rest is part of good work, too.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

// Settings are account preferences; exports are streamed from account-scoped API endpoints.
function SettingsPage({ user, onSave, onDownload }) {
  const [form, setForm] = useState({
    focusMinutes: user.focusMinutes,
    breakMinutes: user.breakMinutes,
    dailyGoalMinutes: user.dailyGoalMinutes,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  useEffect(
    () =>
      setForm({
        focusMinutes: user.focusMinutes,
        breakMinutes: user.breakMinutes,
        dailyGoalMinutes: user.dailyGoalMinutes,
      }),
    [user.focusMinutes, user.breakMinutes, user.dailyGoalMinutes],
  );
  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(
        Object.fromEntries(
          Object.entries(form).map(([key, value]) => [key, Number(value)]),
        ),
      );
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }
  async function doExport(path, filename) {
    setExportBusy(true);
    setError("");
    try {
      await onDownload(path, filename);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setExportBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE THE SPACE YOURS"
        title="Settings & export"
        description="Choose a rhythm that feels right, and take a copy of your data whenever you need."
      />
      <div className="settings-layout">
        <form className="panel settings-panel" onSubmit={save}>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">YOUR PREFERENCES</div>
              <h3>Timer & daily goal</h3>
            </div>
            <Settings2 size={18} className="section-icon" />
          </div>
          <p className="settings-intro">
            These settings follow your account and sync across devices.
          </p>
          <div className="settings-fields">
            <label className="field-label">
              <span>
                <Target size={15} /> Focus block
              </span>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={form.focusMinutes}
                  onChange={(event) =>
                    change("focusMinutes", event.target.value)
                  }
                />
                <span>minutes</span>
              </div>
            </label>
            <label className="field-label">
              <span>
                <Coffee size={15} /> Break
              </span>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={form.breakMinutes}
                  onChange={(event) =>
                    change("breakMinutes", event.target.value)
                  }
                />
                <span>minutes</span>
              </div>
            </label>
            <label className="field-label">
              <span>
                <Flag size={15} /> Daily focus goal
              </span>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={form.dailyGoalMinutes}
                  onChange={(event) =>
                    change("dailyGoalMinutes", event.target.value)
                  }
                />
                <span>minutes</span>
              </div>
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save preferences"}
            <Check size={14} />
          </button>
        </form>
        <section className="panel export-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">YOUR DATA BELONGS TO YOU</div>
              <h3>Export your workspace</h3>
            </div>
            <ArrowDownToLine size={18} className="section-icon" />
          </div>
          <p className="settings-intro">
            Keep a copy of your tasks, notes, and focus history. Exports only
            include data from your account.
          </p>
          <div className="export-options">
            <div className="export-option">
              <div className="export-file-icon json">{`{ }`}</div>
              <div>
                <strong>Complete backup</strong>
                <span>Tasks, notes, focus sessions, and settings</span>
              </div>
              <button
                className="button button-small button-outline"
                onClick={() => doExport("/export/json", "daymark-backup.json")}
                disabled={exportBusy}
              >
                JSON <ArrowDownToLine size={13} />
              </button>
            </div>
            <div className="export-option">
              <div className="export-file-icon csv">CSV</div>
              <div>
                <strong>Tasks</strong>
                <span>Open in a spreadsheet</span>
              </div>
              <button
                className="button button-small button-outline"
                onClick={() =>
                  doExport("/export/tasks.csv", "daymark-tasks.csv")
                }
                disabled={exportBusy}
              >
                Export <ArrowDownToLine size={13} />
              </button>
            </div>
            <div className="export-option">
              <div className="export-file-icon csv">CSV</div>
              <div>
                <strong>Focus history</strong>
                <span>Task, timestamps, and minutes</span>
              </div>
              <button
                className="button button-small button-outline"
                onClick={() =>
                  doExport("/export/sessions.csv", "daymark-focus-sessions.csv")
                }
                disabled={exportBusy}
              >
                Export <ArrowDownToLine size={13} />
              </button>
            </div>
          </div>
          <div className="export-tip">
            <Sparkles size={14} /> JSON is best for keeping a full backup,
            including your daily notes.
          </div>
        </section>
        <section className="panel account-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">ACCOUNT</div>
              <h3>Your sign-in</h3>
            </div>
            <div className="avatar">{user.email.slice(0, 1).toUpperCase()}</div>
          </div>
          <div className="account-detail">
            <span>Email address</span>
            <strong>{user.email}</strong>
          </div>
          <div className="account-detail">
            <span>Privacy</span>
            <strong>
              <span className="online-dot" /> Private to your account
            </strong>
          </div>
        </section>
      </div>
    </>
  );
}
