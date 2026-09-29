// Warehouse packing policy. Dimensions are centimetres and weight is grams.
// These are operational estimates, not carrier prices or product weights.
export const MATE_BOX = Object.freeze({ length: 17, width: 17, height: 17, weight: 550 });
export const SET_BOX = Object.freeze({ length: 30, width: 30, height: 20, weight: 1300 });
const MAX_PARCELS = 20;

export function planPackages(items, products, verifiedProfiles = {}) {
  if (!Array.isArray(items) || !items.length) return null;
  const byId = new Map(products.map(product => [String(product.id), product]));
  let mates = 0, sets = 0;
  for (const item of items) {
    const quantity = Number(item.cantidad), product = byId.get(String(item.producto_id));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99 || !product) return null;
    const categories = product.categorias || [];
    if (product.tipo === 'combo' && categories.some(slug => slug.startsWith('set-'))) sets += quantity;
    else if (product.tipo === 'simple' && categories.some(slug => slug === 'mates' || slug.startsWith('mates-'))) mates += quantity;
    else if (items.length === 1 && quantity === 1 && verifiedProfiles[String(item.producto_id)]) {
      return [{ ...verifiedProfiles[String(item.producto_id)] }];
    } else return null;
  }

  const packages = [];
  // Two sets share the large-box footprint; only the estimated weight grows.
  while (sets > 0) {
    const units = Math.min(2, sets);
    packages.push({ ...SET_BOX, weight: SET_BOX.weight * units });
    sets -= units;
  }
  // Loose mates stay in their own small boxes. Two boxes taped together use
  // a stable 34 × 17 × 17 cm footprint, including in mixed orders.
  while (mates > 0) {
    const units = Math.min(2, mates);
    packages.push({ ...MATE_BOX, length: MATE_BOX.length * units, weight: MATE_BOX.weight * units });
    mates -= units;
  }
  return packages.length <= MAX_PARCELS ? packages : null;
}

// MiCorreo /rates accepts one set of dimensions per request. Quote each
// physical parcel and add only prices returned for the same provider service.
export async function quotePackages(provider, { destinationPostalCode, deliveryType, packages }) {
  if (!Array.isArray(packages) || !packages.length || packages.length > MAX_PARCELS) throw Error('Embalaje no disponible');
  const quotations = await Promise.all(packages.map(dimensions =>
    provider.quote({ destinationPostalCode, deliveryType, dimensions })));
  let common = new Map(quotations[0].map(rate => [rate.service, {
    ...rate, costCents: Math.round(Number(rate.carrierCost) * 100), expires: Date.parse(rate.validTo),
  }]));
  for (const rates of quotations.slice(1)) {
    const byService = new Map(rates.map(rate => [rate.service, rate]));
    common = new Map([...common].flatMap(([service, total]) => {
      const rate = byService.get(service), cents = Math.round(Number(rate?.carrierCost) * 100);
      const expires = Date.parse(rate?.validTo);
      return rate && Number.isSafeInteger(cents) && cents >= 0 && Number.isFinite(expires)
        ? [[service, { ...total, costCents: total.costCents + cents, expires: Math.min(total.expires, expires) }]] : [];
    }));
  }
  return [...common.values()].filter(rate => rate.service && Number.isSafeInteger(rate.costCents) &&
    rate.costCents >= 0 && Number.isFinite(rate.expires) && rate.expires > Date.now()).map(rate => ({
    provider: rate.provider, service: rate.service, name: rate.name,
    carrierCost: rate.costCents / 100, validTo: new Date(rate.expires).toISOString(),
    packageCount: packages.length,
  }));
}
