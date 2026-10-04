// Static allowlist build. No environment, backend or repository metadata is copied.
import {mkdirSync,cpSync,copyFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'), output=resolve(root,'dist');
if(readFileSync(resolve(root,'index.html'),'utf8').includes('/src/css/utilities-'))await import('./build-utilities.mjs');
mkdirSync(output,{recursive:true});
copyFileSync(resolve(root,'index.html'),resolve(output,'index.html'));
cpSync(resolve(root,'src'),resolve(output,'src'),{recursive:true});
console.log('Built dist/index.html and dist/src; use the documented same-origin API proxy.');
