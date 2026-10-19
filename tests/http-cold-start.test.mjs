import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchJson, readJson, serverUnavailable, connectionLost} from '../src/services/http.mjs';
import {addCartItem} from '../src/features/cart/add-item.js';

const renderColdStart = () => new Response('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>', {status: 502, headers: {'content-type': 'text/html'}});
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
async function withFetch(fake, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test('A Render 502 HTML page becomes a Spanish, retryable message instead of "Unexpected token <"', async () => {
  await assert.rejects(readJson(renderColdStart()), error => {
    assert.equal(error.message, serverUnavailable);
    assert.doesNotMatch(error.message, /Unexpected token|JSON/);
    assert.equal(error.retryable, true);
    assert.equal(error.status, 502);
    return true;
  });
});

test('A JSON refusal keeps the server message and field errors and is not retryable', async () => {
  await assert.rejects(readJson(json({error: 'Hay campos que requieren corrección.', fields: {calle: 'Ingresá la calle'}}, 400)), error =>
    error.message === 'Hay campos que requieren corrección.' && error.fields.calle === 'Ingresá la calle' && error.retryable === false);
  await assert.rejects(readJson(json({}, 409), 'No pudimos iniciar la compra'), error => error.message === 'No pudimos iniciar la compra');
});

test('A JSON 503 from the BFF keeps its own message and can be retried', async () => {
  await assert.rejects(readJson(json({error: 'Mercado Pago todavía no está habilitado'}, 503)), error =>
    error.message === 'Mercado Pago todavía no está habilitado' && error.retryable === true);
});

test('A 200 answered with HTML (proxy fallback) is not treated as data', async () => {
  await assert.rejects(readJson(new Response('<html></html>', {status: 200})), error => error.message === serverUnavailable && error.retryable);
});

test('A dropped connection says so in Spanish', async () => {
  await withFetch(async () => { throw new TypeError('Failed to fetch'); }, () =>
    assert.rejects(fetchJson('/api/checkout/contexto'), error => error.message === connectionLost && error.retryable && error.status === 0));
});

test('Adding to the cart during a cold start fails in Spanish, then the retry succeeds', async () => {
  const window = globalThis.window, CustomEvent = globalThis.CustomEvent, events = [];
  globalThis.window = {dispatchEvent: event => events.push(event.detail)};
  globalThis.CustomEvent = class { constructor(type, {detail}) { this.detail = detail; } };
  let cold = true;
  try {
    await withFetch(async (url, options) => {
      if (cold) { cold = false; return renderColdStart(); }
      return json({items: [{variante_id: '7', cantidad: options?.method === 'PUT' ? 1 : 0}].filter(item => item.cantidad)});
    }, async () => {
      await assert.rejects(addCartItem('7'), error => error.message === serverUnavailable);
      const cart = await addCartItem('7');
      assert.equal(cart.items[0].cantidad, 1);
    });
    assert.deepEqual(events, [1]);
  } finally { globalThis.window = window; globalThis.CustomEvent = CustomEvent; }
});
