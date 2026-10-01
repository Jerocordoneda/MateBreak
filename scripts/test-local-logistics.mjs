import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,mustSql} from './local-test-runtime.mjs';
const fixture=readFileSync(resolve(root,'supabase/tests/fixtures/local-members.sql'),'utf8');
const tests=readFileSync(resolve(root,'supabase/tests/logistics/snapshots.sql'),'utf8');
await mustSql(tests.replace('begin;','begin;\n'+fixture));
console.log('PASS logistics SQL: fingerprints, ownership, expiry, immutable snapshots, paid multi-parcel claims; admin role/proof/idempotency, active/abandoned claims, retry limit, finite date, immutable audit and financial isolation.');
