import test from 'node:test';
import assert from 'node:assert/strict';
import {directCardVariant,addCartItem} from '../src/features/cart/add-item.js';
test('cards require selection for variants, options and personalization',()=>{
 const variant={id:'real-variant'};
 assert.equal(directCardVariant({variantes:[variant],opciones:[]}),variant);
 for(const product of [{variantes:[]},{variantes:[variant,variant]},{variantes:[variant],opciones:[{}]},{variantes:[variant],atributos:{personalizable_explicitamente:true}},{variantes:[variant],nombre:'TERMO PERSONALIZADO – CREÁ TU DISEÑO ACÁ'}])assert.equal(directCardVariant(product),null);
});
test('shared cart action serializes increments, preserves personalization and emits real totals',async()=>{
 const fetchBefore=globalThis.fetch,windowBefore=globalThis.window,events=[];let quantity=2,requests=[];
 globalThis.window={dispatchEvent:event=>events.push(event.detail)};
 globalThis.fetch=async (url,options)=>{
  requests.push({url,options});
  if(options.method==='PUT')quantity=JSON.parse(options.body).cantidad;
  return {ok:true,json:async()=>({items:[{variante_id:'v',cantidad:quantity}]})};
 };
 try {
  await Promise.all([addCartItem('v',1,'Grabado'),addCartItem('v')]);
  assert.equal(quantity,4);assert.deepEqual(events,[3,4]);
  assert.deepEqual(JSON.parse(requests[1].options.body),{cantidad:3,personalizacion:'Grabado'});
  assert.equal(requests[1].options.credentials,'same-origin');
  assert.equal(requests[0].url,'/api/carrito');
  globalThis.fetch=async()=>({ok:false});
  await assert.rejects(addCartItem('v'),/recuperar el carrito/);
  globalThis.fetch=async()=>({ok:true,json:async()=>({items:[]})});
  await addCartItem('other');assert.equal(events.at(-1),0);
 }finally{globalThis.fetch=fetchBefore;globalThis.window=windowBefore;}
});
