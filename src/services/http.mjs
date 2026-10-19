// Render answers a cold start with an HTML 502 page, so a body is read as JSON
// only when it is JSON. Anything else becomes a Spanish message the shopper can
// act on, marked `retryable` so the page can offer to try again.
export const serverUnavailable = 'El servidor está iniciando o no responde. Esperá unos segundos y volvé a intentar.';
export const connectionLost = 'No pudimos conectar con la tienda. Revisá tu conexión y volvé a intentar.';

export async function readJson(response, failure = 'No pudimos completar la operación') {
  let data = null;
  try { data = await response.json(); } catch { /* HTML error page, empty body or cut connection. */ }
  if (response.ok && data !== null) return data;
  // A non-JSON 4xx (proxy or CDN page) is a refusal, not a cold start.
  const retryable = response.status >= 500 || [408, 429].includes(response.status) || (response.ok && data === null);
  throw Object.assign(Error(data?.error || (retryable ? serverUnavailable : failure)),
    { status: response.status, fields: data?.fields, retryable });
}

export async function fetchJson(url, options, failure) {
  let response;
  try { response = await fetch(url, options); }
  catch { throw Object.assign(Error(connectionLost), { status: 0, retryable: true }); }
  return readJson(response, failure);
}
