import { persistedMock } from './config/staging.mjs';
import { startReservationExpiry } from './jobs/expire-reservations.mjs';
import { createApp } from './app.mjs';
import { loadConfig } from './config/environment.mjs';
const { config, port, paymentsMode, shippingMode } = loadConfig();
const { app, admin, providers } = createApp(config);
const server = app.listen(port, process.env.MATEBREAK_LOCAL_ONLY === '1' ? '127.0.0.1' : '0.0.0.0',
  () => console.log(`MateBreak: ${config.origin}/ · Shipping ${shippingMode} · Payments ${paymentsMode}${config.stagingMpTestEnabled?'/test':''} · Mercado Pago ${providers.webhook.ready?'ready':'off'}`));
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.timeout = 60_000;
if (paymentsMode === 'real' || persistedMock(config)) await startReservationExpiry(admin);

// Let Render drain HTTP requests on restart; persistent state remains in SQL.
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 25000).unref();
});
