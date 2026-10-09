import {recentOrderId,readOrder,publicNumber,forgetOrder} from './recent-order.mjs';
const box=document.querySelector('#recent-order');let revision=0;
async function refresh(){const epoch=++revision;if(!box)return;box.hidden=true;const id=recentOrderId();if(!id)return;
 const link=box.querySelector('a');link.textContent='Consultar mi compra reciente';link.href='/src/pages/pedido.html?pedido='+encodeURIComponent(id);
 try{const order=await readOrder(id),number=publicNumber(order);if(epoch!==revision)return;
  if(number){const link=box.querySelector('a');link.textContent='Ver mi pedido #'+number;link.href='/src/pages/pedido.html?pedido='+encodeURIComponent(order.id);box.hidden=false;}
 }catch(error){if(epoch!==revision)return;
  if([401,403,404].includes(error.status)){forgetOrder();box.hidden=true;}
  else box.hidden=false; // Connectivity failures preserve navigation, not order data.
 }
}
window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});refresh();
