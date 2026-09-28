// Isolated UI fixture, localhost only. NO Supabase connection or real changes.
// Run explicitly: node tests/inventory-preview.mjs
import { createApp } from '../server/app.mjs';
import express from 'express';
import { readFile } from 'node:fs/promises';
const origin = 'http://localhost:3003';
const rows = [
 ['MB-IMP-CAL','Mate imperial de calabaza',1200,'Mates'],['MB-IMP-ALG','Mate imperial de algarrobo',1200,'Mates'],
 ['MB-CAM-ALG','Mate camionero de algarrobo',700,'Mates'],['MB-MAT-ACE','Mate de acero',700,'Mates'],
 ['MB-TER-NEG','Termo negro',800,'Termos'],['MB-TER-PLA','Termo plateado',24,'Termos'],
 ['MB-CUC-INOX','Cuchillo de acero inoxidable',500,'Cocina'],['MB-MATERA','Matera',60,'Accesorios'],
 ['MB-QUENCHER','Vaso Quencher',70,'Vasos'],['MB-YERBERA','Yerbera',100,'Accesorios'],['MB-TABLA','Tabla',0,'Cocina'],
].map(([sku,nombre,disponible,categoria],i) => ({id:String(i+1),sku,nombre,disponible,reservado:0,fisico:disponible,categoria,material:'Por confirmar',diseno:categoria==='Mates'?'Liso, sin grabar':null,abastecimiento:sku==='MB-TABLA'?'a_pedido':'stock',aproximado:true,minimo:0,notas:'Vista de prueba aislada. No modifica la base de datos.',publicado:false,precio:null}));
const history = rows.map(p => ({nombre:p.nombre,producto_id:p.id,tipo:'inicial',diferencia:p.disponible,disponible_anterior:0,disponible_nuevo:p.disponible,actor_nombre:'Equipo · DEMOSTRACIÓN',motivo:'Stock inicial aproximado · datos de prueba',creado_en:new Date().toISOString(),pedido_id:null}));
const replay = new Map();
const {app} = createApp({url:'https://example.supabase.co',publishable:'fixture',secret:'fixture',origin,production:false},{
 authFactory:() => ({auth:{getUser:async () => ({data:{user:{id:'fixture-admin'}}}),signOut:async () => ({error:null})}}),
 admin:{rpc:async (name,args) => {
  if (name === 'mb_inventario_autorizado') return {data:true};
  if (name !== 'mb_inventario') return {data:{}};
  const data=args.p_datos;
  if (args.p_accion === 'listar') return {data:rows};
  if (args.p_accion === 'historial') return {data:history.filter(m => !data.producto_id || m.producto_id === data.producto_id)};
  const p=rows.find(p => p.id === data.producto_id);
  if (!p) return {error:{code:'P0001',message:'Artículo inexistente'}};
  if (args.p_accion === 'configurar') { Object.assign(p,{abastecimiento:data.abastecimiento,minimo:data.minimo,notas:data.notas}); return {data:p}; }
  if (replay.has(data.idempotencia)) return {data:replay.get(data.idempotencia)};
  const previous=p.disponible;
  p.disponible=data.tipo==='ingreso'?previous+data.cantidad:data.tipo==='egreso'?previous-data.cantidad:data.cantidad-p.reservado;
  p.fisico=p.disponible+p.reservado; if (data.tipo==='conteo') p.aproximado=false;
  const movement={nombre:p.nombre,producto_id:p.id,tipo:data.tipo,diferencia:p.disponible-previous,disponible_anterior:previous,disponible_nuevo:p.disponible,actor_nombre:'Admin de prueba',motivo:data.motivo,creado_en:new Date().toISOString(),pedido_id:null};
  history.unshift(movement); replay.set(data.idempotencia,movement); return {data:movement};
 }},
});
const preview = express();
preview.get('/interno/inventario',async (req,res) => {
 const html = await readFile(new URL('../server/private-ui/inventory.html',import.meta.url),'utf8');
 res.set('Cache-Control','no-store').type('html').send(html.replace('<main>','<main><aside class="message">DEMOSTRACIÓN · Los cambios de esta pantalla no se guardan en Supabase. <a href="http://localhost:3000/interno/inventario">Abrir inventario real →</a></aside>'));
});
preview.use(app);
preview.listen(3003,'127.0.0.1',() => console.log('Isolated inventory preview: '+origin+'/interno/inventario (NO real DB)'));
