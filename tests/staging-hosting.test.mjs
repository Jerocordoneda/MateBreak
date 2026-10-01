import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createStagingVercelConfig,assertStagingVercelReady,validateBackendOrigin,backendRoutes} from '../scripts/staging-config.mjs';
const backend='https://synthetic-fixture.onrender.com'; // Offline only; never contacted.
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
