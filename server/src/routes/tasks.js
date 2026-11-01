import { Router } from "express";
import mongoose from "mongoose";
import { Task, FocusSession } from "../models.js";
import { asyncRoute } from "../middleware.js";
import { isDateKey } from "../date.js";

const router = Router();
const fields = ["title", "note", "priority", "category", "dueDate"];

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const tasks = await Task.find({ userId: req.session.userId })
      .sort({ completedAt: 1, dueDate: 1, createdAt: -1 })
      .lean();
    res.json({ tasks });
  }),
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title)
      return res.status(400).json({ message: "Give your task a title." });
    const dueDate = String(req.body.dueDate || "");
    if (dueDate && !isDateKey(dueDate))
      return res.status(400).json({ message: "Choose a valid due date." });
    const task = await Task.create({
      userId: req.session.userId,
      title,
      note: String(req.body.note || "").trim(),
      priority: ["low", "medium", "high"].includes(req.body.priority)
        ? req.body.priority
        : "medium",
      category: String(req.body.category || "").trim(),
      dueDate,
    });
    res.status(201).json({ task });
  }),
);

router.put(
  "/:id",
  asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: "Task not found." });
    const update = {};
    for (const field of fields)
      if (req.body[field] !== undefined)
        update[field] = String(req.body[field] ?? "").trim();
    if (!update.title && req.body.title !== undefined)
      return res.status(400).json({ message: "Give your task a title." });
    if (update.dueDate && !isDateKey(update.dueDate))
      return res.status(400).json({ message: "Choose a valid due date." });
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      update,
      { new: true, runValidators: true },
    );
    if (!task) return res.status(404).json({ message: "Task not found." });
    await FocusSession.updateMany(
      { taskId: task._id, userId: req.session.userId },
      { taskTitle: task.title },
    );
    res.json({ task });
  }),
);

router.patch(
  "/:id/completion",
  asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: "Task not found." });
    if (typeof req.body.completed !== "boolean")
      return res
        .status(400)
        .json({ message: "Choose whether this task is complete." });
    const completedAt = req.body.completed ? new Date() : null;
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      { completedAt },
      { new: true },
    );
    if (!task) return res.status(404).json({ message: "Task not found." });
    res.json({ task });
  }),
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: "Task not found." });
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.session.userId,
    });
    if (!task) return res.status(404).json({ message: "Task not found." });
    // Removing the task also removes its sessions, so reports never retain an orphaned task record.
    await FocusSession.deleteMany({
      taskId: task._id,
      userId: req.session.userId,
    });
    await task.deleteOne();
    res.json({ ok: true });
  }),
);

export default router;
