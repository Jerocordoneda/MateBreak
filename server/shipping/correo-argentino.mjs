// MiCorreo API contract: https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiMiCorreo.pdf
// No dimensions or prices are inferred from the storefront. The caller must
// supply measured parcel data from a trusted server-side source.
const endpoints = {
  test: 'https://apitest.correoargentino.com.ar/micorreo/v1',
  production: 'https://api.correoargentino.com.ar/micorreo/v1',
};

export function createCorreoArgentino(config = {}, fetcher = fetch) {
  const { environment = 'test', username, password, customerId, originPostalCode } = config;
  if (!Object.hasOwn(endpoints, environment)) throw Error('Ambiente de MiCorreo inválido');
  const ready = Boolean(username && password && customerId && originPostalCode);
  async function token() {
    if (!ready) throw Error('Faltan credenciales o CP de origen de MiCorreo');
    const response = await fetcher(`${endpoints[environment]}/token`, {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw Error('MiCorreo no pudo autenticar la cuenta');
    const data = await response.json();
    if (typeof data.token !== 'string' || !data.token) throw Error('Token de MiCorreo inválido');
    return data.token;
  }
  async function request(path, options = {}) {
    const bearer = await token();
    const response = await fetcher(`${endpoints[environment]}${path}`, {
      ...options, headers: { Authorization: `Bearer ${bearer}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw Error('MiCorreo no pudo completar la consulta');
    return response.json();
  }
  return {
    ready,
    async quote({ destinationPostalCode, deliveryType, dimensions }) {
      if (!/^[A-Za-z0-9 -]{4,12}$/.test(destinationPostalCode) || !['D', 'S'].includes(deliveryType)) throw Error('Destino inválido');
      for (const field of ['weight', 'height', 'width', 'length']) {
        const number = dimensions?.[field];
        if (!Number.isInteger(number) || number < 1 || number > (field === 'weight' ? 25_000 : 150)) throw Error('Faltan dimensiones verificadas del paquete');
      }
      const result = await request('/rates', { method: 'POST', body: JSON.stringify({
        customerId, postalCodeOrigin: originPostalCode, postalCodeDestination: destinationPostalCode,
        deliveredType: deliveryType, dimensions,
      }) });
      return (result.rates || []).filter(rate => rate.deliveredType === deliveryType &&
        Number.isFinite(Number(rate.price)) && Number(rate.price) >= 0).map(rate => ({
          provider: 'correo_argentino', service: rate.productType, name: rate.productName,
          deliveryType, carrierCost: Number(rate.price), validTo: result.validTo,
        }));
    },
    async agencies(provinceCode) {
      if (!/^[A-Z]$/.test(provinceCode)) throw Error('Provincia inválida');
      const result = await request(`/agencies?${new URLSearchParams({ customerId, provinceCode })}`);
      return Array.isArray(result) ? result.filter(agency => agency.code && agency.services?.pickupAvailability === true) : [];
    },
  };
}
