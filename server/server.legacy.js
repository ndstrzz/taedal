// server/server.js
const sharp = require('sharp');
require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const crypto = require('crypto');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');

// ✅ ADD: contracts router
const contractsRouter = require('./routes/contracts');

const uploadMem = require('multer')({ storage: require('multer').memoryStorage() });


// ---------- IPFS providers ----------
let Web3Storage, Web3File, web3Client = null;      // Web3.Storage (z6… token)
let NFTStorage, NFTFile, nftClient = null;         // classic NFT.Storage (eyJ… token)
const axios = require('axios');                    // Pinata
const FormData = require('form-data');

const WEB3_STORAGE_TOKEN = process.env.WEB3_STORAGE_TOKEN || '';
const CLASSIC_NFT_STORAGE_TOKEN = process.env.CLASSIC_NFT_STORAGE_TOKEN || '';
const PINATA_JWT = process.env.PINATA_JWT || '';

try {
  if (WEB3_STORAGE_TOKEN) {
    ({ Web3Storage, File: Web3File } = require('web3.storage'));
    web3Client = new Web3Storage({ token: WEB3_STORAGE_TOKEN });
  }
} catch (e) { console.warn('web3.storage init:', e.message); }

try {
  if (CLASSIC_NFT_STORAGE_TOKEN) {
    ({ NFTStorage, File: NFTFile } = require('nft.storage'));
    nftClient = new NFTStorage({ token: CLASSIC_NFT_STORAGE_TOKEN });
  }
} catch (e) { console.warn('nft.storage init:', e.message); }

const app = express();
const port = 5000;

/* ------------------------ Basic config & middleware ------------------------ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
app.use(session({
  name: 'sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false },
}));

// Ensure uploads dirs exist & serve them
const uploadDir  = path.join(__dirname, 'public', 'uploads');
const avatarDir  = path.join(__dirname, 'public', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(avatarDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));
app.use('/avatars', express.static(avatarDir));

// ✅ ADD: mount the Contracts API
app.use('/api', contractsRouter);

/* --------------------------------- Multer --------------------------------- */
// generic artwork storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});
const upload = multer({ storage });

// avatar storage (separate folder)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});
const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp|gif)/i.test(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
});

/* ----------------------------- Google Sign-in ----------------------------- */
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '412651468180-r122p7emhutv56hm7bi12dd194qf7nrd.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/* -------------------------------- Database -------------------------------- */
const dbPath = process.env.DB_PATH || path.join(__dirname, 'taedal.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      bio TEXT,
      avatar_file TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS artwork (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      date_created TEXT NOT NULL,
      image_file TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      description TEXT,
      ipfs_cid TEXT,
      metadata_cid TEXT,
      phash TEXT,
      token_id TEXT,
      tx_hash TEXT,
      FOREIGN KEY(user_id) REFERENCES user(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS follower (
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      UNIQUE(follower_id, following_id),
      FOREIGN KEY(follower_id) REFERENCES user(id),
      FOREIGN KEY(following_id) REFERENCES user(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS art_like (
      artwork_id INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      created_at TEXT    NOT NULL,
      PRIMARY KEY (artwork_id, user_id),
      FOREIGN KEY(artwork_id) REFERENCES artwork(id),
      FOREIGN KEY(user_id)    REFERENCES user(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS art_bookmark (
      artwork_id INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      created_at TEXT    NOT NULL,
      PRIMARY KEY (artwork_id, user_id),
      FOREIGN KEY(artwork_id) REFERENCES artwork(id),
      FOREIGN KEY(user_id)    REFERENCES user(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS art_comment (
      id         INTEGER PRIMARY KEY,
      artwork_id INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      body       TEXT    NOT NULL,
      created_at TEXT    NOT NULL,
      FOREIGN KEY(artwork_id) REFERENCES artwork(id),
      FOREIGN KEY(user_id)    REFERENCES user(id)
    )
  `);

  // --- Contracts table ---
db.run(`
  CREATE TABLE IF NOT EXISTS contract (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    title       TEXT    NOT NULL,
    counterparty TEXT,
    status      TEXT    NOT NULL DEFAULT 'draft',  -- draft|negotiating|active|signed|expired
    value       INTEGER DEFAULT 0,
    currency    TEXT    DEFAULT 'USD',
    body        TEXT,          -- free-form contract terms
    updated_at  TEXT    NOT NULL,
    FOREIGN KEY(user_id) REFERENCES user(id)
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_contract_user ON contract(user_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_contract_updated ON contract(updated_at)`);


  // Safe migrations (ignore duplicate column errors)
  db.run(`ALTER TABLE artwork ADD COLUMN phash TEXT`, () => {});
  db.run(`ALTER TABLE artwork ADD COLUMN description TEXT`, () => {});
  db.run(`ALTER TABLE artwork ADD COLUMN ipfs_cid TEXT`, () => {});
  db.run(`ALTER TABLE artwork ADD COLUMN metadata_cid TEXT`, () => {});
  db.run(`ALTER TABLE user ADD COLUMN bio TEXT`, () => {});
  db.run(`ALTER TABLE user ADD COLUMN avatar_file TEXT`, () => {});
  // NEW (for on-chain linkage)
  db.run(`ALTER TABLE artwork ADD COLUMN token_id INTEGER`, () => {});
  db.run(`ALTER TABLE artwork ADD COLUMN tx_hash TEXT`, () => {});

  // Helpful indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_artwork_date ON artwork(date_created)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_artwork_user ON artwork(user_id)`);
});

console.log(
  `IPFS providers → Web3.Storage=${WEB3_STORAGE_TOKEN ? 'ON' : 'OFF'} | NFT.Storage=${CLASSIC_NFT_STORAGE_TOKEN ? 'ON' : 'OFF'} | Pinata=${PINATA_JWT ? 'ON' : 'OFF'}`
);

/* ---------------------------- IPFS helpers ---------------------------- */
async function uploadToIPFS(data, filename, mimetype) {
  if (web3Client) {
    try {
      const file = new Web3File([data], filename || 'bin', { type: mimetype || 'application/octet-stream' });
      const cid = await web3Client.put([file], { name: `taedal-${Date.now()}` });
      return { cid, provider: 'web3', url: `https://w3s.link/ipfs/${cid}/${encodeURIComponent(filename || 'bin')}` };
    } catch (e) {
      console.error('Web3.Storage upload failed:', e.response?.data || e.message || e);
    }
  }
  if (nftClient) {
    try {
      const file = new NFTFile([data], filename || 'bin', { type: mimetype || 'application/octet-stream' });
      const cid = await nftClient.storeBlob(file);
      return { cid, provider: 'nft', url: `https://ipfs.io/ipfs/${cid}` };
    } catch (e) {
      console.error('Classic NFT.Storage upload failed:', e.response?.data || e.message || e);
    }
  }
  if (PINATA_JWT) {
    try {
      const form = new FormData();
      form.append('file', data, { filename: filename || 'bin', contentType: mimetype || 'application/octet-stream' });

      const resp = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', form, {
        maxBodyLength: Infinity,
        headers: { Authorization: `Bearer ${PINATA_JWT}`, ...form.getHeaders() },
      });
      if (resp.status === 200 && resp.data?.IpfsHash) {
        const cid = resp.data.IpfsHash;
        return { cid, provider: 'pinata', url: `https://gateway.pinata.cloud/ipfs/${cid}` };
      }
      console.error('Pinata unexpected response:', resp.status, resp.data);
    } catch (e) {
      console.error('Pinata upload failed:', e.response?.data || e.message || e);
    }
  }
  return { cid: null, provider: null, url: null };
}

async function pinJSONToIPFS(json) {
  if (!PINATA_JWT) return null;
  const res = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', json, {
    headers: { Authorization: `Bearer ${PINATA_JWT}`, 'Content-Type': 'application/json' },
  });
  return res.data?.IpfsHash || null;
}

/* ---- perceptual hash (dHash 64-bit) + Hamming distance ---- */
async function dhash64(buffer) {
  const raw = await sharp(buffer).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left  = raw[y * 9 + x];
      const right = raw[y * 9 + x + 1];
      hash = (hash << 1n) | BigInt(left > right ? 1 : 0);
    }
  }
  return hash.toString(16).padStart(16, '0');
}
function hammingHex(a, b) {
  try {
    let v = (BigInt('0x' + a) ^ BigInt('0x' + b));
    let c = 0;
    while (v) { v &= (v - 1n); c++; }
    return c;
  } catch { return 64; }
}

/* ------------------------------- Auth routes ------------------------------ */
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password || password.length < 6) {
      return res.json({ success: false, message: 'Invalid input.' });
    }
    const hashed = await bcrypt.hash(password, 12);
    db.run(
      `INSERT INTO user (username, email, password) VALUES (?, ?, ?)`,
      [String(username).trim(), String(email).trim(), hashed],
      function (err) {
        if (err) return res.json({ success: false, message: err.message });
        req.session.userId = this.lastID;
        res.json({ success: true, userId: this.lastID });
      }
    );
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ success: false, message: 'Missing credentials.' });
  }
  db.get(
    `SELECT id, username, email, password FROM user WHERE username = ? OR email = ?`,
    [username, username],
    async (err, row) => {
      if (err) return res.json({ success: false, message: err.message });
      if (!row) return res.json({ success: false, message: 'User not found.' });
      const ok = await bcrypt.compare(password, row.password);
      if (!ok) return res.json({ success: false, message: 'Wrong password.' });
      req.session.userId = row.id; // canonical field
      res.json({ success: true, userId: row.id });
    }
  );
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/check-session', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ isLoggedIn: true, userId: req.session.userId });
  }
  res.json({ isLoggedIn: false });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ success: false, message: 'Missing credential' });

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name || email.split('@')[0];

    db.get(`SELECT id FROM user WHERE email = ?`, [email], (err, row) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      const finish = (userId) => { req.session.userId = userId; res.json({ success: true, userId }); };
      if (row) return finish(row.id);

      const randomPassword = crypto.randomBytes(32).toString('hex');
      bcrypt.hash(randomPassword, 12).then((hashed) => {
        db.run(
          `INSERT INTO user (username, email, password) VALUES (?, ?, ?)`,
          [name, email, hashed],
          function (err2) {
            if (err2) return res.status(500).json({ success: false, message: err2.message });
            finish(this.lastID);
          }
        );
      });
    });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid Google token' });
  }
});

/* ---------------------------- Follow / Unfollow --------------------------- */
app.post('/api/follow', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: 'Not logged in' });
  const follower = Number(req.session.userId);
  const { following_id } = req.body || {};
  const following = Number(following_id);
  if (!following || follower === following) {
    return res.status(400).json({ ok: false, error: 'Invalid user' });
  }
  db.run(
    `INSERT OR IGNORE INTO follower(follower_id, following_id) VALUES(?, ?)`,
    [follower, following],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, followed: this.changes > 0 });
    }
  );
});

app.post('/api/unfollow', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: 'Not logged in' });
  const follower = Number(req.session.userId);
  const { following_id } = req.body || {};
  const following = Number(following_id);
  if (!following || follower === following) {
    return res.status(400).json({ ok: false, error: 'Invalid user' });
  }
  db.run(
    `DELETE FROM follower WHERE follower_id = ? AND following_id = ?`,
    [follower, following],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, unfollowed: this.changes > 0 });
    }
  );
});

// remove a follower (owner)
app.post('/api/follow/remove', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok:false, error:'Not logged in' });
  const me = Number(req.session.userId);
  const { follower_id } = req.body || {};
  const fid = Number(follower_id);
  if (!fid || fid === me) return res.status(400).json({ ok:false, error:'Invalid follower' });

  db.run(
    `DELETE FROM follower WHERE follower_id = ? AND following_id = ?`,
    [fid, me],
    function (err) {
      if (err) return res.status(500).json({ ok:false, error: err.message });
      res.json({ ok:true, removed: this.changes > 0 });
    }
  );
});

// Am I following this user?
app.get("/api/follow/status/:id", (req, res) => {
  if (!req.session.userId) return res.json({ ok: true, following: false });
  const me = req.session.userId;
  const target = Number(req.params.id);
  if (!target || target === me) return res.json({ ok: true, following: false });

  db.get(
    `SELECT 1 AS yes FROM follower WHERE follower_id = ? AND following_id = ?`,
    [me, target],
    (err, row) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, following: !!row });
    }
  );
});

/* ---------------------------- Profile edit (bio/avatar) -------------------- */
app.patch('/api/account/profile', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok:false, error:'Not logged in' });
  let { bio } = req.body || {};
  bio = String(bio || '').trim();
  if (bio.length > 1000) bio = bio.slice(0, 1000);
  db.run(`UPDATE user SET bio = ? WHERE id = ?`, [bio, req.session.userId], function (err) {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true });
  });
});

app.post('/api/account/avatar', uploadAvatar.single('avatar'), (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok:false, error:'Not logged in' });
  if (!req.file) return res.status(400).json({ ok:false, error:'No file' });
  const me = req.session.userId;

  // fetch old file (delete best-effort)
  db.get(`SELECT avatar_file FROM user WHERE id = ?`, [me], (err, row) => {
    if (row?.avatar_file) {
      const oldPath = path.join(avatarDir, row.avatar_file);
      fs.unlink(oldPath, () => {});
    }
    db.run(`UPDATE user SET avatar_file = ? WHERE id = ?`, [req.file.filename, me], function (err2) {
      if (err2) return res.status(500).json({ ok:false, error: err2.message });
      res.json({ ok:true, avatar_file: req.file.filename, avatar_url: `/avatars/${req.file.filename}` });
    });
  });
});

/* ---------------------------- IPFS JSON metadata --------------------------- */
app.post('/api/metadata', async (req, res) => {
  try {
    const { name, description, imageCid, attributes, artworkId } = req.body || {};
    if (!name || !imageCid) {
      return res.status(400).json({ ok: false, error: 'name and imageCid are required' });
    }
    const metadata = {
      name: String(name),
      description: description ? String(description) : '',
      image: `ipfs://${imageCid}`,
      attributes: Array.isArray(attributes) ? attributes : []
    };
    const buf = Buffer.from(JSON.stringify(metadata), 'utf8');
    const { cid, provider, url } = await uploadToIPFS(buf, 'metadata.json', 'application/json');
    if (!cid) return res.status(502).json({ ok: false, error: 'IPFS providers failed' });

    if (artworkId) {
      db.run(`UPDATE artwork SET metadata_cid = ? WHERE id = ?`, [cid, Number(artworkId)], (err) => {
        if (err) console.error('Failed to save metadata_cid:', err.message);
      });
    }
    res.json({ ok: true, metadata_cid: cid, tokenURI: `ipfs://${cid}`, ipfs_provider: provider, gateway_url: url });
  } catch (e) {
    console.error('metadata error:', e);
    res.status(500).json({ ok: false, error: 'Failed to create metadata' });
  }
});

/* ---------------------------- Artwork: upload/verify ----------------------- */
app.post('/upload', upload.single('artwork'), async (req, res) => {
  try {
    const { title, description } = req.body || {};
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });
    if (!title || !title.trim()) return res.status(400).json({ ok: false, error: 'Title required' });

    const user_id   = req.session.userId || 1; // dev fallback
    const image_file = req.file.filename;

    // read file buffer
    const data = await fs.promises.readFile(req.file.path);

    // exact hash (sha-256)
    const content_hash = crypto.createHash('sha256').update(data).digest('hex');

    // perceptual hash (dHash 64-bit hex)
    let phash = null;
    try { phash = await dhash64(data); } catch { phash = null; }

    // find similar by phash BEFORE inserting
    const MAX_DIST = 10;
    const similar = await new Promise((resolve) => {
      db.all(
        `SELECT a.id, a.title, a.image_file, a.user_id, u.username, a.phash
           FROM artwork a
           JOIN user u ON u.id = a.user_id
          WHERE a.phash IS NOT NULL`,
        [],
        (err, rows) => {
          if (err || !phash) return resolve([]);
          const list = rows
            .map(r => ({
              id: r.id,
              title: r.title,
              username: r.username,
              user_id: r.user_id,
              image_url: `/uploads/${r.image_file}`,
              distance: hammingHex(phash, r.phash)
            }))
            .filter(x => x.distance <= MAX_DIST)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 8);
          resolve(list);
        }
      );
    });

    // pin image to IPFS (best-effort)
    const { cid: ipfs_cid, provider } = await uploadToIPFS(
      data,
      req.file.originalname || image_file,
      req.file.mimetype
    );

    // insert new artwork (store phash)
    db.run(
      `INSERT INTO artwork (title, image_file, content_hash, user_id, date_created, description, ipfs_cid, metadata_cid, phash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), image_file, content_hash, user_id, new Date().toISOString(), description || null, ipfs_cid || null, null, phash],
      function (err) {
        if (err) {
          console.error('DB insert failed:', err.message);
          return res.status(500).json({ ok: false, error: 'DB insert failed' });
        }
        return res.json({
          ok: true,
          id: this.lastID,
          image_url: `/uploads/${image_file}`,
          sha256: content_hash,
          ipfs_cid: ipfs_cid || null,
          ipfs_provider: provider || null,
          similar,
        });
      }
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Upload failed' });
  }
});

//SEARCHH
// --- Simple unified search: users by username, artworks by title/description
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  let limit = Math.max(1, Math.min(30, parseInt(req.query.limit || '12', 10) || 12));
  if (q.length < 2) return res.json({ ok: true, users: [], artworks: [] });

  const like = `%${q}%`;
  const out = { users: [], artworks: [] };

  db.all(
    `SELECT id, username FROM user
     WHERE username LIKE ?
     ORDER BY username COLLATE NOCASE ASC
     LIMIT ?`,
    [like, limit],
    (e1, users) => {
      if (e1) return res.status(500).json({ ok: false, error: e1.message });
      out.users = users || [];

      db.all(
        `SELECT a.id, a.title, a.image_file, a.user_id, u.username
           FROM artwork a
           JOIN user u ON u.id = a.user_id
          WHERE a.title LIKE ? OR (a.description IS NOT NULL AND a.description LIKE ?)
          ORDER BY a.id DESC
          LIMIT ?`,
        [like, like, limit],
        (e2, arts) => {
          if (e2) return res.status(500).json({ ok: false, error: e2.message });
          out.artworks = arts || [];
          res.json({ ok: true, ...out });
        }
      );
    }
  );
});

app.post('/api/retry-ipfs/:id', async (req, res) => {
  const { id } = req.params;
  db.get(`SELECT id, image_file FROM artwork WHERE id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: 'Artwork not found' });

    try {
      const filePath = path.join(uploadDir, row.image_file);
      const data = await fs.promises.readFile(filePath);
      const { cid, provider } = await uploadToIPFS(data, row.image_file, undefined);
      if (!cid) return res.status(502).json({ ok: false, error: 'All IPFS providers failed' });

      db.run(`UPDATE artwork SET ipfs_cid = ? WHERE id = ?`, [cid, id], function (err2) {
        if (err2) return res.status(500).json({ ok: false, error: err2.message });
        res.json({ ok: true, id, ipfs_cid: cid, ipfs_provider: provider });
      });
    } catch (e2) {
      res.status(500).json({ ok: false, error: e2.message });
    }
  });
});

app.post('/pin/metadata', async (req, res) => {
  try {
    const { name, description, image_cid, artwork_id } = req.body || {};
    if (!name || !image_cid) {
      return res.status(400).json({ ok: false, error: 'Missing name or image_cid' });
    }
    const json = { name, description: description || '', image: `ipfs://${image_cid}` };
    const metadata_cid = await pinJSONToIPFS(json);
    if (!metadata_cid) return res.status(500).json({ ok: false, error: 'Pin metadata failed' });

    if (artwork_id) {
      db.run(`UPDATE artwork SET metadata_cid = ? WHERE id = ?`, [metadata_cid, Number(artwork_id)], (err) => {
        if (err) console.error('Failed to save metadata_cid:', err.message);
      });
    }
    res.json({ ok: true, metadata_cid });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json({ ok: false, error: 'Pin metadata failed' });
  }
});

app.post('/api/verify', upload.single('artwork'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const fileStream = fs.createReadStream(req.file.path);
  const hash = crypto.createHash('sha256');

  fileStream.on('data', (chunk) => hash.update(chunk));
  fileStream.on('end', () => {
    const content_hash = hash.digest('hex');
    db.get(
      `SELECT artwork.id, artwork.title, artwork.date_created, artwork.description, artwork.ipfs_cid,
              user.username, artwork.user_id
       FROM artwork JOIN user ON user.id = artwork.user_id
       WHERE content_hash = ?`,
      [content_hash],
      (err, row) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (!row) return res.json({ success: true, match: false, content_hash });
        res.json({ success: true, match: true, content_hash, record: row });
      }
    );
  });
});

/* ---------------------------- Artworks & profiles --------------------------- */
app.get('/api/artworks', (req, res) => {
  db.all(
    `SELECT artwork.*, user.username
     FROM artwork JOIN user ON artwork.user_id = user.id
     ORDER BY artwork.date_created DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ artworks: rows });
    }
  );
});

/* ------------------------------- User profile ------------------------------- */
app.get('/api/user/:id', (req, res) => {
  const { id } = req.params;

  const sendUserAndArtworks = (userRow) => {
    db.all(
      `SELECT id, title, image_file, date_created, content_hash, description, ipfs_cid, metadata_cid
       FROM artwork WHERE user_id = ?
       ORDER BY date_created DESC`,
      [id],
      (err2, artworks) => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.get(
          `SELECT
             (SELECT COUNT(*) FROM follower WHERE following_id = ?) AS followers,
             (SELECT COUNT(*) FROM follower WHERE follower_id = ?) AS following`,
          [id, id],
          (err3, stats) => {
            if (err3) return res.status(500).json({ error: err3.message });

            const viewer = req.session.userId;
            if (viewer && Number(viewer) !== Number(id)) {
              db.get(
                `SELECT 1 FROM follower WHERE follower_id = ? AND following_id = ?`,
                [viewer, id],
                (e4, row4) => {
                  if (e4) return res.status(500).json({ error: e4.message });
                  res.json({ user: userRow, artworks, stats, is_following: !!row4 });
                }
              );
            } else {
              res.json({ user: userRow, artworks, stats, is_following: false });
            }
          }
        );
      }
    );
  };

  db.get(
    `SELECT id, username, email, bio, avatar_file FROM user WHERE id = ?`,
    [id],
    (err, userRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!userRow) return res.status(404).json({ error: 'User not found' });
      sendUserAndArtworks(userRow);
    }
  );
});

/* ------------------------- Followers lists (for modals) --------------------- */
app.get('/api/user/:id/followers', (req, res) => {
  const { id } = req.params;
  db.all(
    `SELECT u.id, u.username, u.avatar_file
       FROM follower f
       JOIN user u ON u.id = f.follower_id
      WHERE f.following_id = ?
      ORDER BY u.username COLLATE NOCASE ASC`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ ok:false, error: err.message });
      res.json({ ok:true, users: rows || [] });
    }
  );
});

app.get('/api/user/:id/following', (req, res) => {
  const { id } = req.params;
  db.all(
    `SELECT u.id, u.username, u.avatar_file
       FROM follower f
       JOIN user u ON u.id = f.following_id
      WHERE f.follower_id = ?
      ORDER BY u.username COLLATE NOCASE ASC`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ ok:false, error: err.message });
      res.json({ ok:true, users: rows || [] });
    }
  );
});

/* ----------------------- Unified /api/feed (flexible) ---------------------- */
app.get('/api/feed', (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  if (Number.isNaN(limit)) limit = 12;
  limit = Math.max(1, Math.min(100, limit));

  const cursor = parseInt(req.query.cursor, 10);
  const hasCursor = !Number.isNaN(cursor);
  const followingOnly = req.query.following === '1';

  const useLegacy = typeof req.query.offset !== 'undefined' || typeof req.query.includeMe !== 'undefined';
  const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
  const includeMe = String(req.query.includeMe || '0') === '1';

  const params = [];
  let sql = `
    SELECT a.id, a.user_id, a.title, a.description, a.image_file, a.ipfs_cid, a.date_created,
           u.username
    FROM artwork a
    JOIN user u ON u.id = a.user_id
  `;

  if (followingOnly || useLegacy) {
    const me = req.session.userId;
    if (!me) return res.status(401).json({ ok:false, error:'Not logged in' });
    sql += ` JOIN follower f ON f.following_id = a.user_id AND f.follower_id = ?`;
    params.push(me);

    if (useLegacy && includeMe) {
      sql += ` OR a.user_id = ?`;
      params.push(me);
    }
  }

  if (hasCursor) {
    sql += params.length ? ` AND a.id < ?` : ` WHERE a.id < ?`;
    params.push(cursor);
  }

  sql += ` ORDER BY a.id DESC`;

  if (useLegacy) {
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
  } else {
    sql += ` LIMIT ?`;
    params.push(limit);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok:false, error:err.message });
    const items = rows || [];
    const nextCursor = (!useLegacy && items.length === limit) ? items[items.length - 1].id : null;
    res.json({ ok:true, items, artworks: items, nextCursor });
  });
});

/* ---------------------------- Like / Bookmark / Comment -------------------- */
app.get('/api/artwork/:id/full', (req, res) => {
  const { id } = req.params;
  const me = req.session.userId || 0;

  db.get(
    `SELECT a.*, u.username
     FROM artwork a JOIN user u ON a.user_id = u.id
     WHERE a.id = ?`,
    [id],
    (err, art) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      if (!art) return res.status(404).json({ ok: false, error: 'Not found' });

      const out = { artwork: art, user_flags: { liked: false, bookmarked: false, is_owner: Number(art.user_id) === Number(me) } };

      db.get(`SELECT COUNT(*) AS c FROM art_like WHERE artwork_id = ?`, [id], (e1, r1) => {
        out.artwork.likes_count = r1 ? r1.c : 0;

        db.get(`SELECT COUNT(*) AS c FROM art_bookmark WHERE artwork_id = ?`, [id], (e2, r2) => {
          out.artwork.bookmarks_count = r2 ? r2.c : 0;

          const loadComments = () => {
            db.all(
              `SELECT c.id, c.body, c.created_at, c.user_id, u.username
                 FROM art_comment c JOIN user u ON c.user_id = u.id
                WHERE c.artwork_id = ?
                ORDER BY c.created_at ASC`,
              [id],
              (e5, comments) => {
                if (e5) return res.status(500).json({ ok: false, error: e5.message });
                out.comments = comments || [];
                res.json({ ok: true, ...out });
              }
            );
          };

          if (me) {
            db.get(`SELECT 1 AS yes FROM art_like WHERE artwork_id = ? AND user_id = ?`, [id, me], (e3, r3) => {
              out.user_flags.liked = !!r3;
              db.get(`SELECT 1 AS yes FROM art_bookmark WHERE artwork_id = ? AND user_id = ?`, [id, me], (e4, r4) => {
                out.user_flags.bookmarked = !!r4;
                loadComments();
              });
            });
          } else {
            loadComments();
          }
        });
      });
    }
  );
});

app.post('/api/artwork/:id/like', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: 'Not logged in' });
  const { id } = req.params;
  const me = req.session.userId;
  const now = new Date().toISOString();

  db.get(`SELECT 1 AS yes FROM art_like WHERE artwork_id = ? AND user_id = ?`, [id, me], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    const finish = () => {
      db.get(`SELECT COUNT(*) AS c FROM art_like WHERE artwork_id = ?`, [id], (e2, r2) => {
        res.json({ ok: true, liked: !row, likes_count: r2 ? r2.c : 0 });
      });
    };

    if (row) {
      db.run(`DELETE FROM art_like WHERE artwork_id = ? AND user_id = ?`, [id, me], (e) => {
        if (e) return res.status(500).json({ ok: false, error: e.message });
        finish();
      });
    } else {
      db.run(`INSERT INTO art_like(artwork_id, user_id, created_at) VALUES(?,?,?)`, [id, me, now], (e) => {
        if (e) return res.status(500).json({ ok: false, error: e.message });
        finish();
      });
    }
  });
});

app.post('/api/artwork/:id/bookmark', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: 'Not logged in' });
  const { id } = req.params;
  const me = req.session.userId;
  const now = new Date().toISOString();

  db.get(`SELECT 1 AS yes FROM art_bookmark WHERE artwork_id = ? AND user_id = ?`, [id, me], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });

    const finish = (bookmarked) => res.json({ ok: true, bookmarked });

    if (row) {
      db.run(`DELETE FROM art_bookmark WHERE artwork_id = ? AND user_id = ?`, [id, me], (e) => {
        if (e) return res.status(500).json({ ok: false, error: e.message });
        finish(false);
      });
    } else {
      db.run(`INSERT INTO art_bookmark(artwork_id, user_id, created_at) VALUES(?,?,?)`, [id, me, now], (e) => {
        if (e) return res.status(500).json({ ok: false, error: e.message });
        finish(true);
      });
    }
  });
});

app.post('/api/artwork/:id/comment', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: 'Not logged in' });
  const { id } = req.params;
  let { body } = req.body || {};
  body = String(body || '').trim();
  if (!body) return res.status(400).json({ ok: false, error: 'Empty comment' });
  if (body.length > 500) return res.status(400).json({ ok: false, error: 'Max 500 chars' });

  const now = new Date().toISOString();
  const me = req.session.userId;

  db.run(
    `INSERT INTO art_comment(artwork_id, user_id, body, created_at) VALUES(?,?,?,?)`,
    [id, me, body, now],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      db.get(
        `SELECT c.id, c.body, c.created_at, c.user_id, u.username
           FROM art_comment c JOIN user u ON c.user_id = u.id
          WHERE c.id = ?`,
        [this.lastID],
        (e2, row) => {
          if (e2) return res.status(500).json({ ok: false, error: e2.message });
          res.json({ ok: true, comment: row });
        }
      );
    }
  );
});

/* ------------------------------ Owner: edit/delete ------------------------- */
app.patch('/api/artwork/:id', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: 'Not logged in' });
  const { id } = req.params;
  let { description } = req.body || {};
  description = description === null ? null : String(description || '').trim();

  db.get(`SELECT user_id FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    if (Number(row.user_id) !== Number(req.session.userId)) return res.status(403).json({ ok: false, error: 'Not owner' });

    db.run(`UPDATE artwork SET description = ? WHERE id = ?`, [description, id], (e2) => {
      if (e2) return res.status(500).json({ ok: false, error: e2.message });
      res.json({ ok: true });
    });
  });
});

app.delete('/api/artwork/:id', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: 'Not logged in' });
  const { id } = req.params;

  db.get(`SELECT user_id, image_file FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    if (Number(row.user_id) !== Number(req.session.userId)) return res.status(403).json({ ok: false, error: 'Not owner' });

    const filePath = path.join(uploadDir, row.image_file);

    db.run(`DELETE FROM art_like WHERE artwork_id = ?`, [id], () => {
      db.run(`DELETE FROM art_bookmark WHERE artwork_id = ?`, [id], () => {
        db.run(`DELETE FROM art_comment WHERE artwork_id = ?`, [id], () => {
          db.run(`DELETE FROM artwork WHERE id = ?`, [id], (e4) => {
            if (e4) return res.status(500).json({ ok: false, error: e4.message });
            fs.unlink(filePath, () => {}); // best-effort
            res.json({ ok: true });
          });
        });
      });
    });
  });
});

// --- On-chain linkage: store token_id + tx_hash after client mint ---
app.post("/api/artwork/:id/onchain", (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    const artworkId = Number(req.params.id);
    const { tokenId, txHash } = req.body || {};
    if (!Number.isFinite(artworkId) || !txHash) {
      return res.status(400).json({ error: "bad_input" });
    }

    // Check ownership of artwork
    db.get("SELECT user_id FROM artwork WHERE id = ?", [artworkId], (err, row) => {
      if (err) return res.status(500).json({ error: "db_error" });
      if (!row) return res.status(404).json({ error: "not_found" });

      const me = Number(req.session.userId);
      if (Number(row.user_id) !== me) return res.status(403).json({ error: "forbidden" });

      db.run(
        "UPDATE artwork SET token_id = ?, tx_hash = ? WHERE id = ?",
        [tokenId || null, String(txHash), artworkId],
        (e2) => {
          if (e2) return res.status(500).json({ error: "db_error" });
          res.json({ ok: true, token_id: tokenId || null, tx_hash: String(txHash) });
        }
      );
    });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

// NEW: fetch persisted on-chain info for an artwork (useful after refresh)
app.get("/api/artwork/:id/onchain", (req, res) => {
  const artworkId = Number(req.params.id);
  if (!Number.isFinite(artworkId)) return res.status(400).json({ ok: false, error: "bad_input" });

  db.get(
    "SELECT token_id, tx_hash FROM artwork WHERE id = ?",
    [artworkId],
    (err, row) => {
      if (err) return res.status(500).json({ ok: false, error: "db_error" });
      if (!row) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, token_id: row.token_id || null, tx_hash: row.tx_hash || null });
    }
  );
});

/* ========================= Contracts API ========================= */

// Guard
function requireLogin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ ok:false, error:'not_authenticated' });
  next();
}

// List my contracts (optional filters: ?q=&status=)
app.get('/api/contracts', requireLogin, (req, res) => {
  const me = Number(req.session.userId);
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim();
  const args = [me];
  let where = `user_id = ?`;

  if (status && ['draft','negotiating','active','signed','expired'].includes(status)) {
    where += ` AND status = ?`; args.push(status);
  }
  if (q) {
    where += ` AND (LOWER(title) LIKE ? OR LOWER(counterparty) LIKE ?)`;
    args.push(`%${q}%`, `%${q}%`);
  }

  db.all(
    `SELECT id, title, counterparty, status, value, currency, updated_at
       FROM contract
      WHERE ${where}
      ORDER BY datetime(updated_at) DESC, id DESC`,
    args,
    (err, rows) => {
      if (err) return res.status(500).json({ ok:false, error: err.message });
      res.json({ ok:true, items: rows || [] });
    }
  );
});

// Create
app.post('/api/contracts', requireLogin, (req, res) => {
  let { title, counterparty, status, value, currency, body } = req.body || {};
  title = String(title || '').trim();
  if (!title) return res.status(400).json({ ok:false, error:'title_required' });

  counterparty = String(counterparty || '').trim() || null;
  status = ['draft','negotiating','active','signed','expired'].includes(status) ? status : 'draft';
  value = Number.isFinite(Number(value)) ? Number(value) : 0;
  currency = String(currency || 'USD').toUpperCase();
  body = String(body || '');

  const now = new Date().toISOString();

  db.run(
    `INSERT INTO contract(user_id, title, counterparty, status, value, currency, body, updated_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    [req.session.userId, title, counterparty, status, value, currency, body, now],
    function (err) {
      if (err) return res.status(500).json({ ok:false, error: err.message });
      res.json({
        ok:true,
        item:{ id:this.lastID, title, counterparty, status, value, currency, updated_at: now }
      });
    }
  );
});

// Read one (owner only for now)
app.get('/api/contracts/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  db.get(
    `SELECT id, user_id, title, counterparty, status, value, currency, body, updated_at
       FROM contract WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ ok:false, error: err.message });
      if (!row) return res.status(404).json({ ok:false, error:'not_found' });
      if (Number(row.user_id) !== Number(req.session.userId)) {
        return res.status(403).json({ ok:false, error:'forbidden' });
      }
      res.json({ ok:true, item: row });
    }
  );
});

// Update
app.patch('/api/contracts/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  db.get(`SELECT user_id FROM contract WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    if (!row) return res.status(404).json({ ok:false, error:'not_found' });
    if (Number(row.user_id) !== Number(req.session.userId)) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }

    let { title, counterparty, status, value, currency, body } = req.body || {};
    const fields = [];
    const params = [];

    if (typeof title !== 'undefined') { fields.push('title = ?'); params.push(String(title).trim()); }
    if (typeof counterparty !== 'undefined') { fields.push('counterparty = ?'); params.push(String(counterparty || '').trim() || null); }
    if (typeof status !== 'undefined') {
      const st = ['draft','negotiating','active','signed','expired'].includes(status) ? status : 'draft';
      fields.push('status = ?'); params.push(st);
    }
    if (typeof value !== 'undefined') { fields.push('value = ?'); params.push(Number(value) || 0); }
    if (typeof currency !== 'undefined') { fields.push('currency = ?'); params.push(String(currency || 'USD').toUpperCase()); }
    if (typeof body !== 'undefined') { fields.push('body = ?'); params.push(String(body || '')); }

    const now = new Date().toISOString();
    fields.push('updated_at = ?'); params.push(now);
    params.push(id);

    db.run(`UPDATE contract SET ${fields.join(', ')} WHERE id = ?`, params, (e2) => {
      if (e2) return res.status(500).json({ ok:false, error: e2.message });
      res.json({ ok:true, updated_at: now });
    });
  });
});

// Delete
app.delete('/api/contracts/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  db.get(`SELECT user_id FROM contract WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    if (!row) return res.status(404).json({ ok:false, error:'not_found' });
    if (Number(row.user_id) !== Number(req.session.userId)) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }
    db.run(`DELETE FROM contract WHERE id = ?`, [id], (e2) => {
      if (e2) return res.status(500).json({ ok:false, error: e2.message });
      res.json({ ok:true });
    });
  });
});

// (stub) Request signature — in the future you could email a link, etc.
app.post('/api/contracts/:id/request-signature', requireLogin, (_req, res) => {
  res.json({ ok:true, message:'Signature request queued (stub).' });
});


/* --------------------------------- Startup -------------------------------- */
app.get('/', (req, res) => {
  res.type('text/plain').send('Taedal API is running.\nTry: /api/health, /api/artworks, or /uploads/<filename>');
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
