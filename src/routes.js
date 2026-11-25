// Cada feature registra seu roteador aqui (uma linha de import + uma linha em registerRoutes).
import { authRouter } from './auth/routes.js';
import { eventsRouter } from './events/routes.js';
import { partnerRouter } from './partner/routes.js';
import { storefrontRouter } from './storefront/routes.js';
import { checkinRouter } from './checkin/routes.js';
import { cancelRouter } from './cancel/routes.js';

export function registerRoutes(app) {
  app.use(authRouter);
  app.use(eventsRouter);
  app.use(partnerRouter);
  app.use(storefrontRouter);
  app.use(checkinRouter);
  app.use(cancelRouter);
}
