import {compile} from '@tailwindcss/node';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const files=[root+'/index.html'];
function walk(dir){for(const f of readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+f.name;if(f.isDirectory())walk(p);else if(/\.(html|js|mjs)$/.test(f.name))files.push(p);}}
walk(root+'/src');
const candidates=new Set();for(const file of files){const text=readFileSync(file,'utf8');for(const m of text.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g))for(const c of m[1].split(/\s+/))candidates.add(c);}
for(const theme of JSON.parse(readFileSync(root+'/scripts/themes/index.json'))){
 const compiler=await compile('@import "tailwindcss";\n@config "./themes/'+theme+'.mjs";', {base:root+'/scripts',onDependency:()=>{}});
 writeFileSync(root+'/src/css/utilities-'+theme+'.css',compiler.build([...candidates].sort()));
}
console.log('Built local utilities: '+candidates.size+' candidates; no browser CDN compiler');
