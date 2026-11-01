import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import cors from "cors";
import { connectDatabase } from "./db.js";
import { requireUser } from "./middleware.js";
import authRoutes from "./routes/auth.js";
import taskRoutes from "./routes/tasks.js";
import activityRoutes from "./routes/activity.js";
import exportRoutes from "./routes/exports.js";
import demoRoutes from "./routes/demo.js";

const app = express();
const port = Number(process.env.PORT || 5000);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const sessionSecret =
  process.env.SESSION_SECRET ||
  "local-development-secret-change-before-deploying";
if (process.env.NODE_ENV === "production" && sessionSecret.length < 32) {
  throw new Error(
    "Set SESSION_SECRET to a random value with at least 32 characters in production.",
  );
}

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "daymark.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: process.env.MONGODB_URI
      ? MongoStore.create({
          mongoUrl: process.env.MONGODB_URI,
          collectionName: "sessions",
        })
      : undefined,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/demo", requireUser, demoRoutes);
app.use("/api/tasks", requireUser, taskRoutes);
app.use("/api", requireUser, activityRoutes);
app.use("/api/export", requireUser, exportRoutes);

if (process.env.NODE_ENV === "production") {
  const here = path.dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.resolve(here, "../../client/dist")));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.resolve(here, "../../client/dist/index.html"));
  });
}

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.code === 11000)
    return res.status(409).json({ message: "That record already exists." });
  if (error.name === "ValidationError" || error.name === "CastError")
    return res
      .status(400)
      .json({ message: "Check the details and try again." });
  res.status(error.status || 500).json({
    message: error.status
      ? error.message
      : "Something went wrong. Please try again.",
  });
});

connectDatabase()
  .then(() => {
    app.listen(port, "0.0.0.0", () =>
      console.log(`Daymark API listening on http://localhost:${port}`),
    );
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
