import test from 'node:test';
import assert from 'node:assert/strict';
import {addCartItem,directCardVariant} from '../src/features/cart/add-item.js';
test('cards require one unambiguous variant and defer options and personalization to detail',()=>{
  const v={id:'one'},p={nombre:'Bombilla',variantes:[v],opciones:[],atributos:{}};
  assert.equal(directCardVariant(p),v);
  for(const change of [{variantes:[v,{id:'two'}]},{opciones:[{nombre:'Modelo'}]},{atributos:{personalizable_explicitamente:true}},{nombre:'Mate personalizado'}])assert.equal(directCardVariant({...p,...change}),null);
  assert.equal(directCardVariant(null),null);
});
test('parallel card/detail additions preserve quantities, customization and recover after a failed write',async()=>{
  const originalFetch=globalThis.fetch,originalWindow=globalThis.window,originalEvent=globalThis.CustomEvent;
  const events=[],writes=[];let items=[{variante_id:'a',cantidad:2}],fail=true;
  globalThis.window={dispatchEvent:e=>events.push(e.detail)};
  globalThis.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail;}};
  globalThis.fetch=async(url,options)=>{
    assert.equal(options.credentials,'same-origin');
    if(options.method==='PUT'){
      const body=JSON.parse(options.body);writes.push(body);await new Promise(r=>setTimeout(r,5));
      if(fail){fail=false;return {ok:false,json:async()=>({error:'Sin stock'})};}
      items=[{variante_id:'a',...body}];
    }
    return {ok:true,json:async()=>({items:structuredClone(items)})};
  };
  try{
    await assert.rejects(addCartItem('a'),/Sin stock/);
    await Promise.all([addCartItem('a',2,'Grabado aprobado'),addCartItem('a')]);
    assert.deepEqual(writes,[{cantidad:3},{cantidad:4,personalizacion:'Grabado aprobado'},{cantidad:5}]);
    assert.deepEqual(events,[4,5]);assert.equal(items[0].cantidad,5);
  }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.CustomEvent=originalEvent;}
});
