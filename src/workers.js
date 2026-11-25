// Workers de fundo iniciados pelo main.js. Cada item: { name, start(): stopFn }.
import { gatewayWorker } from './tickets/worker.js';

export const workers = [gatewayWorker];
