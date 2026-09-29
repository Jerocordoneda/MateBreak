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
// These specific current publications were visually reviewed against their
// imported galleries. Never infer the colour for a newly added set by prefix.
const reviewedSilverSets=new Set([
  'SET MATERO DE BELGRANO','SET MATERO DE BOCA','SET MATERO DE CENTRAL',
  'SET MATERO DE COLON','SET MATERO DE ESTUDIANTES','SET MATERO DE INDEPENDIENTE',
  'SET MATERO DE LANÚS','SET MATERO DE NEWELL´S - ROSARIO','SET MATERO DE PLATENSE',
  'SET MATERO DE RACING','SET MATERO DE RIVER','SET MATERO DE SAN LORENZO',
  'SET MATERO DE TALLERES','SET MATERO DE TIGRE','SET MATERO DE VELEZ',
  'SET MATERO DEL CAMPEÓN','SET MATERO PERSONALIZADO - TU PROPIO DISEÑO',
  'SET MATERO PREMIUM ARGENTINO','SET PREMIUM DE BELGRANO','SET PREMIUM DE CENTRAL',
  'SET PREMIUM DE ESTUDIANTES','SET PREMIUM DE INDEPENDIENTE',
  'SET PREMIUM DE LA ACADEMIA','SET PREMIUM DE LANÚS','SET PREMIUM DE SAN LORENZO',
  'SET PREMIUM DE TALLERES','SET PREMIUM DE VELEZ','SET PREMIUM DEL MILLONARIO',
  'SET PREMIUM DEL XENEIZE','SET PREMIUM PERSONALIZADO - TU PROPIO DISEÑO',
]);
const reviewedBlackSets=new Set(['SET MATERO MUNDIAL 2026']);
function classify(product,variant){
  const name=product.nombre,options=variant.opciones||{},matero=mateFor(options);
  const evidence=product.componentes.map(component=>component.evidencia).join(' | ')||product.descripcion;
  if(product.tipo==='combo'){
    if(name.startsWith('SET DELUXE'))return {
      clase:'C',sku:`${matero} + MB-TABLA + MB-CUC-INOX`,grupo:'caja_regalo_deluxe',
      motivo:'Mate, tabla 20×30 y cuchillo identificados; la caja de regalo premium incluida no tiene SKU físico ni abastecimiento confirmado.',
      faltantes:'Caja de regalo premium MateBreak: crear SKU y definir si se controla por stock o a pedido',evidencia:evidence};
    const thermo=reviewedSilverSets.has(name)?'MB-TER-PLA':reviewedBlackSets.has(name)?'MB-TER-NEG':null;
    return {
      clase:'C',sku:`${matero} + MB-BOM-PICO-LORO + ${thermo||'termo por revisar'}${name.startsWith('SET PREMIUM')?' + MB-TABLA + MB-CUC-INOX':''}`,
      grupo:thermo?'caja_regalo_set':'combo_termo_caja',
      motivo:thermo?'El termo físico se identifica en la galería importada y el texto no lo contradice; la caja de regalo incluida carece de SKU.':'La publicación nueva requiere revisar el color del termo y la caja de regalo carece de SKU.',
      faltantes:thermo?'Caja de regalo premium MateBreak: crear SKU y definir abastecimiento':'Revisar color del termo publicado; crear SKU de caja de regalo y definir abastecimiento',evidencia:evidence};
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
  const fields=Object.keys(rows[0]||{}),escape=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  await fs.writeFile(out,'\uFEFF'+fields.map(escape).join(',')+'\n'+rows.map(row=>fields.map(field=>escape(row[field])).join(',')).join('\n')+'\n','utf8');
}
console.log(JSON.stringify({pendientes:rows.length,clases:counts,grupos:groups,archivo:out||null},null,2));
