// Versioned, deterministic logistics contract. Amounts/dimensions come from backend.
const provinceCodes = {salta:'A','buenos aires':'B','ciudad autonoma de buenos aires':'C',caba:'C',
 'san luis':'D','entre rios':'E','la rioja':'F','santiago del estero':'G',chaco:'H','san juan':'J',
 catamarca:'K','la pampa':'L',mendoza:'M',misiones:'N',formosa:'P',neuquen:'Q','rio negro':'R',
 'santa fe':'S',tucuman:'T',chubut:'U','tierra del fuego':'V',corrientes:'W',cordoba:'X',jujuy:'Y','santa cruz':'Z'};
export function provinceCode(name) {
 const key=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const code=provinceCodes[key];
 if(!code)throw Object.assign(Error('Provincia de destino inválida'),{status:400});
 return code;
}
export function shippingSnapshot({cart,recipient,deliveryType,pickupPoint,rate,environment,originPostalCode,customerId,sender}) {
 const cartItems=(cart.items||[]).filter(i=>i.variante_id).map(i=>({
  variant:String(i.variante_id),product:String(i.producto_id),quantity:i.cantidad,personalization:i.personalizacion??null,
 })).sort((a,b)=>BigInt(a.variant)<BigInt(b.variant)?-1:1);
 return {version:1,environment,customerId:customerId||null,sender:sender||null,cartItems,deliveryType,originPostalCode:originPostalCode||null,
  recipient:{name:recipient.nombre+' '+recipient.apellido,email:recipient.email,phone:recipient.telefono},
  address:{streetName:recipient.calle,streetNumber:recipient.numero,floor:recipient.piso||'',
   apartment:recipient.departamento||'',city:recipient.ciudad,provinceCode:provinceCode(recipient.provincia),postalCode:recipient.codigo_postal},
  agency:pickupPoint,parcels:rate.parcels};
}
