export const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function searchCatalog(products,query){
  const terms=normalizeSearch(query).split(' ').filter(Boolean);
  if(!terms.length)return [];
  return products.map((product,index)=>{
    const name=normalizeSearch(product.nombre);
    const text=normalizeSearch([product.nombre,product.descripcion,product.tipo,...(product.categorias||[]).flatMap(c=>[c.nombre,c.slug])].join(' '));
    return {product,index,text,score:terms.filter(t=>name.includes(t)).length};
  }).filter(p=>terms.every(t=>p.text.includes(t))).sort((a,b)=>b.score-a.score||a.index-b.index).map(p=>p.product);
}
