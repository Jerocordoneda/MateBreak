// Approved operational gross estimates: products plus packaging, cm / grams.
import { withinAdmissionLimits } from './carrier-limits.mjs';
import { dimensions } from './correo-argentino.mjs';
export const MATE_BOX = Object.freeze({ length:17, width:17, height:17, weight:550 });
export const SET_BOX = Object.freeze({ length:30, width:30, height:20, weight:1300 });
const MAX_PARCELS = 20; // Transport/import contract; retail planning below allows at most two.
const retailProfiles = [
 { mates:1, sets:0, dimensions:MATE_BOX },
 { mates:2, sets:0, dimensions:{ ...MATE_BOX, length:34, weight:1100 } },
 { mates:0, sets:1, dimensions:SET_BOX },
 { mates:0, sets:2, dimensions:{ ...SET_BOX, weight:2600 } },
];
const volume = p => p.length * p.width * p.height;
function validDimensions(value) { try { const parcel=dimensions(value); return withinAdmissionLimits(parcel)?parcel:null; } catch { return null; } }
export function packagingDecision(items, products, verifiedProfiles = {}, approvedRetailProfiles = []) {
 if (!Array.isArray(items) || !items.length) return {status:'empty', packages:null};
 const byId = new Map(products.map(p => [String(p.id),p]));
 let mates=0, sets=0;
 for (const item of items) {
  const quantity=Number(item.cantidad), product=byId.get(String(item.producto_id));
  if (!Number.isSafeInteger(quantity) || quantity<1 || !product) return {status:'invalid',packages:null};
  const categories=product.categorias||[];
  if(product.tipo==='combo' && categories.some(c=>c.startsWith('set-')))sets+=quantity;
  else if(product.tipo==='simple' && categories.some(c=>c==='mates'||c.startsWith('mates-')))mates+=quantity;
  else if(items.length===1 && quantity===1 && verifiedProfiles[String(item.producto_id)]) {
   const box=validDimensions(verifiedProfiles[String(item.producto_id)]);
   return box?{status:'automatic',packages:[box]}:{status:'manual',packages:null};
  } else return {status:'manual',packages:null};
 }
 if(!Number.isSafeInteger(mates)||!Number.isSafeInteger(sets))return {status:'invalid',packages:null};
 // Additional profiles are server-owned physical approvals, never capacities extrapolated from volume.
 const profiles=[...retailProfiles,...(Array.isArray(approvedRetailProfiles)?approvedRetailProfiles:[])].filter(p=>
  Number.isSafeInteger(p.mates) && Number.isSafeInteger(p.sets) && p.mates>=0 && p.sets>=0 && p.mates+p.sets>0 &&
  validDimensions(p.dimensions)).sort((a,b)=>b.sets-a.sets || b.mates-a.mates);
 const candidates=[];
 for(const p of profiles) {
  if(p.mates===mates && p.sets===sets)candidates.push([{...p.dimensions}]);
  for(const q of profiles)if(p.mates+q.mates===mates && p.sets+q.sets===sets)candidates.push([{...p.dimensions},{...q.dimensions}]);
 }
 candidates.sort((a,b)=>a.length-b.length || a.reduce((s,p)=>s+volume(p),0)-b.reduce((s,p)=>s+volume(p),0));
 return candidates.length?{status:'automatic',packages:candidates[0]}:{status:'manual',packages:null};
}
// Compatibility: callers that only need dimensions keep the established null/array contract.
export function planPackages(items, products, verifiedProfiles = {}, approvedRetailProfiles = []) {
 return packagingDecision(items,products,verifiedProfiles,approvedRetailProfiles).packages;
}

// MiCorreo /rates accepts one set of dimensions per request. Quote each
// physical parcel and add only prices returned for the same provider service.
export async function quotePackages(provider, { destinationPostalCode, deliveryType, packages }) {
  if (!Array.isArray(packages) || !packages.length || packages.length > MAX_PARCELS) throw Error('Embalaje no disponible');
  const quotations = await Promise.all(packages.map(dimensions =>
    provider.quote({ destinationPostalCode, deliveryType, dimensions })));
  let common = new Map(quotations[0].map(rate => [rate.service, {
    ...rate, costCents: Math.round(Number(rate.carrierCost) * 100), expires: Date.parse(rate.validTo),
    parcels: [{ dimensions: packages[0], carrierCost: rate.carrierCost }],
  }]));
  for (const [index, rates] of quotations.slice(1).entries()) {
    const byService = new Map(rates.map(rate => [rate.service, rate]));
    common = new Map([...common].flatMap(([service, total]) => {
      const rate = byService.get(service), cents = Math.round(Number(rate?.carrierCost) * 100);
      const expires = Date.parse(rate?.validTo);
      return rate && Number.isSafeInteger(cents) && cents >= 0 && Number.isFinite(expires)
        ? [[service, { ...total, costCents: total.costCents + cents, expires: Math.min(total.expires, expires),
          parcels: [...total.parcels, { dimensions: packages[index + 1], carrierCost: rate.carrierCost }] }]] : [];
    }));
  }
  return [...common.values()].filter(rate => rate.service && Number.isSafeInteger(rate.costCents) &&
    rate.costCents >= 0 && Number.isFinite(rate.expires) && rate.expires > Date.now()).map(rate => ({
    provider: rate.provider, service: rate.service, name: rate.name,
    carrierCost: rate.costCents / 100, validTo: new Date(rate.expires).toISOString(),
    packageCount: packages.length, parcels: rate.parcels,
  }));
}
