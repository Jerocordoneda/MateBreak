import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertLocalConfiguration } from './local-supabase.mjs';

export const root = resolve(import.meta.dirname, '..');
export const localContainer = 'supabase_db_matebreak-local-tests';
export const disposableContainer = 'matebreak-disposable-tests';
export function assertLocalTests() {
  assertLocalConfiguration(readFileSync(resolve(root, 'supabase/config.toml'), 'utf8'),
    existsSync(resolve(root, '.env')) ? readFileSync(resolve(root, '.env'), 'utf8') : '');
  for (const [name, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (/^(MP_|MERCADOPAGO_|CORREO_)/.test(name)) throw Error('Provider credentials/configuration are forbidden in local tests.');
    if (/^(SUPABASE_.*KEY|SUPABASE_ACCESS_TOKEN|PGPASSWORD)$/.test(name)) throw Error('Tests discover local keys; inherited credentials are forbidden.');
    if (/^(SUPABASE_URL|SUPABASE_DB_URL|DATABASE_URL|POSTGRES_URL)$/.test(name)) {
      const u = new URL(value);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
        || !['54321', '54322'].includes(u.port)) throw Error('Remote test target refused.');
    }
  }
}
export function checkContainer(name) {
  assertLocalTests();
  if (![localContainer, disposableContainer].includes(name)) throw Error('Unrecognized local test container.');
  const r = spawnSync('docker', ['inspect', name, '--format', '{{json .Config.Labels}}'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error('Local test container unavailable.');
  const labels = JSON.parse(r.stdout);
  if (name === localContainer ? labels['com.supabase.cli.project'] !== 'matebreak-local-tests'
    || resolve(labels['com.supabase.cli.workdir'] || '') !== root
    : labels['matebreak.test'] !== 'disposable' || resolve(labels['matebreak.workdir'] || '') !== root)
    throw Error('Container is not owned by this local test worktree.');
}
export function sqlQuery(sql, { container = localContainer, database = 'postgres', user = 'postgres' } = {}) {
  if (container === localContainer && (database !== 'postgres' || user !== 'postgres')) throw Error('Local Supabase SQL target must be application postgres.');
  if (container === disposableContainer && (!/^matebreak_test_[a-z0-9_]+$/.test(database) || user !== 'supabase_admin')) throw Error('Invalid disposable database.');
  checkContainer(container);
  return new Promise(resolveResult => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('error', error => resolveResult({ ok: false, stdout, stderr: error.message }));
    child.on('close', code => resolveResult({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.on('error', () => {});
    child.stdin.end(sql + '\n');
  });
}
export async function mustSql(sql, options) {
  const r = await sqlQuery(sql, options);
  if (!r.ok) throw Error(r.stderr || 'Local SQL failed.');
  return r.stdout;
}
export function localStatus() {
  assertLocalTests(); checkContainer(localContainer);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(SUPABASE_|MP_|MERCADOPAGO_|CORREO_|DATABASE_URL$|POSTGRES_URL$|PG)/.test(k)));
  const r = spawnSync(process.execPath, [resolve(root, 'node_modules/supabase/dist/supabase.js'), 'status', '--output', 'json', '--workdir', root],
    { env, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error('Unable to discover local Supabase credentials.');
  const status = JSON.parse(r.stdout);
  if (status.API_URL !== 'http://127.0.0.1:54321' || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw Error('Unexpected local Supabase status.');
  return status;
}
