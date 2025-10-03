// server/src/app.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

// Routes
const authRoutes = require("./routes/auth.routes");
const artworksRoutes = require("./routes/artworks.routes");   // /upload + /api/artwork/*
const uploadRoutes = require("./routes/upload.routes");       // legacy upload + verify + metadata
const similarityRoutes = require("./routes/similarity.routes"); // /api/similar

// -------- Env / config --------
const FRONTEND_BASE = process.env.FRONTEND_BASE || "http://localhost:3000";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev_session_secret_change_me";

// If API is served behind its own HTTPS origin (e.g. Cloudflare tunnel),
// cookies must be SameSite=None; Secure to be sent cross-site.
const USING_TUNNEL =
  process.env.USE_TUNNEL === "1" ||
  process.env.USING_TUNNEL === "true" ||
  false;

const app = express();

// If you run behind a proxy (Cloudflare tunnel), keep trust proxy on:
app.set("trust proxy", 1);

// -------- CORS (allow frontend) --------
app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin / no-origin (curl, mobile apps) and your FE
      const allowed = new Set([FRONTEND_BASE, "http://localhost:3000"]);
      if (!origin || allowed.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

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
    cookie: USING_TUNNEL
      ? {
          // API on a different HTTPS origin (Cloudflare)
          secure: true,
          httpOnly: true,
          sameSite: "none",
          maxAge: 1000 * 60 * 60 * 24 * 7,
        }
      : {
          // Local dev: FE http://localhost:3000 -> API http://localhost:5000
          secure: false,
          httpOnly: true,
          sameSite: "lax",
          maxAge: 1000 * 60 * 60 * 24 * 7,
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
