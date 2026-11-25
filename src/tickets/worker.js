// Worker do gateway: a cada 250 ms aplica as respostas vencidas (sem reentrância).
import { applyDueGatewayResponses } from './service.js';

export const gatewayWorker = {
  name: 'gateway',
  start(intervalMs = 250) {
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await applyDueGatewayResponses();
      } catch (err) {
        console.error('[gateway-worker]', err.message);
      } finally {
        running = false;
      }
    }, intervalMs);
    return () => clearInterval(timer);
  },
};
