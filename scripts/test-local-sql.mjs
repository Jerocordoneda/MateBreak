import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, mustSql } from './local-test-runtime.mjs';

const fixture = readFileSync(resolve(root, 'supabase/tests/fixtures/local-members.sql'), 'utf8');
// Historical scenarios predate live-session RLS. Supply confirmed synthetic
// sessions inside their rollback transaction, without weakening any policy or
// changing the historical assertions/actors. Never execute this against Cloud.
const withLiveTestSessions = sql => sql
  .replace(/insert into auth\.users\b[^;]+;/gi, statement => statement + `
update auth.users set email_confirmed_at=now() where email_confirmed_at is null;
insert into auth.sessions(id,user_id) select id,id from auth.users on conflict(id) do nothing;
`)
  .replace(/select set_config\('request\.jwt\.claim\.sub'[^;]+;/gi, statement => statement + `
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
`);
// These three guest files run together in test-guest-sql.mjs, against its
// separately owned disposable database. Preserve all 18 historical scenarios.
const guestScenarioFiles = new Set(['guest-fixture.sql', 'guest-checkout.sql', 'guest-commerce-regression.sql']);
const files = readdirSync(resolve(root, 'supabase/tests')).filter(f => f.endsWith('.sql') && !guestScenarioFiles.has(f)).sort();
if (files.length !== 18) throw Error('Expected all 18 historical SQL tests.');
for (const file of files) {
  const source = readFileSync(resolve(root, 'supabase/tests', file), 'utf8');
  const transactional = /\bbegin\s*;/i.test(source);
  if (transactional && !/\brollback\s*;/i.test(source)) throw Error(`Missing rollback boundary: ${file}`);
  await mustSql(withLiveTestSessions(transactional ? source.replace(/\bbegin\s*;/i, 'begin;\n' + fixture)
    : 'begin;\n' + fixture + source + '\nrollback;'));
  console.log(`PASS ${file}`);
}
console.log('Historical SQL: 18/18 passed (synthetic fixtures, rolled back).');
