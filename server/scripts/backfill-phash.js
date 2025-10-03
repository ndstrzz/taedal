// server/scripts/backfill-phash.js
/**
 * Backfill perceptual hashes (phash) for existing artworks.
 * Looks for files in ROOT public/uploads and writes phash to `artwork.phash`.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const db = require('../src/services/db');

// dHash 64-bit hex
async function dhash64(filePath) {
  const raw = await sharp(filePath).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = raw[y * 9 + x];
      const right = raw[y * 9 + x + 1];
      hash = (hash << 1n) | BigInt(left > right ? 1 : 0);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

(async () => {
  const uploadDir = path.join(__dirname, '..', 'public', 'uploads'); // ROOT public/uploads
  console.log('Backfilling phash for artworks…');

  db.all(
    `SELECT id, image_file, phash FROM artwork ORDER BY id ASC`,
    [],
    async (err, rows) => {
      if (err) {
        console.error('DB read error:', err.message);
        process.exit(1);
      }
      let total = 0, updated = 0, missing = 0, failed = 0, skipped = 0;

      for (const row of rows) {
        total++;
        if (row.phash) { skipped++; continue; }

        const fp = path.join(uploadDir, row.image_file || '');
        if (!row.image_file || !fs.existsSync(fp)) {
          missing++;
          continue;
        }

        try {
          const phash = await dhash64(fp);
          await new Promise((resolve, reject) => {
            db.run(`UPDATE artwork SET phash = ? WHERE id = ?`, [phash, row.id], (e) => {
              if (e) return reject(e);
              resolve();
            });
          });
          updated++;
        } catch (e) {
          failed++;
          console.error(`phash failed for id=${row.id}:`, e.message);
        }
      }

      console.log(
        `Backfill complete → total:${total} updated:${updated} missing:${missing} failed:${failed} skipped:${skipped}`
      );
      process.exit(0);
    }
  );
})();
