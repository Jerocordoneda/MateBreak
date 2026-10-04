// Offline planner + disposable PostgreSQL rehearsal. No Cloud client or writer.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createGuestDatabase,sqlLiteral as lit} from './guest-local-runtime.mjs';
export const catalogSnapshotSql=`select jsonb_build_object(
 'products',(select jsonb_agg(to_jsonb(p) order by id_producto) from public.producto p),
 'catalog',(select jsonb_agg(to_jsonb(c) order by producto_id) from public.catalogo_producto c),
 'variants',(select jsonb_agg(to_jsonb(v) order by id) from public.catalogo_variante v),
 'images',(select jsonb_agg(to_jsonb(i) order by producto_id,source_url) from public.catalogo_imagen i),
 'inventory',(select jsonb_agg(jsonb_build_object('id',s.id_producto,'sku',f.sku,'stock',s.stock,'category',s.categoria) order by s.id_producto) from public.producto_simple s left join private.inventario_ficha f on f.producto_id=s.id_producto),
 'mappings',(select jsonb_agg(to_jsonb(m) order by variante_id) from public.catalogo_variante_mapeo m),
 'components',(select jsonb_agg(to_jsonb(c) order by variante_id,producto_simple_id) from public.catalogo_variante_componente c));`;
const specs=[
 ['products','producto',['id_producto'],['external_id','slug','nombre','descripcion','precio','tipo','activo','moneda','source_url']],
 ['catalog','catalogo_producto',['producto_id'],['disponible','precio_original','precio_transferencia','descuento','cuotas','envio_gratis','destacado','publicado','descripcion_origen','personalizacion','atributos','source_hash']],
 ['variants','catalogo_variante',['id'],['producto_id','external_id','sku','opciones','precio','precio_original','precio_transferencia','cuotas','disponible','imagen_origen','vigente']],
 ['images','catalogo_imagen',['producto_id','source_url'],['asset_hash','posicion','rol','alt','vigente']]
];
const project=(row,keys)=>Object.fromEntries(keys.map(k=>[k,row[k]??null]));
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const key=(r,keys)=>stable(project(r,keys));
const same=(a,b)=>stable(a)===stable(b);
const hash=v=>createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');
export function buildRecoveryPlan(current,target){
 assert.equal(current.catalog.length,106);assert.equal(target.catalog.length,106);
 assert.equal(current.variants.length,217);assert.equal(target.variants.length,217);
 assert.deepEqual(current.inventory.map(v=>[v.id,v.sku,v.category]),target.inventory.map(v=>[v.id,v.sku,v.category]),'Inventory SKU identity changed');
 assert.ok(same(current.mappings.map(v=>project(v,['variante_id','aprobado','nota'])),target.mappings.map(v=>project(v,['variante_id','aprobado','nota']))),'Mappings differ; stop'); assert.ok(same(current.components,target.components),'Components differ; stop');
 assert.deepEqual(current.variants.map(v=>[v.id,v.producto_id,v.external_id,v.sku]),target.variants.map(v=>[v.id,v.producto_id,v.external_id,v.sku]),'Variant/SKU identity changed');
 const ids=new Set(target.catalog.map(c=>c.producto_id)),changes=[];
 for(const [group,table,keys,fields]of specs){
  const before=new Map(current[group].map(r=>[key(r,keys),r]));
  for(const row of target[group]){
   if(group==='products'&&!ids.has(row.id_producto))continue;
   const old=before.get(key(row,keys));assert.ok(old,'Missing identity: '+table+' '+key(row,keys));
   const a=project(old,fields),b=project(row,fields);
   if(!same(a,b))changes.push({table,key:project(row,keys),before:a,after:b,fields:fields.filter(k=>!same(a[k],b[k]))});
  }
 }
 const targetMetadata=specs.map(([group,table,keys,fields])=>[table,target[group].filter(r=>group!=='products'||ids.has(r.id_producto)).map(r=>project(r,[...keys,...fields]))]);
 return {projectRef:'rxccjczyywhewqqdfgxm',source:'frozen 20260928 + complete migration replay',beforeSha256:hash(current),targetSha256:hash(targetMetadata),inventoryPreserved:current.inventory,mappingsPreserved:current.mappings,componentsPreserved:current.components,changes};
}
export function recoverySql(plan){
 const lines=[`-- REVIEW REQUIRED. Staging only; no stock, order, Auth, mapping or component writes.
-- Approval binds the exact before/after delta. Transactions are idempotent.
begin;
do $$begin if current_setting('app.matebreak.catalog_recovery_approved',true) is distinct from '${hash(plan)}' then raise exception 'Exact catalog delta approval missing';end if;end$$;
lock table public.producto,public.catalogo_producto,public.catalogo_variante,public.catalogo_imagen in share row exclusive mode;
lock table public.producto_simple,public.catalogo_variante_mapeo,public.catalogo_variante_componente in share mode;
-- Stop until all approved image binaries exist at their approved paths.
do $$begin if exists(select 1 from public.catalogo_asset a where not exists(select 1 from storage.objects o where o.bucket_id='product-images' and o.name=a.storage_path)) then raise exception 'Approved Storage image assets missing';end if;end$$;`];
 lines.push(`do $$begin if (select jsonb_agg(jsonb_build_object('id',s.id_producto,'sku',f.sku,'stock',s.stock,'category',s.categoria) order by s.id_producto)from public.producto_simple s left join private.inventario_ficha f on f.producto_id=s.id_producto) is distinct from ${lit(plan.inventoryPreserved)}::jsonb then raise exception 'Inventory changed since catalog approval';end if;end$$;`);
 lines.push(`do $$begin if (select jsonb_agg(to_jsonb(c)order by variante_id,producto_simple_id)from public.catalogo_variante_componente c) is distinct from ${lit(plan.componentsPreserved)}::jsonb then raise exception 'Components changed since catalog approval';end if;end$$;`);
 const mappingFields=['variante_id','aprobado','nota'];
 lines.push(`do $$begin if (select jsonb_agg(jsonb_build_object('variante_id',m.variante_id,'aprobado',m.aprobado,'nota',m.nota)order by variante_id)from public.catalogo_variante_mapeo m) is distinct from ${lit(plan.mappingsPreserved.map(v=>project(v,mappingFields)))}::jsonb then raise exception 'Mappings changed since catalog approval';end if;end$$;`);
 for(const row of plan.changes){
  if([row.key,row.before,row.after].some(v=>JSON.stringify(v).includes('$$')))throw Error('Unsafe SQL delimiter in catalog input');
  const where=Object.entries(row.key).map(([k,v])=>`t.${k} is not distinct from ${lit(v)}`).join(' and ');
  const projection='jsonb_build_object('+Object.keys(row.before).map(k=>`${lit(k)},t.${k}`).join(',')+')';
  const fields=Object.keys(row.after),record=`jsonb_populate_record(null::public.${row.table},${lit(row.after)}::jsonb)`;
  lines.push(`do $$begin if exists(select 1 from public.${row.table} t where ${where} and ${projection}=${lit(row.after)}::jsonb) then return;end if;
if not exists(select 1 from public.${row.table} t where ${where} and ${projection}=${lit(row.before)}::jsonb) then raise exception using message=${lit('Unexpected catalog row: '+row.table+' '+Object.values(row.key).join(' '))};end if;
update public.${row.table} t set (${fields.join(',')})=(select ${fields.join(',')} from ${record}) where ${where};end$$;`);
 }
 lines.push('commit;');return lines.join('\n');
}
function decode(path){const r=JSON.parse(readFileSync(path,'utf8'));if(r.catalog)return r;const raw=JSON.parse(r.content[0].text).result;return JSON.parse(raw.match(/<untrusted-data-[^>]+>\n([\s\S]*?)\n<\/untrusted-data-/)[1])[0].catalog_snapshot;}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/catalog-recovery-plan.mjs <read-only-snapshot.json> <output-directory>');
 const current=decode(input),db=createGuestDatabase(),q=db.query;
 try{
  const target=JSON.parse(q(catalogSnapshotSql)),plan=buildRecoveryPlan(current,target);
  const assets=JSON.parse(q('select jsonb_agg(to_jsonb(a) order by sha256) from public.catalogo_asset a;'));
  const sql=recoverySql(plan);mkdirSync(output,{recursive:true});
  writeFileSync(resolve(output,'catalog-delta.json'),JSON.stringify({...plan,approvalSha256:hash(plan)},null,2));
  writeFileSync(resolve(output,'catalog-recovery.sql'),sql);writeFileSync(resolve(output,'catalog-image-manifest.json'),JSON.stringify(assets,null,2));
  // Emulate current Staging metadata in this newly owned, isolated database.
  const emulate=[];for(const row of plan.changes){const fields=Object.keys(row.before),where=Object.entries(row.key).map(([k,v])=>`${k} is not distinct from ${lit(v)}`).join(' and ');emulate.push(`update public.${row.table} set (${fields.join(',')})=(select ${fields.join(',')} from jsonb_populate_record(null::public.${row.table},${lit(row.before)}::jsonb)) where ${where};`);}
  for(const v of current.inventory)emulate.push(`update public.producto_simple set stock=${lit(v.stock)} where id_producto=${v.id};`);q(emulate.join('\n'));
  const protectedSql=`select jsonb_build_object('inventory',(select jsonb_agg(to_jsonb(s) order by id_producto)from public.producto_simple s),'mappings',(select jsonb_agg(to_jsonb(m)order by variante_id)from public.catalogo_variante_mapeo m),'components',(select jsonb_agg(to_jsonb(c)order by variante_id,producto_simple_id)from public.catalogo_variante_componente c),'orders',(select count(*)from public.pedido),'payments',(select count(*)from public.pago));`;
  const before=q(protectedSql);
  // Storage metadata fixture is local only; no asset download/upload occurs.
  q(`create schema storage;create table storage.objects(bucket_id text,name text);insert into storage.objects select 'product-images',storage_path from public.catalogo_asset;set app.matebreak.catalog_recovery_approved=${lit(hash(plan))};`);
  q(`set app.matebreak.catalog_recovery_approved=${lit(hash(plan))};`+sql);const once=q(catalogSnapshotSql);assert.equal(q(protectedSql),before);q(`set app.matebreak.catalog_recovery_approved=${lit(hash(plan))};`+sql);assert.equal(q(catalogSnapshotSql),once);assert.equal(q(protectedSql),before);
  const restored=JSON.parse(once);assert.equal(restored.catalog.filter(v=>v.publicado).length,target.catalog.filter(v=>v.publicado).length);
  const availability=JSON.parse(q('select jsonb_agg(to_jsonb(d)) from public.mb_catalogo_disponibilidad() d;'));
  writeFileSync(resolve(output,'catalog-rehearsal.json'),JSON.stringify({migrations:38,counts:Object.fromEntries(specs.map(([group])=>[group,plan.changes.filter(r=>r.table===specs.find(x=>x[0]===group)[1]).length])),published:restored.catalog.filter(v=>v.publicado).length,variants:restored.variants.filter(v=>v.vigente).length,approvedImageMetadata:assets.length,storageBinariesVerified:false,protectedBeforeSha256:hash(before),protectedAfterSha256:hash(q(protectedSql)),secondApplicationNoChanges:true,availability},null,2));
  console.log('PASS catalog delta generated, rehearsed twice; inventory, mappings, components, orders and payments unchanged');
 }finally{db.close();}
}
