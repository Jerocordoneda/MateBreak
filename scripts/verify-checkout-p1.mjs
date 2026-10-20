// Real-browser check of the checkout P1 fixes at 320/390/768/1440 px:
//  - a Render cold start (HTML 502) shows a Spanish message and "Reintentar" works;
//  - changing step focuses the step title, announces it and honours reduced motion;
//  - "Confirmar pedido" and "Comprar ahora" send one request per attempt, even on
//    a double click or a click while the page navigates, and a retry after a 502
//    reuses the same idempotency key;
//  - home-delivery addresses: "1234 bis" goes through as 1234 with its wording in
//    Referencia; "S/N", "Km 12" and "0" get specific guidance on the field.
// The API is stubbed with synthetic data; nothing remote is used.
//   node scripts/verify-checkout-p1.mjs [--root <dir>] [--proof <dir>]
// Playwright: installed module, or MATEBREAK_BROWSER_MODULE=<path to playwright index.mjs>.
import http from 'node:http';
import assert from 'node:assert/strict';
import {readFile, stat, mkdir} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {provinces} from '../server/shipping/provinces.mjs';

const repo = resolve(import.meta.dirname, '..');
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const root = resolve(option('--root') || repo);
const proof = option('--proof');
if (proof) await mkdir(proof, {recursive: true});
const {chromium} = await import(process.env.MATEBREAK_BROWSER_MODULE
  ? pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href : 'playwright');
const rules = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8')).rewrites
  .filter(rule => rule.destination.startsWith('/'))
  .map(rule => ({pattern: new RegExp('^' + rule.source.replace(/:[a-z]+\*?/g, '[^/]+') + '$'), to: rule.destination}));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2'};
const server = http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Stands in for Mercado Pago / the result page: a navigation that takes a while.
  if (path === '/__slow') { await new Promise(done => setTimeout(done, 4000)); res.writeHead(200, {'content-type': 'text/html'}); return res.end('<p>destino</p>'); }
  if (path === '/') path = '/index.html';
  path = rules.find(rule => rule.pattern.test(path))?.to ?? path;
  try {
    const file = join(root, normalize(path));
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

const coldStart = {status: 502, contentType: 'text/html', body: '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>'};
const item = {producto_id: '11', variante_id: '5', nombre: 'MATE DE PRUEBA', cantidad: 1, precio_unitario: 20000, opciones: {}, personalizacion: null};
const checkoutContext = {
  requiresAuthentication: false, cart: {id: 'cart-verify', items: [item], requiere_confirmacion_catalogo: false},
  quote: {items: [item], subtotal: 20000, moneda: 'ARS', descuento_promocional: 0}, progress: {remaining: 60000},
  modo_prueba: true, mock_persistente: false, mercadopago_test: false, pickupEnabled: false, manualQuoteAvailable: false,
  deliveries: [{codigo: 'retiro', nombre: 'Retiro en MateBreak', activo: true}, {codigo: 'correo_domicilio', nombre: 'Correo Argentino a domicilio', activo: true},
    {codigo: 'correo_sucursal', nombre: 'Correo Argentino a sucursal', activo: false}],
  payments: [{codigo: 'mercadopago', nombre: 'Mercado Pago', activo: true}, {codigo: 'transferencia', nombre: 'Transferencia', activo: true}],
  packaging: {status: 'automatic'}, provinces, user: null,
};
const product = {id_producto: 11, slug: 'mate-de-prueba', nombre: 'MATE DE PRUEBA', descripcion: 'Mate para la verificación.', tipo: 'mate', moneda: 'ARS',
  categorias: [], imagenes: [], opciones: [], promociones: [], componentes: [], atributos: {},
  variantes: [{id: 5, opciones: {}, precio: 20000, comprable: true, con_stock: true, imagen: null}]};
const contact = {nombre: 'Ana', apellido: 'Prueba', email: 'ana@example.com', telefono: '2494123456'};
const address = {codigo_postal: '7000', provincia: 'Buenos Aires', ciudad: 'Tandil', calle: 'Ruta 226'};
const quoteId = '6f1c3c56-8a8f-4d7a-9a55-0b5b0d6f9f10';

const failures = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); } };

async function newPage(browser, width, reducedMotion) {
  const mobile = width < 768;
  const context = await browser.newContext({viewport: {width, height: 900}, isMobile: mobile, hasTouch: mobile, reducedMotion});
  await context.route(/\/api\//, route => route.fulfill({json: {}}));
  await context.route(/\/api\/sesion/, route => route.fulfill({json: {usuario: null}}));
  await context.route(/\/api\/carrito\/resumen/, route => route.fulfill({json: {cantidad: 1}}));
  await context.route(/\/api\/productos/, route => route.fulfill({json: new URL(route.request().url()).pathname === '/api/productos' ? [product] : product}));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await context.addInitScript(() => {
    const scroll = window.scrollTo.bind(window);
    window.__scrolls = [];
    window.scrollTo = (...args) => { window.__scrolls.push(args[0]); scroll(...args); };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return {context, page, errors};
}
const focusState = page => page.evaluate(() => ({
  focused: document.activeElement?.closest('section')?.id + ' ' + document.activeElement?.tagName,
  status: document.querySelector('#checkout-step-status')?.textContent,
  scroll: window.__scrolls.at(-1)?.behavior,
}));
// Playwright waits on a pending navigation, so the clicks "while the page
// navigates" run inside the page and report back through a stubbed request.
async function clickWhileLeaving(page, context, find) {
  let done;
  const report = new Promise(resolve => { done = resolve; });
  await context.route(/\/api\/__probe/, route => { done(JSON.parse(route.request().postData())); return route.fulfill({json: {}}); });
  await page.evaluate(({css, text}) => setTimeout(() => {
    const button = css ? document.querySelector(css) : [...document.querySelectorAll('button')].find(b => b.textContent.startsWith(text));
    const disabled = button.disabled;
    button.click(); button.click();
    fetch('/api/__probe', {method: 'POST', body: JSON.stringify({disabled, path: location.pathname})});
  }, 1000), find);
  return report;
}
async function fill(page, values) {
  for (const [name, value] of Object.entries(values)) {
    const field = page.locator(`#recipient-form [name=${name}]`);
    if (await field.evaluate(node => node.tagName === 'SELECT')) await field.selectOption(value); else await field.fill(value);
  }
}

const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});
for (const [index, width] of [320, 390, 768, 1440].entries()) {
  const reduced = index % 2 === 0, label = `${width}px${reduced ? ' reduced motion' : ''}`;

  // 1. Cold start, retry, step focus, one order per attempt.
  {
    const {context, page, errors} = await newPage(browser, width, reduced ? 'reduce' : 'no-preference');
    let contextCalls = 0;
    const orders = [];
    await context.route(/\/api\/checkout\/contexto/, route => ++contextCalls === 1 ? route.fulfill(coldStart) : route.fulfill({json: checkoutContext}));
    await context.route(/\/api\/checkout\/pedidos$/, async route => {
      orders.push(JSON.parse(route.request().postData()));
      if (orders.length === 1) return route.fulfill(coldStart);
      await new Promise(done => setTimeout(done, 300));
      return route.fulfill({status: 201, json: {order: {id: 'order-verify'}, redirectUrl: origin + '/__slow'}});
    });
    await page.goto(origin + '/checkout', {waitUntil: 'load'});
    await page.locator('#checkout-error:not([hidden])').waitFor();
    await check(`${label} cold start: Spanish message, no JSON parser error`, async () => {
      const text = await page.locator('#checkout-error').textContent();
      assert.doesNotMatch(text, /Unexpected token|JSON/);
      assert.match(text, /servidor.*volvé a intentar/i);
    });
    if (proof) await page.screenshot({path: join(proof, `checkout-502-${width}.png`)});
    await check(`${label} cold start: submitting before the retry keeps a Spanish message`, async () => {
      await page.locator('#continue-payment').click();
      const text = await page.locator('#checkout-error').textContent();
      assert.doesNotMatch(text, /Cannot read|undefined|TypeError/);
      assert.match(text, /Reintentar/);
    });
    await check(`${label} cold start: "Reintentar" loads the checkout`, async () => {
      await page.locator('#checkout-retry').click({timeout: 2000});
      await page.waitForFunction(() => document.querySelectorAll('#recipient-form [name=provincia] option').length > 20, null, {timeout: 3000});
      assert.equal(await page.locator('#checkout-error').isHidden(), true);
      assert.equal(await page.locator('#checkout-retry').isHidden(), true);
    });
    // Without a working retry, reload so the remaining checks still run.
    if (await page.locator('#recipient-form [name=provincia] option').count() < 20) {
      await page.reload({waitUntil: 'load'});
      await page.waitForFunction(() => document.querySelectorAll('#recipient-form [name=provincia] option').length > 20);
    }
    await fill(page, contact);
    await page.locator('#continue-payment').click();
    await page.locator('#payment-panel:not([hidden])').waitFor();
    await check(`${label} to payment: focus on the step title, step announced`, async () => {
      const state = await focusState(page);
      assert.equal(state.focused, 'payment-panel H2');
      assert.equal(state.status, 'Paso 2 de 2: Pago');
      assert.equal(state.scroll, reduced ? 'instant' : 'smooth');
    });
    if (proof) await page.screenshot({path: join(proof, `checkout-payment-${width}.png`)});
    await check(`${label} "Cambiar" back to delivery: focus and announcement`, async () => {
      await page.locator('#editable-summary button').first().click();
      const state = await focusState(page);
      assert.equal(state.focused, 'delivery-panel H2');
      assert.equal(state.status, 'Paso 1 de 2: Entrega');
    });
    await page.locator('#continue-payment').click();
    await page.locator('#payment-panel:not([hidden])').waitFor();
    await page.locator('#payment-options input[value=mercadopago]').check();
    await page.locator('#place-order').click();
    await page.locator('#checkout-error:not([hidden])').waitFor();
    await check(`${label} order 502: Spanish message and the button comes back for a retry`, async () => {
      assert.match(await page.locator('#checkout-error').textContent(), /servidor/i);
      assert.equal(await page.locator('#place-order').isEnabled(), true);
    });
    // The order answers after 300 ms; the destination takes 4 s, so at 1 s the page is leaving.
    const leaving = clickWhileLeaving(page, context, {css: '#place-order'});
    await page.locator('#place-order').dblclick();
    const late = await leaving;
    await page.waitForTimeout(300);
    await check(`${label} double click and clicks while navigating send one more order only`, () => assert.equal(orders.length, 2));
    await check(`${label} the retry after the 502 reuses the idempotency key`, () => assert.equal(orders[1]?.idempotencia, orders[0]?.idempotencia));
    await check(`${label} "Confirmar" stays disabled after a successful order`, () => assert.deepEqual(late, {disabled: true, path: '/checkout'}));
    await check(`${label} checkout has no page errors`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 2. Home delivery with addresses without a plain street number.
  for (const numero of ['S/N', 'Km 12', '1234 bis', '0']) {
    const {context, page, errors} = await newPage(browser, width, 'no-preference');
    const quotes = [];
    await context.route(/\/api\/checkout\/contexto/, route => route.fulfill({json: checkoutContext}));
    await context.route(/\/api\/checkout\/cotizar-envio/, route => {
      quotes.push(JSON.parse(route.request().postData()));
      return route.fulfill({json: [{id: quoteId, customerShippingCost: 0}]});
    });
    await page.goto(origin + '/checkout', {waitUntil: 'load'});
    await page.waitForFunction(() => document.querySelectorAll('#recipient-form [name=provincia] option').length > 20);
    await page.locator('#delivery-options input[value=correo_domicilio]').check();
    await fill(page, {...contact, ...address, numero});
    await page.locator('#continue-payment').click();
    if (numero === '1234 bis') await check(`${label} address "1234 bis" reaches payment as 1234 with the wording kept`, async () => {
      await page.locator('#payment-panel:not([hidden])').waitFor({timeout: 2000});
      assert.equal(quotes.length, 1);
      assert.equal(quotes[0].destinatario.numero, '1234');
      assert.equal(quotes[0].destinatario.referencia, 'Altura 1234 bis');
      assert.match(await page.locator('#editable-summary').textContent(), /Ruta 226 1234/);
      assert.equal(await page.locator('#recipient-form [name=numero]').inputValue(), '1234 bis', 'the form keeps what was typed');
    });
    if (numero === '1234 bis') await check(`${label} changing "1234 bis" to "1500" sends no stale note`, async () => {
      await page.locator('#editable-summary button').first().click();
      await page.locator('#recipient-form [name=numero]').fill('1500');
      await page.locator('#continue-payment').click();
      await page.locator('#payment-panel:not([hidden])').waitFor({timeout: 2000});
      assert.deepEqual([quotes[1]?.destinatario.numero, quotes[1]?.destinatario.referencia], ['1500', '']);
    });
    else await check(`${label} address "${numero}" gets specific guidance on the field, no request`, async () => {
      await page.locator('[name=numero][aria-invalid=true]').waitFor({timeout: 2000});
      const field = await page.evaluate(() => ({focused: document.activeElement?.name, message: document.querySelector('#recipient-numero-error')?.textContent}));
      assert.equal(field.focused, 'numero');
      assert.match(field.message, /altura/i);
      assert.notEqual(field.message, 'Ingresá la altura de la dirección');
      assert.equal(quotes.length, 0);
      assert.equal(await page.locator('#payment-panel').isHidden(), true);
    });
    if (proof && ['S/N', '1234 bis'].includes(numero)) await page.screenshot({path: join(proof, `checkout-${numero === 'S/N' ? 'sn' : 'bis'}-${width}.png`)});
    await check(`${label} address "${numero}" no page errors`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 2b. Once the BFF reports numero_flexible (migration applied), S/N travels as such.
  {
    const {context, page, errors} = await newPage(browser, width, 'no-preference');
    const quotes = [];
    await context.route(/\/api\/checkout\/contexto/, route => route.fulfill({json: {...checkoutContext, numero_flexible: true}}));
    await context.route(/\/api\/checkout\/cotizar-envio/, route => {
      quotes.push(JSON.parse(route.request().postData()));
      return route.fulfill({json: [{id: quoteId, customerShippingCost: 0}]});
    });
    await page.goto(origin + '/checkout', {waitUntil: 'load'});
    await page.waitForFunction(() => document.querySelectorAll('#recipient-form [name=provincia] option').length > 20);
    await page.locator('#delivery-options input[value=correo_domicilio]').check();
    await fill(page, {...contact, ...address, numero: 's/n'});
    await page.locator('#continue-payment').click();
    await check(`${label} flexible BFF: "s/n" is sent as S/N with no guidance`, async () => {
      await page.locator('#payment-panel:not([hidden])').waitFor({timeout: 2000});
      assert.deepEqual([quotes[0]?.destinatario.numero, quotes[0]?.destinatario.referencia], ['S/N', '']);
    });
    await check(`${label} flexible BFF: no page errors`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 3. "Comprar ahora" on the product page.
  {
    const {context, page, errors} = await newPage(browser, width, 'no-preference');
    let purchases = 0;
    await context.route(/\/api\/compra-directa/, async route => {
      purchases++; await new Promise(done => setTimeout(done, 300));
      return route.fulfill({status: 201, json: {next: '/__slow'}});
    });
    await page.goto(origin + '/productos/' + product.slug, {waitUntil: 'load'});
    const buyNow = page.getByRole('button', {name: 'Comprar ahora →'});
    await buyNow.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.startsWith('Comprar ahora') && !b.disabled));
    const leaving = clickWhileLeaving(page, context, {text: 'Comprar ahora'});
    await buyNow.dblclick();
    const late = await leaving;
    await page.waitForTimeout(300);
    await check(`${label} "Comprar ahora" starts one purchase`, () => assert.equal(purchases, 1));
    await check(`${label} "Comprar ahora" stays disabled while navigating`, () => assert.deepEqual(late, {disabled: true, path: '/productos/' + product.slug}));
    await check(`${label} product page has no page errors`, () => assert.deepEqual(errors, []));
    await context.close();
  }
}
await browser.close(); server.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('Checkout P1: cold start retry, step focus, one order per attempt and street-height guidance pass at 320/390/768/1440');
