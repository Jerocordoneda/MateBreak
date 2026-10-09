import {isOrderId,publicNumber} from '../checkout/result-state.mjs';
const key='mb_recent_order_navigation';
// This identifier is not a capability. Every read still requires server-verified
// HttpOnly cart/session credentials; no credential is copied into browser storage.
export function rememberOrder(id,storage){
 if(!isOrderId(id))return false;
 try{(storage??globalThis.sessionStorage).setItem(key,id);return (storage??globalThis.sessionStorage).getItem(key)===id;}catch{return false;}
}
export function recentOrderId(storage){try{const id=(storage??globalThis.sessionStorage).getItem(key);return isOrderId(id)?id:null;}catch{return null;}}
export function forgetOrder(storage){try{(storage??globalThis.sessionStorage).removeItem(key);}catch{/* Storage may be unavailable. */}}
export async function readOrder(id){
 if(!isOrderId(id))throw Error('Pedido inválido');
 const response=await fetch('/api/checkout/pedidos/'+encodeURIComponent(id)+'?consulta=carrito',{
  credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000),
 });
 if(!response.ok)throw Object.assign(Error('No pudimos verificar el acceso al pedido. Tu sesión de compra puede haber vencido.'),{status:response.status});
 const order=await response.json();
 if(order.id!==id)throw Error('No pudimos verificar el pedido');
 return order;
}
export {publicNumber};
