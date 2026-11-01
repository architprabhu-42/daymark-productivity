import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models.js";
import { asyncRoute } from "../middleware.js";

const router = Router();
// dotenv/config in the API entry point loads these private settings before this route is imported.
const sampleAdminEmail = (process.env.SAMPLE_ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();
const sampleAdminPassword = process.env.SAMPLE_ADMIN_PASSWORD || "";
const publicUser = (user) => ({
  id: user._id,
  email: user.email,
  focusMinutes: user.focusMinutes,
  breakMinutes: user.breakMinutes,
  dailyGoalMinutes: user.dailyGoalMinutes,
  sampleDataLoaded: user.sampleDataLoaded,
  isAdmin: Boolean(user.isAdmin),
});

function establishSession(req, userId) {
  return new Promise((resolve, reject) => {
    // Rotate the session identifier at sign-in so an old anonymous cookie cannot become an authenticated session.
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.userId = String(userId);
      req.session.save((saveError) =>
        saveError ? reject(saveError) : resolve(),
      );
    });
  });
}

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    const user = await User.findById(req.session.userId);
    if (!user) return res.json({ user: null });
    res.json({ user: publicUser(user) });
  }),
);

router.post(
  "/register",
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    if (!/^\S+@\S+\.\S+$/.test(email))
      return res.status(400).json({ message: "Enter a valid email address." });
    if (password.length < 8)
      return res
        .status(400)
        .json({ message: "Use a password with at least 8 characters." });
    const isAdmin = email === sampleAdminEmail;
    if (isAdmin && (!sampleAdminPassword || password !== sampleAdminPassword)) {
      return res.status(403).json({
        message: "Use the configured admin password for this email address.",
      });
    }
    if (await User.exists({ email }))
      return res
        .status(409)
        .json({ message: "An account with that email already exists." });

    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      isAdmin,
    });
    await establishSession(req, user._id);
    res.status(201).json({ user: publicUser(user) });
  }),
);

router.post(
  "/login",
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email });
    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
    const configuredAdminLogin =
      email === sampleAdminEmail &&
      sampleAdminPassword &&
      password === sampleAdminPassword;
    if (!user || (!passwordMatches && !configuredAdminLogin)) {
      return res
        .status(401)
        .json({ message: "Email or password is incorrect." });
    }
    // The private configured secret can promote an existing account and align its password with the admin setting.
    if (configuredAdminLogin && (!user.isAdmin || !passwordMatches)) {
      if (!passwordMatches) user.passwordHash = await bcrypt.hash(password, 12);
      user.isAdmin = true;
      await user.save();
    }
    await establishSession(req, user._id);
    res.json({ user: publicUser(user) });
  }),
);

router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("daymark.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    res.json({ ok: true });
  });
});

router.patch(
  "/settings",
  asyncRoute(async (req, res) => {
    if (!req.session.userId)
      return res.status(401).json({ message: "Please sign in to continue." });
    const update = {};
    for (const field of ["focusMinutes", "breakMinutes", "dailyGoalMinutes"]) {
      if (req.body[field] !== undefined) {
        const value = Number(req.body[field]);
        const maximum =
          field === "focusMinutes" ? 180 : field === "breakMinutes" ? 60 : 1440;
        const minimum = field === "dailyGoalMinutes" ? 0 : 1;
        if (!Number.isInteger(value) || value < minimum || value > maximum) {
          return res.status(400).json({
            message: `Choose a ${field} value between ${minimum} and ${maximum}.`,
          });
        }
        update[field] = value;
      }
    }
    const user = await User.findByIdAndUpdate(req.session.userId, update, {
      new: true,
      runValidators: true,
    });
    res.json({ user: publicUser(user) });
  }),
);

export default router;
