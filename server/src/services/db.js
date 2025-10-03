const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

/* --------------------------------------------------------------- */
/* Paths & DB open                                                 */
/* --------------------------------------------------------------- */
const dataDir = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "taedal.sqlite3");
const db = new sqlite3.Database(dbPath);

/* --------------------------------------------------------------- */
/* Helpers: schema inspection / migrations                         */
/* --------------------------------------------------------------- */
function columnExists(table, column) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
      if (err) return resolve(false);
      resolve((rows || []).some((r) => r.name === column));
    });
  });
}

async function addColumnIfMissing(table, column, type) {
  const exists = await columnExists(table, column);
  if (!exists) {
    await new Promise((resolve, reject) => {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, [], (e) =>
        e ? reject(e) : resolve()
      );
    }).catch((e) => {
      console.error(`[db] failed to add column ${table}.${column}:`, e.message);
    });
  }
}

/* --------------------------------------------------------------- */
/* Schema init                                                     */
/* --------------------------------------------------------------- */
db.serialize(async () => {
  db.run(`PRAGMA foreign_keys = ON`);

  // ---------- users ----------
  db.run(
    `CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password TEXT,
      bio TEXT,
      avatar_file TEXT
    )`
  );

  await addColumnIfMissing("user", "username", "TEXT");
  await addColumnIfMissing("user", "email", "TEXT");
  await addColumnIfMissing("user", "password", "TEXT");
  await addColumnIfMissing("user", "bio", "TEXT");
  await addColumnIfMissing("user", "avatar_file", "TEXT");

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON user(username)`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON user(email)`);

  // ---------- artwork ----------
  db.run(
    `CREATE TABLE IF NOT EXISTS artwork (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT,
      description TEXT,
      image_file TEXT,
      content_hash TEXT,
      ipfs_cid TEXT,
      metadata_cid TEXT,

      token_id TEXT,
      tx_hash TEXT,

      price REAL,
      currency TEXT,
      edition TEXT,
      edition_size INTEGER,

      published INTEGER DEFAULT 0,
      published_at TEXT,

      date_created TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
    )`
  );

  await addColumnIfMissing("artwork", "category", "TEXT");
  await addColumnIfMissing("artwork", "medium", "TEXT");
  await addColumnIfMissing("artwork", "dimensions", "TEXT");
  await addColumnIfMissing("artwork", "year", "INTEGER");
  await addColumnIfMissing("artwork", "series", "TEXT");
  await addColumnIfMissing("artwork", "physical", "INTEGER");
  await addColumnIfMissing("artwork", "location", "TEXT");
  await addColumnIfMissing("artwork", "weight", "TEXT");
  await addColumnIfMissing("artwork", "inspiration", "TEXT");
  await addColumnIfMissing("artwork", "tags_json", "TEXT");
  await addColumnIfMissing("artwork", "materials_json", "TEXT");
  await addColumnIfMissing("artwork", "techniques_json", "TEXT");
  await addColumnIfMissing("artwork", "phash", "TEXT");

  db.run(`CREATE INDEX IF NOT EXISTS idx_artwork_user_id ON artwork(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_artwork_date_created ON artwork(date_created)`);

  // ---------- socials ----------
  db.run(
    `CREATE TABLE IF NOT EXISTS art_like (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artwork_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT,
      UNIQUE(artwork_id, user_id),
      FOREIGN KEY(artwork_id) REFERENCES artwork(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
    )`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_like_artwork ON art_like(artwork_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_like_user ON art_like(user_id)`);

  db.run(
    `CREATE TABLE IF NOT EXISTS art_bookmark (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artwork_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT,
      UNIQUE(artwork_id, user_id),
      FOREIGN KEY(artwork_id) REFERENCES artwork(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
    )`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_bookmark_artwork ON art_bookmark(artwork_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bookmark_user ON art_bookmark(user_id)`);

  db.run(
    `CREATE TABLE IF NOT EXISTS art_comment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artwork_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT,
      FOREIGN KEY(artwork_id) REFERENCES artwork(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
    )`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_comment_artwork ON art_comment(artwork_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_comment_user ON art_comment(user_id)`);

  // ---------- social graph ----------
  db.run(
    `CREATE TABLE IF NOT EXISTS follower (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      UNIQUE(follower_id, following_id),
      FOREIGN KEY(follower_id) REFERENCES user(id) ON DELETE CASCADE,
      FOREIGN KEY(following_id) REFERENCES user(id) ON DELETE CASCADE
    )`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_follower_follower ON follower(follower_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_follower_following ON follower(following_id)`);

  console.log("[db] ready at", dbPath);
});

module.exports = db;
