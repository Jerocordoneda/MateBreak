import {provinceCode} from './provinces.mjs';
export {provinceCode} from './provinces.mjs';
export function shippingSnapshot({cart,recipient,deliveryType,pickupPoint,rate,environment,originPostalCode,customerId,sender}) {
 const cartItems=(cart.items||[]).filter(i=>i.variante_id).map(i=>({
  variant:String(i.variante_id),product:String(i.producto_id),quantity:i.cantidad,personalization:i.personalizacion??null,
 })).sort((a,b)=>BigInt(a.variant)<BigInt(b.variant)?-1:1);
 return {version:1,environment,customerId:customerId||null,sender:sender||null,cartItems,deliveryType,originPostalCode:originPostalCode||null,
  recipient:{name:recipient.nombre+' '+recipient.apellido,email:recipient.email,phone:recipient.telefono},
  address:{streetName:recipient.calle,streetNumber:recipient.numero,floor:recipient.piso||'',
   apartment:recipient.departamento||'',city:recipient.ciudad,provinceCode:pickupPoint?.address?.provinceCode||provinceCode(recipient.provincia),postalCode:recipient.codigo_postal},
  agency:pickupPoint,parcels:rate.parcels};
}
