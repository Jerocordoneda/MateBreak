// Disposable responsive fixtures, exclusively in the guarded local Docker stack.
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {localStatus,mustSql} from './local-test-runtime.mjs';
const s=localStatus();
if(await mustSql('select count(*)from public.pedido;')!=='0')throw Error('Responsive seeding requires a freshly reset owned local database.');
const admin=createClient(s.API_URL,s.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const listed=await admin.auth.admin.listUsers({page:1,perPage:1000});
if(listed.error)throw listed.error;
if(listed.data.users.length)throw Error('Responsive seeding requires an empty local Auth fixture.');
for(const [email,team]of [['responsive-admin@example.invalid',true],['responsive-customer@example.invalid',false]]){
 const {data,error}=await admin.auth.admin.createUser({email,password:'Local-only-Responsive-2026!',email_confirm:true,user_metadata:{nombre:'Prueba',apellido:'Responsive'}});
 if(error)throw error;
 if(team)await mustSql(`insert into private.equipo_inventario(usuario_id)values('${data.user.id}');`);
}
await mustSql(readFileSync(new URL('../deploy/staging/wholesale-commercial.sql',import.meta.url),'utf8'));
console.log('PASS two synthetic users and 11 approved offers seeded in owned local Docker only; no retail/catalog updates.');
