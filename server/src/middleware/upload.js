// server/src/middleware/upload.js
const path = require("path");
const fs = require("fs");
const multer = require("multer");

// ✅ Store uploads in server/uploads (matches app.js `app.use("/uploads", ...)`)
const uploadDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const orig = file.originalname || "file";
    const ext = path.extname(orig) || "";
    const base = path
      .basename(orig, ext)
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 60);
    cb(null, `${Date.now()}-${base}${ext.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// Memory storage for quick probes (e.g., /api/verify, /api/similar)
const uploadMem = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

module.exports = { upload, uploadMem, uploadDir };
