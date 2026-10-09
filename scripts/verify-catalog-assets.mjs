// Offline verification only: no downloading, Storage client or uploads.
import {readFileSync,existsSync,writeFileSync}from'node:fs';import {resolve,sep}from'node:path';import {createHash}from'node:crypto';
const [manifest,directory,output]=process.argv.slice(2);if(!manifest||!directory||!output)throw Error('Usage: node scripts/verify-catalog-assets.mjs manifest.json asset-directory report.json');
const root=resolve(directory),rows=JSON.parse(readFileSync(manifest,'utf8')),report=[];
for(const row of rows){const path=resolve(root,row.storage_path);if(!path.startsWith(root+sep)||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Unsafe manifest path');
 if(!existsSync(path)){report.push({sha256:row.sha256,path:row.storage_path,status:'missing'});continue;}
 const bytes=readFileSync(path),digest=createHash('sha256').update(bytes).digest('hex');report.push({sha256:row.sha256,path:row.storage_path,status:bytes.length===Number(row.bytes)&&digest===row.sha256?'verified':'mismatch'});
}
writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({total:report.length,verified:report.filter(v=>v.status==='verified').length,missing:report.filter(v=>v.status==='missing').length,mismatch:report.filter(v=>v.status==='mismatch').length}));if(report.some(v=>v.status!=='verified'))process.exitCode=1;
