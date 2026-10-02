import { shippingProgress } from './policy.mjs';

const key = item => item.variante_id == null ? `p:${item.producto_id}` : `v:${item.variante_id}`;
// Keep legacy fields unchanged. The additive quotation is the same SQL pricing
// source used by checkout, before any payment-method discount or shipping.
export async function quoteCart(cart, admin) {
  if (!cart.items?.length) return { ...cart, cotizacion: {
    items: [], subtotal: 0, subtotal_original: 0, descuento_promocional: 0,
    moneda: cart.moneda || 'ARS', metodo_base: 'mercadopago', progress: shippingProgress(0),
  } };
  if (cart.requiere_confirmacion_catalogo || cart.items.some(item => item.activo === false))
    return { ...cart, cotizacion: null, error_cotizacion: 'Revisá los productos no disponibles antes de continuar.' };
  const { data: quote, error } = await admin.rpc('mb_cotizar_catalogo', { p_carrito_id: cart.id, p_pago: 'mercadopago' });
  const originals = new Map(cart.items.map(item => [key(item), item]));
  if (error || !quote || quote.moneda !== 'ARS' || !Array.isArray(quote.items) ||
      quote.items.length !== cart.items.length || !Number.isFinite(Number(quote.subtotal)) || Number(quote.subtotal) <= 0 ||
      new Set(quote.items.map(key)).size !== quote.items.length ||
      quote.items.some(item => !originals.has(key(item)) || item.cantidad !== originals.get(key(item)).cantidad ||
        !Number.isFinite(Number(originals.get(key(item)).precio)) || Number(originals.get(key(item)).precio) <= 0 ||
        !Number.isFinite(Number(item.precio_unitario)) || Number(item.precio_unitario) <= 0))
    return { ...cart, cotizacion: null, error_cotizacion: 'No pudimos confirmar el precio. Actualizá tu carrito antes de continuar.' };
  if(Math.round(quote.items.reduce((sum,item)=>sum+Number(item.precio_unitario)*item.cantidad,0)*100)!==Math.round(Number(quote.subtotal)*100))
    return { ...cart, cotizacion: null, error_cotizacion: 'No pudimos confirmar el precio. Actualizá tu carrito antes de continuar.' };
  const items = quote.items.map(item => {
    const original = originals.get(key(item));
    // A concurrent price rise must never show an original below the quote.
    const price = Math.max(Number(original.precio), Number(item.precio_unitario));
    return { ...item, precio_original: price, subtotal_original: Math.round(price * item.cantidad * 100) / 100,
      subtotal: Math.round(Number(item.precio_unitario) * item.cantidad * 100) / 100 };
  });
  const original = Math.round(items.reduce((sum, item) => sum + item.subtotal_original, 0) * 100) / 100;
  return { ...cart, cotizacion: { ...quote, items, metodo_base: 'mercadopago', subtotal_original: original,
    descuento_promocional: Math.round(Math.max(0, original - Number(quote.subtotal)) * 100) / 100,
    progress: shippingProgress(quote.subtotal) } };
}
