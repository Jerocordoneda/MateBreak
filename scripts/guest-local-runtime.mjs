// Owned disposable PostgreSQL only. No published ports or remote targets.
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),container='matebreak-guest-isolated';
function docker(args,input){const r=spawnSync('docker',args,{encoding:'utf8',input,windowsHide:true,maxBuffer:20*1024*1024});if(r.status!==0)throw Error(r.stderr||r.stdout||'Docker failed');return r.stdout.trim();}
export function createGuestDatabase(){
 const info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.Config.Labels['matebreak.test'],'guest-local');assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
 docker(['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],`do $$begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;end if;if not exists(select 1 from pg_roles where rolname='postgres')then create role postgres nologin;end if;end$$;`);
 const db='matebreak_guest_'+process.pid+'_'+Date.now();docker(['exec',container,'psql','-X','-U','supabase_admin','-d','postgres','-c','create database '+db]);
 const args=['exec','-i',container,'psql','-X','-q','-A','-t','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'];const query=sql=>docker(args,sql);
 const parallel=sql=>new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true});let output='',error='';p.stdout.on('data',v=>output+=v);p.stderr.on('data',v=>error+=v);p.on('error',reject);p.on('close',code=>code===0?resolve(output.trim()):reject(Error(error)));p.stdin.end(sql);});
 const close=()=>docker(['exec',container,'psql','-X','-U','supabase_admin','-d','postgres','-c','drop database '+db+' with (force)']);
 try{query(`create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz,is_anonymous boolean default false);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const f of readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')).sort())query('BEGIN;\n'+readFileSync(root+'/supabase/migrations/'+f,'utf8')+'\nCOMMIT;');}catch(error){close();throw error;}
 return {query,parallel,close,db};
}
export function seedGuestFixture(query){query(readFileSync(root+'/supabase/tests/guest-fixture.sql','utf8'));}
export const sqlLiteral=value=>value===null||value===undefined?'NULL':"'"+String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")+"'";
