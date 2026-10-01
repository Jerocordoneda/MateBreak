// Offline audit: no server is imported, no provider or database is contacted.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';

const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' }).trim().split('\n'))].sort();
const sources = files.filter(file => /\.(mjs|js)$/.test(file));
const dependencies = {};
const missing = [];
for (const file of sources) {
  dependencies[file] = [];
  const imports = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g;
  for (const match of readFileSync(file, 'utf8').matchAll(imports)) {
    if (!match[1].startsWith('.')) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    dependencies[file].push(target);
    if (!existsSync(target)) missing.push({ file, import: match[1] });
  }
}
const cycles = [];
const done = new Set();
function visit(file, stack = []) {
  if (stack.includes(file)) {
    cycles.push([...stack.slice(stack.indexOf(file)), file]);
    return;
  }
  if (done.has(file)) return;
  for (const target of dependencies[file] || []) visit(target, [...stack, file]);
  done.add(file);
}
for (const file of sources) visit(file);

// String route registrations are inventoried here. Arrays/dynamic private-UI
// registrations are also verified by tests/refactor-http + existing private UI tests.
const routes = sources.flatMap(file => [...readFileSync(file, 'utf8')
  .matchAll(/app\.(get|post|put|delete|use)\(\s*(['"])([^'"]+)\2/g)]
  .map(match => ({ file, method: match[1], path: match[3] })));
const privateAssets = {
  '/interno/inventario/style.css': 'server/private-ui/inventory.css',
  '/interno/inventario/app.js': 'server/private-ui/inventory.js',
  '/interno/logistica/style.css': 'server/private-ui/logistics.css',
  '/interno/logistica/app.js': 'server/private-ui/logistics.js',
};
const missingAssets = [];
for (const file of files.filter(file => file.endsWith('.html'))) {
  const resources = /<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/g;
  for (const match of readFileSync(file, 'utf8').matchAll(resources)) {
    if (/^(https?:|\/\/|data:)/.test(match[1])) continue;
    const spec = match[1].split(/[?#]/)[0];
    const target = privateAssets[spec] || (spec.startsWith('/') ? spec.slice(1) :
      path.posix.join(path.posix.dirname(file), spec));
    if (!existsSync(target)) missingAssets.push({ file, target });
  }
}
const migrations = Object.fromEntries(files.filter(file => file.startsWith('supabase/migrations/'))
  .map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const report = {
  files,
  largeFiles: sources.map(file => ({ file, lines: readFileSync(file, 'utf8').split('\n').length }))
    .filter(entry => entry.lines > 180).sort((a, b) => b.lines - a.lines),
  dependencies, cycles, missing, missingAssets, routes,
  scripts: JSON.parse(readFileSync('package.json')).scripts,
  migrations,
};
const stage = process.argv[2] || 'after';
if (!['before', 'after'].includes(stage)) throw Error('Expected before or after');
mkdirSync('docs/refactor', { recursive: true });
if (stage === 'before' && existsSync('docs/refactor/before.json'))
  throw Error('Before snapshot already exists; preserve the original audit');
if (stage === 'after') {
  const before = JSON.parse(readFileSync('docs/refactor/before.json'));
  if (JSON.stringify(before.migrations) !== JSON.stringify(migrations))
    throw Error('Historical migration hashes changed');
  const key = route => route.method + ' ' + route.path;
  const lost = before.routes.filter(route => !routes.some(current => key(current) === key(route)));
  if (lost.length) throw Error('Missing routes: ' + JSON.stringify(lost));
  for (const [name, command] of Object.entries(before.scripts))
    if (report.scripts[name] !== command) throw Error('Changed npm interface: ' + name);
  if (missing.length || cycles.length || missingAssets.length)
    throw Error('Broken imports, assets or dependency cycles: ' + JSON.stringify({ missing, cycles, missingAssets }));
}
writeFileSync(`docs/refactor/${stage}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ stage, files: files.length, cycles, missing, missingAssets,
  routes: routes.length, migrations: Object.keys(migrations).length }));
