import {readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,relative} from 'node:path';
import assert from 'node:assert/strict';
import {assertStagingVercelReady} from './staging-config.mjs';
const root=resolve(import.meta.dirname,'..'),sha=b=>createHash('sha256').update(b).digest('hex');
assertStagingVercelReady(JSON.parse(readFileSync(root+'/vercel.json','utf8')),process.env.STAGING_BACKEND_ORIGIN);
function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(e=>{const p=resolve(path,e.name);assert.ok(!lstatSync(p).isSymbolicLink(),'Unexpected symbolic link');return e.isDirectory()?files(p):[p];});}
const approved=execFileSync('git',['ls-tree','-r','--name-only','3a8e596','supabase/migrations'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
assert.equal(approved.length,26);
// Respect Git's established Windows checkout filter (core.autocrlf=true).
// Compare actual bytes to the approved tree as Git materializes it here;
// do not rewrite or normalize the physical migration files.
for(const p of approved)assert.equal(sha(readFileSync(resolve(root,p))),sha(execFileSync('git',['cat-file','--filters','3a8e596:'+p],{cwd:root,maxBuffer:20*1024*1024})),'Historical migration changed: '+p);
const manifest={files:[],historicalMigrations:26,backend:process.env.STAGING_BACKEND_ORIGIN};
for(const path of files(root+'/dist')){
 const name=relative(root+'/dist',path).replaceAll('\\','/');assert.ok(name==='index.html'||name.startsWith('src/'),'Unexpected artifact root');
 assert.ok(!/(^|\/)(server|supabase|deploy|diagnostics|node_modules|\.env|\.git)(\/|$)|\.(sql|log|toml)$/i.test(name),'Private artifact');
 const body=readFileSync(path),source=readFileSync(resolve(root,name));
 // Match the explicit CRLF-to-LF transformation in build-frontend.mjs.
 // Binary files still require exact source bytes.
 const expected=/\.(html|css|js|mjs|json|svg|txt)$/.test(name)?Buffer.from(source.toString('utf8').replaceAll('\r\n','\n')):source;
 assert.equal(sha(body),sha(expected),'Build source mismatch: '+name);
 if(/\.(html|js|mjs|css|json|txt|svg)$/i.test(name))assert.ok(!/(sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,})/.test(body.toString('utf8')),'Credential pattern in artifact');
 manifest.files.push({path:name,sha256:sha(body),bytes:body.length});
}
const output=process.argv[2];if(output)writeFileSync(resolve(output),JSON.stringify(manifest,null,2)+'\n');
console.log('PASS '+manifest.files.length+' static files match their sources; approved strict Vercel config; 26 unchanged migration hashes; no backend/SQL/credential patterns/private evidence');
