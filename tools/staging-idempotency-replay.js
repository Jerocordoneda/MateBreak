// Chrome DevTools Sources > Snippets. Local-only test aid; never ship in dist.
// Install before a FUTURE approved purchase. Captured recipient/body stay only
// in this page's closure; credentials remain managed by the browser.
(() => {
  const origin = window.location.origin;
  const url = new URL(origin);
  if (origin !== 'https://matebreak-staging.vercel.app' &&
      !(url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port))
    throw Error('Replay limitado a Staging o servidor aislado de loopback.');
  if (window.mbStagingReplay) throw Error('Ya existe un control de replay en esta página.');
  const originalFetch = window.fetch;
  const send = originalFetch.bind(window);
  let captured = null, firstResponse = null, proof = null, release, used = false, audited = false;
  const gate = new Promise(resolve => { release = resolve; });
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
  const readJson = async response => { try { return await response.json(); } catch { throw Error('Respuesta no interpretable; detener sin reintentar.'); } };
  window.fetch = async function(input, options = {}) {
    const endpoint = typeof input === 'string' ? new URL(input, origin) : null;
    if (!endpoint || endpoint.origin !== origin || endpoint.pathname !== '/api/checkout/pedidos' || options.method !== 'POST')
      return send(input, options);
    if (captured) throw Error('La captura ya contiene un intento; no repetir la compra desde la UI.');
    if (endpoint.search || endpoint.hash || options.credentials !== 'same-origin' || typeof options.body !== 'string' || options.signal)
      throw Error('Formato de request no soportado; no se envió el pedido.');
    const headers = new Headers(options.headers);
    if ([...headers.keys()].some(key => key !== 'content-type') || headers.get('content-type') !== 'application/json')
      throw Error('Headers no soportados; no se envió el pedido.');
    let body;
    try { body = JSON.parse(options.body); } catch { throw Error('Payload no interpretable; no se envió el pedido.'); }
    if (!uuid(body.idempotencia) || !uuid(body.cotizacion_id) || body.pago !== 'mercadopago' || body.envio !== 'correo_domicilio' || body.directa !== false)
      throw Error('Alcance de compra no soportado; no se envió el pedido.');
    captured = { input, options: { ...options, headers: new Headers(headers), body: options.body }, key: body.idempotencia };
    // Freeze the UI before it removes the key/navigates. No automatic replay.
    try { firstResponse = await send(captured.input, captured.options); } catch { throw Error('Primer envío falló; detener y auditar sin reintentar.'); }
    const result = await readJson(firstResponse.clone());
    if (!firstResponse.ok || result.mock !== true || result.paymentStatus !== 'approved' || result.order?.estado !== 'pagado' || result.order.moneda !== 'ARS' || !uuid(result.order.id) || Number(result.order.total) !== 18500)
      throw Error('Primer resultado fuera del alcance; detener y auditar, sin replay.');
    proof = { orderId: result.order.id, total: Number(result.order.total), idempotencyKey: captured.key };
    await gate;
    return firstResponse;
  };
  window.mbStagingReplay = Object.freeze({
    inspect() { return { ready: Boolean(proof), used, audited, ...(proof || {}) }; },
    confirmAudit(orderId) {
      if (!proof || orderId !== proof.orderId || used) throw Error('Auditoría no confirmada para el pedido capturado.');
      audited = true;
    },
    async replayOnce() {
      if (!proof || !audited || used) throw Error('Replay no autorizado por el control de auditoría o ya utilizado.');
      used = true; // Even a timeout/error consumes the single allowed attempt.
      let response;
      try { response = await send(captured.input, { ...captured.options, headers: new Headers(captured.options.headers) }); } catch { throw Error('Replay falló; detener y auditar sin reintentar.'); }
      const result = await readJson(response);
      if (!response.ok || result.order?.id !== proof.orderId || result.order?.estado !== 'pagado' || result.order.moneda !== 'ARS' || Number(result.order.total) !== proof.total)
        throw Error('Replay divergente; detener y auditar. No reintentar.');
      return { orderId: result.order.id, status: response.status, total: Number(result.order.total), repeated: true };
    },
    release() {
      window.fetch = originalFetch;
      release();
      captured = null;
      delete window.mbStagingReplay;
    },
  });
})();
