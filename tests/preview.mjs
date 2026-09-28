// In-memory fixture for visual/UI checks. No Supabase connection or real orders.
// Run explicitly: node tests/preview.mjs -> http://localhost:3002/tienda
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express(); app.use(express.json());
const products = [{id_producto:'1',nombre:'Mate imperial de calabaza',descripcion:'Producto de prueba visual.',precio:2490,tipo:'simple'},{id_producto:'2',nombre:'Bombilla de acero inoxidable',descripcion:'Producto de prueba visual.',precio:690,tipo:'simple'}];
let items = [{producto_id:'1',nombre:products[0].nombre,precio:2490,cantidad:1,activo:true},{producto_id:'2',nombre:products[1].nombre,precio:690,cantidad:2,activo:true}];
const cart = () => ({id:'preview',items:items.map(i=>({...i,subtotal:i.precio*i.cantidad})),total:items.reduce((s,i)=>s+i.precio*i.cantidad,0),estado:'abierto'});
app.get('/api/productos',(req,res)=>res.json(products));
app.get('/api/carrito',(req,res)=>res.json(cart()));
app.put('/api/carrito/items/:id',(req,res)=>{const n=req.body.cantidad;const p=products.find(p=>p.id_producto===req.params.id);if(!p||!Number.isInteger(n)||n<0||n>99)return res.status(400).json({error:'Cantidad inválida'});items=items.filter(i=>i.producto_id!==req.params.id);if(n)items.push({producto_id:p.id_producto,nombre:p.nombre,precio:p.precio,cantidad:n,activo:true});res.json(cart());});
app.get('/api/metodos',(req,res)=>res.json({pagos:[{codigo:'transferencia',nombre:'Transferencia bancaria',instrucciones:'Instrucciones de prueba.'}],envios:[{codigo:'retiro',nombre:'Retiro coordinado',costo:0,requiere_direccion:false},{codigo:'envio',nombre:'Entrega a domicilio',costo:250,requiere_direccion:true}]}));
app.get('/api/sesion',(req,res)=>res.json({usuario:null}));
app.use('/api',(req,res)=>res.status(501).json({error:'Vista previa: no se realizan operaciones reales.'}));
app.use('/src',express.static(path.join(root,'src')));
app.get('/tienda',(req,res)=>res.sendFile(path.join(root,'src/pages/tienda.html')));
app.listen(3002,()=>console.log('Visual fixture (not production): http://localhost:3002/tienda'));
