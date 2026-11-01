import { randomUUID } from "node:crypto";
import { Router } from "express";
import { DayNote, FocusSession, Task, User } from "../models.js";
import { asyncRoute } from "../middleware.js";
import { isDateKey } from "../date.js";

const router = Router();

function localDayKey(todayKey, daysFromToday = 0) {
  const [year, month, day] = todayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + daysFromToday));
  return date.toISOString().slice(0, 10);
}

function localTime(todayKey, timezoneOffset, daysFromToday, hour, minute = 0) {
  const [year, month, day] = todayKey.split("-").map(Number);
  // Convert the user's local wall-clock time to UTC using the browser's offset.
  const localTimeAsUtc = Date.UTC(
    year,
    month - 1,
    day + daysFromToday,
    hour,
    minute,
  );
  return new Date(localTimeAsUtc + timezoneOffset * 60_000);
}

router.post(
  "/sample-data",
  asyncRoute(async (req, res) => {
    const userId = req.session.userId;
    const account = await User.findById(userId).select("isAdmin");
    if (!account?.isAdmin) {
      return res.status(403).json({
        message: "Sample workspaces are available to the admin account only.",
      });
    }
    const { todayKey, timezoneOffset } = req.body;
    if (
      !isDateKey(todayKey) ||
      !Number.isInteger(timezoneOffset) ||
      timezoneOffset < -840 ||
      timezoneOffset > 840
    ) {
      return res.status(400).json({ message: "Invalid local date settings." });
    }

    // Atomically mark the one-time sample action before inserting its related records.
    const reservation = await User.updateOne(
      { _id: userId, sampleDataLoaded: { $ne: true } },
      { $set: { sampleDataLoaded: true } },
    );
    if (!reservation.modifiedCount) {
      return res.status(409).json({
        message: "Sample data has already been loaded for this account.",
      });
    }

    let taskCount;
    let sessionCount;
    let noteCount;
    try {
      [taskCount, sessionCount, noteCount] = await Promise.all([
        Task.countDocuments({ userId }),
        FocusSession.countDocuments({ userId }),
        DayNote.countDocuments({ userId }),
      ]);
    } catch (error) {
      await User.updateOne(
        { _id: userId },
        { $set: { sampleDataLoaded: false } },
      );
      throw error;
    }
    if (taskCount || sessionCount || noteCount) {
      await User.updateOne(
        { _id: userId },
        { $set: { sampleDataLoaded: false } },
      );
      return res.status(409).json({
        message: "Sample data can only be added to an empty workspace.",
      });
    }

    let tasks = [];
    let sessions = [];
    let notes = [];
    try {
      tasks = await Task.insertMany([
        {
          userId,
          title: "Plan the week ahead",
          note: "Pick the one thing that would make this week feel successful.",
          priority: "medium",
          category: "Planning",
          dueDate: localDayKey(todayKey, -1),
          completedAt: localTime(todayKey, timezoneOffset, -1, 12, 15),
        },
        {
          userId,
          title: "Draft the project outline",
          note: "Start with the problem, audience, and three main sections.",
          priority: "high",
          category: "Work",
          dueDate: localDayKey(todayKey),
        },
        {
          userId,
          title: "Review your study notes",
          note: "Look over the last chapter and capture any open questions.",
          priority: "medium",
          category: "Study",
          dueDate: localDayKey(todayKey, 1),
        },
        {
          userId,
          title: "Take a short walk",
          note: "A small reset counts, too.",
          priority: "low",
          category: "Personal",
        },
        {
          userId,
          title: "Choose tomorrow’s first task",
          priority: "low",
          category: "Planning",
          dueDate: localDayKey(todayKey, 1),
        },
      ]);

      const completedTask = tasks[0];
      const projectTask = tasks[1];
      const studyTask = tasks[2];
      const sessionSpecs = [
        { task: completedTask, daysAgo: -1, hour: 13, durationMinutes: 25 },
        { task: projectTask, daysAgo: 0, hour: 10, durationMinutes: 25 },
        { task: studyTask, daysAgo: -2, hour: 14, durationMinutes: 50 },
      ];
      sessions = await FocusSession.insertMany(
        sessionSpecs.map(({ task, daysAgo, hour, durationMinutes }) => {
          const endedAt = localTime(todayKey, timezoneOffset, daysAgo, hour);
          return {
            userId,
            timerId: randomUUID(),
            taskId: task._id,
            taskTitle: task.title,
            startedAt: new Date(endedAt.getTime() - durationMinutes * 60000),
            endedAt,
            durationMinutes,
          };
        }),
      );

      notes = await DayNote.insertMany([
        {
          userId,
          dateKey: localDayKey(todayKey),
          content:
            "Today’s intention: make a little progress on the project outline, then take a proper break.",
        },
        {
          userId,
          dateKey: localDayKey(todayKey, -1),
          content:
            "A win from yesterday: I made a plan and finished the first focus block.",
        },
      ]);
    } catch (error) {
      await Promise.all([
        Task.deleteMany({
          _id: { $in: tasks.map((task) => task._id) },
          userId,
        }),
        FocusSession.deleteMany({
          _id: { $in: sessions.map((session) => session._id) },
          userId,
        }),
        DayNote.deleteMany({
          _id: { $in: notes.map((note) => note._id) },
          userId,
        }),
        User.updateOne({ _id: userId }, { $set: { sampleDataLoaded: false } }),
      ]);
      throw error;
    }

    res.status(201).json({
      message: "Sample workspace added.",
      counts: {
        tasks: tasks.length,
        focusSessions: sessions.length,
        dayNotes: notes.length,
      },
    });
  }),
);

export default router;
