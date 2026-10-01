// Build never changes Vercel routing: the root config is resolved before build.
import {readFileSync} from 'node:fs';
import {assertStagingVercelReady} from './staging-config.mjs';
const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
assertStagingVercelReady(config,process.env.STAGING_BACKEND_ORIGIN);
await import('./build-frontend.mjs');
console.log('PASS staging build: reviewed root proxy configuration matches backend origin');
