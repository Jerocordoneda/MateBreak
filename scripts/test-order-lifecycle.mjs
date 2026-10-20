// Exercise production SQL functions in a fresh disposable loopback PostgreSQL DB.
// Never points at Supabase or a shared database.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { disposableContainer, sqlQuery, assertLocalTests } from './local-test-runtime.mjs';
assertLocalTests();

const root = resolve(import.meta.dirname, '..');
const host = process.env.MB_LIFECYCLE_HOST || '127.0.0.1';
const port = process.env.MB_LIFECYCLE_PORT || '55433';
const database = process.env.MB_LIFECYCLE_DB;
const psql = process.env.PSQL_BIN || 'psql';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) || port === '5432' ||
  !/^matebreak_minorista_[a-z0-9_]+$/.test(database || '')) {
  throw Error('Use a fresh matebreak_minorista_* database in a separate loopback cluster');
}
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', host, '-p', port, '-U', 'postgres', '-d', database];
function query(sql) {
  if (process.env.MB_TEST_CONTAINER) return sqlQuery(sql, { container: disposableContainer,
    database: 'matebreak_test_lifecycle', user: 'supabase_admin' });
  return new Promise(resolveResult => {
    const child = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data);
    child.stderr.on('data', data => stderr += data);
    child.on('error', error => resolveResult({ ok: false, stdout, stderr: String(error) }));
    child.on('close', code => resolveResult({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.end(sql + '\n');
  });
}
async function must(sql, stage) {
  const result = await query(sql);
  if (!result.ok) throw Error(`${stage}: ${result.stderr || result.stdout || 'psql failed'}`);
  return result.stdout;
}
const file = path => readFileSync(resolve(root, path), 'utf8');
function productionFunction(path, name) {
  const source = file(path);
  const start = source.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`, 'i'));
  if (start < 0) throw Error(`Missing production function ${name}`);
  const end = source.indexOf('$$;', start);
  if (end < 0) throw Error(`Unterminated production function ${name}`);
  return source.slice(start, end + 3);
}

const existing = await must("select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema');", 'database check');
if (Number(existing) !== 0) throw Error('The test database must be empty');
await must(file('tests/concurrency/isolated-schema.sql'), 'base fixture');
await must(file('tests/concurrency/minorista-schema.sql'), 'minorista fixture');
const functions = [
  ['supabase/migrations/20260928210316_ars_variant_checkout.sql', 'mb_precio_variante'],
  ['supabase/migrations/20260928210316_ars_variant_checkout.sql', 'mb_cantidad_promo'],
  ['supabase/migrations/20260928210316_ars_variant_checkout.sql', 'mb_cotizar_catalogo'],
  ['supabase/migrations/20260929000841_on_demand_and_preparation.sql', 'mb_catalogo_disponibilidad'],
  ['supabase/migrations/20260907203438_commerce.sql', 'mb_comercio'],
  ['supabase/migrations/20260928210316_ars_variant_checkout.sql', 'mb_comercio'],
  ['supabase/migrations/20260907203438_commerce.sql', 'mb_confirmar_pago'],
  ['supabase/migrations/20260929204150_fix_minorista_checkout_lifecycle.sql', 'mb_checkout_catalogo'],
  ['supabase/migrations/20260929204150_fix_minorista_checkout_lifecycle.sql', 'mb_validar_transicion_pedido'],
  ['supabase/migrations/20260929204150_fix_minorista_checkout_lifecycle.sql', 'mb_confirmar_pago'],
  ['supabase/migrations/20260929204150_fix_minorista_checkout_lifecycle.sql', 'mb_confirmar_transferencia'],
  ['supabase/migrations/20260929204150_fix_minorista_checkout_lifecycle.sql', 'mb_checkout_minorista'],
  ['supabase/migrations/20260929144308_checkout_minorista_preparacion.sql', 'mb_expirar_reservas'],
];
for (const [path, name] of functions) {
  let sql = productionFunction(path, name);
  if (path.endsWith('20260907203438_commerce.sql') && name === 'mb_comercio') {
    sql = sql.replace('function public.mb_comercio(', 'function public.mb_comercio_base(');
  }
  await must(sql, `function ${name}`);
}
await must(`create trigger pedido_validar_transicion before update of estado on public.pedido
for each row execute function public.mb_validar_transicion_pedido();`, 'state transition trigger');
await must(file('tests/concurrency/minorista-lifecycle.sql'), 'lifecycle assertions');
console.log('Minorista lifecycle SQL: 9/9 OK');

// Two separate psql processes compete for two units with quantity two each.
const recipient = { nombre:'Ana',apellido:'Prueba',email:'ana@example.test',telefono:'2494123456',
  codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Pinto',numero:'623' };
const buyers = ['00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022'];
const carts = ['00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032'];
const quotes = ['00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000042'];
const keys = ['00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000052'];
const tokens = ['1'.repeat(64), '2'.repeat(64)];
await must(`
insert into auth.users(id) values ('${buyers[0]}'),('${buyers[1]}');
insert into public.producto(id_producto,nombre,precio,tipo) values
 (100,'Mate de prueba',100,'simple'),(101,'Mate físico',1,'simple'),(102,'Caja física',1,'simple');
insert into public.producto_simple(id_producto,stock) values (101,2),(102,2);
insert into private.inventario_ficha(producto_id,sku,abastecimiento) values
 (101,'FIX-MATE','stock'),(102,'MB-CAJA-MATE','stock');
insert into public.catalogo_producto(producto_id) values (100);
insert into public.catalogo_variante(id,producto_id,precio) values (200,100,100);
insert into public.catalogo_variante_mapeo(variante_id,aprobado) values (200,true);
insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad)
 values (200,101,1),(200,102,1);
update public.metodo_pago set activo=true where codigo='mercadopago';
update public.metodo_envio set activo=true where codigo='correo_domicilio';
${buyers.map((buyer, i) => `insert into public.carrito(id,token_hash,usuario_id,expira_en)
 values ('${carts[i]}','${tokens[i]}','${buyer}',now()+interval '1 day');
 insert into public.carrito_variante(carrito_id,variante_id,cantidad) values ('${carts[i]}',200,2);
 insert into public.checkout_cotizacion_envio(id,carrito_id,usuario_id,destinatario,modalidad,costo_transportista,valido_hasta)
 values ('${quotes[i]}','${carts[i]}','${buyer}','${JSON.stringify(recipient)}'::jsonb,'correo_domicilio',7755,now()+interval '15 minutes');`).join('\n')}
`, 'concurrent fixture');
const request = i => `select public.mb_checkout_minorista('${tokens[i]}','${buyers[i]}'::uuid,
 '${JSON.stringify({ idempotencia: keys[i], pago:'mercadopago', envio:'correo_domicilio', cotizacion_id:quotes[i], destinatario:recipient })}'::jsonb)::text;`;
let firstDone = false, secondDone = false, advisoryWait = false;
const first = query(request(0)).then(result => { firstDone = true; return result; });
const second = query(request(1)).then(result => { secondDone = true; return result; });
while (!firstDone || !secondDone) {
  const wait = await query("select count(*) from pg_stat_activity where wait_event_type='Lock' and wait_event='advisory' and query like '%mb_checkout_minorista%';");
  if (wait.ok && Number(wait.stdout) > 0) advisoryWait = true;
  await new Promise(resolveWait => setTimeout(resolveWait, 20));
}
const [one, two] = await Promise.all([first, second]);
const state = JSON.parse(await must(`select jsonb_build_object(
 'orders',(select count(*) from public.pedido),
 'stock_mate',(select stock from public.producto_simple where id_producto=101),
 'stock_box',(select stock from public.producto_simple where id_producto=102),
 'reserved',(select coalesce(sum(cantidad),0) from public.pedido_stock),
 'negative',(select count(*) from public.producto_simple where stock<0),
 'partial',(select count(*) from public.pedido p where not exists (select 1 from public.pedido_stock s where s.pedido_id=p.id))
)::text;`, 'concurrent result'));
if (!advisoryWait || Number(one.ok) + Number(two.ok) !== 1 ||
  ![one, two].some(result => !result.ok && /Stock insuficiente/i.test(result.stderr)) ||
  state.orders !== 1 || state.stock_mate !== 0 || state.stock_box !== 0 ||
  state.reserved !== 4 || state.negative !== 0 || state.partial !== 0) {
  throw Error(`Concurrent minorista checkout failed: ${JSON.stringify({ one, two, state, advisoryWait })}`);
}
console.log('Minorista concurrent last-two-units checkout: 1/1 OK (advisory wait observed)');

// The same cart and idempotency key must converge to the same order.
const retryCart = '00000000-0000-4000-8000-000000000033';
const retryQuote = '00000000-0000-4000-8000-000000000043';
const retryKey = '00000000-0000-4000-8000-000000000053';
const retryToken = '3'.repeat(64);
await must(`
update public.producto_simple set stock=1 where id_producto in (101,102);
insert into public.carrito(id,token_hash,usuario_id,expira_en)
 values ('${retryCart}','${retryToken}','${buyers[0]}',now()+interval '1 day');
insert into public.carrito_variante(carrito_id,variante_id,cantidad) values ('${retryCart}',200,1);
insert into public.checkout_cotizacion_envio(id,carrito_id,usuario_id,destinatario,modalidad,costo_transportista,valido_hasta)
 values ('${retryQuote}','${retryCart}','${buyers[0]}','${JSON.stringify(recipient)}'::jsonb,'correo_domicilio',7755,now()+interval '15 minutes');
`, 'same-key fixture');
const retrySql = `select public.mb_checkout_minorista('${retryToken}','${buyers[0]}'::uuid,
 '${JSON.stringify({ idempotencia: retryKey, pago:'mercadopago', envio:'correo_domicilio', cotizacion_id:retryQuote, destinatario:recipient })}'::jsonb)::text;`;
firstDone = false; secondDone = false; advisoryWait = false;
const retryOne = query(retrySql).then(result => { firstDone = true; return result; });
const retryTwo = query(retrySql).then(result => { secondDone = true; return result; });
while (!firstDone || !secondDone) {
  const wait = await query("select count(*) from pg_stat_activity where wait_event_type='Lock' and wait_event='advisory' and query like '%mb_checkout_minorista%';");
  if (wait.ok && Number(wait.stdout) > 0) advisoryWait = true;
  await new Promise(resolveWait => setTimeout(resolveWait, 20));
}
const [retryA, retryB] = await Promise.all([retryOne, retryTwo]);
if (!retryA.ok || !retryB.ok || !advisoryWait ||
  JSON.parse(retryA.stdout).id !== JSON.parse(retryB.stdout).id) {
  throw Error(`Concurrent same-key retry failed: ${JSON.stringify({ retryA, retryB, advisoryWait })}`);
}
const retryState = JSON.parse(await must(`select jsonb_build_object(
 'orders',(select count(*) from public.pedido where carrito_id='${retryCart}'),
 'reservations',(select count(*) from public.pedido_stock where pedido_id=
  (select id from public.pedido where carrito_id='${retryCart}')),
 'stock_mate',(select stock from public.producto_simple where id_producto=101),
 'stock_box',(select stock from public.producto_simple where id_producto=102)
)::text;`, 'same-key result'));
if (retryState.orders !== 1 || retryState.reservations !== 2 ||
  retryState.stock_mate !== 0 || retryState.stock_box !== 0) {
  throw Error(`Concurrent same-key reservation duplicated: ${JSON.stringify(retryState)}`);
}
console.log('Minorista concurrent same-key retry: 1/1 OK (one order, one reservation per SKU)');
