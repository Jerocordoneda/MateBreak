// Explicit local-only rehearsal. Cloud application uses the emitted, guarded
// DML files after checking the published image manifest and protected baseline.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createGuestDatabase,seedGuestFixture,sqlLiteral as lit} from './guest-local-runtime.mjs';
const dir=resolve(process.argv[2]||''),read=name=>JSON.parse(readFileSync(resolve(dir,name+'.json'),'utf8'));
const changes=read('fresh-delta'),current=read('staging-catalog'),tables=read('protected-tables');
const protectedSql=readFileSync(resolve(dir,'protected-query.sql'),'utf8').replace(/;\s*$/,'');
const sha=v=>createHash('sha256').update(v).digest('hex');
const imageManifest=readFileSync(new URL('../src/assets/catalog-staging/manifest.json',import.meta.url));
const allowed={producto:['id_producto'],catalogo_producto:['producto_id'],catalogo_variante:['id'],catalogo_imagen:['producto_id','source_url']};
for(const c of changes){assert.ok(allowed[c.table]);assert.deepEqual(Object.keys(c.key),allowed[c.table]);assert.ok(c.fields.every(f=>/^[a-z_]+$/.test(f)));assert.ok(!c.fields.some(f=>['stock','creado_en','actualizado_en','importado_en'].includes(f)));}
export function sql(rows,protectedDigests){
 const locks=tables.map(t=>'"'+t.table_schema+'"."'+t.table_name+'"').join(',');
 let text=`-- Staging rxccjczyywhewqqdfgxm only. Verified static image manifest SHA256 ${sha(imageManifest)}\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='90s';\nLOCK TABLE public.producto,public.catalogo_producto,public.catalogo_variante,public.catalogo_imagen IN SHARE ROW EXCLUSIVE MODE;\nLOCK TABLE ${locks} IN SHARE MODE;\n`;
 const guard=`IF (${protectedSql})::jsonb IS DISTINCT FROM ${lit(protectedDigests)}::jsonb THEN RAISE EXCEPTION 'Protected commercial baseline changed; stop';END IF;`;
 text+=`DO $catalog_guard$ BEGIN ${guard} END $catalog_guard$;\n`;
 for(const table of Object.keys(allowed)){
  const entries=rows.filter(c=>c.table===table);if(!entries.length)continue;
  const fields=[...new Set(entries.flatMap(c=>c.fields))];
  text+=`DO $catalog_delta$ DECLARE item jsonb; BEGIN FOR item IN SELECT value FROM jsonb_array_elements(${lit(entries)}::jsonb) LOOP\n`;
  text+=`IF (SELECT count(*) FROM public.${table} t WHERE to_jsonb(t) @> (item->'key')) <> 1 THEN RAISE EXCEPTION 'Catalog identity mismatch: ${table}';END IF;\n`;
  text+=`IF EXISTS(SELECT 1 FROM public.${table} t WHERE to_jsonb(t) @> (item->'key') AND to_jsonb(t) @> (item->'after')) THEN CONTINUE;END IF;\n`;
  text+=`IF NOT EXISTS(SELECT 1 FROM public.${table} t WHERE to_jsonb(t) @> (item->'key') AND to_jsonb(t) @> (item->'before')) THEN RAISE EXCEPTION 'Catalog concurrent change: ${table}';END IF;\n`;
  // jsonb @> cannot match JSON null with SQL NULL inconsistently: to_jsonb
  // retains every column, including nulls, and populate_record preserves types.
  text+=`UPDATE public.${table} t SET (${fields.join(',')})=(SELECT ${fields.join(',')} FROM jsonb_populate_record(NULL::public.${table},to_jsonb(t)||(item->'after'))) WHERE to_jsonb(t) @> (item->'key');\nEND LOOP;END $catalog_delta$;\n`;
 }
 return text+`DO $catalog_guard$ BEGIN ${guard} END $catalog_guard$;\nCOMMIT;\n`;
}
const db=createGuestDatabase(),q=db.query;
try{
 seedGuestFixture(q);
 // Emulate current Staging catalogue and inventory in the disposable database.
 const emulate=[];
 // Reproduce all current metadata, including unchanged fixture fields. A replay
 // may differ in fields outside this delta; those differences must not make the
 // rehearsal silently test a different starting catalogue.
 for(const [group,table] of [['products','producto'],['catalog','catalogo_producto'],['variants','catalogo_variante'],['images','catalogo_imagen']])for(const row of current[group]){
  const keys=allowed[table],fields=Object.keys(row).filter(f=>!keys.includes(f)&&!['creado_en','actualizado_en','importado_en'].includes(f)),key=Object.fromEntries(keys.map(k=>[k,row[k]]));
  emulate.push(`update public.${table} t set (${fields.join(',')})=(select ${fields.join(',')} from jsonb_populate_record(null::public.${table},to_jsonb(t)||${lit(row)}::jsonb)) where to_jsonb(t) @> ${lit(key)}::jsonb;`);
 }
 for(const s of current.inventory)emulate.push(`update public.producto_simple set stock=${lit(s.product.stock)} where id_producto=${s.product.id_producto};`);
 q(emulate.join('\n'));
 const protectedBefore=JSON.parse(q(protectedSql));
 const metadataSql="select jsonb_build_object('p',(select jsonb_agg(to_jsonb(t) order by id_producto)from public.producto t),'c',(select jsonb_agg(to_jsonb(t) order by producto_id)from public.catalogo_producto t),'v',(select jsonb_agg(to_jsonb(t) order by id)from public.catalogo_variante t),'i',(select jsonb_agg(to_jsonb(t) order by producto_id,source_url)from public.catalogo_imagen t));";
 const before=q(metadataSql),stages=[];
 for(const phase of ['A','B']){
  const rows=changes.filter(c=>c.phase===phase);q(sql(rows,protectedBefore));const once=q(metadataSql);q(sql(rows,protectedBefore));assert.equal(q(metadataSql),once);assert.deepEqual(JSON.parse(q(protectedSql)),protectedBefore);
  const ids=new Set(current.variants.map(v=>v.id));
  // The guest SQL fixture adds its own independent product. Report only the
  // 217 historical variant identities that this recovery actually targets.
  const availability=JSON.parse(q('select jsonb_agg(to_jsonb(t) order by variante_id) from public.mb_catalogo_disponibilidad() t;')).filter(v=>ids.has(v.variante_id));
  stages.push({phase,changedRows:rows.length,idempotent:true,comprable:availability.filter(v=>v.comprable).length,conStock:availability.filter(v=>v.comprable&&v.con_stock).length});
 }
 assert.equal(stages[1].comprable,217);assert.equal(stages[1].conStock,7);
 const rollback=changes.map(c=>({...c,before:c.after,after:c.before}));q(sql(rollback,protectedBefore));assert.equal(q(metadataSql),before);assert.deepEqual(JSON.parse(q(protectedSql)),protectedBefore);
 // Unexpected metadata must abort rather than overwrite human changes.
 q("update public.producto set nombre='CONCURRENT CHANGE' where id_producto=13;");assert.throws(()=>q(sql(changes,protectedBefore)),/Catalog concurrent change/);
 const baseline=read('protected-before');
 for(const phase of ['A','B'])writeFileSync(resolve(dir,'recover-'+phase+'.sql'),sql(changes.filter(c=>c.phase===phase),baseline));
 writeFileSync(resolve(dir,'rollback.sql'),sql(rollback,baseline));
 const report={migrations:40,stages,protectedTables:tables.length,protectedUnchanged:true,rollbackExact:true,concurrentChangeBlocked:true,imageManifestSha256:sha(imageManifest),backupSha256:sha(readFileSync(resolve(dir,'staging-catalog.json')))};
 writeFileSync(resolve(dir,'dry-run.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{db.close();}
