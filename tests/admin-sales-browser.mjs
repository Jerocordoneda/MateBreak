import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startAdminPreview} from './helpers/admin-runtime.mjs';
const {chromium}=await import(process.env.MATEBREAK_PLAYWRIGHT_MODULE||'playwright');
const out=process.env.MATEBREAK_EVIDENCE_DIR;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const runtime=await startAdminPreview(),browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],report=[];
try{
 for(const name of ['account-sales.sql','admin-dashboard.sql']){
  let sql=fs.readFileSync(new URL('../supabase/tests/'+name,import.meta.url),'utf8');
  assert.ok(/rollback\s*;/i.test(sql));
  sql=sql.replace(/insert into auth\.users\b[^;]+;/gi,statement=>statement+"update auth.users set email_confirmed_at=now()where email_confirmed_at is null;insert into auth.sessions(id,user_id)select id,id from auth.users on conflict(id)do nothing;")
   .replace(/select set_config\('request\.jwt\.claim\.sub'[^;]+;/gi,statement=>statement+"select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);");
  runtime.db.query(sql);report.push('PASS unchanged historical '+name+' on isolated PostgreSQL, rolled back');
 }
 const authResponses=[];const guestAuth=await browser.newContext({viewport:{width:390,height:844}}),authPage=await guestAuth.newPage();authPage.on('pageerror',e=>errors.push(e.message));authPage.on('response',async r=>{if(r.url().endsWith('/api/auth/login'))authResponses.push({status:r.status(),body:await r.text()});});
 await authPage.goto(runtime.base+'/mi-cuenta');await authPage.locator('#signin').waitFor();await authPage.locator('#register-tab').click();await authPage.waitForFunction(()=>document.querySelector('#signin [name=provincia]').options.length>1);
 assert.deepEqual(await authPage.locator('#signin input:not([disabled]),#signin select').evaluateAll(fields=>fields.filter(f=>f.offsetParent!==null).map(f=>f.name)),['nombre','apellido','whatsapp','provincia','localidad','email','password','confirmacion']);
 await authPage.locator('#signin-submit').click();assert.equal(await authPage.locator('#signin [aria-invalid=true]').count(),8);
 for(const [name,value]of [['nombre','Ana'],['apellido','Pérez'],['whatsapp','01112345678'],['localidad','Tandil'],['email','mal'],['password','123'],['confirmacion','456']])await authPage.locator('#signin [name='+name+']').fill(value);
 await authPage.locator('#signin [name=provincia]').selectOption('Buenos Aires');await authPage.locator('#signin-submit').click();for(const name of ['email','password','confirmacion'])assert.equal(await authPage.locator('#signin [name='+name+']').getAttribute('aria-invalid'),'true');
 await authPage.screenshot({path:out+'/register-errors-390.png',fullPage:true});await authPage.locator('#login-tab').click();await authPage.locator('#signin [name=email]').fill('wrong@example.invalid');await authPage.locator('#signin [name=password]').fill('wrong-password');await authPage.locator('#signin-submit').click();try{await authPage.waitForFunction(()=>document.querySelector('#auth-error-summary').textContent.includes('incorrectos'));}catch(e){console.log(JSON.stringify({authResponses,summary:await authPage.locator('#auth-error-summary').textContent(),errors}));throw e;}
 for(const name of ['email','password'])assert.equal(await authPage.locator('#signin [name='+name+']').getAttribute('aria-invalid'),'true');assert.equal(await authPage.locator('#signin [name=email]').inputValue(),'wrong@example.invalid');await authPage.screenshot({path:out+'/login-errors-390.png',fullPage:true});await guestAuth.close();report.push('PASS exact registration field order, all field errors, password mismatch and server login feedback');
 const admin=await browser.newContext({extraHTTPHeaders:{'x-local-preview-admin':'1'},viewport:{width:1440,height:1000}}),seller=await browser.newContext({extraHTTPHeaders:{'x-local-preview-seller':'1'},viewport:{width:390,height:844}});
 const page=await admin.newPage(),salePage=await seller.newPage();for(const p of [page,salePage])p.on('pageerror',e=>errors.push(e.message));
 const put=(ctx,url,data)=>ctx.request.put(runtime.base+url,{headers:{origin:runtime.base},data});
 const post=(ctx,url,data)=>ctx.request.post(runtime.base+url,{headers:{origin:runtime.base},data});
 const get=async(ctx,path)=>(await ctx.request.get(runtime.base+path)).json();
 await page.goto(runtime.base+'/mi-cuenta');await page.locator('.dashboard-kpi').first().waitFor();
 assert.deepEqual(await page.locator('.admin-navigation a').allTextContents(),['Dashboard','Roles','Inventario','Solicitudes mayoristas','Pedidos minoristas']);
 assert.equal(await page.locator('[data-admin-panel]:visible').count(),1);
 // Real cost reception, through the original inventory API, then an audit correction.
 let response=await post(admin,'/api/admin/inventario/990001/recepciones',{cantidad:300,costo_unitario:'5500',fecha:new Date().toISOString().slice(0,10),proveedor:'Proveedor fixture',motivo:'Compra aislada de prueba',idempotencia:crypto.randomUUID(),disponible_esperado:10,reservado_esperado:0});assert.equal(response.status(),200,await response.text());
 assert.equal((await get(admin,'/api/admin/inventario')).find(x=>x.id==='990001').costo_unitario,5500);
 await page.locator('.admin-navigation a[href="#inventario-admin"]').click();assert.equal(await page.locator('#inventario-admin .workspace-link').count(),1);assert.equal(await page.locator('.stock-cost-form').count(),0);
 assert.equal((await put(admin,'/api/admin/inventario/990001/costo',{costo_unitario:'6000',costo_esperado:'5500',idempotencia:crypto.randomUUID(),motivo:'Corrección local auditada'})).status(),200);
 const costBody={costo_unitario:'6000',costo_esperado:'5500',idempotencia:crypto.randomUUID(),motivo:'Costo desactualizado'};
 assert.equal((await put(admin,'/api/admin/inventario/990001/costo',costBody)).status(),409);
 assert.equal((await put(seller,'/api/admin/inventario/990001/costo',costBody)).status(),403);
 const guest=await browser.newContext();assert.equal((await put(guest,'/api/admin/inventario/990001/costo',costBody)).status(),401);await guest.close();
 await page.locator('.admin-navigation a[href="#resumen-comercial"]').click();await page.locator('#dashboard-period').selectOption('todo');
 await salePage.goto(runtime.base+'/mi-cuenta');await salePage.locator('#seller-area').waitFor();
 await salePage.locator('[name=cliente]').fill('Cliente aislado');await salePage.locator('#sale-form [name=telefono]').fill('11000001');await salePage.locator('[name=metodo_pago]').selectOption('efectivo');await salePage.locator('.sale-line [name=producto_id]').selectOption('990001');await salePage.locator('.sale-line [name=cantidad]').fill('2');await salePage.locator('.sale-line [name=precio_unitario]').fill('10000');await salePage.locator('.sale-line [name=personalizacion]').fill('Grabado fixture');
 let lost=false;await salePage.route('**/api/ventas',async route=>{if(route.request().method()==='POST'&&!lost){lost=true;await route.fetch();return route.abort('failed');}return route.continue();});
 await salePage.locator('#save-sale').click();await salePage.waitForFunction(()=>document.querySelector('#sale-result').textContent.includes('guardada'));
 let rows=await get(seller,'/api/ventas');assert.equal(rows.length,1);const sale=rows[0];assert.equal(sale.total,20000);
 let stock=(await get(admin,'/api/admin/inventario')).find(x=>x.id==='990001');assert.deepEqual([stock.disponible,stock.reservado,stock.fisico],[308,2,310]);
 await page.waitForFunction(()=>document.querySelector('#dashboard-period-note').textContent.includes('todo el historial'));
 // Separate browser sessions: only the normal timer can update the admin.
 await page.waitForFunction(()=>document.querySelector('#dashboard-recent').textContent.includes('Cliente aislado'),null,{timeout:25000});
 assert.equal(await page.locator('#dashboard-period').inputValue(),'todo');let dash=await get(admin,'/api/admin/dashboard?periodo=todo');assert.equal(dash.costos.facturacion_neta,8000);assert.equal(dash.totales.facturacion_entregada,0);
 // Future cost changes never alter the sale snapshot or its historical net.
 const change={costo_unitario:'7000',costo_esperado:'6000',idempotencia:crypto.randomUUID(),motivo:'Costo futuro local'};
 assert.equal((await put(admin,'/api/admin/inventario/990001/costo',change)).status(),200);assert.equal((await put(admin,'/api/admin/inventario/990001/costo',change)).status(),200);
 assert.equal((await get(admin,'/api/admin/dashboard?periodo=todo')).costos.facturacion_neta,8000);
 await salePage.getByRole('button',{name:'Grabado listo → Por entregar'}).click();await salePage.getByRole('button',{name:'Confirmar entrega',exact:true}).waitFor();await salePage.getByRole('button',{name:'Confirmar entrega',exact:true}).click();await salePage.waitForFunction(()=>document.querySelector('#sales-list').textContent.includes('Stock: piezas entregadas'));
 stock=(await get(admin,'/api/admin/inventario')).find(x=>x.id==='990001');assert.deepEqual([stock.disponible,stock.reservado,stock.fisico],[308,0,308]);
 dash=await get(admin,'/api/admin/dashboard?periodo=todo');assert.equal(dash.totales.facturacion_entregada,20000);assert.equal(dash.totales.ticket_promedio_entregado,20000);
 assert.equal((await post(seller,'/api/ventas',{idempotencia:crypto.randomUUID(),cliente:'Venta sin stock',telefono:'',notas:'',estado:'entregada',metodo_pago:'efectivo',items:[{producto_id:'990001',cantidad:309,precio_unitario:'10000',personalizacion:''}]})).status(),409);
 await salePage.locator('#sale-form [name=cliente]').fill('Sobreventa local');await salePage.locator('#sale-form [name=metodo_pago]').selectOption('efectivo');await salePage.locator('#sale-state').selectOption('por_entregar');await salePage.locator('.sale-line [name=producto_id]').selectOption('990001');await salePage.locator('.sale-line [name=cantidad]').fill('309');await salePage.locator('.sale-line [name=precio_unitario]').fill('10000');await salePage.locator('#save-sale').click();await salePage.waitForFunction(()=>document.querySelector('#sale-result').textContent.includes('No se guardó la venta: Stock insuficiente'));assert.equal((await get(seller,'/api/ventas')).length,1);report.push('PASS seller form preserves exact rejection reason and does not confirm or duplicate a rejected sale');
 runtime.db.query(`begin;insert into public.producto(id_producto,nombre,precio,tipo,moneda) overriding system value values(990002,'Producto sin costo',10000,'simple','ARS');insert into public.producto_simple(id_producto,stock)values(990002,10);insert into private.inventario_ficha(producto_id,sku)values(990002,'ADMIN-MISSING-COST');set local role service_role;
 select public.mb_ventas('44444444-4444-4444-8444-444444444444','registrar','{"idempotencia":"77777777-7777-4777-8777-777777777777","cliente":"Sin costo","telefono":"","notas":"","estado":"entregada","metodo_pago":"efectivo","items":[{"producto_id":"990002","cantidad":1,"precio_unitario":"10000","personalizacion":""}]}');
 do $check$ declare d jsonb;begin d:=public.mb_admin_dashboard('33333333-3333-4333-8333-333333333333','todo');if d#>'{costos,facturacion_neta}'<>'null'::jsonb or (d#>>'{costos,unidades_sin_costo}')::integer<>1 then raise exception 'Missing cost must not be silently zero';end if;end $check$;rollback;`);
 report.push('PASS missing historical cost prevents incomplete net; local fixture rolled back');
 report.push('PASS browser → secured API → PostgreSQL: receipt costs, corrections, permissions, lost-response replay, reserve, deliver once, oversell rollback, immutable cost, admin auto refresh across sessions');
 for(const width of [320,360,375,390,414,430,1440]){
  await page.setViewportSize({width,height:900});
  for(const link of await page.locator('.admin-navigation a').all()){
   await link.click();assert.equal(await page.locator('[data-admin-panel]:visible').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width+' '+await link.innerText());
  }
  await page.locator('.admin-navigation a').first().click();await page.locator('#refresh-dashboard').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/dashboard-'+width+'.png',fullPage:true});report.push('PASS five sections and no overflow at '+width+'px');
 }
 await salePage.screenshot({path:out+'/seller-390.png',fullPage:true});assert.equal(errors.length,0,errors.join('\n'));
 await admin.close();await seller.close();console.log(report.join('\n'));fs.writeFileSync(out+'/report.json',JSON.stringify({cases:report,errors},null,2));
}finally{await browser.close();await runtime.close();}
