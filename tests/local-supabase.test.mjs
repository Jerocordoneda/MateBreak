import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalConfiguration } from '../scripts/local-supabase.mjs';

const config = 'project_id = "matebreak-local-tests"\n[api]\nport = 54321\n[db]\nport = 54322\n';

test('local Supabase guard accepts only loopback URLs on known local ports', () => {
 assert.doesNotThrow(() => assertLocalConfiguration(config,
  'SUPABASE_URL=http://127.0.0.1:54321\nDATABASE_URL=postgresql://postgres:local@localhost:54322/postgres'));
 for (const env of [
  'SUPABASE_URL=https://example.supabase.co',
  'SUPABASE_URL=http://127.0.0.1:54323',
  'DATABASE_URL=postgresql://postgres:local@192.168.1.5:54322/postgres',
  'SUPABASE_DB_URL=not-a-url',
 ]) assert.throws(() => assertLocalConfiguration(config, env), /se detiene por seguridad/);
 assert.throws(() => assertLocalConfiguration(config.replace('matebreak-local-tests','other')), /configuración local/);
 assert.throws(() => assertLocalConfiguration(config.replace('port = 54322','port = 64322')), /configuración local/);
});
