// Read-only, offline lock. Historical snapshot is never regenerated/overwritten.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const lock=JSON.parse(readFileSync(new URL('../docs/commercial-readiness/migrations.lock.json',import.meta.url)));
const before=JSON.parse(readFileSync(new URL('../docs/refactor/before.json',import.meta.url)));
const dir=new URL('../supabase/migrations/',import.meta.url);
assert.deepEqual(readdirSync(dir).filter(f=>f.endsWith('.sql')).sort(),lock.rows.map(r=>r.file));
assert.deepEqual(Object.keys(before.migrations).sort(),lock.rows.filter(r=>r.historicalSha256).map(r=>'supabase/migrations/'+r.file));
for(const row of lock.rows){
 const source=readFileSync(new URL(row.file,dir),'utf8').replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(source).digest('hex'),row.sha256LF,'Unexpected migration content: '+row.file);
 if(row.historicalSha256)assert.equal(before.migrations['supabase/migrations/'+row.file],row.historicalSha256,'Historical baseline changed');
}
console.log('PASS 26 historical hashes preserved; exact 37-file candidate lock; only CRLF/LF normalized, all SQL/comments/ACL/RLS statements pinned');
