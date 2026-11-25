import { randomBytes } from 'node:crypto';
import { query } from '../db.js';

const COOKIE = 'sid';
const TTL_MS = 7 * 24 * 3600 * 1000;

export async function createSession(res, userId) {
  const id = randomBytes(32).toString('hex');
  await query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [id, userId, new Date(Date.now() + TTL_MS)]);
  res.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', maxAge: TTL_MS, path: '/' });
}

export async function destroySession(req, res) {
  const id = req.cookies?.[COOKIE];
  if (id) await query('DELETE FROM sessions WHERE id = $1', [id]);
  res.clearCookie(COOKIE, { path: '/' });
}

/** Popula req.user (ou null) e res.locals.user. */
export async function loadUser(req, res, next) {
  req.user = null;
  const id = req.cookies?.[COOKIE];
  if (id) {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > now()`,
      [id],
    );
    req.user = rows[0] || null;
  }
  res.locals.user = req.user;
  next();
}
