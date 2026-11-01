import { Router } from "express";
import { DayNote, FocusSession, Task, User } from "../models.js";
import { asyncRoute } from "../middleware.js";

const router = Router();

router.get(
  "/json",
  asyncRoute(async (req, res) => {
    const userId = req.session.userId;
    const [user, tasks, sessions, notes] = await Promise.all([
      User.findById(userId)
        .select("email focusMinutes breakMinutes dailyGoalMinutes")
        .lean(),
      Task.find({ userId }).sort({ createdAt: 1 }).lean(),
      FocusSession.find({ userId }).sort({ endedAt: 1 }).lean(),
      DayNote.find({ userId }).sort({ dateKey: 1 }).lean(),
    ]);
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=daymark-backup.json",
    );
    res.json({
      exportedAt: new Date().toISOString(),
      user,
      tasks,
      focusSessions: sessions,
      dayNotes: notes,
    });
  }),
);

const csvCell = (value) => {
  const text = String(value ?? "").replaceAll('"', '""');
  // Prefix spreadsheet formula markers so task text remains data when opened in a spreadsheet.
  return `"${/^[=+\-@]/.test(text) ? `'${text}` : text}"`;
};

router.get(
  "/tasks.csv",
  asyncRoute(async (req, res) => {
    const tasks = await Task.find({ userId: req.session.userId })
      .sort({ createdAt: 1 })
      .lean();
    const rows = [
      [
        "title",
        "note",
        "priority",
        "category",
        "dueDate",
        "completedAt",
        "createdAt",
      ],
      ...tasks.map((task) => [
        task.title,
        task.note,
        task.priority,
        task.category,
        task.dueDate,
        task.completedAt?.toISOString() || "",
        task.createdAt.toISOString(),
      ]),
    ];
    res
      .type("text/csv")
      .setHeader(
        "Content-Disposition",
        "attachment; filename=daymark-tasks.csv",
      );
    res.send(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
  }),
);

router.get(
  "/sessions.csv",
  asyncRoute(async (req, res) => {
    const sessions = await FocusSession.find({ userId: req.session.userId })
      .sort({ endedAt: 1 })
      .lean();
    const rows = [
      ["task", "startedAt", "endedAt", "durationMinutes"],
      ...sessions.map((session) => [
        session.taskTitle,
        session.startedAt.toISOString(),
        session.endedAt.toISOString(),
        session.durationMinutes,
      ]),
    ];
    res
      .type("text/csv")
      .setHeader(
        "Content-Disposition",
        "attachment; filename=daymark-focus-sessions.csv",
      );
    res.send(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
  }),
);

export default router;
