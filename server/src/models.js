import mongoose from "mongoose";

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    focusMinutes: { type: Number, default: 25, min: 1, max: 180 },
    breakMinutes: { type: Number, default: 5, min: 1, max: 60 },
    dailyGoalMinutes: { type: Number, default: 120, min: 0, max: 1440 },
    sampleDataLoaded: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Private records all carry userId so route queries can enforce account boundaries directly.
const taskSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    note: { type: String, trim: true, maxlength: 4000, default: "" },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    category: { type: String, trim: true, maxlength: 40, default: "" },
    dueDate: { type: String, match: /^(|\d{4}-\d{2}-\d{2})$/, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const focusSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    timerId: { type: String, required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    taskTitle: { type: String, trim: true, default: "Focus session" },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1, max: 180 },
  },
  { timestamps: true },
);
focusSessionSchema.index({ userId: 1, timerId: 1 }, { unique: true });

const dayNoteSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    content: { type: String, trim: true, maxlength: 10000, default: "" },
  },
  { timestamps: true },
);
dayNoteSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const User = model("User", userSchema);
export const Task = model("Task", taskSchema);
export const FocusSession = model("FocusSession", focusSessionSchema);
export const DayNote = model("DayNote", dayNoteSchema);
