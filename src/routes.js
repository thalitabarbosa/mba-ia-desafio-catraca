// Cada feature registra seu roteador aqui (uma linha de import + uma linha em registerRoutes).
import { authRouter } from './auth/routes.js';
import { placeholderRouter } from './placeholder-routes.js';
import { eventsRouter } from './events/routes.js';

export function registerRoutes(app) {
  app.use(authRouter);
  app.use(eventsRouter);
  app.use(placeholderRouter);
}
