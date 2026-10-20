export const isOrderId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function publicNumber(order){
 const value=String(order.numero_publico??order.numero??'');
 if(order.numero_publico==null&&isOrderId(order.id)&&value.toUpperCase()===order.id.slice(0,8).toUpperCase())return null;
 return /^[1-9]\d{0,18}$/.test(value)?value:null;
}
export function paymentState(order){
 const payments=order.pagos||order.pago||[];
 // Both persisted order and payment must agree. URL parameters never prove payment.
 if(['pagado','en_preparacion','enviado','entregado'].includes(order.estado)&&Array.isArray(payments)&&payments.some(p=>p.estado==='aprobado'))return 'approved';
 if(order.estado==='cancelado')return order.estado_pago_externo==='rejected'||payments.some?.(p=>['cancelado','rechazado'].includes(p.estado))?'rejected':'cancelled';
 if(order.estado==='expirado')return 'expired';
 return 'pending';
}
export function countdown({tick,redirect,schedule=setInterval,clear=clearInterval}){
 let remaining=5,active=true,timer;
 const cancel=()=>{active=false;if(timer!==undefined)clear(timer);};
 tick(remaining);
 timer=schedule(()=>{if(!active)return;remaining--;if(!remaining){cancel();redirect('/');}else tick(remaining);},1000);
 return cancel;
}
