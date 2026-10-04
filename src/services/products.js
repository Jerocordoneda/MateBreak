let pending;
// One shared request per page. Failed requests can be retried.
export async function getProducts() {
  if(!pending)pending=fetch('/api/productos',{credentials:'same-origin',signal:AbortSignal.timeout(20000)}).then(async r=>{if(!r.ok)throw Error('No pudimos cargar el catálogo. Intentá nuevamente.');return r.json();}).catch(e=>{pending=null;if(e.name==='TimeoutError')throw Error('El catálogo está demorando. Volvé a intentar en unos segundos.');throw e;});
  return pending;
}
export const getFeaturedProducts=async()=> (await getProducts()).filter(p=>p.destacado);
export const getProductsByCategory=async slug=>(await getProducts()).filter(p=>p.categorias.some(c=>c.slug===slug));
export const getProductBySlug=async slug=>(await getProducts()).find(p=>p.slug===slug)||null;
const normalize=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
export const searchProducts=async term=>(await getProducts()).filter(p=>normalize(p.nombre+' '+p.descripcion).includes(normalize(term)));
export const money=(value,currency='ARS')=>value==null?'Consultar precio':new Intl.NumberFormat('es-AR',{style:'currency',currency,currencyDisplay:'code'}).format(value);
export function bestInstallment(plans) {
  return Object.values(plans||{}).flatMap(method=>Object.entries(method).map(([count,p])=>({...p,count:Number(count)})))
    .filter(p=>p.count>1&&p.without_interests).sort((a,b)=>b.count-a.count)[0]||null;
}
