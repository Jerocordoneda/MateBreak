// Labels, canonical values and carrier codes all come from the backend.
export function populateProvinces(catalog,destination,pickup){
 if(!Array.isArray(catalog)||catalog.length!==24||new Set(catalog.map(p=>p.code)).size!==24||
   catalog.some(p=>typeof p.name!=='string'||!p.name||!/^[A-Z]$/.test(p.code)))throw Error('No pudimos verificar el catálogo de provincias. Volvé a intentar.');
 for(const [select,carrier] of [[destination,false],[pickup,true]]){
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Elegí una provincia';
  select.replaceChildren(placeholder);
  for(const p of catalog){const option=document.createElement('option');option.value=carrier?p.code:p.name;option.textContent=p.code==='C'?'CABA · Ciudad Autónoma de Buenos Aires':p.name;select.append(option);}
  select.disabled=false;
 }
}
