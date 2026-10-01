import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, mustSql } from './local-test-runtime.mjs';

const fixture = readFileSync(resolve(root, 'supabase/tests/fixtures/local-members.sql'), 'utf8');
const files = readdirSync(resolve(root, 'supabase/tests')).filter(f => f.endsWith('.sql')).sort();
if (files.length !== 18) throw Error('Expected all 18 historical SQL tests.');
for (const file of files) {
  const source = readFileSync(resolve(root, 'supabase/tests', file), 'utf8');
  const transactional = /\bbegin\s*;/i.test(source);
  if (transactional && !/\brollback\s*;/i.test(source)) throw Error(`Missing rollback boundary: ${file}`);
  await mustSql(transactional ? source.replace(/\bbegin\s*;/i, 'begin;\n' + fixture)
    : 'begin;\n' + fixture + source + '\nrollback;');
  console.log(`PASS ${file}`);
}
console.log('Historical SQL: 18/18 passed (synthetic fixtures, rolled back).');
