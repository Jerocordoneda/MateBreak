// Local file preparation only. Never deploys or contacts the supplied backend.
import {writeFileSync} from 'node:fs';
import {createStagingVercelConfig,validateBackendOrigin} from './staging-config.mjs';
const origin=validateBackendOrigin(process.env.STAGING_BACKEND_ORIGIN);
writeFileSync(new URL('../vercel.json',import.meta.url),JSON.stringify(createStagingVercelConfig(origin),null,2)+'\n');
console.log('Prepared root vercel.json; review and commit before any approved deploy');
