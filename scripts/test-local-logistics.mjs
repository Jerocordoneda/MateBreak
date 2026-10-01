import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,mustSql} from './local-test-runtime.mjs';
const fixture=readFileSync(resolve(root,'supabase/tests/fixtures/local-members.sql'),'utf8');
const tests=readFileSync(resolve(root,'supabase/tests/logistics/snapshots.sql'),'utf8');
await mustSql(tests.replace('begin;','begin;\n'+fixture));
console.log('PASS logistics SQL: fingerprints, ownership, expiry, immutable snapshot, paid-only multi-parcel claims, retries and financial isolation.');
