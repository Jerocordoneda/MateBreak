import {AsyncLocalStorage}from'node:async_hooks';
const guarded=new Set(['mb_rol','mb_inventario_autorizado','mb_admin_roles','mb_admin_dashboard','mb_ventas','mb_inventario','mb_listar_recepciones','mb_registrar_recepcion','mb_preparacion','mb_logistics_admin','mb_comercio','mb_carrito_cantidad','mb_cotizar_catalogo','mb_catalogo_disponibilidad','mb_shipping_fingerprint','mb_checkout_minorista','mb_mark_mock_payment','mb_confirmar_pago','mb_confirmar_transferencia','mb_cancelar_pedido_servicio','mb_pedido_por_carrito','mb_exchange_order_link','mb_read_order_link','mb_request_order_link','mb_wholesale_catalog','mb_wholesale_quote','mb_wholesale_submit_account','mb_wholesale_own','mb_wholesale_manage']);
export function sessionScopedAdmin(base,{enabled=true}={}){
 const scope=new AsyncLocalStorage();
 const admin=new Proxy(base,{get(target,key){
  if(key==='rpc')return (name,args={})=>{const req=scope.getStore();if(enabled&&req?.user&&guarded.has(name)){
   if(!req.liveSessionId)throw Object.assign(Error('Tu sesión venció. Volvé a ingresar.'),{status:401});
   return target.rpc('mb_sensitive_session_rpc',{p_user:req.user.id,p_session:req.liveSessionId,p_function:name,p_args:args});
  }return target.rpc(name,args);};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 return {admin,middleware:(req,res,next)=>scope.run(req,next)};
}
