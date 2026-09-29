export const FREE_SHIPPING_FROM_ARS = 80_000;
export const TRANSFER_DISCOUNT = 0.10;

const cents = amount => Math.round(Number(amount) * 100);
export function shippingProgress(merchandiseSubtotal) {
  const value = Math.max(0, cents(merchandiseSubtotal));
  if (!Number.isSafeInteger(value)) throw Error('Subtotal inválido');
  const threshold = FREE_SHIPPING_FROM_ARS * 100;
  return { threshold: FREE_SHIPPING_FROM_ARS, remaining: Math.max(0, threshold - value) / 100,
    eligible: value >= threshold, fraction: Math.min(1, value / threshold) };
}

export function calculateTotals({ merchandiseSubtotal, carrierCost, method }) {
  const subtotal = cents(merchandiseSubtotal), carrier = cents(carrierCost);
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || !Number.isSafeInteger(carrier) || carrier < 0) throw Error('Importe inválido');
  if (!['transferencia', 'mercadopago'].includes(method)) throw Error('Medio de pago inválido');
  const discount = method === 'transferencia' ? Math.round(subtotal * TRANSFER_DISCOUNT) : 0;
  const customerShipping = shippingProgress(merchandiseSubtotal).eligible ? 0 : carrier;
  return { merchandiseSubtotal: subtotal / 100, discount: discount / 100, carrierCost: carrier / 100,
    customerShippingCost: customerShipping / 100, total: (subtotal - discount + customerShipping) / 100,
    currency: 'ARS' };
}

const required = {
  nombre: [2, 100], apellido: [2, 100], email: [3, 254], telefono: [7, 30],
  codigo_postal: [4, 12], provincia: [2, 100], ciudad: [2, 100], calle: [2, 150], numero: [1, 20],
};
const optional = { piso: 20, departamento: 30, referencia: 300 };
export function validateRecipient(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Completá los datos del destinatario');
  const result = {};
  for (const [key, [min, max]] of Object.entries(required)) {
    const text = value[key];
    if (typeof text !== 'string' || text.trim().length < min || text.trim().length > max) throw Error(`Revisá ${key.replaceAll('_', ' ')}`);
    result[key] = text.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw Error('Email inválido');
  if (!/^[+0-9 ()-]+$/.test(result.telefono) || result.telefono.replace(/\D/g, '').length < 7) throw Error('Teléfono inválido');
  if (!/^[A-Za-z0-9 -]+$/.test(result.codigo_postal)) throw Error('Código postal inválido');
  if (!/^[0-9]+[A-Za-z]?$/.test(result.numero)) throw Error('Número de calle inválido');
  for (const [key, max] of Object.entries(optional)) {
    if (value[key] === undefined || value[key] === null || value[key] === '') { result[key] = ''; continue; }
    if (typeof value[key] !== 'string' || value[key].trim().length > max) throw Error(`Revisá ${key}`);
    result[key] = value[key].trim();
  }
  return result;
}
