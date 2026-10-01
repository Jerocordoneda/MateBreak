import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './local-test-runtime.mjs';
const dir = resolve(root, 'docs/schema-metadata');
const remote = JSON.parse(readFileSync(resolve(dir, 'remote-final-reference.json')));
const local = JSON.parse(readFileSync(resolve(dir, 'local-final-reference.json')));
const key = x => [x.schema, x.table, x.name, x.arguments].filter(Boolean).join('.');
// Compare SQL tokens, preserving string/quoted identifier contents. Formatting
// and comments differ between the Windows migration files and hosted definitions.
const tokens = s => (s.replace(/\r/g, '').match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$[a-zA-Z_]*\$|[a-zA-Z_][a-zA-Z_0-9]*|\d+(?:\.\d+)?|[^\s]/g) || [])
  .filter(t => !t.startsWith('--') && !t.startsWith('/*'));
const normalized = (field, value) => field === 'definition' ? tokens(value)
  : field === 'acl' && value ? value.slice(1, -1).split(',').sort() : value;
const report = {};
for (const category of Object.keys(remote)) {
  const a = new Map(remote[category].map(x => [key(x), x]));
  const b = new Map(local[category].map(x => [key(x), x]));
  report[category] = {
    remoteCount: a.size, localCount: b.size,
    missing: [...a.keys()].filter(k => !b.has(k)),
    added: [...b.keys()].filter(k => !a.has(k)),
    changed: [...a].filter(([k]) => b.has(k)).flatMap(([k, x]) => {
      const fields = Object.keys(x).filter(f => JSON.stringify(normalized(f, x[f])) !== JSON.stringify(normalized(f, b.get(k)[f])));
      return fields.length ? [{ key: k, fields }] : [];
    }),
  };
}
writeFileSync(resolve(dir, 'schema-diff.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
