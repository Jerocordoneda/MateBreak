// Explicit backend job entry point, deliberately NOT scheduled by server/index.
// Mock only by default. A future real rollout must explicitly opt in after review.
export async function runShipmentJob({admin,provider,allowReal=false}) {
 if(!provider?.mock && !allowReal)throw Error('Importación real deshabilitada');
 if(!provider?.importShipment)throw Error('Proveedor sin importación');
 const environment=provider.mock?'mock':provider.environment;
 if(!['mock','test','production'].includes(environment))throw Error('Ambiente inválido');
 const {data:claim,error}=await admin.rpc('mb_claim_shipment',{p_environment:environment});
 if(error)throw Error('No se pudo tomar el trabajo logístico');
 if(!claim)return {processed:false};
 const snapshot=claim.snapshot;
 let result;
 try {
  if(snapshot.environment!==environment || (snapshot.customerId && snapshot.customerId!==provider.customerId))
    throw Object.assign(Error('Configuración del envío incompatible'),{type:'configuration_mismatch'});
  const imported=await provider.importShipment({extOrderId:claim.extOrderId,orderNumber:claim.orderId,
   sender:snapshot.sender,recipient:snapshot.recipient,
   shipping:{deliveryType:snapshot.deliveryType,agency:snapshot.agency?.code,address:snapshot.address,
    ...claim.parcel.dimensions,declaredValue:claim.parcel.declaredValue}});
  if(typeof imported?.createdAt!=='string' || !Number.isFinite(Date.parse(imported.createdAt)))throw Object.assign(Error('Resultado ambiguo'),{type:'ambiguous'});
  result={state:'importado',createdAt:imported.createdAt};
 }catch(e) {
  const allowed=new Set(['ambiguous','already_imported','http','unauthorized','rate_limit','invalid_import','invalid_dimensions','configuration_mismatch','missing_api_credentials']);
  const errorType=allowed.has(e.type)?e.type:'ambiguous';
  // Only explicit 429 rejection is automatically retried (same extOrderId).
  // Other failures need operator review; no raw provider body ever persists.
  result={state:errorType==='rate_limit'&&e.status===429?'error':'revision',errorType,
   status:Number.isInteger(e.status)?e.status:null,
   requestId:/^[0-9a-f-]{36}$/.test(e.requestId||'')?e.requestId:null};
 }
 const finished=await admin.rpc('mb_finish_shipment',{p_claim_id:claim.claimId,p_result:result});
 if(finished.error)throw Error('No se pudo registrar el resultado; requiere conciliación');
 return {processed:true,state:result.state};
}
