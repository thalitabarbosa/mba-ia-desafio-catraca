import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadUser } from './auth/session.js';
import { registerRoutes } from './routes.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', join(here, 'views'));
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use(loadUser);
  registerRoutes(app);

  app.use((req, res) => res.status(404).render('error', { title: 'Página não encontrada', message: 'Página não encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'internal_error' });
    res.status(500).render('error', { title: 'Erro', message: 'Algo deu errado.' });
  });
  return app;
}
