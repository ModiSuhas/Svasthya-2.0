import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { sessionMiddleware } from './auth.js';
import { apiRouter, authRouter } from './api.js';

if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in production.');
}

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../dist');
const port = Number(process.env.PORT || 3000);

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.openstreetmap.org'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(sessionMiddleware);

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.use('/api', (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !['GET','HEAD','OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const expected = `${req.protocol}://${req.get('host')}`;
    if (!origin || origin !== expected) return res.status(403).json({ error: 'Request origin could not be verified.' });
  }
  next();
});
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(dist, 'index.html'), (error) => error && next(error));
  }
  next();
});

app.use((error, req, res, _next) => {
  const databaseStatus = { '23505': 409, '23503': 400, '23514': 400, '22P02': 400, '22007': 400, '22008': 400, '22003': 400 };
  const status = Number(error.status || databaseStatus[error.code] || (error.name === 'MulterError' ? 400 : 500));
  const message = error.code === '23505' ? 'A record with those details already exists.'
    : error.code === '23503' ? 'A selected related record does not exist.'
      : databaseStatus[error.code] ? 'One or more submitted values are invalid.' : error.message;
  if (status >= 500) console.error(`[${req.requestId}]`, error);
  else console.warn(`[${req.requestId}]`, error.message);
  res.status(status).json({ error: status >= 500 ? 'An unexpected server error occurred.' : message, requestId: req.requestId });
});

const server = app.listen(port, '0.0.0.0', () => console.log(`Svasthya server listening on port ${port}`));
for (const signal of ['SIGINT','SIGTERM']) {
  process.on(signal, () => server.close(async () => { await pool.end(); process.exit(0); }));
}
