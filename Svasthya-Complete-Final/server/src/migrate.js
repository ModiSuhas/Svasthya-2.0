import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.join(here, 'migrations');
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const files = (await readdir(folder)).filter((x) => x.endsWith('.sql')).sort();
  for (const filename of files) {
    const found = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (found.rowCount) continue;
    const sql = await readFile(path.join(folder, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
