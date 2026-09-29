// Real concurrent calls to the repository's checkout SQL in an empty local DB.
// Requires PostgreSQL/psql and a fresh, disposable cluster bound to loopback.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const host = process.env.MB_CONCURRENCY_HOST || '127.0.0.1';
const port = process.env.MB_CONCURRENCY_PORT || '55432';
const database = process.env.MB_CONCURRENCY_DB || 'postgres';
const psql = process.env.PSQL_BIN || 'psql';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) || port === '5432') {
  throw Error('Concurrency tests require a separate loopback PostgreSQL cluster on a non-default port');
}
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', host, '-p', port, '-U', 'postgres', '-d', database];
function query(sql) {
  return new Promise((done) => {
    const child = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('error', error => done({ ok: false, stdout, stderr: String(error) }));
    child.on('close', code => done({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.end(sql + '\n');
  });
}
async function must(sql) {
  const result = await query(sql);
  if (!result.ok) throw Error(result.stderr || result.stdout || 'psql failed');
  return result.stdout;
}
function productionFunction(file, name) {
  const source = readFileSync(resolve(root, 'supabase/migrations', file), 'utf8');
  const start = source.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`, 'i'));
  if (start < 0) throw Error(`Missing production function ${name}`);
  const end = source.indexOf('$$;', start);
  if (end < 0) throw Error(`Unterminated production function ${name}`);
  return source.slice(start, end + 3);
}
const original = '20260928210316_ars_variant_checkout.sql';
const latest = '20260929000841_on_demand_and_preparation.sql';
const functions = [
  [original, 'mb_precio_variante'], [original, 'mb_cantidad_promo'],
  [original, 'mb_cotizar_catalogo'], [latest, 'mb_catalogo_disponibilidad'],
  [latest, 'mb_checkout_catalogo'],
];
const token = n => n.toString(16).padStart(64, '0');
const uuid = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function seed(kind, repeat) {
  const box = kind === 'boxes' || kind === 'idempotency';
  const stockA = kind === 'boxes' || kind === 'idempotency' ? 10 : 1;
  const second = kind === 'combo' || box;
  const productType = kind === 'combo' ? 'combo' : 'simple';
  const idBase = repeat * 1000;
  const key1 = uuid(idBase + 10), key2 = kind === 'idempotency' ? key1 : uuid(idBase + 11);
  const user1 = uuid(idBase + 20), user2 = kind === 'idempotency' ? user1 : uuid(idBase + 21);
  const cart1 = uuid(idBase + 30), cart2 = kind === 'idempotency' ? cart1 : uuid(idBase + 31);
  const token1 = token(idBase + 40), token2 = kind === 'idempotency' ? token1 : token(idBase + 41);
  const parts = [
    `truncate public.pago,public.envio,public.movimiento_stock,public.pedido_stock,public.pedido_abastecimiento,public.pedido_item,public.pedido,public.carrito_variante,public.carrito_item,public.carrito,public.catalogo_variante_componente,public.catalogo_variante_mapeo,public.catalogo_variante,public.catalogo_producto,public.producto_simple,private.inventario_ficha,public.producto,auth.users cascade;`,
    `insert into auth.users(id) values ('${user1}')${user2 === user1 ? '' : `,('${user2}')`};`,
    `insert into public.producto(id_producto,nombre,precio,tipo) values (100,'Fixture ${kind}',100,'${productType}'),(101,'${box ? 'Mate base' : 'Physical A'}',1,'simple')${second ? `,(102,'${box ? 'Caja de mate' : 'Physical B'}',1,'simple')` : ''};`,
    `insert into public.producto_simple(id_producto,stock) values (101,${stockA})${second ? ',(102,1)' : ''};`,
    `insert into private.inventario_ficha(producto_id,sku,abastecimiento) values (101,'FIX-A','stock')${second ? `, (102,'${box ? 'MB-CAJA-MATE' : 'FIX-B'}','stock')` : ''};`,
    `insert into public.catalogo_producto(producto_id) values (100);`,
    `insert into public.catalogo_variante(id,producto_id,precio) values (200,100,100);`,
    `insert into public.catalogo_variante_mapeo(variante_id,aprobado) values (200,true);`,
    `insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad) values (200,101,1)${second ? ',(200,102,1)' : ''};`,
    `insert into public.carrito(id,token_hash,usuario_id,expira_en) values ('${cart1}','${token1}','${user1}',now()+interval '1 day')${cart2 === cart1 ? '' : `,('${cart2}','${token2}','${user2}',now()+interval '1 day')`};`,
    `insert into public.carrito_variante(carrito_id,variante_id,cantidad) values ('${cart1}',200,1)${cart2 === cart1 ? '' : `,('${cart2}',200,1)`};`,
  ];
  await must(parts.join('\n'));
  const request = (tok, user, key) => `select public.mb_checkout_catalogo('${tok}','${user}'::uuid,'{"idempotencia":"${key}","envio":"retiro","pago":"transferencia"}'::jsonb)::text;`;
  return [request(token1,user1,key1), request(token2,user2,key2)];
}

async function run(kind, repeat) {
  const [one, two] = await seed(kind, repeat);
  let firstDone = false, secondDone = false, advisoryWait = false;
  const first = query(one).then(r => { firstDone = true; return r; });
  const second = query(two).then(r => { secondDone = true; return r; });
  while (!firstDone || !secondDone) {
    const wait = await query("select count(*) from pg_stat_activity where wait_event_type='Lock' and wait_event='advisory' and query like '%mb_checkout_catalogo%';");
    if (wait.ok && Number(wait.stdout) > 0) advisoryWait = true;
    await sleep(20);
  }
  const [a,b] = await Promise.all([first,second]);
  const check = await must(`select jsonb_build_object(
    'orders',(select count(*) from public.pedido),
    'reservations',(select coalesce(sum(cantidad),0) from public.pedido_stock),
    'stock_a',(select stock from public.producto_simple where id_producto=101),
    'stock_b',(select stock from public.producto_simple where id_producto=102),
    'reserved_a',(select coalesce(sum(cantidad),0) from public.pedido_stock where producto_simple_id=101),
    'reserved_b',(select coalesce(sum(cantidad),0) from public.pedido_stock where producto_simple_id=102),
    'negative',(select count(*) from public.producto_simple where stock<0),
    'partial',(select count(*) from public.pedido p where not exists (select 1 from public.pedido_stock s where s.pedido_id=p.id))
  )::text;`);
  const state = JSON.parse(check);
  const okCount = Number(a.ok) + Number(b.ok);
  const expectedIdempotency = kind === 'idempotency';
  const expectedStockA = kind === 'boxes' || expectedIdempotency ? 9 : 0;
  const valid = advisoryWait && state.orders === 1 && state.reserved_a === 1 &&
    state.stock_a === expectedStockA && state.negative === 0 && state.partial === 0 &&
    (kind === 'combo' || kind === 'boxes' || expectedIdempotency ? state.reserved_b === 1 && state.stock_b === 0 : state.reserved_b === 0) &&
    (expectedIdempotency ? okCount === 2 && JSON.parse(a.stdout).id === JSON.parse(b.stdout).id
      : okCount === 1 && [a,b].some(x => !x.ok && /Stock insuficiente/.test(x.stderr)));
  if (!valid) throw Error(`${kind} #${repeat}: ${JSON.stringify({a,b,state,advisoryWait})}`);
  console.log(`${kind} #${repeat}: OK (advisory wait observed)`);
}

const existing = await must("select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema');");
if (Number(existing) !== 0) throw Error('Test DB must be empty; use a fresh disposable local cluster');
await must(readFileSync(resolve(root, 'tests/concurrency/isolated-schema.sql'), 'utf8'));
for (const [file,name] of functions) await must(productionFunction(file,name));
for (let repeat=1; repeat<=5; repeat++) {
  for (const kind of ['simple','combo','boxes','idempotency']) await run(kind,repeat);
}
console.log('All 20 real-concurrency scenarios passed.');
