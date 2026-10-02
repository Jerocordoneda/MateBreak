import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStagingVercelConfig,assertStagingVercelReady,validateBackendOrigin,backendRoutes} from '../scripts/staging-config.mjs';
const backend='https://synthetic-fixture.onrender.com'; // Offline only; never contacted.

test('staging headers protect root explicitly and preserve non-root coverage under strict validation',()=>{
 const prepared=createStagingVercelConfig(backend);
 assert.deepEqual(prepared.headers.map(rule=>rule.source),['/','/:path*']);
 for(const rule of prepared.headers)assert.deepEqual(rule.headers,[
  {key:'X-Robots-Tag',value:'noindex, nofollow'},
  {key:'Cache-Control',value:'no-store'},
 ]);
 const root=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(assertStagingVercelReady(root,'https://matebreak-api-staging.onrender.com'),'https://matebreak-api-staging.onrender.com');
 for(const mutate of [
  c=>{c.headers.shift();},c=>{c.headers.pop();},
  c=>{c.headers[0].source='/index.html';},c=>{c.headers[1].source='/tienda';},
  c=>{c.headers[0].headers[0].value='index, follow';},
  c=>{c.headers[0].headers[1].value='public';},
  c=>{c.headers[1].headers[0].value='index, follow';},
  c=>{c.headers[1].headers[1].value='public';},
  c=>{c.headers.push({source:'/',headers:[]});},
 ]){const changed=structuredClone(prepared);mutate(changed);assert.throws(()=>assertStagingVercelReady(changed,backend),/blocked.*\$\.headers/);}
});
test('staging config diagnostics preserve strict rejection of routing, Git, build and header changes',()=>{
 const prepared=createStagingVercelConfig(backend);
 const mutations=[
  [c=>{c.git.deploymentEnabled=true;},'$.git.deploymentEnabled'],
  [c=>{delete c.git;},'$.git (missing)'],
  [c=>{c.installCommand='npm install';},'$.installCommand'],
  [c=>{c.buildCommand='npm run build:frontend';},'$.buildCommand'],
  [c=>{c.outputDirectory='.';},'$.outputDirectory'],
  [c=>{c.framework='express';},'$.framework'],
  [c=>{c.rewrites.pop();},'$.rewrites.length'],
  [c=>{c.rewrites.push({source:'/:path*',destination:backend+'/:path*'});},'$.rewrites.length'],
  [c=>{c.rewrites[4].destination='/index.html';},'$.rewrites[4].destination'],
  [c=>{c.headers[0].headers[0].value='index, follow';},'$.headers[0].headers[0].value'],
  [c=>{c.headers[0].headers[1].value='public, max-age=3600';},'$.headers[0].headers[1].value'],
  [c=>{c.version=2;},'$ (unexpected keys)'],
 ];
 for(let i=0;i<backendRoutes.length;i++)mutations.push([c=>{c.rewrites[i].destination='https://wrong-fixture.onrender.com'+backendRoutes[i];},'$.rewrites['+i+'].destination']);
 for(const [mutate,path]of mutations){const config=structuredClone(prepared);mutate(config);assert.throws(()=>assertStagingVercelReady(config,backend),error=>error.message.includes('blocked')&&error.message.includes(path));}
 assert.equal(assertStagingVercelReady(JSON.parse(JSON.stringify(prepared)),backend),backend);
});
test('staging config diagnostics never echo rejected values or unexpected key names',()=>{
 const sentinel='synthetic-private-value-do-not-log';
 const config=createStagingVercelConfig(backend);
 config.rewrites[0].destination=sentinel;
 config[sentinel]={credential:sentinel};
 assert.throws(()=>assertStagingVercelReady(config,backend),error=>{
  assert.ok(error.message.includes('$.rewrites[0].destination'));
  assert.ok(error.message.includes('$ (unexpected keys)'));
  assert.ok(!error.message.includes(sentinel));return true;
 });
});

test('root diagnostics name known Vercel properties but still reject every additional property',()=>{
 for(const [key,value]of [['version',2],['$schema','synthetic-private-schema'],['regions',['synthetic-private-region']],['build',{env:{PRIVATE:'synthetic-private-env'}}],['env',{PRIVATE:'synthetic-private-env'}],['services',{}],['meta',{PRIVATE:'synthetic-private-meta'}],['projectSettings',{PRIVATE:'synthetic-private-setting'}]]){
  const config=createStagingVercelConfig(backend);config[key]=value;
  assert.throws(()=>assertStagingVercelReady(config,backend),error=>{
   assert.ok(error.message.includes('$ (unexpected keys)'));
   assert.ok(error.message.includes('additional known='+JSON.stringify([key])));
   assert.ok(error.message.includes('undisclosed unexpected keys=0'));
   assert.ok(!error.message.includes('synthetic-private'));
   assert.ok(!error.message.includes('PRIVATE'));return true;
  });
 }
});

test('root diagnostics compare expected and effective safe names without leaking arbitrary names or values',()=>{
 const config=createStagingVercelConfig(backend);delete config.installCommand;
 config.version=2;config.$schema='synthetic-private-value';
 for(const key of ['syntheticSecretLookingIdentifier','token\nINJECTED LOG','eyJsynthetic.payload.signature'])config[key]={nestedSecret:'synthetic-private-value'};
 config.git['nested-private-key']='nested-private-value';
 assert.throws(()=>assertStagingVercelReady(config,backend),error=>{
  const message=error.message;
  const expected=['buildCommand','framework','git','headers','installCommand','outputDirectory','rewrites'];
  const actual=['$schema','buildCommand','framework','git','headers','outputDirectory','rewrites','version'];
  assert.ok(message.includes('root keys: expected='+JSON.stringify(expected)));
  assert.ok(message.includes('actual known='+JSON.stringify(actual)));
  assert.ok(message.includes('additional known=["$schema","version"]'));
  assert.ok(message.includes('undisclosed unexpected keys=3'));
  assert.ok(message.includes('$.installCommand (missing)'));
  assert.ok(message.includes('$.git (unexpected keys)'));
  for(const forbidden of ['syntheticSecret','INJECTED','eyJsynthetic','synthetic-private','nested-private'])assert.ok(!message.includes(forbidden));
  return true;
 });
});

test('root diagnostics reject falsy metadata and malformed roots without logging their contents',()=>{
 for(const value of [null,false,0,'']){
  const config=createStagingVercelConfig(backend);config.version=value;
  assert.throws(()=>assertStagingVercelReady(config,backend),/additional known=\["version"\]/);
 }
 for(const config of [null,false,'synthetic-private-root',['synthetic-private-root']])
  assert.throws(()=>assertStagingVercelReady(config,backend),error=>error.message.includes('actual=not an object')&&!error.message.includes('synthetic-private-root'));
});

test('physical-file key snapshots identify later key changes without exposing arbitrary names or values',()=>{
 const config=createStagingVercelConfig(backend),physicalKeys=Object.keys(config);
 config.name='synthetic-private-name';config.version=2;
 assert.throws(()=>assertStagingVercelReady(config,backend,physicalKeys),error=>{
  assert.ok(error.message.includes('additional known=["name","version"]'));
  assert.ok(error.message.includes('file/evaluated root key sets match=false'));
  assert.ok(!error.message.includes('synthetic-private-name'));return true;
 });
 config['synthetic-private-property']='synthetic-private-value';
 const actualFileKeys=Object.keys(config);
 assert.throws(()=>assertStagingVercelReady(config,backend,actualFileKeys),error=>{
  assert.ok(error.message.includes('undisclosed unexpected keys=1'));
  assert.ok(error.message.includes('file undisclosed root keys=1'));
  assert.ok(error.message.includes('file/evaluated root key sets match=true'));
  assert.ok(!error.message.includes('synthetic-private'));return true;
 });
 assert.equal(assertStagingVercelReady(createStagingVercelConfig(backend),backend,physicalKeys),backend);
});

test('name/version never exempt changes to any of the seven protected root fields',()=>{
 const mutations=[
  [c=>{c.git.deploymentEnabled=true;},'$.git.deploymentEnabled'],
  [c=>{c.installCommand='npm install';},'$.installCommand'],
  [c=>{c.buildCommand='npm run build:frontend';},'$.buildCommand'],
  [c=>{c.outputDirectory='.';},'$.outputDirectory'],
  [c=>{c.framework='express';},'$.framework'],
  [c=>{c.rewrites[0].destination='https://wrong-fixture.onrender.com/api/:path*';},'$.rewrites[0].destination'],
  [c=>{c.headers[0].headers[0].value='index, follow';},'$.headers[0].headers[0].value'],
 ];
 for(const [mutate,path]of mutations){
  const config={...createStagingVercelConfig(backend),name:'synthetic-fixture',version:2};mutate(config);
  assert.throws(()=>assertStagingVercelReady(config,backend,Object.keys(config)),error=>error.message.includes(path)&&error.message.includes('additional known=["name","version"]'));
 }
});

test('build reads only root vercel.json and never substitutes or merges the generated example',t=>{
 const prefix=join(tmpdir(),'matebreak-config-diagnostic-'),root=mkdtempSync(prefix);
 t.after(()=>{assert.ok(root.startsWith(prefix));rmSync(root,{recursive:true,force:true});});
 mkdirSync(join(root,'scripts'));mkdirSync(join(root,'src'));
 for(const name of ['build-staging.mjs','staging-config.mjs','build-frontend.mjs'])
  copyFileSync(new URL('../scripts/'+name,import.meta.url),join(root,'scripts',name));
 writeFileSync(join(root,'index.html'),'<html>synthetic offline fixture</html>');
 const prepared=createStagingVercelConfig(backend),example=createStagingVercelConfig('https://different-fixture.onrender.com');
 writeFileSync(join(root,'vercel.json'),JSON.stringify(prepared));
 writeFileSync(join(root,'vercel.staging.generated.json'),JSON.stringify(example));
 const run=()=>spawnSync(process.execPath,[join(root,'scripts','build-staging.mjs')],{cwd:root,env:{STAGING_BACKEND_ORIGIN:backend},encoding:'utf8',windowsHide:true});
 const good=run();assert.ifError(good.error);assert.equal(good.status,0,good.stderr);
 assert.deepEqual(JSON.parse(readFileSync(join(root,'vercel.json'),'utf8')),prepared);
 prepared.version=2;
 writeFileSync(join(root,'vercel.json'),JSON.stringify(prepared));
 writeFileSync(join(root,'vercel.staging.generated.json'),JSON.stringify(createStagingVercelConfig(backend)));
 const rejected=run();assert.ifError(rejected.error);assert.notEqual(rejected.status,0);
 assert.ok(rejected.stderr.includes('additional known=["version"]'));
 assert.ok(rejected.stderr.includes('file/evaluated root key sets match=true'));
 prepared.name='synthetic-private-name';
 prepared['synthetic-private-property']='synthetic-private-value';
 writeFileSync(join(root,'vercel.json'),JSON.stringify(prepared));
 const metadataRejected=run();assert.ifError(metadataRejected.error);assert.notEqual(metadataRejected.status,0);
 assert.ok(metadataRejected.stderr.includes('additional known=["name","version"]'));
 assert.ok(metadataRejected.stderr.includes('file parsed known root keys='));
 assert.ok(metadataRejected.stderr.includes('file undisclosed root keys=1'));
 assert.ok(metadataRejected.stderr.includes('file/evaluated root key sets match=true'));
 assert.ok(!metadataRejected.stderr.includes('synthetic-private'));
});
test('staging frontend refuses incomplete routing, wrong backend and unsafe origins before build',()=>{
 const prepared=createStagingVercelConfig(backend);
 assert.equal(assertStagingVercelReady(prepared,backend),backend);
 assert.throws(()=>assertStagingVercelReady(createStagingVercelConfig(),backend),/blocked/);
 assert.throws(()=>assertStagingVercelReady(prepared,'https://different-fixture.onrender.com'),/blocked/);
 for(const value of ['', 'http://localhost:3000','https://backend.example.invalid','https://example.com','https://fixture.supabase.co','https://matebreak.com.ar','https://host.onrender.com/path'])assert.throws(()=>validateBackendOrigin(value));
});
test('staging rewrites preserve auth/private routes and block Git auto deploys without exposing secrets',()=>{
 const config=createStagingVercelConfig(backend);assert.equal(config.git.deploymentEnabled,false);
 for(const source of backendRoutes)assert.ok(config.rewrites.some(r=>r.source===source&&r.destination===backend+source));
 assert.ok(config.rewrites.some(r=>r.source==='/checkout/resultado'&&r.destination==='/src/pages/checkout-resultado.html'));
 assert.ok(!JSON.stringify(config).includes('SUPABASE_SECRET_KEY'));
 const root=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));assert.equal(root.git.deploymentEnabled,false);
 assert.ok(!JSON.stringify(root).includes('.invalid'));
});
test('Render entrypoint honors PORT, starts without Docker or dotenv and terminates on SIGTERM',async t=>{
 const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const env={...process.env,APP_ENV:'local',NODE_ENV:'development',PORT:String(port),SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic',APP_ORIGIN:'http://127.0.0.1:'+port,SHIPPING_MODE:'mock',PAYMENTS_MODE:'mock'};
 for(const key of Object.keys(env))if(/^(MP_|MERCADOPAGO_|CORREO_|MATEBREAK_|SUPABASE_ACCESS_TOKEN$|DATABASE_URL$|POSTGRES_URL$|PG)/.test(key))delete env[key];
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../',import.meta.url),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill();});let output='';child.stderr.on('data',()=>{});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Runtime smoke startup timeout')),5000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error('Runtime exited before ready: '+code));});child.stdout.on('data',data=>{output+=data;if(output.includes('MateBreak:')){clearTimeout(timer);resolve();}});});
 const health=await fetch('http://127.0.0.1:'+port+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});
 const exit=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exit;
});
