import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { newId } from '../ids.js';
import { createSession, destroySession } from './session.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : null);

authRouter.get('/signup', (req, res) => res.render('auth/signup', { title: 'Criar conta', errors: [], values: {} }));

authRouter.post('/signup', async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const errors = [];
  if (!name) errors.push('Informe o nome.');
  if (!EMAIL_RE.test(email)) errors.push('Informe um e-mail válido.');
  if (password.length < 8) errors.push('A senha precisa ter pelo menos 8 caracteres.');
  if (!errors.length) {
    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rowCount) errors.push('Já existe uma conta com este e-mail.');
  }
  if (errors.length) return res.status(422).render('auth/signup', { title: 'Criar conta', errors, values: { name, email } });

  const id = newId('usr');
  const hash = await bcrypt.hash(password, 10);
  try {
    await query(`INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'participant')`, [id, name, email, hash]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(422).render('auth/signup', { title: 'Criar conta', errors: ['Já existe uma conta com este e-mail.'], values: { name, email } });
    }
    throw err;
  }
  await createSession(res, id);
  res.redirect(303, '/');
});

authRouter.get('/login', (req, res) =>
  res.render('auth/login', { title: 'Entrar', errors: [], values: {}, next: safeNext(req.query.next) }),
);

authRouter.post('/login', async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const next = safeNext(req.body.next);
  const { rows } = await query('SELECT id, role, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).render('auth/login', { title: 'Entrar', errors: ['E-mail ou senha inválidos'], values: { email }, next });
  }
  await createSession(res, user.id);
  if (user.role === 'organizer') return res.redirect(303, next?.startsWith('/organizer') ? next : '/organizer');
  res.redirect(303, next && !next.startsWith('/organizer') ? next : '/');
});

authRouter.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.redirect(303, '/');
});
