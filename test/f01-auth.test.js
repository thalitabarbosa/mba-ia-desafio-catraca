import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, resetDb, pool, query, loginAs, anon, PART } from './helpers.js';
import { seed } from '../src/seed.js';

before(resetDb);
after(() => pool.end());

test('health responde ok', async () => {
  const res = await anon().get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('seed é idempotente e cria 2 organizadores e 1 participante', async () => {
  await seed();
  await seed();
  const { rows } = await query('SELECT role, count(*) AS n FROM users GROUP BY role ORDER BY role');
  assert.deepEqual(rows, [{ role: 'organizer', n: 2 }, { role: 'participant', n: 1 }]);
});

test('cadastro, login e logout de participante', async () => {
  const agent = request.agent(app);
  const email = `ana.${Date.now()}@example.com`;
  const signup = await agent.post('/signup').type('form').send({ name: 'Ana', email, password: 'senha12345' });
  assert.equal(signup.status, 303);
  assert.equal(signup.headers.location, '/');
  const home = await agent.get('/');
  assert.match(home.text, /Ana/);

  const logout = await agent.post('/logout');
  assert.equal(logout.status, 303);
  const after = await agent.get('/');
  assert.doesNotMatch(after.text, /Sair/);

  const login = await agent.post('/login').type('form').send({ email, password: 'senha12345' });
  assert.equal(login.status, 303);
  assert.equal(login.headers.location, '/');
});

test('e-mail duplicado é rejeitado com 422', async () => {
  const res = await anon().post('/signup').type('form').send({ name: 'X', email: PART, password: 'senha12345' });
  assert.equal(res.status, 422);
  assert.match(res.text, /class="error"/);
});

test('senha errada responde 401 com a mensagem', async () => {
  const res = await anon().post('/login').type('form').send({ email: PART, password: 'errada' });
  assert.equal(res.status, 401);
  assert.match(res.text, /E-mail ou senha inválidos/);
});

test('organizador vai para /organizer no login', async () => {
  const res = await anon().post('/login').type('form').send({ email: 'organizador.a@catraca.dev', password: 'catraca123' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/organizer');
});

test('área de organizador: visitante redirecionado, participante 403', async () => {
  const visitor = await anon().get('/organizer');
  assert.equal(visitor.status, 302);
  assert.match(visitor.headers.location, /^\/login/);
  const part = await loginAs(PART);
  const res = await part.get('/organizer');
  assert.equal(res.status, 403);
  assert.match(res.text, /Acesso restrito/);
});
