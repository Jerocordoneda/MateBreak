// Dedicated disposable PostgreSQL, no ports, Cloud clients or credentials.
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
export const root=resolve(import.meta.dirname,'..'),container='matebreak-wholesale-isolated';
const docker=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:20e6});if(r.status!==0)throw Error(r.stderr||r.stdout||'Docker unavailable');return r.stdout.trim();};
export const literal=v=>v==null?'NULL':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
export function createWholesaleDatabase(){
 const info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.Config.Labels['matebreak.test'],'wholesale-local');assert.equal(resolve(info.Config.Labels['matebreak.workdir']),root);assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
 docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],`do $$begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;end if;if not exists(select 1 from pg_roles where rolname='postgres')then create role postgres nologin;end if;end$$;`);
 const db='mb_wholesale_'+process.pid+'_'+Date.now();docker(['exec',container,'psql','-X','-U','supabase_admin','-d','postgres','-c','create database '+db]);
 const args=['exec','-i',container,'psql','-X','-q','-A','-t','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'];
 const query=sql=>docker(args,sql),parallel=sql=>new Promise((done,reject)=>{const p=spawn('docker',args,{windowsHide:true});let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('error',reject);p.on('close',code=>code?reject(Error(error)):done(out.trim()));p.stdin.end(sql);});
 const close=()=>{assert.match(db,/^mb_wholesale_\d+_\d+$/);docker(['exec',container,'psql','-X','-U','supabase_admin','-d','postgres','-c','drop database '+db+' with (force)']);};
 try{query(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  for(const f of readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')).sort())query('BEGIN;\n'+readFileSync(root+'/supabase/migrations/'+f,'utf8')+'\nCOMMIT;');
 }catch(e){close();throw e;}
 return{query,parallel,close,db};
}
export function seedWholesale(query){
 query(readFileSync(root+'/supabase/tests/guest-fixture.sql','utf8'));
 query(`insert into public.producto(id_producto,nombre,precio,tipo,moneda,slug) overriding system value values(900004,'Bombilla sintética local',1000,'simple','ARS','bombilla-local');
 insert into public.catalogo_producto(producto_id,publicado,extraido_en)values(900004,true,now());
 insert into public.catalogo_variante(id,producto_id,external_id,opciones,precio,disponible) overriding system value values(900004,900004,'wholesale-accessory','{}',1000,true);
 insert into private.wholesale_offer values(900001,8000,1,true,'Una unidad de mate sintético'),(900004,1000,0,true,'Accesorio: no cuenta para el mínimo');
 insert into auth.users(id,email)values('33333333-3333-4333-8333-333333333333','admin@fixture.invalid'),('44444444-4444-4444-8444-444444444444','seller@fixture.invalid');
 insert into private.equipo_inventario(usuario_id)values('33333333-3333-4333-8333-333333333333');
 insert into private.equipo_vendedores(usuario_id)values('44444444-4444-4444-8444-444444444444');
 insert into private.wholesale_source(reference,kind,originator_id,active) values('seller01','enlace_vendedor','44444444-4444-4444-8444-444444444444',true),('campaign01','campana_identificada',null,true);`);
}
