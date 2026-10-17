// Use Motion's reviewed, self-contained browser distribution: no runtime CDN,
// React, bundler, or AI/MCP tooling is shipped to visitors.
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
const require = createRequire(import.meta.url);
const packagePath = require.resolve('motion/package.json');
const {version} = JSON.parse(readFileSync(packagePath, 'utf8'));
if (version !== '14.3.0') throw new Error('Review the Motion distribution before updating its public asset.');
const target = new URL('../src/js/vendor/', import.meta.url);
mkdirSync(target, {recursive: true});
copyFileSync(resolve(dirname(packagePath), 'dist/motion.js'), new URL(`motion-${version}.js`, target));
copyFileSync(resolve(dirname(packagePath), 'LICENSE.md'), new URL('motion-LICENSE.md', target));
console.log(`Built local Motion ${version} browser asset`);
