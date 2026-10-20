// A partial selection can preview matching variants, but only an exact, unique
// combination can be purchased. Prices remain display data; the server quotes the cart.
export function resolveProductSelection(product, values) {
  const chosen = product.opciones.filter(o => values[o.nombre]);
  const matches = product.variantes.filter(v => chosen.every(o => v.opciones[o.nombre] === values[o.nombre]));
  const complete = chosen.length === product.opciones.length;
  const variant = complete && matches.length === 1 ? matches[0] : null;
  const priced = matches.filter(v => Number.isFinite(v.precio)).sort((a,b) => a.precio-b.precio);
  return {variant, matches, preview:variant || priced[0] || matches[0] || null,
    model:chosen.filter(o => /modelo|material/i.test(o.nombre)).map(o => values[o.nombre]).join(' · ')};
}
