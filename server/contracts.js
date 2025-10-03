// server/contracts.js
const { randomUUID } = require("crypto");

/**
 * Mounts contract CRUD endpoints onto your existing Express app.
 * Uses the same SQLite `db` already opened in server.js
 */
module.exports = function mountContracts(app, db) {
  // Ensure table exists
  db.run(`
    CREATE TABLE IF NOT EXISTS contract (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      counterparty TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      currency TEXT NOT NULL DEFAULT 'USD',
      value REAL NOT NULL DEFAULT 0,
      body TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(owner_id) REFERENCES user(id)
    )
  `);

  const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ ok: false, error: "Not logged in" });
    }
    next();
  };

  // GET /api/contracts?tab=all|draft|negotiating|active|signed&q=...
  app.get("/api/contracts", requireAuth, (req, res) => {
    const me = req.session.userId;
    const tab = String(req.query.tab || "all").toLowerCase();
    const q = String(req.query.q || "").trim();

    const params = [me];
    let where = "owner_id = ?";
    if (tab && tab !== "all") {
      where += " AND status = ?";
      params.push(tab);
    }
    if (q) {
      where += " AND (title LIKE ? OR counterparty LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    const sql = `
      SELECT id, owner_id, title, counterparty, status, currency, value, updated_at
      FROM contract
      WHERE ${where}
      ORDER BY datetime(updated_at) DESC
    `;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, contracts: rows || [] });
    });
  });

  // GET /api/contracts/:id
  app.get("/api/contracts/:id", requireAuth, (req, res) => {
    const me = req.session.userId;
    const id = String(req.params.id);
    db.get(
      `SELECT * FROM contract WHERE id = ? AND owner_id = ?`,
      [id, me],
      (err, row) => {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        if (!row) return res.status(404).json({ ok: false, error: "Not found" });
        res.json({ ok: true, contract: row });
      }
    );
  });

  // POST /api/contracts
  app.post("/api/contracts", requireAuth, (req, res) => {
    const me = req.session.userId;
    let {
      title,
      counterparty = "",
      status = "draft",
      currency = "USD",
      value = 0,
      body = "",
    } = req.body || {};

    title = String(title || "").trim();
    if (!title) return res.status(400).json({ ok: false, error: "Title required" });

    status = String(status || "draft").toLowerCase();
    const allowed = new Set(["draft", "negotiating", "active", "signed", "expired"]);
    if (!allowed.has(status)) status = "draft";

    currency = String(currency || "USD").slice(0, 8);
    value = Number(value) || 0;
    body = String(body || "");

    const id = randomUUID();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO contract (id, owner_id, title, counterparty, status, currency, value, body, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, me, title, counterparty, status, currency, value, body, now, now],
      function (err) {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        res.json({
          ok: true,
          contract: {
            id,
            owner_id: me,
            title,
            counterparty,
            status,
            currency,
            value,
            body,
            created_at: now,
            updated_at: now,
          },
        });
      }
    );
  });

  // PATCH /api/contracts/:id
  app.patch("/api/contracts/:id", requireAuth, (req, res) => {
    const me = req.session.userId;
    const id = String(req.params.id);

    db.get(`SELECT owner_id FROM contract WHERE id = ?`, [id], (e, row) => {
      if (e) return res.status(500).json({ ok: false, error: e.message });
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });
      if (Number(row.owner_id) !== Number(me))
        return res.status(403).json({ ok: false, error: "Forbidden" });

      const now = new Date().toISOString();
      const allowed = new Set(["draft", "negotiating", "active", "signed", "expired"]);
      let {
        title,
        counterparty,
        status,
        currency,
        value,
        body,
      } = req.body || {};

      const fields = [];
      const params = [];
      if (typeof title !== "undefined") {
        fields.push("title = ?");
        params.push(String(title || "").trim());
      }
      if (typeof counterparty !== "undefined") {
        fields.push("counterparty = ?");
        params.push(String(counterparty || ""));
      }
      if (typeof status !== "undefined") {
        const s = String(status || "draft").toLowerCase();
        fields.push("status = ?");
        params.push(allowed.has(s) ? s : "draft");
      }
      if (typeof currency !== "undefined") {
        fields.push("currency = ?");
        params.push(String(currency || "USD").slice(0, 8));
      }
      if (typeof value !== "undefined") {
        fields.push("value = ?");
        params.push(Number(value) || 0);
      }
      if (typeof body !== "undefined") {
        fields.push("body = ?");
        params.push(String(body || ""));
      }

      fields.push("updated_at = ?");
      params.push(now);

      params.push(id);
      const sql = `UPDATE contract SET ${fields.join(", ")} WHERE id = ?`;

      db.run(sql, params, function (err2) {
        if (err2) return res.status(500).json({ ok: false, error: err2.message });
        res.json({ ok: true, updated_at: now });
      });
    });
  });

  // POST /api/contracts/:id/request-sign  (stub)
  app.post("/api/contracts/:id/request-sign", requireAuth, (req, res) => {
    const me = req.session.userId;
    const id = String(req.params.id);
    db.get(
      `SELECT id FROM contract WHERE id = ? AND owner_id = ?`,
      [id, me],
      (err, row) => {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        if (!row) return res.status(404).json({ ok: false, error: "Not found" });
        // For now just flip status to 'negotiating'
        db.run(
          `UPDATE contract SET status = 'negotiating', updated_at = ? WHERE id = ?`,
          [new Date().toISOString(), id],
          () => res.json({ ok: true })
        );
      }
    );
  });
};
