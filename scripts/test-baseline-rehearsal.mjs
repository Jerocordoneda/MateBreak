// Destructive ONLY to the fixed, owned disposable local Supabase stack.
// Never loads dotenv or accepts a remote target/extra CLI flags.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root, assertLocalTests, checkContainer, localContainer, mustSql} from './local-test-runtime.mjs';
import {compareSchemas, equalSchemas} from './schema-comparison.mjs';

if (process.argv.length !== 2) throw Error('Rehearsal accepts no arguments or targets.');
assertLocalTests(); checkContainer(localContainer);
const cliPath = resolve(root,'node_modules/supabase/dist/supabase.js');
const output = resolve(root,'.baseline-rehearsal'); mkdirSync(output,{recursive:true});
const report = {status:'RUNNING', cli:'2.118.0', target:'owned local matebreak-local-tests', commands:[]};
const save = (name, value) => writeFileSync(resolve(output,name+'.json'),JSON.stringify(value,null,2)+'\n');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(SUPABASE_|MP_|MERCADOPAGO_|CORREO_|DATABASE_URL$|POSTGRES_URL$|PG)/.test(k)));
function cli(args, expectedSuccess=true) {
  assertLocalTests(); checkContainer(localContainer);
  assert(args.includes('--local'),'Every rehearsal CLI operation must target --local');
  const r = spawnSync(process.execPath,[cliPath,...args,'--workdir',root],{cwd:root,env:cleanEnv,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  const step = {command:'supabase '+args.join(' '),exitCode:r.status,stdout:r.stdout,stderr:r.stderr};
  report.commands.push(step); save('progress',report);
  if (expectedSuccess && r.status!==0) throw Error(`Local CLI failed: ${args.join(' ')}: ${r.stderr}`);
  return step;
}
// Existing local image operator, used ONLY to install/remove temporary audit
// event triggers. No roles are elevated; application migrations run as postgres.
function operator(sql) {
  checkContainer(localContainer);
  const r=spawnSync('docker',['exec','-i',localContainer,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],
    {input:sql,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  if(r.status!==0)throw Error(r.stderr||'Local fixture operator failed');
  return r.stdout.trim();
}
const schemaQuery=readFileSync(resolve(root,'scripts/sql/schema-metadata.sql'),'utf8');
const schema=async()=>JSON.parse(await mustSql(schemaQuery));
const history=async()=>JSON.parse(await mustSql("select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,'statementCount',cardinality(statements)) order by version),'[]') from supabase_migrations.schema_migrations;"));
const defaults=async()=>JSON.parse(await mustSql("select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text) order by pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype),'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname='public';"));
const identity=async()=>JSON.parse(await mustSql(`select jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'oid',c.oid,'kind',c.relkind) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'oid',p.oid) order by n.nspname,p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
 'triggers',(select jsonb_agg(jsonb_build_object('oid',t.oid,'table',t.tgrelid,'name',t.tgname) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
 'sequenceValues',(select jsonb_agg(jsonb_build_object('schema',schemaname,'name',sequencename,'lastValue',last_value::text) order by schemaname,sequencename) from pg_sequences where schemaname in ('public','private')));`));
async function dataDigest() {
  // Local synthetic/public archive rows only; output counts/hashes, never rows.
  const tables=await schema(); const result=[];
  for(const t of tables.tables) {
    assert(/^[a-z_][a-z0-9_]*$/.test(t.name));
    result.push({table:`${t.schema}.${t.name}`,...JSON.parse(await mustSql(`select jsonb_build_object('count',count(*),'md5',md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')),'rowVersionMd5',md5(coalesce(string_agg(t.xmin::text,'|' order by to_jsonb(t)::text,t.xmin::text),''))) from "${t.schema}"."${t.name}" t;`))});
  }
  return result;
}
const equivalence=JSON.parse(readFileSync(resolve(root,'docs/schema-metadata/migration-equivalence.json')));
const historical=equivalence.filter(x=>x.version<='20260929144308');
const pending=equivalence.filter(x=>x.version>'20260929144308');
assert.equal(historical.length,22); assert.equal(pending.length,4);
assert.equal(pending[3].file,'20261001112820_logistics_admin_recovery.sql');
const captured=JSON.parse(readFileSync(resolve(root,'docs/schema-metadata/remote-migration-history.json'))).history;
assert.equal(captured.length,18);
for(const row of captured)assert(historical.some(x=>x.remoteVersion===row.version && x.tokenEquivalent===true));
const remoteSchema=JSON.parse(readFileSync(resolve(root,'docs/schema-metadata/remote-final-reference.json')));
// Exactly reproduce captured ACLs on the legacy objects where bootstrap is
// deliberately stricter. These grants are temporary local fixture setup only.
async function capturedLegacyAcl() {
  const allowedTables=['producto','combo','combo_item'];
  const allowedSeq=['producto_id_producto_seq','catalogo_categoria_id_seq','catalogo_variante_id_seq'];
  const letters={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',U:'USAGE'};
  for(const [category,names,kind] of [['tables',allowedTables,'table'],['sequences',allowedSeq,'sequence']]) {
    for(const name of names) {
      const row=remoteSchema[category].find(x=>x.schema==='public'&&x.name===name); assert(row?.acl);
      for(const role of ['anon','authenticated']) {
        await mustSql(`revoke all on ${kind} public."${name}" from ${role};`);
        const entry=row.acl.slice(1,-1).split(',').find(x=>x.startsWith(role+'='));
        if(!entry)continue;
        const permissions=entry.split('=')[1].split('/')[0]; assert(!permissions.includes('*'));
        const grants=[...permissions].map(c=>{assert(letters[c]); return letters[c];});
        if(grants.length)await mustSql(`grant ${grants.join(',')} on ${kind} public."${name}" to ${role};`);
      }
    }
  }
}
const auditSetup=`create schema rehearsal_audit authorization postgres;
create table rehearsal_audit.ddl(id bigint generated always as identity primary key,tag text,objects jsonb);
grant usage on schema rehearsal_audit to postgres;
grant insert,select,delete on rehearsal_audit.ddl to postgres;
grant usage,select on sequence rehearsal_audit.ddl_id_seq to postgres;
create function rehearsal_audit.capture() returns event_trigger language plpgsql security invoker set search_path='' as $$
begin insert into rehearsal_audit.ddl(tag,objects) select tg_tag,coalesce(jsonb_agg(jsonb_build_object('type',object_type,'schema',schema_name,'identity',object_identity)),'[]') from pg_event_trigger_ddl_commands(); end;$$;
revoke all on function rehearsal_audit.capture() from public,anon,authenticated;
create event trigger mb_rehearsal_capture on ddl_command_end execute function rehearsal_audit.capture();`;
const failSetup=`create function rehearsal_audit.fail_hardening() returns event_trigger language plpgsql security invoker set search_path='' as $$begin if tg_tag='REVOKE' and position('revoke all on sequence public.producto_id_producto_seq' in lower(current_query()))>0 then raise exception 'MB_REHEARSAL_INJECTED_HARDENING_FAILURE'; end if; end;$$;
revoke all on function rehearsal_audit.fail_hardening() from public,anon,authenticated;
create event trigger mb_rehearsal_fail on ddl_command_end when tag in ('REVOKE') execute function rehearsal_audit.fail_hardening();`;
try {
  const version=spawnSync(process.execPath,[cliPath,'--version'],{cwd:root,env:cleanEnv,encoding:'utf8',windowsHide:true});
  assert.equal(version.status,0); assert.equal(version.stdout.trim(),'2.118.0','Rehearsal must use the reviewed CLI version');
  const audit=spawnSync(process.execPath,['scripts/audit-baseline.mjs','--check'],{cwd:root,env:cleanEnv,encoding:'utf8',windowsHide:true});
  assert.equal(audit.status,0,audit.stderr||'Current historical SQL no longer matches captured token hashes');
  report.migrationFileSha256=Object.fromEntries(equivalence.map(x=>[x.file,createHash('sha256').update(readFileSync(resolve(root,'supabase/migrations',x.file))).digest('hex')]));
  console.log('Rehearsal: reset owned local DB to the 22 historical migrations.');
  cli(['db','reset','--local','--no-seed','--version','20260929144308']);
  await capturedLegacyAcl();
  const beforeSchema=await schema(); save('schema-before',beforeSchema);
  report.historicalSchemaComparison=compareSchemas(remoteSchema,beforeSchema);
  assert(equalSchemas(report.historicalSchemaComparison),'Historical local schema differs from captured remote metadata: STOP');
  const beforeDefaults=await defaults(); save('defaults-before',beforeDefaults);
  // Only the disposable history is replaced. Remote statements were captured
  // as hashes; fixture statements are equivalent LOCAL SQL, not exact remote bytes.
  await mustSql('begin; delete from supabase_migrations.schema_migrations; '+captured.map(r=>{
    const file=historical.find(x=>x.remoteVersion===r.version); assert(file);
    const sql=readFileSync(resolve(root,'supabase/migrations',file.file),'utf8');
    const literal=s=>"'"+s.replaceAll("'","''")+"'";
    return `insert into supabase_migrations.schema_migrations(version,name,statements) values (${literal(r.version)},${literal(r.name)},array[${literal(sql)}]);`;
  }).join('\n')+' commit;');
  report.historyBefore=await history(); save('history-before',report.historyBefore);
  const beforeIdentity=await identity(), beforeData=await dataDigest();
  save('identity-before',beforeIdentity); save('data-before',beforeData);
  operator(auditSetup); await mustSql('delete from rehearsal_audit.ddl;');
  console.log('Rehearsal: real CLI repair --local applied 22, then reverted 18.');
  cli(['migration','repair',...historical.map(x=>x.version),'--status','applied','--local']);
  cli(['migration','repair',...captured.map(x=>x.version),'--status','reverted','--local']);
  report.historyAfter=await history(); save('history-after',report.historyAfter);
  assert.deepEqual(report.historyAfter.map(x=>x.version),historical.map(x=>x.version));
  const afterSchema=await schema(), afterIdentity=await identity(), afterData=await dataDigest();
  save('schema-after-repair',afterSchema); save('identity-after',afterIdentity); save('data-after',afterData);
  assert.deepEqual(afterSchema,beforeSchema); assert.deepEqual(afterIdentity,beforeIdentity); assert.deepEqual(afterData,beforeData);
  assert.deepEqual(await defaults(),beforeDefaults);
  report.repairDdl=JSON.parse(await mustSql("select coalesce(jsonb_agg(jsonb_build_object('tag',tag,'objects',objects) order by id),'[]') from rehearsal_audit.ddl;"));
  save('repair-ddl',report.repairDdl);
  assert(!report.repairDdl.some(x=>x.objects.some(o=>['public','private'].includes(o.schema))),'Repair executed application DDL');
  report.repairProof={schemaUnchanged:true,objectOidsUnchanged:true,allApplicationDataDigestsUnchanged:true,defaultPrivilegesUnchanged:true,
    schemaSha256:hash(beforeSchema),identitySha256:hash(beforeIdentity),dataSha256:hash(beforeData),tables:beforeData.length};
  const dry=cli(['db','push','--local','--dry-run','--skip-vault']);
  const dryText=dry.stdout+dry.stderr;
  const planned=[...new Set(dryText.match(/\d{14}_[a-z_]+\.sql/g)||[])];
  assert.deepEqual(planned.sort(),pending.map(x=>x.file).sort()); report.pendingDryRun=planned;
  console.log('Rehearsal: inject a REVOKE failure in migration 2; migration 1 must persist and 3/4 must not run.');
  operator(failSetup);
  const failed=cli(['db','push','--local','--skip-vault','--yes'],false);
  assert.notEqual(failed.exitCode,0); assert((failed.stderr+failed.stdout).includes('MB_REHEARSAL_INJECTED_HARDENING_FAILURE'));
  report.historyAfterFailure=await history(); save('history-after-failure',report.historyAfterFailure);
  assert.deepEqual(report.historyAfterFailure.map(x=>x.version),[...historical.map(x=>x.version),pending[0].version]);
  const afterFailureSchema=await schema(); save('schema-after-failure',afterFailureSchema);
  assert(afterFailureSchema.functions.some(x=>x.name==='mb_validar_transicion_pedido'));
  assert(!afterFailureSchema.tables.some(x=>x.name==='envio_bulto'));
  assert.deepEqual(afterFailureSchema.tables,beforeSchema.tables,'Partial table ACL revoke persisted');
  assert.deepEqual(afterFailureSchema.sequences,beforeSchema.sequences,'Partial sequence revoke persisted');
  assert.deepEqual(await defaults(),beforeDefaults,'Partial default privilege changes persisted');
  assert.deepEqual(await dataDigest(),beforeData,'Application data changed in failure path');
  report.failureProof={lifecycleRecorded:true,hardeningNotRecorded:true,logisticsNotRecorded:true,legacyAclUnchanged:true,defaultsUnchanged:true,dataUnchanged:true};
  // Recovery removes ONLY our synthetic fault. No history repair to mark the
  // failed migration applied and no rollback of the already committed lifecycle.
  operator('drop event trigger mb_rehearsal_fail; drop function rehearsal_audit.fail_hardening();');
  const recoveryDry=cli(['db','push','--local','--skip-vault','--dry-run']);
  assert.deepEqual([...new Set((recoveryDry.stdout+recoveryDry.stderr).match(/\d{14}_[a-z_]+\.sql/g)||[])].sort(),pending.slice(1).map(x=>x.file).sort());
  console.log('Rehearsal: recover forward with only the remaining migrations.');
  cli(['db','push','--local','--skip-vault','--yes']);
  report.historyFinal=await history(); assert.deepEqual(report.historyFinal.map(x=>x.version),equivalence.map(x=>x.version));
  report.migrationDdl=JSON.parse(await mustSql("select coalesce(jsonb_agg(jsonb_build_object('tag',tag,'objects',objects) order by id),'[]') from rehearsal_audit.ddl;")); save('migration-ddl',report.migrationDdl);
  assert(report.migrationDdl.some(x=>x.objects.some(o=>['public','private'].includes(o.schema))),'DDL observer did not capture actual application migrations');
  operator('drop event trigger mb_rehearsal_capture; drop schema rehearsal_audit cascade;');
  const simulated=await schema(),simulatedDefaults=await defaults(); save('schema-simulated-final',simulated); save('defaults-simulated-final',simulatedDefaults);
  // SQL tests use rollback and synthetic fixture users. Includes catalog and
  // logistics/RPC constraints, ownership, grants, immutable snapshots and claims.
  for(const script of ['scripts/test-local-sql.mjs','scripts/test-local-logistics.mjs']) {
    const r=spawnSync(process.execPath,[script],{cwd:root,env:cleanEnv,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
    writeFileSync(resolve(output,script.split('/').at(-1)+'.log'),r.stdout+r.stderr);
    assert.equal(r.status,0,r.stderr); console.log(r.stdout.trim());
  }
  console.log('Rehearsal: rebuild all 26 migrations from scratch and compare logical schema/defaults.');
  cli(['db','reset','--local','--no-seed']);
  const fresh=await schema(),freshDefaults=await defaults(); save('schema-fresh-final',fresh); save('defaults-fresh-final',freshDefaults);
  report.finalSchemaComparison=compareSchemas(simulated,fresh);
  assert(equalSchemas(report.finalSchemaComparison),'Simulated/fresh final schemas do not converge');
  assert.deepEqual(freshDefaults,simulatedDefaults,'Final default privileges do not converge');
  report.finalProof={schemaConverges:true,defaultPrivilegesConverge:true,counts:Object.fromEntries(Object.entries(fresh).map(([k,v])=>[k,v.length])),
    platformAdminDefaultsUnchanged:JSON.stringify(beforeDefaults.filter(x=>x.owner==='supabase_admin'))===JSON.stringify(freshDefaults.filter(x=>x.owner==='supabase_admin'))};
  assert(report.finalProof.platformAdminDefaultsUnchanged);
  for(const [file,digest] of Object.entries(report.migrationFileSha256))
    assert.equal(createHash('sha256').update(readFileSync(resolve(root,'supabase/migrations',file))).digest('hex'),digest,'Migration file changed during rehearsal');
  report.finalProof.migrationFilesUnchanged=true;
  report.status='PASS';
} catch(error) {
  report.status='FAIL'; report.failure=error.message; process.exitCode=1; console.error(error.message);
} finally {
  // Retain failed state in volumes/artifacts for diagnosis; always stop public
  // ports. A passing run ends on the fresh 26-migration baseline.
  const stopped=spawnSync(process.execPath,['scripts/local-supabase.mjs','stop'],{cwd:root,env:cleanEnv,encoding:'utf8',windowsHide:true});
  report.localStackStopped=stopped.status===0;
  if(stopped.status!==0){report.status='FAIL'; process.exitCode=1; console.error('STOP FAILED: manually stop owned Supabase stack.');}
  save('result',report);
  writeFileSync(resolve(root,'docs/schema-metadata/baseline-rehearsal-result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Baseline rehearsal ${report.status}; local stack stop ${stopped.status===0?'OK':'FAILED'}; evidence: .baseline-rehearsal/`);
}
