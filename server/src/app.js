// server/src/app.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

// Routes
const authRoutes = require("./routes/auth.routes");
const artworksRoutes = require("./routes/artworks.routes");     // /upload + /api/artwork/*
const uploadRoutes = require("./routes/upload.routes");         // legacy upload + verify + metadata
const similarityRoutes = require("./routes/similarity.routes"); // /api/similar

// -------- Env / config --------
const FRONTEND_BASE = process.env.FRONTEND_BASE || "http://localhost:3000";

// If you want to pin a specific origin for CORS (recommended), set CORS_ORIGIN, otherwise we fall back to FRONTEND_BASE
const CORS_ORIGIN = process.env.CORS_ORIGIN || FRONTEND_BASE;

// Session secrets/cookie behaviour
const SESSION_SECRET = process.env.SESSION_SECRET || "dev_session_secret_change_me";
const COOKIE_SECURE =
  String(process.env.SESSION_COOKIE_SECURE || "").toLowerCase() === "true" ||
  process.env.NODE_ENV === "production"; // Render is HTTPS → true
const COOKIE_SAMESITE =
  (process.env.SESSION_COOKIE_SAMESITE || (COOKIE_SECURE ? "none" : "lax")).toLowerCase();

const app = express();

// Render/Cloud provider sits behind a proxy → needed for 'secure' cookies to be honored
app.set("trust proxy", 1);

// -------- CORS (force headers + handle preflights) --------
const FE_ORIGIN = (process.env.CORS_ORIGIN || process.env.FRONTEND_BASE || "http://localhost:3000").replace(/\/+$/, "");

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow =
    !origin ||
    origin.replace(/\/+$/, "") === FE_ORIGIN ||
    origin === "http://localhost:3000";

  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", origin || FE_ORIGIN);
    // Vary on both Origin and requested headers to cache correctly
    res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

    // Mirror back what the browser intends to send (covers Cache-Control, etc.)
    const reqHeaders = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      reqHeaders || "Content-Type, Authorization, X-Requested-With, Cache-Control"
    );
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});



// -------- Body parsing --------
app.use(express.json({ limit: "5mb" }));

// -------- Sessions (SQLite-backed) --------
const dataDir = path.join(__dirname, "..", "data");
const sessionsFile = path.join(dataDir, "sessions.sqlite3");
fs.mkdirSync(path.dirname(sessionsFile), { recursive: true });

app.use(
  session({
    name: "sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({
      db: path.basename(sessionsFile),
      dir: path.dirname(sessionsFile),
      concurrentDB: false,
    }),
    cookie: {
      httpOnly: true,
      secure: COOKIE_SECURE,          // true on Render (HTTPS)
      sameSite: COOKIE_SAMESITE,      // 'none' on Render → cross-site cookie works
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    },
  })
);

// -------- Static assets --------
app.use("/avatars", express.static(path.join(__dirname, "public", "avatars")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// -------- Health check --------
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// -------- Routes --------
app.use(authRoutes);
app.use(artworksRoutes);
app.use(uploadRoutes);
app.use("/api", similarityRoutes);

// -------- 404 --------
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// -------- Error handler --------
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "Server error" });
});

module.exports = app;
