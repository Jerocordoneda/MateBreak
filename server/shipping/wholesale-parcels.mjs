import {createHash} from 'node:crypto';
import {dimensions,numericPrice} from './correo-argentino.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Operator preparation only. Does not turn a wholesale request into a paid order,
// alter retail packing, quote, persist or import anything at the carrier.
export function confirmWholesaleParcels({orderId,actorId,measuredAt,parcels,merchandiseValue,environment='test'},now=Date.now()) {
 if(!uuid.test(orderId||'')||!uuid.test(actorId||'')||!['test','production'].includes(environment)||!Number.isFinite(Date.parse(measuredAt))||Date.parse(measuredAt)>now||now-Date.parse(measuredAt)>7*86400000||!Array.isArray(parcels)||parcels.length<1||parcels.length>20||numericPrice(merchandiseValue)===null||merchandiseValue<=0||Math.abs(Number(merchandiseValue)*100-Math.round(Number(merchandiseValue)*100))>0.00001)throw Error('Confirmación de bultos inválida');
 const cents=Math.round(Number(merchandiseValue)*100),n=parcels.length;
 const prepared=parcels.map((p,i)=>({parcelNumber:i+1,extOrderId:`MB-${orderId}-${i+1}`,dimensions:dimensions(p),declaredValue:(Math.floor(cents/n)+(i<cents%n?1:0))/100}));
 const result={version:1,kind:'wholesale-manual',orderId,actorId,measuredAt:new Date(measuredAt).toISOString(),environment,parcels:prepared};
 return {...result,digest:createHash('sha256').update(JSON.stringify(result)).digest('hex')};
}
