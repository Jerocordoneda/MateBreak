// Offline migration equivalence. Captured history contains hashes, never business rows.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const history=JSON.parse(readFileSync(new URL('../docs/schema-metadata/remote-migration-history.json',import.meta.url))).history;
const dir=new URL('../supabase/migrations/',import.meta.url);
const tokens=s=>(s.replace(/\r/g,'').match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$[a-zA-Z_]*\$|[a-zA-Z_][a-zA-Z_0-9]*|\d+(?:\.\d+)?|[^\s]/g)||[]).filter(t=>!t.startsWith('--')&&!t.startsWith('/*'));
const rows=readdirSync(dir).sort().map(file=>{
 const version=file.slice(0,14),name=file.slice(15,-4),remote=history.find(r=>r.name===name);
 const hash=createHash('md5').update(tokens(readFileSync(new URL(file,dir),'utf8')).join('\x1f')).digest('hex');
 return {file,version,name,remoteVersion:remote?.version??null,localTokenMd5:hash,remoteTokenMd5:remote?.sql_token_md5??null,tokenEquivalent:remote?hash===remote.sql_token_md5:null};
});
if(rows.filter(r=>r.remoteVersion).length!==history.length || rows.some(r=>r.tokenEquivalent===false))throw Error('Remote/local SQL equivalence changed; stop baseline adoption.');
const output=JSON.stringify(rows,null,2)+'\n',target=new URL('../docs/schema-metadata/migration-equivalence.json',import.meta.url);
if(process.argv.includes('--check')) {if(readFileSync(target,'utf8').replace(/\r/g,'')!==output)throw Error('Regenerate migration equivalence evidence.');}
else writeFileSync(target,output);
console.log('Baseline: 18 remote migrations match SQL tokens; metadata/history remain read-only.');
