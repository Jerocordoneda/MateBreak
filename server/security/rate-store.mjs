import {createHmac} from 'node:crypto';
// SQL gives every process the same atomic quota. IP/account identifiers are
// keyed hashes; no raw identifiers are persisted. Secret must survive restarts.
export function createSqlRateStore({admin,key}){
 if(typeof key!=='string'||! /^[a-f0-9]{64}$/.test(key))throw Error('RATE_LIMIT_KEY requires 32 bytes');
 return {async take({identity,category,limit}){
  const bucket=createHmac('sha256',Buffer.from(key,'hex')).update(category+'\0'+identity).digest('hex');
  const r=await admin.rpc('mb_security_rate_take',{p_bucket:bucket,p_limit:limit,p_seconds:60});
  if(r.error||typeof r.data?.allowed!=='boolean')throw Error('Shared quota unavailable');
  return r.data;
 }};
}
