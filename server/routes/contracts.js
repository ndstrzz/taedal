// server/routes/contracts.js
const { Router } = require("express");
const crypto = require("crypto");

const router = Router();

// In-memory store (swap for DB later)
const store = {
  users: [{ id: "u1", username: "artist" }],
  contracts: {},
  shares: {},      // token -> { contract_id, expires_at }
  signatures: {},  // contract_id -> [ { signer_name, signer_email, ... } ]
};

function requireSession(req, _res, next) {
  // DEMO ONLY: fake session as user u1
  req.user = store.users[0];
  next();
}
router.use(requireSession);

const nowISO = () => new Date().toISOString();

function ensureOwner(req, res, next) {
  const c = store.contracts[req.params.id];
  if (!c) return res.json({ ok: false, error: "Not found" });
  if (c.owner_id !== req.user.id) return res.json({ ok: false, error: "Forbidden" });
  req.contract = c;
  next();
}

// List contracts
router.get("/contracts", (req, res) => {
  const list = Object.values(store.contracts).filter(c => c.owner_id === req.user.id);
  res.json({ ok: true, contracts: list });
});

// Create contract
router.post("/contracts", (req, res) => {
  const id = crypto.randomUUID();
  const c = {
    id,
    owner_id: req.user.id,
    owner_username: req.user.username,
    title: "Untitled contract",
    counterparty_name: "",
    counterparty_email: "",
    value: 0,
    currency: "USD",
    status: "draft",
    body_md: "",
    effective_date: "",
    expiry_date: "",
    updated_at: nowISO(),
    created_at: nowISO(),
  };
  store.contracts[id] = c;
  res.json({ ok: true, contract: c });
});

// Read
router.get("/contracts/:id", ensureOwner, (req, res) => {
  res.json({ ok: true, contract: req.contract });
});

// Update
router.patch("/contracts/:id", ensureOwner, (req, res) => {
  Object.assign(req.contract, req.body || {}, { updated_at: nowISO() });
  res.json({ ok: true, contract: req.contract });
});

// Share (generate token link)
router.post("/contracts/:id/share", ensureOwner, (req, res) => {
  const token = crypto.randomBytes(24).toString("hex");
  const expires_at = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  store.shares[token] = { contract_id: req.contract.id, expires_at };
  const url = `${process.env.APP_ORIGIN || "http://localhost:3000"}/review/${req.contract.id}?t=${token}`;
  res.json({ ok: true, url });
});

// Public review (token-gated)
router.get("/review/:id", (req, res) => {
  const { t } = req.query;
  const share = store.shares[t];
  if (!share || share.contract_id !== req.params.id || Date.now() > share.expires_at) {
    return res.json({ ok: false, error: "Invalid or expired token" });
  }
  const c = store.contracts[req.params.id];
  if (!c) return res.json({ ok: false, error: "Not found" });
  res.json({ ok: true, contract: c });
});

router.post("/review/:id/comment", (req, res) => {
  const { t } = req.query;
  const share = store.shares[t];
  if (!share || share.contract_id !== req.params.id) return res.json({ ok: false, error: "Invalid token" });
  // Persist comment in DB later. For now just ACK.
  res.json({ ok: true });
});

router.post("/review/:id/approve", (req, res) => {
  const { t } = req.query;
  const share = store.shares[t];
  if (!share || share.contract_id !== req.params.id) return res.json({ ok: false, error: "Invalid token" });
  const c = store.contracts[req.params.id];
  if (!c) return res.json({ ok: false, error: "Not found" });
  c.status = "approved";
  c.updated_at = nowISO();
  res.json({ ok: true });
});

router.post("/review/:id/sign", (req, res) => {
  const { t } = req.query;
  const share = store.shares[t];
  if (!share || share.contract_id !== req.params.id) return res.json({ ok: false, error: "Invalid token" });
  const c = store.contracts[req.params.id];
  if (!c) return res.json({ ok: false, error: "Not found" });

  const { signer_name, signer_email } = req.body || {};
  if (!signer_name || !signer_email) return res.json({ ok: false, error: "Missing signer info" });

  if (!store.signatures[c.id]) store.signatures[c.id] = [];
  store.signatures[c.id].push({
    signer_name,
    signer_email,
    signed_at: nowISO(),
    ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString(),
    ua: req.headers["user-agent"] || "",
  });

  c.status = "signed";
  c.updated_at = nowISO();
  res.json({ ok: true });
});

// PDF preview (stub)
router.get("/contracts/:id/pdf", ensureOwner, (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(
    [
      "CONTRACT (preview)\n",
      `Title: ${req.contract.title}`,
      `Counterparty: ${req.contract.counterparty_name} <${req.contract.counterparty_email}>`,
      `Value: ${req.contract.currency} ${req.contract.value}`,
      "",
      req.contract.body_md || "(no body)",
      "",
      `Status: ${req.contract.status}`,
      `Updated: ${req.contract.updated_at}`,
    ].join("\n")
  );
});

module.exports = router;
