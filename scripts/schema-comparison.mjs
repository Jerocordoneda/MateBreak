// Metadata comparison preserves SQL literals; ACL ordering is immaterial.
export const sqlTokens = s => (s.replace(/\r/g, '').match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$[a-zA-Z_]*\$|[a-zA-Z_][a-zA-Z_0-9]*|\d+(?:\.\d+)?|[^\s]/g) || [])
  .filter(t => !t.startsWith('--') && !t.startsWith('/*'));
const key = x => [x.schema, x.table, x.name, x.arguments].filter(Boolean).join('.');
const normalize = (field, value) => field === 'definition' ? sqlTokens(value)
  : field === 'acl' && value ? value.slice(1, -1).split(',').sort() : value;
export function compareSchemas(reference, candidate) {
  const report = {};
  for (const category of Object.keys(reference)) {
    const a = new Map(reference[category].map(x => [key(x), x]));
    const b = new Map(candidate[category].map(x => [key(x), x]));
    report[category] = {
      referenceCount: a.size, candidateCount: b.size,
      missing: [...a.keys()].filter(k => !b.has(k)), added: [...b.keys()].filter(k => !a.has(k)),
      changed: [...a].filter(([k]) => b.has(k)).flatMap(([k, x]) => {
        const fields = [...new Set([...Object.keys(x), ...Object.keys(b.get(k))])]
          .filter(f => JSON.stringify(normalize(f, x[f])) !== JSON.stringify(normalize(f, b.get(k)[f])));
        return fields.length ? [{key:k, fields}] : [];
      }),
    };
  }
  return report;
}
export const equalSchemas = report => Object.values(report).every(x => !x.missing.length && !x.added.length && !x.changed.length);
