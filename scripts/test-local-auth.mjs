import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../server/app.mjs';
import { createMockShipping } from '../server/shipping/mock.mjs';
import { runShipmentJob } from '../server/shipping/jobs.mjs';
import { root, localStatus, mustSql } from './local-test-runtime.mjs';
import { resolve } from 'node:path';

const status = localStatus();
const authOptions = { auth: { persistSession:false, autoRefreshToken:false } };
const client = (key = status.ANON_KEY) => createClient(status.API_URL, key, authOptions);
const admin = client(status.SERVICE_ROLE_KEY), anon = client();
const ids = [], clients = [];
const server = createServer();
await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
const origin = `http://127.0.0.1:${server.address().port}`;
const { app } = createApp({ url:status.API_URL, secret:status.SERVICE_ROLE_KEY, publishable:status.ANON_KEY,
  origin, production:false, shippingMode:'mock', paymentsMode:'mock', localPersistMock:true,
  mockPaymentResult:'approved', correo:{}, mercadoPago:{} });
server.on('request', app);
const run = file => new Promise((done, reject) => {
  const child = spawn(process.execPath, [resolve(root, file)], { cwd:root,
    env:{...process.env,APP_ORIGIN:origin}, stdio:'inherit', windowsHide:true });
  child.on('error',reject); child.on('close',code=>code===0?done():reject(Error(`${file} failed.`)));
});
const checked = async promise => { const r=await promise; if(r.error) throw Error(r.error.message); return r.data; };
const denied = async promise => {
  const r=await promise;
  if(r.error) assert.ok(['42501','PGRST106'].includes(r.error.code), `Unexpected denial code: ${r.error.code}`);
  else assert.deepEqual(r.data,[], 'Unauthorized rows disclosed');
};
function browser(base=origin) {
  const jar = new Map();
  return async (route, method='GET', body) => {
    const response=await fetch(base+'/api'+route,{method,headers:{origin:base,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),
      ...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
    for(const cookie of response.headers.getSetCookie()) { const pair=cookie.split(';')[0], at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1)); }
    return {status:response.status,data:await response.json()};
  };
}
let objectPath;
try {
  await run('tests/integration.mjs');
  for(let i=0;i<2;i++) {
    const email=`local-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('base64url');
    const data=await checked(admin.auth.admin.createUser({email,password,email_confirm:true}));
    ids.push(data.user.id); const db=client();
    const login=await checked(db.auth.signInWithPassword({email,password}));
    assert.ok(login.session.access_token); assert.equal(login.user.id,data.user.id);
    clients.push({db,email,password,request:browser()});
  }
  const [a,b]=clients;
  const unconfirmedEmail=`local-unconfirmed-${randomUUID()}@example.invalid`;
  const unconfirmedPassword=randomBytes(24).toString('base64url');
  const unconfirmed=await checked(admin.auth.admin.createUser({email:unconfirmedEmail,password:unconfirmedPassword,email_confirm:false}));
  ids.push(unconfirmed.user.id);
  assert.ok((await client().auth.signInWithPassword({email:unconfirmedEmail,password:unconfirmedPassword})).error,
    'Unconfirmed local email must not obtain a session');
  await checked(a.db.from('perfil').upsert({id:ids[0],nombre:'Fixture A'}));
  await checked(b.db.from('perfil').upsert({id:ids[1],nombre:'Fixture B'}));
  assert.deepEqual((await checked(a.db.from('perfil').select('id'))).map(r=>r.id),[ids[0]]);
  assert.deepEqual(await checked(a.db.from('perfil').select('id').eq('id',ids[1])),[]);
  await denied(a.db.from('perfil').update({nombre:'forged'}).eq('id',ids[1]).select());
  assert.equal((await checked(b.db.from('perfil').select('nombre').single())).nombre,'Fixture B');
  const address=await checked(a.db.from('direccion').insert({usuario_id:ids[0],destinatario:'Fixture A',telefono:'000',
    calle:'Fixture 1',ciudad:'Fixture',departamento:'Fixture',pais:'AR'}).select('id').single());
  await denied(b.db.from('direccion').select('id').eq('id',address.id));
  await denied(b.db.from('direccion').delete().eq('id',address.id).select());
  assert.equal((await checked(a.db.from('direccion').select('id').single())).id,address.id);
  await denied(b.db.from('direccion').insert({usuario_id:ids[0],destinatario:'forged',telefono:'000',calle:'Fixture',ciudad:'Fixture',departamento:'Fixture'}).select());
  const contact=await checked(a.db.from('email_contacto').insert({usuario_id:ids[0],email:'fixture@example.invalid'}).select('id').single());
  await denied(b.db.from('email_contacto').select('id').eq('id',contact.id));
  for(const db of [anon,a.db,b.db]) for(const table of ['producto','producto_simple','combo','combo_item','pedido','pedido_item','pago','pedido_stock','movimiento_stock'])
    await denied(db.from(table).select('*').limit(1));
  for(const table of ['perfil','direccion','email_contacto']) await denied(anon.from(table).select('*').limit(1));
  for(const db of [anon,a.db,b.db]) await denied(db.schema('private').from('inventario_ficha').select('*'));
  const fake=randomUUID();
  const calls={mb_comercio:{p_token_hash:'0'.repeat(64),p_usuario_id:ids[0],p_accion:'carrito',p_datos:{}},
    mb_checkout_minorista:{p_token_hash:'0'.repeat(64),p_usuario_id:ids[0],p_datos:{}},
    mb_checkout_catalogo:{p_token_hash:'0'.repeat(64),p_usuario_id:ids[0],p_datos:{}},
    mb_cotizar_catalogo:{p_carrito_id:fake,p_pago:'mercadopago'},
    mb_confirmar_pago:{p_pago_id:fake,p_referencia:'TEST',p_importe:1,p_moneda:'ARS'},mb_expirar_reservas:{},
    mb_actualizar_envio:{p_pedido_id:fake,p_estado:'preparando',p_transportista:null,p_seguimiento:null},
    mb_shipping_fingerprint:{p_carrito_id:fake,p_snapshot:{}},
    mb_claim_shipment:{p_environment:'mock'},
    mb_finish_shipment:{p_claim_id:fake,p_result:{}}};
  for(const db of [anon,a.db,b.db]) for(const [name,args] of Object.entries(calls)) {
    const r=await db.rpc(name,args); assert.equal(r.error?.code,'42501',`${name} must be service-only`);
  }
  const unsafe=await mustSql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef and
    (not (coalesce(p.proconfig,'{}') @> array['search_path=""'] or coalesce(p.proconfig,'{}') @> array['search_path=pg_catalog'])
     or (has_schema_privilege('anon',n.oid,'USAGE') and has_function_privilege('anon',p.oid,'EXECUTE'))
     or (has_schema_privilege('authenticated',n.oid,'USAGE') and has_function_privilege('authenticated',p.oid,'EXECUTE')));`);
  assert.equal(Number(unsafe),0,'Unsafe SECURITY DEFINER exposure');
  const forged=await fetch(status.API_URL+'/rest/v1/perfil?select=id',{headers:{apikey:status.ANON_KEY,Authorization:'Bearer invalid.signature.token'}});
  assert.equal(forged.status,401);
  console.log('PASS Auth/JWT, direct RLS A/B, anon, private schema, 10 service-only RPCs, SECURITY DEFINER');
  const publicCatalog=await browser()('/productos');assert.equal(publicCatalog.status,200);
  assert.equal(publicCatalog.data.length,106);
  const forbiddenKeys=new Set(['stock','stock_origen','reservado','usuario_id','token_hash']);
  const visit=value=>{if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){assert.ok(!forbiddenKeys.has(key),`Public catalog disclosed ${key}`);visit(child);}};
  visit(publicCatalog.data);
  console.log('PASS public catalog: commercial details/availability only, no internal stock quantities');

  objectPath=`local-tests/${randomUUID()}.png`;
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afoAAAAAASUVORK5CYII=','base64');
  await checked(admin.storage.from('product-images').upload(objectPath,image,{contentType:'image/png'}));
  const publicUrl=admin.storage.from('product-images').getPublicUrl(objectPath).data.publicUrl;
  const downloaded=await fetch(publicUrl);assert.equal(downloaded.status,200);
  assert.equal(createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex'),createHash('sha256').update(image).digest('hex'));
  const upload=await a.db.storage.from('product-images').upload('local-tests/forged.png',image,{contentType:'image/png'});
  assert.ok(upload.error,'Authenticated upload must be denied');
  assert.deepEqual((await anon.storage.from('product-images').list('local-tests')).data||[],[]);
  assert.deepEqual((await a.db.storage.from('product-images').remove([objectPath])).data||[],[]);
  assert.equal((await admin.storage.from('product-images').download(objectPath)).error,null);
  await checked(admin.storage.from('product-images').remove([objectPath]));objectPath=null;
  console.log('PASS Storage: explicit public image read, restricted listing/upload/delete');

  await mustSql(`update public.metodo_pago set activo=true where codigo='mercadopago';
    update public.metodo_envio set activo=true where codigo in ('retiro','correo_domicilio');
    update public.producto_simple set stock=100 where id_producto=(select producto_id from private.inventario_ficha where sku='MB-CAJA-MATE');`);
  const variant=JSON.parse(await mustSql(`select jsonb_build_object('id',cv.id,'parts',(select jsonb_agg(jsonb_build_object('id',c.producto_simple_id,'cantidad',c.cantidad,'stock',s.stock))
    from public.catalogo_variante_componente c join public.producto_simple s on s.id_producto=c.producto_simple_id where c.variante_id=cv.id))
    from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
    where p.nombre='IMPERIAL NEGRO DE ALPACA' and cv.opciones->>'Agregar BOMBILLA DE ACERO'='NO' limit 1;`));
  for(const c of clients) assert.equal((await c.request('/auth/login','POST',{email:c.email,password:c.password})).status,200);
  assert.equal((await a.request('/carrito/variantes/'+variant.id,'PUT',{cantidad:1})).status,200);
  const recipient={nombre:'Fixture',apellido:'Local',email:a.email,telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',
    ciudad:'Fixture',calle:'Fixture',numero:'1',piso:'',departamento:'',referencia:''};
  const quote=await a.request('/checkout/cotizar-envio','POST',{destinatario:recipient,modalidad:'correo_domicilio'});
  assert.equal(quote.status,200,JSON.stringify(quote.data));assert.equal(quote.data[0].mock,true);
  const body={idempotencia:randomUUID(),pago:'mercadopago',envio:'correo_domicilio',cotizacion_id:quote.data[0].id,destinatario:recipient,total:1,usuario_id:ids[1]};
  const result=await a.request('/checkout/pedidos','POST',body);
  assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(result.data.mock,true);assert.equal(result.data.order.estado,'pagado');
  const order=result.data.order;
  const saved=await checked(admin.from('pedido').select('usuario_id,total').eq('id',order.id).single());
  assert.equal(saved.usuario_id,ids[0]);assert.ok(Number(saved.total)>1);
  const reserved=await checked(admin.from('pedido_stock').select('producto_simple_id,cantidad').eq('pedido_id',order.id));
  assert.equal(reserved.length,variant.parts.length);
  for(const part of variant.parts) {
    assert.equal(reserved.find(r=>r.producto_simple_id===part.id).cantidad,part.cantidad);
    assert.equal((await checked(admin.from('producto_simple').select('stock').eq('id_producto',part.id).single())).stock,part.stock-part.cantidad);
  }
  const payment=await checked(admin.from('pago').select('estado,referencia_externa').eq('pedido_id',order.id).single());
  assert.equal(payment.estado,'aprobado');assert.ok(payment.referencia_externa.startsWith('TEST-LOCAL-'));
  assert.equal((await a.request('/checkout/pedidos/'+order.id)).status,200);
  assert.equal((await b.request('/checkout/pedidos/'+order.id)).status,404);
  const retry=await a.request('/checkout/pedidos','POST',body);assert.equal(retry.data.order.id,order.id);
  assert.equal((await checked(admin.from('pedido_stock').select('*').eq('pedido_id',order.id))).length,reserved.length);
  console.log('PASS persisted mock: cart -> shipping mock -> real local reservation/order -> mock payment -> owned result/retry');
  let importCalls=0;
  const logisticsProvider=createMockShipping();
  const importMock=logisticsProvider.importShipment;
  logisticsProvider.importShipment=async data=>{importCalls++;assert.ok(data.extOrderId.startsWith('MB-'+order.id+'-'));return importMock(data);};
  const jobs=await Promise.all([runShipmentJob({admin,provider:logisticsProvider}),runShipmentJob({admin,provider:logisticsProvider})]);
  assert.equal(jobs.filter(j=>j.processed).length,1);assert.equal(importCalls,1);
  assert.equal((await checked(admin.from('envio').select('estado_integracion').eq('pedido_id',order.id).single())).estado_integracion,'importado');
  assert.equal((await checked(admin.from('pedido').select('estado,cotizacion_envio_id').eq('id',order.id).single())).cotizacion_envio_id,quote.data[0].id);
  assert.deepEqual(await runShipmentJob({admin,provider:logisticsProvider}),{processed:false});
  console.log('PASS local logistics job: concurrent claims import a paid parcel once, preserve quote relation and financial state (mock only).');
  for(const paymentResult of ['rejected','pending']) {
    const modeServer=createServer();
    await new Promise(r=>modeServer.listen(0,'127.0.0.1',r));
    const modeOrigin=`http://127.0.0.1:${modeServer.address().port}`;
    const modeApp=createApp({url:status.API_URL,secret:status.SERVICE_ROLE_KEY,publishable:status.ANON_KEY,
      origin:modeOrigin,production:false,shippingMode:'mock',paymentsMode:'mock',localPersistMock:true,
      mockPaymentResult:paymentResult,correo:{},mercadoPago:{}}).app;
    modeServer.on('request',modeApp);
    try {
      const request=browser(modeOrigin);
      const before=new Map((await checked(admin.from('producto_simple').select('id_producto,stock')
        .in('id_producto',variant.parts.map(p=>p.id)))).map(p=>[p.id_producto,p.stock]));
      assert.equal((await request('/auth/login','POST',{email:a.email,password:a.password})).status,200);
      assert.equal((await request('/carrito/variantes/'+variant.id,'PUT',{cantidad:1})).status,200);
      const response=await request('/checkout/pedidos','POST',{idempotencia:randomUUID(),pago:'mercadopago',envio:'retiro',destinatario:recipient});
      assert.equal(response.status,201,JSON.stringify(response.data));
      assert.equal(response.data.order.estado,paymentResult==='rejected'?'cancelado':'pendiente_pago');
      const after=await checked(admin.from('producto_simple').select('id_producto,stock').in('id_producto',variant.parts.map(p=>p.id)));
      for(const part of variant.parts) assert.equal(after.find(p=>p.id_producto===part.id).stock,
        before.get(part.id)-(paymentResult==='pending'?part.cantidad:0));
      console.log(`PASS persisted mock ${paymentResult}: ${paymentResult==='rejected'?'reservation fully released':'one pending reservation retained'}`);
    } finally {await new Promise(r=>modeServer.close(r));}
  }
} finally {
  if(objectPath) await admin.storage.from('product-images').remove([objectPath]);
  // An order fixture cannot be deleted independently due to audit FKs; test:local
  // performs a guarded local reset afterward, even on failure. No remote cleanup.
  await new Promise(resolveClose=>server.close(resolveClose));
}
