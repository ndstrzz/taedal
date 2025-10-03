const crypto = require("crypto");

/**
 * Registers the Contracts API against an existing Express app + sqlite3 db.
 *
 * Exposes:
 *  GET    /api/contracts               (list)
 *  GET    /api/contracts/:id           (get one)
 *  POST   /api/contracts               (create)
 *  PATCH  /api/contracts/:id           (update)
 *  POST   /api/contracts/:id/request-sign  (set status=negotiating)
 */
module.exports = function registerContractRoutes(app, db) {
  // Ensure table exists
  db.run(`
    CREATE TABLE IF NOT EXISTS contract (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      counterparty TEXT,
      status TEXT NOT NULL,
      currency TEXT NOT NULL,
      value REAL NOT NULL,
      body TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  function pickContractPayload(req) {
    const src = req.body?.form || req.body || {};
    const out = {
      title: String(src.title || "").trim(),
      counterparty: String(src.counterparty || "").trim(),
      status: String(src.status || "draft"),
      currency: String(src.currency || "USD"),
      value: Number(src.value) || 0,
      body: String(src.body || ""),
    };
    if (!out.title) out.title = "Untitled contract";
    return out;
  }

  // List with simple filters
  app.get("/api/contracts", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ ok:false, error:"not_authenticated" });

    const me = req.session.userId;
    const tab = String(req.query.tab || "all");
    const q = String(req.query.q || "").trim();

    const params = [me];
    let where = "WHERE owner_id = ?";
    if (tab !== "all") {
      where += " AND status = ?";
      params.push(tab);
    }
    if (q) {
      where += " AND (title LIKE ? OR counterparty LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    const sql = `
      SELECT id, title, counterparty, status, currency, value, body, updated_at
        FROM contract
        ${where}
      ORDER BY updated_at DESC
    `;
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ ok:false, error: err.message });
      res.json({ ok:true, contracts: rows || [] });
    });
  });

  // Get one
  app.get("/api/contracts/:id", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ ok:false, error:"not_authenticated" });
    const id = req.params.id;
    db.get(
      `SELECT id, title, counterparty, status, currency, value, body, updated_at
         FROM contract
        WHERE id = ? AND owner_id = ?`,
      [id, req.session.userId],
      (err, row) => {
        if (err) return res.status(500).json({ ok:false, error: err.message });
        if (!row) return res.status(404).json({ ok:false, error: "not_found" });
        res.json({ ok:true, contract: row });
      }
    );
  });

  // Create
  app.post("/api/contracts", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ ok:false, error:"not_authenticated" });

    const c = pickContractPayload(req);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO contract (id, owner_id, title, counterparty, status, currency, value, body, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.session.userId, c.title, c.counterparty, c.status, c.currency, c.value, c.body, now],
      (err) => {
        if (err) return res.status(500).json({ ok:false, error: err.message });
        res.json({ ok:true, contract: { id } });
      }
    );
  });

  // Update
  app.patch("/api/contracts/:id", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ ok:false, error:"not_authenticated" });
    const id = req.params.id;
    const c = pickContractPayload(req);
    const now = new Date().toISOString();

    db.run(
      `UPDATE contract
          SET title=?, counterparty=?, status=?, currency=?, value=?, body=?, updated_at=?
        WHERE id=? AND owner_id=?`,
      [c.title, c.counterparty, c.status, c.currency, c.value, c.body, now, id, req.session.userId],
      function (err) {
        if (err) return res.status(500).json({ ok:false, error: err.message });
        if (this.changes === 0) return res.status(404).json({ ok:false, error: "not_found" });
        res.json({ ok:true, contract: { id } });
      }
    );
  });

  // Request signature → set status to 'negotiating'
  app.post("/api/contracts/:id/request-sign", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ ok:false, error:"not_authenticated" });
    const id = req.params.id;
    const now = new Date().toISOString();
    db.run(
      `UPDATE contract SET status='negotiating', updated_at=? WHERE id=? AND owner_id=?`,
      [now, id, req.session.userId],
      function (err) {
        if (err) return res.status(500).json({ ok:false, error: err.message });
        if (this.changes === 0) return res.status(404).json({ ok:false, error:"not_found" });
        res.json({ ok:true });
      }
    );
  });
};
