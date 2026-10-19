import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitLock, leaving} from '../src/js/submit-lock.mjs';
import {orderAttemptKey} from '../src/features/checkout/order-attempt.mjs';

const control = () => {
  const button = {disabled: false};
  return {button, hooks: {lock: () => { button.disabled = true; }, release: () => { button.disabled = false; }}};
};
const storage = () => {
  const values = new Map();
  return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value))};
};
const choices = {destinatario: {nombre: 'Ana', email: 'ana@example.com'}, envio: 'retiro', pago: 'mercadopago', cotizacion_id: null, directa: false};

test('A successful order keeps "Confirmar" locked while the page navigates', async () => {
  const {button, hooks} = control();
  let posts = 0;
  const place = submitLock(async () => { posts++; return leaving; }, hooks);
  await place();
  assert.equal(button.disabled, true, 'the button must not come back after a successful order');
  await place();
  assert.equal(posts, 1, 'a second click during the navigation sends no second order');
});

test('A double click while the order is in flight sends one request', async () => {
  const {hooks} = control();
  let posts = 0, finish;
  const place = submitLock(() => { posts++; return new Promise(resolve => { finish = resolve; }); }, hooks);
  const first = place(); await place(); finish(leaving); await first;
  assert.equal(posts, 1);
});

test('A failed order releases the button so the shopper can retry', async () => {
  const {button, hooks} = control();
  const place = submitLock(async () => { throw Error('502'); }, hooks);
  await assert.rejects(place(), /502/);
  assert.equal(button.disabled, false);
});

test('Returning from the back/forward cache unlocks a page left mid-navigation', async () => {
  const {button, hooks} = control();
  const place = submitLock(async () => leaving, hooks);
  await place(); place.reset();
  assert.equal(button.disabled, false);
});

test('Retrying the same choices reuses the idempotency key, also after success', async () => {
  const saved = storage();
  let issued = 0;
  const next = () => `key-${++issued}`;
  const first = await orderAttemptKey(saved, 'cart-5a', choices, next);
  assert.equal(await orderAttemptKey(saved, 'cart-5a', structuredClone(choices), next), first);
  assert.equal(issued, 1);
});

test('Changing any choice or the cart starts a new attempt', async () => {
  const saved = storage();
  let issued = 0;
  const next = () => `key-${++issued}`;
  const first = await orderAttemptKey(saved, 'cart-6a', choices, next);
  assert.notEqual(await orderAttemptKey(saved, 'cart-6a', {...choices, pago: 'transferencia'}, next), first);
  assert.notEqual(await orderAttemptKey(saved, 'cart-6b', choices, next), first);
});

test('The stored attempt holds no recipient data and survives blocked storage', async () => {
  const saved = storage();
  await orderAttemptKey(saved, 'cart-7a', choices, () => 'key-1');
  assert.doesNotMatch([...saved.values.values()].join(), /ana@example\.com|Ana/);
  const blocked = {getItem() { throw Error('SecurityError'); }, setItem() { throw Error('SecurityError'); }};
  const key = await orderAttemptKey(blocked, 'cart-blocked', choices, () => 'memory-key');
  assert.equal(await orderAttemptKey(blocked, 'cart-blocked', choices, () => 'other'), key);
});

test('A legacy plain key from an earlier release is replaced, not reused for other choices', async () => {
  const saved = storage();
  saved.setItem('mb_checkout_key_cart-legacy', '2f1c3c56-8a8f-4d7a-9a55-0b5b0d6f9f10');
  assert.equal(await orderAttemptKey(saved, 'cart-legacy', choices, () => 'fresh'), 'fresh');
});
