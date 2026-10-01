import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
const files=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n');
const sources=files.filter(f=>/\.(mjs|js)$/.test(f));
const dependencies={}; const missing=[];
for(const f of sources){const text=readFileSync(f,'utf8'); dependencies[f]=[];
 const re=/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g;
 for(const m of text.matchAll(re)){if(!m[1].startsWith('.'))continue;const dest=path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1])); dependencies[f].push(dest);if(!existsSync(dest))missing.push({file:f,import:m[1]});}
}
const cycles=[]; const done=new Set();
function visit(f,stack=[]){if(stack.includes(f)){cycles.push([...stack.slice(stack.indexOf(f)),f]);return;}if(done.has(f))return;for(const d of dependencies[f]||[])visit(d,[...stack,f]);done.add(f);}
for(const f of sources)visit(f);
const routes=sources.flatMap(f=>[...readFileSync(f,'utf8').matchAll(/app\.(get|post|put|delete|use)\(\s*(['"])([^'"]+)\2/g)].map(m=>({file:f,method:m[1],path:m[3]})));
const migrations=Object.fromEntries(files.filter(f=>f.startsWith('supabase/migrations/')).map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const report={files,largeFiles:sources.map(f=>({file:f,lines:readFileSync(f,'utf8').split('\n').length})).filter(x=>x.lines>180).sort((a,b)=>b.lines-a.lines),dependencies,cycles,missing,routes,scripts:JSON.parse(readFileSync('package.json')).scripts,migrations};
mkdirSync('docs/refactor',{recursive:true});
const stage=process.argv[2]||'after';writeFileSync(`docs/refactor/${stage}.json`,JSON.stringify(report,null,2)+'\n');
if(stage==='after'){const before=JSON.parse(readFileSync('docs/refactor/before.json'));if(JSON.stringify(before.migrations)!==JSON.stringify(migrations))throw Error('Historical migration hashes changed');const key=r=>r.method+' '+r.path;const lost=before.routes.filter(r=>!routes.some(a=>key(a)===key(r)));if(lost.length)throw Error('Missing routes: '+JSON.stringify(lost));for(const [k,v]of Object.entries(before.scripts))if(report.scripts[k]!==v)throw Error('Changed npm interface: '+k);if(missing.length||cycles.length)throw Error('Broken imports or dependency cycles');}
console.log(JSON.stringify({stage,files:files.length,cycles,missing,routes:routes.length,migrations:Object.keys(migrations).length}));
