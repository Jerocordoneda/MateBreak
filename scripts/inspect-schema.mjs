import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, mustSql } from './local-test-runtime.mjs';

const query = readFileSync(resolve(root, 'scripts/sql/schema-metadata.sql'), 'utf8');
if (process.argv[2] === '--query') {
  // For a read-only remote metadata connector; no remote connection or key here.
  console.log(query);
} else if (!process.argv[2] || process.argv[2] === '--local') {
  const metadata = JSON.parse(await mustSql(query));
  writeFileSync(resolve(root, 'docs/schema-metadata/local-final-reference.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, v.length]))));
} else throw Error('Use --local or --query; remote SQL execution is not implemented.');
