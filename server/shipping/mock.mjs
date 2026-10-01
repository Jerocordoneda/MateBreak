// Development-only MiCorreo-shaped provider. Its price is deliberately
// synthetic and must never be shown as a real carrier tariff.
export function createMockShipping({ originPostalCode = '7000' } = {}) {
  if (!/^[A-Za-z0-9 -]{4,12}$/.test(originPostalCode)) throw Error('CP de origen mock inválido');
  return {
    ready: true,
    mock: true,
    async quote({ destinationPostalCode, deliveryType, dimensions }) {
      if (!/^[A-Za-z0-9 -]{4,12}$/.test(destinationPostalCode) || !['D', 'S'].includes(deliveryType))
        throw Error('Destino de prueba inválido');
      for (const field of ['weight', 'height', 'width', 'length']) {
        const value = dimensions?.[field];
        if (!Number.isInteger(value) || value < 1 || value > (field === 'weight' ? 25_000 : 150))
          throw Error('Bulto de prueba inválido');
      }
      return [{ provider: 'correo_argentino_mock', service: 'MOCK-PAQ',
        name: 'Envío de prueba · tarifa simulada', deliveryType,
        carrierCost: 8500, validTo: new Date(Date.now() + 15 * 60_000).toISOString(),
        estimatedDeliveryDays: 4, originPostalCode, mock: true }];
    },
    async agencies() { return []; },
    async importShipment() { return {createdAt:new Date().toISOString()}; },
  };
}
