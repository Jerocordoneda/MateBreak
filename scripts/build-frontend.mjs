// Static allowlist build. No environment, backend or repository metadata is copied.
import {mkdirSync,cpSync,copyFileSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'), output=resolve(root,'dist');
if(readFileSync(resolve(root,'index.html'),'utf8').includes('/src/css/utilities-'))await import('./build-utilities.mjs');
mkdirSync(output,{recursive:true});
copyFileSync(resolve(root,'index.html'),resolve(output,'index.html'));
cpSync(resolve(root,'src'),resolve(output,'src'),{recursive:true});
// Git's Windows checkout may use CRLF. Canonical public text bytes make the
// reviewed artifact reproducible from the same commit on another checkout.
function canonicalText(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())canonicalText(p);else if(/\.(html|css|js|mjs|json|svg|txt)$/.test(e.name))writeFileSync(p,readFileSync(p,'utf8').replaceAll('\r\n','\n'));}}
canonicalText(output);
console.log('Built dist/index.html and dist/src; use the documented same-origin API proxy.');
