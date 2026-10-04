import {mkdirSync,writeFileSync} from 'node:fs';
import {renderAuthTemplate} from '../server/email/auth-templates.mjs';
const origin=process.argv[2];if(!origin)throw Error('Pass the exact approved HTTPS brand origin; this script writes files only.');
mkdirSync(new URL('../docs/email-templates/',import.meta.url),{recursive:true});
for(const kind of ['confirmation','recovery']){
 const result=renderAuthTemplate({kind,origin});
 writeFileSync(new URL('../docs/email-templates/'+kind+'.html',import.meta.url),result.html+'\n');
 writeFileSync(new URL('../docs/email-templates/'+kind+'-subject.txt',import.meta.url),result.subject+'\n');
}
console.log('Prepared local Auth templates; nothing uploaded or sent.');
