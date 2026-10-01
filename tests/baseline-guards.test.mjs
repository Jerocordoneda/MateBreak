import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>
  !/^(SUPABASE_|MP_|MERCADOPAGO_|CORREO_|DATABASE_URL$|POSTGRES_URL$|PG)/.test(k)));
function denied(args,env,message) {
  const r=spawnSync(process.execPath,['scripts/test-baseline-rehearsal.mjs',...args],
    {cwd:root,env:{...cleanEnv,...env},encoding:'utf8',windowsHide:true});
  assert.notEqual(r.status,0); assert.match(r.stderr,message);
  assert.equal(r.stdout,'','Refusal must happen before CLI/Docker execution or fixture output');
  assert(!r.stderr.includes('synthetic-secret-never-send'),'Credential appeared in error');
}
test('baseline rehearsal refuses remote CLI arguments before consulting Docker',()=>{
  denied(['--project-ref','not-a-real-project'],{},/Rehearsal accepts no arguments or targets/);
});
test('baseline rehearsal refuses provider credentials before consulting Docker',()=>{
  denied([],{CORREO_MICORREO_PASSWORD:'synthetic-secret-never-send'},/Provider credentials\/configuration are forbidden/);
});
test('baseline rehearsal refuses inherited Supabase keys before consulting Docker',()=>{
  denied([],{SUPABASE_SECRET_KEY:'synthetic-secret-never-send'},/inherited credentials are forbidden/);
});
test('baseline rehearsal refuses a remote Supabase endpoint before consulting Docker',()=>{
  denied([],{SUPABASE_URL:'https://not-a-real-project.supabase.co'},/Remote test target refused/);
});
