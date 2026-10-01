import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, mustSql, disposableContainer } from './local-test-runtime.mjs';
const options = { container: disposableContainer, database: 'matebreak_test_privileges', user: 'supabase_admin' };
const count = await mustSql("select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema');", options);
if (Number(count) !== 0) throw Error('Privilege test requires its own empty disposable database.');
let sql = readFileSync(resolve(root, 'tests/security-privileges.sql'), 'utf8');
for (const [include, file] of [
  ['../supabase/migrations/20260929214717_harden_default_privileges.sql', 'supabase/migrations/20260929214717_harden_default_privileges.sql'],
  ['../supabase/platform/harden-admin-defaults.sql', 'supabase/platform/harden-admin-defaults.sql'],
]) sql = sql.replace('\\ir ' + include, readFileSync(resolve(root, file), 'utf8'));
if (/\\ir\s/.test(sql)) throw Error('Unrecognized SQL include.');
console.log(await mustSql(sql, options));
