import { startReservationExpiry } from './jobs/expire-reservations.mjs';
import { createApp } from './app.mjs';
import { loadConfig } from './config/environment.mjs';
const { config, port, paymentsMode, shippingMode } = loadConfig();
const { app, admin } = createApp(config);
const server = app.listen(port, process.env.MATEBREAK_LOCAL_ONLY === '1' ? '127.0.0.1' : undefined,
  () => console.log(`MateBreak: ${config.origin}/ · Shipping ${shippingMode} · Payments ${paymentsMode}`));
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.timeout = 60_000;
if (paymentsMode === 'real' || config.localPersistMock) await startReservationExpiry(admin);
