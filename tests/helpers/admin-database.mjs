// Dedicated disposable PostgreSQL, no ports, Cloud clients or credentials.
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
export const root=resolve(import.meta.dirname,'../..'),container='matebreak-admin-costs-isolated';
const docker=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:20e6});if(r.status!==0)throw Error(r.stderr||r.stdout||'Docker unavailable');return r.stdout.trim();};
export const literal=v=>v==null?'NULL':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
export function createAdminDatabase({skipAccountMigration=false,migrationLimit=Infinity}={}){
 const info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.Config.Labels['matebreak.test'],'admin-costs');assert.equal(resolve(info.Config.Labels['matebreak.workdir']),root);assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
 docker(['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`do $$begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;end if;if not exists(select 1 from pg_roles where rolname='postgres')then create role postgres nologin;end if;end$$;`);
 const db='mb_admin_'+process.pid+'_'+Date.now();docker(['exec',container,'psql','-X','-U','postgres','-d','postgres','-c','create database '+db]);
 const args=['exec','-i',container,'psql','-X','-q','-A','-t','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'];
 const pending=new Set();const query=sql=>docker(args,sql),runParallel=sql=>new Promise((done,reject)=>{const p=spawn('docker',args,{windowsHide:true});let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('error',reject);p.on('close',code=>code?reject(Error(error)):done(out.trim()));p.stdin.end(sql);});
 const parallel=sql=>{const result=runParallel(sql);pending.add(result);result.then(()=>pending.delete(result),()=>pending.delete(result));return result;};
 const close=async()=>{do{await Promise.allSettled([...pending]);await new Promise(resolve=>setTimeout(resolve,300));}while(pending.size);assert.match(db,/^mb_admin_\d+_\d+$/);docker(['exec',container,'psql','-X','-U','postgres','-d','postgres','-c','drop database '+db+' with (force)']);};
 try{query(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz,is_anonymous boolean default false);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  for(const f of readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')&&!(skipAccountMigration&&f.endsWith('_wholesale_account_access.sql'))).sort().slice(0,migrationLimit))query('BEGIN;\n'+readFileSync(root+'/supabase/migrations/'+f,'utf8')+'\nCOMMIT;');
 }catch(e){close();throw e;}
 return{query,parallel,close,db};
}
