import assert from 'node:assert/strict';import {createWholesaleDatabase,literal as l} from './wholesale-local-runtime.mjs';
const db=createWholesaleDatabase(),q=db.query,a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
try{q('insert into auth.users(id,email_confirmed_at)values('+l(a)+',now()),('+l(b)+',now());');const execute=(id,data)=>'set role authenticated;set request.jwt.claim.sub='+l(id)+';select public.mb_wholesale_profile_complete('+l(data)+');';
const first={nombre:'Ana Pérez',whatsapp:'01112345678',provincia:'Buenos Aires',localidad:'Tandil',empresa:'Fixture'};
const rows=await Promise.all([db.parallel(execute(a,first)),db.parallel(execute(a,first))]);assert.equal(new Set(rows).size,1);
const updated=JSON.parse(q(execute(a,{nombre:'Forged overwrite',whatsapp:'22222222',localidad:'Salta',provincia:'Salta',empresa:'Other'})));assert.deepEqual(updated,first);
assert.equal(q('set role authenticated;set request.jwt.claim.sub='+l(b)+';select count(*) from public.perfil where id='+l(a)+';'),'0');
assert.throws(()=>q('set role authenticated;set request.jwt.claim.sub='+l(b)+';update public.perfil set id='+l(b)+' where id='+l(a)+';insert into public.perfil(id,nombre)values('+l(a)+',\'Forged\');'));
for(const data of [{id:b},{rol:'administrador'},{whatsapp:'1e10'},{provincia:'fake'},{localidad:'x'.repeat(101)},null])assert.throws(()=>q(execute(a,data)));
assert.throws(()=>q('set role anon;select public.mb_wholesale_profile_complete(\'{}\');'));
q('set role authenticated;set request.jwt.claim.sub='+l(a)+';update public.perfil set nombre=\'Ana permanente\',telefono=\'00012345678\' where id='+l(a)+';');const same=JSON.parse(q(execute(a,{localidad:'Other'})));assert.equal(same.nombre,'Ana permanente');assert.equal(same.whatsapp,'00012345678');assert.equal(same.localidad,'Tandil');
q('reset role;');assert.equal(q('select count(*) from public.pedido;'),'0');assert.equal(q('select count(*) from public.pago;'),'0');assert.equal(q('select count(*) from private.wholesale_request;'),'0');
console.log('PASS 32 migrations; profile RPC concurrency, fill-only, canonical phone/province, RLS ownership, spoof rejection, general profile preservation, no commercial writes');
}finally{db.close();}

