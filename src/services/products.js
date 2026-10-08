const pending=new Map();
async function readCatalog(url){
  if(!pending.has(url))pending.set(url,fetch(url,{credentials:'same-origin',signal:AbortSignal.timeout(20000)}).then(async r=>{if(r.status===404)return null;if(!r.ok)throw Error('No pudimos cargar el catálogo. Intentá nuevamente.');return r.json();}).catch(e=>{pending.delete(url);if(e.name==='TimeoutError')throw Error('El catálogo está demorando. Volvé a intentar en unos segundos.');throw e;}));
  return pending.get(url);
}
// Only public card data is reused across navigation for 15 seconds. No session,
// cart, quote or detail responses are stored; checkout always requotes on the server.
const cardsKey='matebreak-public-cards-v1',cardsLifetime=15000;
export async function getProducts(){
  try{const saved=JSON.parse(sessionStorage.getItem(cardsKey));if(saved&&Date.now()>=saved.time&&Date.now()-saved.time<cardsLifetime&&Array.isArray(saved.data))return saved.data;}catch{}
  const data=await readCatalog('/api/productos?view=cards');
  try{sessionStorage.setItem(cardsKey,JSON.stringify({time:Date.now(),data}));}catch{}
  // A later call on the same document must not renew an old fulfilled response.
  pending.delete('/api/productos?view=cards');
  return data;
}
if(typeof window!=='undefined')window.addEventListener('mb:cart',()=>{try{sessionStorage.removeItem(cardsKey);}catch{}pending.clear();});
export const getFeaturedProducts=async()=> (await getProducts()).filter(p=>p.destacado);
export const getProductsByCategory=async slug=>(await getProducts()).filter(p=>p.categorias.some(c=>c.slug===slug));
export const getProductBySlug=slug=>readCatalog('/api/productos/'+encodeURIComponent(slug));
const normalize=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
export const searchProducts=async term=>(await getProducts()).filter(p=>normalize(p.nombre+' '+p.descripcion).includes(normalize(term)));
const formatters=new Map();
export const money=(value,currency='ARS')=>{if(value==null)return 'Consultar precio';if(!formatters.has(currency))formatters.set(currency,new Intl.NumberFormat('es-AR',{style:'currency',currency,currencyDisplay:'code'}));return formatters.get(currency).format(value);};
export function bestInstallment(plans) {
  return Object.values(plans||{}).flatMap(method=>Object.entries(method).map(([count,p])=>({...p,count:Number(count)})))
    .filter(p=>p.count>1&&p.without_interests).sort((a,b)=>b.count-a.count)[0]||null;
}
