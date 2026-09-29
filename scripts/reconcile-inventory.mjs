// Read-only inventory review: npm start, then
// node --env-file-if-exists=.env scripts/reconcile-inventory.mjs --out=docs/reconciliacion-variantes.csv
import fs from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';

const out=process.argv.find(arg=>arg.startsWith('--out='))?.slice(6);
const origin=process.argv.find(arg=>arg.startsWith('--origin='))?.slice(9)||'http://localhost:3000';
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key||!process.env.SUPABASE_URL)throw Error('Faltan credenciales de servicio en .env');
const db=createClient(process.env.SUPABASE_URL,key,{auth:{persistSession:false}});
const [catalogResponse,inventoryResponse,mappingsResponse]=await Promise.all([
  fetch(new URL('/api/productos',origin)),db.rpc('mb_inventario_reconciliacion'),
  db.from('catalogo_variante_mapeo').select('variante_id,aprobado'),
]);
if(!catalogResponse.ok)throw Error(`Catálogo HTTP ${catalogResponse.status}`);
if(inventoryResponse.error)throw Error(`Inventario: ${inventoryResponse.error.message}`);
if(mappingsResponse.error)throw Error(`Mappings: ${mappingsResponse.error.message}`);
const products=await catalogResponse.json();
const stock=new Map(inventoryResponse.data.map(row=>[row.sku,row]));
const approved=new Set(mappingsResponse.data.filter(row=>row.aprobado).map(row=>String(row.variante_id)));
const has=sku=>stock.has(sku);
const mateFor=options=>options['MODELO DE MATE']==='IMPERIAL DE CALABAZA'?'MB-IMP-CAL':
  options['MODELO DE MATE']==='IMPERIAL DE ALGARROBO'?'MB-IMP-ALG':'';
const excerpt=s=>String(s||'').replace(/\s+/g,' ').slice(0,220);
function classify(product,variant){
  const name=product.nombre,options=variant.opciones||{},matero=mateFor(options);
  const evidence=product.componentes.map(component=>component.evidencia).join(' | ')||product.descripcion;
  if(product.tipo==='combo'){
    return {clase:'B',sku:matero||'—',grupo:'combo_nuevo',
      motivo:'La composición de este combo aún no fue reconciliada por completo.',
      faltantes:'Revisar todos los componentes físicos y el color del termo publicado, si corresponde',evidencia:evidence};
  }
  if(name==='MATERA NEGRA ECOCUERO')return {
    clase:'B',sku:'MB-MATERA?',grupo:'matera',motivo:'El SKU Matera no especifica color negro ni ecocuero.',
    faltantes:'Confirmar que MB-MATERA es la matera negra de ecocuero',evidencia:evidence};
  if(name.startsWith('TERMO'))return {
    clase:'B',sku:name.includes('PLATEADO')?'MB-TER-PLA?':name.includes('NEGRO')?'MB-TER-NEG?':'MB-TER-NEG? / MB-TER-PLA?',
    grupo:'termos_por_revisar',motivo:'Esta publicación requiere revisar título, descripción y galería antes de fijar el SKU físico; el cliente no elige color.',
    faltantes:'Identificar el color que la publicación ya determina',evidencia:evidence};
  if(name==='IMPERIAL NEGRO DE ALPACA'||name==='MI MATE IMPERIAL - CREÁ TU DISEÑO ACÁ')return {
    clase:'B',sku:'MB-IMP-CAL?',grupo:'imperial_alpaca',motivo:'La ficha indica calabaza y detalles de alpaca/cuero negro; el SKU imperial de calabaza no identifica esos acabados.',
    faltantes:'Confirmar que MB-IMP-CAL es también esta base con alpaca/cuero negro',evidencia:evidence};
  return {clase:'B',sku:'—',grupo:'revisar',motivo:'No hay una regla inequívoca en los datos actuales.',faltantes:'Revisión de identidad física',evidencia:evidence};
}
const rows=[];
for(const product of products)for(const variant of product.variantes){
  if(approved.has(String(variant.id)))continue;
  const result=classify(product,variant);
  const suggestions=result.sku.match(/MB-[A-Z-]+/g)||[];
  for(const sku of suggestions)if(!has(sku))throw Error(`Sugerencia ${sku} no existe en inventario`);
  rows.push({producto_id:product.id_producto,producto:product.nombre,variante_id:variant.id,
    variante:JSON.stringify(variant.opciones),categorias:product.categorias.map(c=>c.nombre).join(' / '),
    tipo:product.tipo,clase:result.clase,sku_sugerido:result.sku,grupo_decision:result.grupo,
    motivo:result.motivo,componentes_faltantes:result.faltantes,evidencia:excerpt(result.evidencia)});
}
rows.sort((a,b)=>a.grupo_decision.localeCompare(b.grupo_decision,'es')||a.producto.localeCompare(b.producto,'es')||Number(a.variante_id)-Number(b.variante_id));
const counts=rows.reduce((acc,row)=>(acc[row.clase]=(acc[row.clase]||0)+1,acc),{});
const groups=rows.reduce((acc,row)=>(acc[row.grupo_decision]=(acc[row.grupo_decision]||0)+1,acc),{});
if(out){
  const fields=['producto_id','producto','variante_id','variante','categorias','tipo','clase',
    'sku_sugerido','grupo_decision','motivo','componentes_faltantes','evidencia'];
  const escape=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  await fs.writeFile(out,'\uFEFF'+fields.map(escape).join(',')+'\n'+
    (rows.length?rows.map(row=>fields.map(field=>escape(row[field])).join(',')).join('\n')+'\n':''),'utf8');
}
console.log(JSON.stringify({pendientes:rows.length,clases:counts,grupos:groups,archivo:out||null},null,2));
