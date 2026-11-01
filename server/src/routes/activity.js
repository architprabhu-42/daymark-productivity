import { Router } from "express";
import mongoose from "mongoose";
import { DayNote, FocusSession, Task } from "../models.js";
import { asyncRoute } from "../middleware.js";
import { isDateKey } from "../date.js";

const router = Router();

router.get(
  "/sessions",
  asyncRoute(async (req, res) => {
    const sessions = await FocusSession.find({ userId: req.session.userId })
      .sort({ endedAt: -1 })
      .lean();
    res.json({ sessions });
  }),
);

router.post(
  "/sessions",
  asyncRoute(async (req, res) => {
    const timerId = String(req.body.timerId || "");
    const durationMinutes = Number(req.body.durationMinutes);
    const startedAt = new Date(req.body.startedAt);
    const endedAt = new Date(req.body.endedAt);
    if (
      !/^[\w-]{16,64}$/.test(timerId) ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 180 ||
      Number.isNaN(startedAt.valueOf()) ||
      Number.isNaN(endedAt.valueOf()) ||
      endedAt <= startedAt
    ) {
      return res
        .status(400)
        .json({ message: "That focus session could not be saved." });
    }

    const existing = await FocusSession.findOne({
      userId: req.session.userId,
      timerId,
    }).lean();
    if (existing) return res.json({ session: existing });

    let task = null;
    if (req.body.taskId) {
      if (!mongoose.isValidObjectId(req.body.taskId))
        return res.status(400).json({ message: "Choose a valid task." });
      task = await Task.findOne({
        _id: req.body.taskId,
        userId: req.session.userId,
      }).select("title");
      if (!task) return res.status(404).json({ message: "Task not found." });
    }

    const session = await FocusSession.create({
      userId: req.session.userId,
      timerId,
      taskId: task?._id || null,
      taskTitle: task?.title || "Focus session",
      startedAt,
      endedAt,
      durationMinutes,
    });
    res.status(201).json({ session });
  }),
);

router.get(
  "/notes",
  asyncRoute(async (req, res) => {
    const notes = await DayNote.find({ userId: req.session.userId })
      .sort({ dateKey: -1 })
      .lean();
    res.json({ notes });
  }),
);

router.put(
  "/notes/:dateKey",
  asyncRoute(async (req, res) => {
    const { dateKey } = req.params;
    if (!isDateKey(dateKey))
      return res.status(400).json({ message: "Choose a valid calendar date." });
    const content = String(req.body.content || "").trim();
    if (!content) {
      await DayNote.deleteOne({ userId: req.session.userId, dateKey });
      return res.json({ note: null });
    }
    const note = await DayNote.findOneAndUpdate(
      { userId: req.session.userId, dateKey },
      { content },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
    res.json({ note });
  }),
);

export default router;
