import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db.js';

const PgStore = connectPgSimple(session);
export const sessionMiddleware = session({
  store: new PgStore({ pool, createTableIfMissing: true, tableName: 'user_sessions' }),
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-only-change-this-secret'),
  resave: false,
  saveUninitialized: false,
  name: 'svasthya.sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8,
  },
});

export async function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  const result = await pool.query(
    'SELECT id,name,email,role,active,must_change_password FROM users WHERE id=$1',
    [req.session.user.id],
  );
  if (!result.rowCount || !result.rows[0].active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Your account is inactive. Contact an administrator.' });
  }
  const { active, ...user } = result.rows[0];
  req.session.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}
