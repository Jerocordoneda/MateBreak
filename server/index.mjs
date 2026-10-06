import { persistedMock } from './config/staging.mjs';
import { startReservationExpiry } from './jobs/expire-reservations.mjs';
import { createApp } from './app.mjs';
import { loadConfig } from './config/environment.mjs';
import {runApproved1008Once} from './jobs/temporary-approved-1008.mjs';
const { config, port, paymentsMode, shippingMode } = loadConfig();
const { app, admin, providers } = createApp(config);
// No listener or reservation job starts until the provider authenticates TEST identity.
if(config.stagingMpTestEnabled) {
  await providers.webhook.verifyTestIdentity();
  console.log(`Mercado Pago TEST identity verified · seller ${providers.webhook.collectorId} · test_user`);
  console.log('Staging TEST isolation · emails/worker/receipts/reconciliation/recovery off · persisted mock off');
  if(config.mercadoPago.expectedLiveMode===true)
    await runApproved1008Once({config,admin,provider:providers.webhook,log:event=>console.log(JSON.stringify(event))});
}
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
