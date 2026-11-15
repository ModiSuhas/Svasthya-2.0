import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

try {
  const { SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD || SEED_ADMIN_PASSWORD.length < 12) {
    throw new Error('Set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of at least 12 characters before seeding.');
  }
  const existing = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (existing.rowCount) {
    console.log('An administrator already exists; no account was changed.');
  } else {
    const hash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 12);
    await pool.query(
      'INSERT INTO users(name,email,password_hash,role) VALUES($1,LOWER($2),$3,\'admin\')',
      [SEED_ADMIN_NAME || 'Clinic Administrator', SEED_ADMIN_EMAIL, hash],
    );
    console.log(`Created the initial administrator: ${SEED_ADMIN_EMAIL}`);
  }
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
