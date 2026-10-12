// Serialize read/modify/write operations so cards and detail share the existing cart.
let pending=Promise.resolve();
export function addCartItem(variantId,units=1,personalization){
  const operation=pending.then(async()=>{
    const current=await fetch('/api/carrito',{credentials:'same-origin'});
    if(!current.ok)throw Error('No se pudo recuperar el carrito');
    const cart=await current.json(),old=cart.items.find(i=>String(i.variante_id)===String(variantId));
    const response=await fetch('/api/carrito/variantes/'+encodeURIComponent(variantId),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({cantidad:(old?.cantidad||0)+units,...(personalization!==undefined?{personalizacion:personalization}:{})})});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'No pudimos agregar el producto');
    window.dispatchEvent(new CustomEvent('mb:cart',{detail:result.items.reduce((n,i)=>n+i.cantidad,0)}));
    return result;
  });
  pending=operation.catch(()=>{});return operation;
}
export function directCardVariant(product){
  if(!product||product.atributos?.personalizable_explicitamente||/personaliz|cre[aá].*dise[ñn]o/i.test(product.nombre||'')||product.opciones?.length||product.variantes?.length!==1)return null;
  return product.variantes[0];
}
