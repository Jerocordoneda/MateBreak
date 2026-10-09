import {OFFICIAL_TRACKING_URL} from '../email/templates.mjs';
export function createMockTracking(){return {mock:true,async lookup(){return {state:'unavailable',verified:false};}};}
// Interface prepared for an officially documented provider adapter. No real
// credentials, polling timer or transport requests are introduced here.
export async function recordVerifiedDispatch({admin,adapter,orderId,tracking}){
 if(adapter?.mock)throw Error('Mock tracking cannot announce a real dispatch');
 if(typeof tracking!=='string'||!/^[A-Z0-9]{8,30}$/.test(tracking))throw Error('Invalid tracking');
 const result=await adapter.lookup(tracking);
 if(!result?.verified||result.orderId!==orderId||result.tracking!==tracking||!['accepted','in_transit','delivered'].includes(result.state))
  throw Error('Provider has not verified dispatch');
 const saved=await admin.rpc('mb_record_verified_dispatch',{p_order_id:orderId,p_tracking:tracking,p_state:result.state});
 if(saved.error)throw Error('Verified dispatch could not be persisted');
 return {tracking,url:OFFICIAL_TRACKING_URL};
}
