import { config } from './config.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { createApp } from './app.js';
import { workers } from './workers.js';
import { pool } from './db.js';

await migrate();
await seed();
const stops = workers.map((w) => w.start());
const server = createApp().listen(config.port, () => {
  console.log(`Catraca ouvindo na porta ${config.port} (gateway ${config.gatewayMode}, escala ${config.gatewayDelayScale})`);
});

const shutdown = () => {
  stops.forEach((stop) => stop?.());
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
