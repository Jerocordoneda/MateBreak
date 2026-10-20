import test from 'node:test';import assert from 'node:assert/strict';
test('public cards reuse fresh navigation data, expire, invalidate on cart changes and retry failed requests',async()=>{
 const saved=new Map(),listeners=new Map(),calls=[];let fail=false;
 globalThis.sessionStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn)};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async url=>{calls.push(url);if(fail)return new Response('{}',{status:503});return new Response(JSON.stringify(url.includes('?')?[{id_producto:'25',slug:'boca'}]:{id_producto:'25',variantes:[{id:'34'}]}),{headers:{'Content-Type':'application/json'}});};
 try{
  const {getProducts,getProductBySlug}=await import('../src/services/products.js');
  await Promise.all([getProducts(),getProducts()]);assert.equal(calls.length,1);await getProducts();assert.equal(calls.length,1);
  const key=[...saved.keys()][0],cached=JSON.parse(saved.get(key));saved.set(key,JSON.stringify({...cached,time:Date.now()-16000}));await getProducts();assert.equal(calls.length,2);
  assert.equal((await getProductBySlug('boca')).variantes[0].id,'34');assert.ok(calls.includes('/api/productos/boca'));assert.equal(saved.size,1,'Details are not persisted');
  listeners.get('mb:cart')();assert.equal(saved.size,0);fail=true;await assert.rejects(getProducts());fail=false;await getProducts();assert.equal(calls.at(-1),'/api/productos?view=cards');
 }finally{globalThis.fetch=originalFetch;delete globalThis.sessionStorage;delete globalThis.window;}
});
