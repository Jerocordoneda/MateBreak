// One bounded execution. No timer, scheduler, HTTP admin trigger or auto-drain.
import {loadConfig} from './config/environment.mjs';
import {createApp} from './app.mjs';
import {reconcileOnce} from './jobs/reconcile-payments.mjs';
import {workerAlert} from './jobs/monitor.mjs';
const action=process.argv[2];if(!['email-once','payment-once','payment-scan','status'].includes(action))throw Error('Choose email-once, payment-once, payment-scan or status');
const {config}=loadConfig(),{admin,workers,providers}=createApp(config);
if(action==='email-once')console.log(JSON.stringify({processed:await workers.runEmailOnce()}));
if(action==='payment-once')console.log(JSON.stringify({processed:await reconcileOnce({admin,provider:providers.webhook,enabled:config.reconciliationEnabled})}));
if(action==='payment-scan'){if(!config.reconciliationEnabled||!providers.webhook.ready)throw Error('Reconciliation disabled');const r=await admin.rpc('mb_seed_payment_reconciliation',{p_limit:100});if(r.error)throw Error('Reconciliation scan failed');console.log(JSON.stringify({queued:r.data}));}
if(action==='status'){const r=await admin.rpc('mb_worker_status');if(r.error)throw Error('Worker status unavailable');console.log(JSON.stringify({...r.data,alert:workerAlert(r.data)}));}
