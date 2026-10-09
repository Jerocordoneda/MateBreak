import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteCart} from '../server/checkout/cart-quote.mjs';
import {createApp} from './helpers/business-app.mjs';

const selection = quantity => ({id:'cart-fixture',estado:'abierto',moneda:'ARS',total:10000*quantity,
  items:[{producto_id:'13',variante_id:'2',nombre:'Fixture',cantidad:quantity,precio:10000,subtotal:10000*quantity,activo:true}]});
test('cart uses SQL prices for 1, 2, 3, 4, 5, 8, 10 units, never discounts transfer twice',async()=>{
  for(const [quantity,subtotal,eligible] of [[1,10000,false],[2,20000,false],[3,24000,false],[4,32000,false],[5,40000,false],[8,64000,false],[10,80000,true]]){
    const cart=selection(quantity),calls=[];
    const result=await quoteCart(cart,{rpc:async(name,args)=>{calls.push({name,args});return {data:{items:[{producto_id:13,variante_id:2,cantidad:quantity,precio_unitario:10000}],subtotal_original_productos:10000*quantity,descuento_promocional:10000*quantity-subtotal,subtotal,moneda:'ARS'}};}});
    assert.equal(result.total,cart.total,'legacy total remains compatible');assert.deepEqual(result.items,cart.items);
    assert.equal(result.cotizacion.subtotal,subtotal);assert.equal(result.cotizacion.subtotal_original,10000*quantity);
    assert.equal(result.cotizacion.descuento_promocional,10000*quantity-subtotal);assert.equal(result.cotizacion.progress.eligible,eligible);
    assert.deepEqual(calls,[{name:'mb_cotizar_catalogo',args:{p_carrito_id:cart.id,p_pago:'mercadopago'}}]);
  }
});
test('legacy combo and non-promotional variant retain SQL quotation, with no browser policy',async()=>{
  const cart={id:'mixed',total:18000,items:[{producto_id:'50',cantidad:1,precio:5000},{producto_id:'13',variante_id:'2',cantidad:2,precio:6500}]};
  const result=await quoteCart(cart,{rpc:async()=>({data:{moneda:'ARS',subtotal:18000,items:[{producto_id:50,variante_id:null,cantidad:1,precio_unitario:5000},{producto_id:13,variante_id:2,cantidad:2,precio_unitario:6500}]}})});
  assert.equal(result.cotizacion.descuento_promocional,0);assert.equal(result.cotizacion.items.length,2);
});
test('failed/stale SQL quotes cannot enable checkout or invent a promotional price',async()=>{
  for(const response of [{error:{code:'P0001'}},{data:{items:[],subtotal:10000,moneda:'ARS'}},{data:{items:[{variante_id:2,cantidad:2,precio_unitario:8000}],subtotal:16000,moneda:'ARS'}}]){
    const result=await quoteCart(selection(1),{rpc:async()=>response});assert.equal(result.cotizacion,null);assert.ok(result.error_cotizacion);
  }
  let called=false;const unavailable=await quoteCart({...selection(1),requiere_confirmacion_catalogo:true},{rpc:()=>{called=true;}});
  assert.equal(called,false);assert.equal(unavailable.cotizacion,null);
});
test('HTTP quantity 1→2→1 persists and ignores forged prices, discounts and stock',async t=>{
  let quantity=1;const forwarded=[];
  const admin={rpc:async(name,args)=>{
    if(name==='mb_comercio'){if(args.p_accion==='variante'){forwarded.push(args.p_datos);quantity=args.p_datos.cantidad;}return {data:selection(quantity)};}
    const subtotal=quantity*10000;return {data:{moneda:'ARS',subtotal,subtotal_original_productos:subtotal,descuento_promocional:0,items:[{producto_id:13,variante_id:2,cantidad:quantity,precio_unitario:10000}]}};
  }};
  const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},
    {admin,authFactory:()=>({auth:{getUser:async()=>({data:{user:null}})}})});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  for(const qty of [1,2,1]){
    const response=await fetch(base+'/api/carrito/variantes/2',{method:'PUT',headers:{origin:'https://matebreak.test','content-type':'application/json'},body:JSON.stringify({cantidad:qty,precio:0,descuento:100,stock:999})});
    assert.equal(response.status,200);const cart=await response.json();assert.equal(cart.cotizacion.subtotal,qty*10000);
    const persisted=await (await fetch(base+'/api/carrito')).json();assert.equal(persisted.items[0].cantidad,qty);
  }
  assert.deepEqual(forwarded,[1,2,1].map(cantidad=>({variante_id:'2',cantidad})));
});
