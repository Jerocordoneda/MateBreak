// Read-only comparison with the approved local base; no Cloud clients or data.
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import assert from'node:assert/strict';
const root=new URL('../',import.meta.url),base='cf1df3703e4bb7ffe6909bf0f5487d1c17408020',sha=b=>createHash('sha256').update(b).digest('hex');
const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:20*1024*1024});
const files=git(['ls-tree','-r','--name-only',base,'supabase/migrations']).toString().trim().split(/\r?\n/);assert.equal(files.length,28);const manifest=[];
for(const file of files){const body=readFileSync(new URL(file,root));assert.equal(sha(body),sha(git(['cat-file','--filters',base+':'+file])),'Approved physical migration changed: '+file);manifest.push({file,sha256:sha(body)});}
const previous=JSON.parse(git(['show',base+':docs/schema-metadata/migration-equivalence.json'])),current=JSON.parse(readFileSync(new URL('docs/schema-metadata/migration-equivalence.json',root)));assert.deepEqual(current.slice(0,28),previous);assert.equal(current.length,29);
const file='supabase/migrations/20261003202124_wholesale_requests.sql';manifest.push({file,sha256:sha(readFileSync(new URL(file,root)))});
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(manifest,null,2)+'\n');
console.log('PASS 28 approved physical SQL hashes and equivalence entries unchanged; one new local migration; total 29');
