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

import {validateRecipient as validateFields} from '../../src/features/checkout/recipient-validation.mjs';
import {province,provinces} from '../shipping/provinces.mjs';
export function validateRecipient(value,mode='correo_domicilio',choices=provinces){
 if(mode==='correo_domicilio'){
  try{value={...value,provincia:province(value?.provincia).name};}
  catch{} // Collect the province error together with all other field errors.
 }
 return validateFields(value,mode,choices);
}
