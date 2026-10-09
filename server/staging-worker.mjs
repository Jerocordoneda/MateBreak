// Explicit staging-only worker. No allowReal switch exists in this entrypoint.
import {createClient} from '@supabase/supabase-js';
import {loadConfig} from './config/environment.mjs';
import {createMockShipping} from './shipping/mock.mjs';
import {runShipmentJob} from './shipping/jobs.mjs';
const {config}=loadConfig();
if(!config.staging || !config.stagingPersistMock)throw Error('Worker requires persisted staging mocks');
const admin=createClient(config.url,config.secret,{auth:{persistSession:false,autoRefreshToken:false}});
const provider=createMockShipping();
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
while(!stopping){
 try {const result=await runShipmentJob({admin,provider});if(result.processed)console.log(JSON.stringify({kind:'staging_worker',state:result.state}));}
 catch {console.error(JSON.stringify({kind:'staging_worker',error:'job_failed'}));}
 if(!stopping)await new Promise(resolve=>setTimeout(resolve,5000));
}
