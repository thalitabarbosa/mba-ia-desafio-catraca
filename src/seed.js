import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { newId } from './ids.js';

export const SEED_PASSWORD = 'catraca123';
export const SEED_USERS = [
  { name: 'Organizador A', email: 'organizador.a@catraca.dev', role: 'organizer' },
  { name: 'Organizador B', email: 'organizador.b@catraca.dev', role: 'organizer' },
  { name: 'Participante Seed', email: 'participante@catraca.dev', role: 'participant' },
];

/** Idempotente: pode rodar quantas vezes quiser. */
export async function seed() {
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const u of SEED_USERS) {
    await query(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING`,
      [newId('usr'), u.name, u.email, hash, u.role],
    );
  }
}
