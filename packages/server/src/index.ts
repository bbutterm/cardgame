import { startServer } from './server.js';

/**
 * Process entry point. All the wiring lives in `startServer` so tests can run
 * isolated instances in-process; this file only owns the process lifecycle.
 */
const server = await startServer();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n[delezh] ${signal}, shutting down`);
    void server.close().then(() => process.exit(0));
  });
}
