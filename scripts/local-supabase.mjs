// Supabase CLI is used only for disposable local services. No arbitrary CLI
// flags are forwarded, so a linked project cannot become a reset target.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const config = resolve(root, 'supabase/config.toml');
const cli = resolve(root, 'node_modules/supabase/dist/supabase.js');
const commands = {
  start: ['start'],
  stop: ['stop', '--project-id', 'matebreak-local-tests'],
  status: ['status', '--output', 'json'],
  reset: ['db', 'reset', '--local', '--no-seed'],
};

export function assertLocalConfiguration(configText, dotenvText = '') {
  const section = name => configText.match(new RegExp(`^\\[${name}\\]([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm'))?.[1] ?? '';
  if (!/^project_id\s*=\s*"matebreak-local-tests"\s*$/m.test(configText) ||
      !/^port\s*=\s*54321\s*$/m.test(section('api')) ||
      !/^port\s*=\s*54322\s*$/m.test(section('db'))) {
    throw Error('La configuración local de Supabase no coincide con los puertos y proyecto esperados.');
  }
  for (const line of dotenvText.split(/\r?\n/)) {
    const match = line.match(/^\s*(SUPABASE_URL|SUPABASE_DB_URL|DATABASE_URL|POSTGRES_URL)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    let url;
    try { url = new URL(match[2].replace(/^['"]|['"]$/g, '')); }
    catch { throw Error(`${match[1]} inválida en .env; se detiene por seguridad.`); }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !['54321', '54322'].includes(url.port)) {
      throw Error(`${match[1]} apunta fuera del Supabase local; se detiene por seguridad.`);
    }
  }
}

export function runLocalCommand(command) {
  if (!Object.hasOwn(commands, command)) throw Error('Comando local no permitido.');
  if (!existsSync(config) || !existsSync(cli)) throw Error('Falta supabase/config.toml o npm install.');
  const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', windowsHide: true });
  if (docker.status !== 0) throw Error('Docker Desktop no está instalado o no está iniciado.');
  assertLocalConfiguration(readFileSync(config, 'utf8'),
    (existsSync(resolve(root, '.env')) ? readFileSync(resolve(root, '.env'), 'utf8') : '') + '\n' +
    Object.entries(process.env).filter(([key,value]) => value && /^(SUPABASE_URL|SUPABASE_DB_URL|DATABASE_URL|POSTGRES_URL)$/.test(key))
      .map(([key,value]) => `${key}=${value}`).join('\n'));
  if (command === 'reset' && Object.entries(process.env).some(([key,value]) => value
    && /^(SUPABASE_.*KEY|SUPABASE_ACCESS_TOKEN|PGPASSWORD|MP_|MERCADOPAGO_|CORREO_)/.test(key)))
    throw Error('Inherited credentials/provider configuration are forbidden in local reset.');
  const existing = spawnSync('docker', ['inspect','supabase_db_matebreak-local-tests','--format','{{json .Config.Labels}}'],
    { encoding:'utf8', windowsHide:true });
  if (existing.status === 0) {
    const labels=JSON.parse(existing.stdout);
    if (labels['com.supabase.cli.project']!=='matebreak-local-tests'
      || resolve(labels['com.supabase.cli.workdir']||'')!==root)
      throw Error('The running Supabase stack belongs to another worktree.');
  }
  // Local CLI operations need no real provider or Supabase credentials.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(SUPABASE_|MP_|MERCADOPAGO_|CORREO_|DATABASE_URL$|POSTGRES_URL$|OPENAI_API_KEY$)/.test(key)));
  const child = spawnSync(process.execPath, [cli, ...commands[command], '--workdir', root],
    { cwd: root, env, stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', windowsHide: true });
  if (child.error) throw child.error;
  if (child.stdout?.trim()) {
    try {
      const result = JSON.parse(child.stdout);
      if (child.status !== 0 && result.error)
        console.error(`Local CLI failed: ${result.error.code || 'unknown'}: ${String(result.error.message || '').split('\n')[0].slice(0,200)}`);
      // Whitelist public service endpoints/status; never print generated keys.
      console.log(JSON.stringify(Object.fromEntries(Object.entries(result).filter(([key]) =>
        ['API_URL','REST_URL','STUDIO_URL','MAILPIT_URL','INBUCKET_URL','target','version','message'].includes(key))), null, 2));
    } catch { console.log('Local CLI completed; credential-bearing output withheld.'); }
  }
  if (child.status !== 0) process.exitCode = child.status || 1;
  if (command === 'start' && child.status === 0) {
    const published = spawnSync('docker', ['ps', '--filter', 'label=com.supabase.cli.project=matebreak-local-tests', '--format', '{{.Ports}}'],
      {encoding:'utf8', windowsHide:true});
    if (published.status !== 0 || /0\.0\.0\.0:|\[::\]:|:::/.test(published.stdout)) {
      console.warn('WARNING: Supabase local publica puertos en 0.0.0.0/:: o no se pudo verificar su bind. No dejar el stack abierto permanentemente en una red no confiable. Al finalizar desarrollo/tests ejecutar npm run supabase:stop.');
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try { runLocalCommand(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
