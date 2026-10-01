// Full destructive integration suite. Target is fixed to this worktree's local
// Supabase and a private disposable Docker cluster with no published ports.
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertLocalTests, localStatus, checkContainer, disposableContainer, root } from './local-test-runtime.mjs';

assertLocalTests(); localStatus();
const run = (args, env=process.env) => new Promise((done,reject) => {
  const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
  child.on('error',reject);child.on('close',code=>code===0?done():reject(Error(`Local test step failed: ${args[0]}`)));
});
const docker = args => {
  const r=spawnSync('docker',args,{cwd:root,encoding:'utf8',windowsHide:true});
  if(r.status!==0) throw Error(r.stderr || 'Disposable Docker step failed.');
  return r.stdout.trim();
};
// Do not remove or reuse a container belonging to an earlier/unrelated run.
if(spawnSync('docker',['inspect',disposableContainer],{stdio:'ignore',windowsHide:true}).status===0)
  throw Error('Disposable test container already exists; stop only your prior owned test run first.');
let created=false, authAttempted=false;
try {
  await run(['scripts/build-historical-catalog.mjs','--check']);
  // Shell-free glob expansion keeps the unit suite portable on Windows.
  const { readdirSync }=await import('node:fs');
  await run(['--test',...readdirSync(resolve(root,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f)]);
  await run(['scripts/test-local-sql.mjs']);
  docker(['run','--detach','--rm','--name',disposableContainer,'--label','matebreak.test=disposable',
    '--label',`matebreak.workdir=${root}`,'--env','POSTGRES_PASSWORD=disposable-local-only',
    'public.ecr.aws/supabase/postgres:17.6.1.171']);created=true;
  checkContainer(disposableContainer);
  let ready=false;
  for(let n=0;n<30;n++) {
    // The image uses a temporary Unix-socket server during init, then restarts.
    // Readiness must probe TCP so it cannot mistake that server for final PG.
    if(spawnSync('docker',['exec',disposableContainer,'pg_isready','-h','127.0.0.1','-U','supabase_admin'],{stdio:'ignore',windowsHide:true}).status===0){ready=true;break;}
    await new Promise(r=>setTimeout(r,1000));
  }
  if(!ready) throw Error('Disposable PostgreSQL did not become ready.');
  for(const name of ['stock','lifecycle','privileges'])
    docker(['exec',disposableContainer,'psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-c',`create database matebreak_test_${name}`]);
  const testEnv={...process.env,MB_TEST_CONTAINER:disposableContainer,MB_LIFECYCLE_DB:'matebreak_minorista_local'};
  await run(['scripts/test-local-privileges.mjs']);
  await run(['scripts/test-stock-concurrency.mjs'],testEnv);
  await run(['scripts/test-order-lifecycle.mjs'],testEnv);
  authAttempted=true;
  await run(['scripts/test-local-auth.mjs']);
} finally {
  if(created){checkContainer(disposableContainer);docker(['stop',disposableContainer]);}
  if(authAttempted) {
    console.log('Removing synthetic HTTP/order fixtures with guarded local reset.');
    try { await run(['scripts/local-supabase.mjs','reset']); }
    finally {
      // Leave no development services exposed, even if reset cleanup fails.
      // Keep all local volumes for diagnosis/recovery.
      await run(['scripts/local-supabase.mjs','stop']);
    }
  }
}
console.log('PASS full local integration suite; fixtures cleaned and Supabase stopped.');
