// install: npm i cors
const cors = require("cors");

const ALLOWED_ORIGIN =
  process.env.CORS_ORIGIN ||
  process.env.FRONTEND_BASE ||           // e.g. https://taedal.netlify.app
  "http://localhost:3000";

app.set("trust proxy", 1);               // important for secure cookies on Render

app.use(cors({
  origin: ALLOWED_ORIGIN,
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Requested-With"],
}));

// Respond to preflight quickly
app.options("*", cors({
  origin: ALLOWED_ORIGIN,
  credentials: true,
}));

app.use((req, res, next) => {
  // allow Google OAuth popup postMessage
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  // not required, but avoids COEP warnings
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});


module.exports = require('./src/index');
