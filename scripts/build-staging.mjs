// Build never changes Vercel routing: the root config is resolved before build.
import {readFileSync} from 'node:fs';
import {assertStagingVercelReady} from './staging-config.mjs';
const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
// Snapshot the keys immediately after parsing the physical file, before the
// guard evaluates the object. Diagnostics never include source text or values.
const fileRootKeys=config&&typeof config==='object'&&!Array.isArray(config)?Object.keys(config):null;
assertStagingVercelReady(config,process.env.STAGING_BACKEND_ORIGIN,fileRootKeys);
await import('./build-frontend.mjs');
console.log('PASS staging build: reviewed root proxy configuration matches backend origin');
