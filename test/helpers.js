// Utilitários dos testes: banco limpo + seed, app do Express e agente com cookies.
import request from 'supertest';
import { migrate } from '../src/migrate.js';
import { seed, SEED_PASSWORD } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db.js';

export { pool, query, SEED_PASSWORD };
export const app = createApp();

export async function resetDb() {
  await migrate();
  const { rows } = await query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  if (rows.length) await query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  await seed();
}

export const ORG_A = 'organizador.a@catraca.dev';
export const ORG_B = 'organizador.b@catraca.dev';
export const PART = 'participante@catraca.dev';

/** Agente supertest já logado. */
export async function loginAs(email, password = SEED_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/login').type('form').send({ email, password });
  if (res.status !== 303) throw new Error(`login de ${email} falhou: ${res.status}`);
  return agent;
}

export const anon = () => request(app);

/** "YYYY-MM-DDTHH:mm" em horário de SP, deslocado em dias. */
export function localDate(days, hhmm = '21:00') {
  const d = new Date(Date.now() + days * 864e5 - 3 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${hhmm}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
