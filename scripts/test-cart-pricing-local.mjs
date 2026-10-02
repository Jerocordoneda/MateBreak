// Disposable PostgreSQL only, all fixture/schema changes in a rolled-back tx.
import {readFileSync} from 'node:fs';
import {assertLocalTests,checkContainer,disposableContainer,mustSql} from './local-test-runtime.mjs';
assertLocalTests();checkContainer(disposableContainer);
const options={container:disposableContainer,database:'matebreak_test_cart_pricing',user:'supabase_admin'};
if(Number(await mustSql("select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema');",options))!==0)
  throw Error('Disposable pricing database must be empty.');
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fn=(path,name)=>{
 const source=file(path),start=source.search(new RegExp(`create (?:or replace )?function public\\.${name}\\(`,'i'));
 const end=source.indexOf('$$;',start);if(start<0||end<0)throw Error('Missing repository SQL function');return source.slice(start,end+3);
};
const pricing='supabase/migrations/20260928210316_ars_variant_checkout.sql',lifecycle='supabase/migrations/20260929204150_fix_minorista_checkout_lifecycle.sql';
const functions=[fn(pricing,'mb_precio_variante'),fn(pricing,'mb_cantidad_promo'),fn(pricing,'mb_cotizar_catalogo'),
 fn('supabase/migrations/20260929000841_on_demand_and_preparation.sql','mb_catalogo_disponibilidad'),
 fn('supabase/migrations/20260907203438_commerce.sql','mb_comercio').replace('function public.mb_comercio(', 'function public.mb_comercio_base('),
 fn(lifecycle,'mb_checkout_catalogo'),fn(lifecycle,'mb_checkout_minorista'),fn(lifecycle,'mb_confirmar_pago')];
await mustSql('begin;\n'+file('tests/concurrency/isolated-schema.sql')+'\n'+file('tests/concurrency/minorista-schema.sql')+'\n'+functions.join('\n')+'\n'+file('tests/concurrency/cart-pricing.sql')+'\nrollback;',options);
if(Number(await mustSql("select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema');",options))!==0)throw Error('Rollback did not clear disposable fixtures.');
console.log('PASS real SQL cart pricing, eligibility, legacy combo, variant combo, repricing and stock guard; transaction rolled back.');
