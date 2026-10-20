import test from 'node:test';
import assert from 'node:assert/strict';
import {productCardData} from '../server/modules/catalog/routes.mjs';
test('listing projection preserves display/search values without full variants, photos or installments',()=>{
 const p={id_producto:'25',slug:'imperial-premium-de-boca',nombre:'Mate',descripcion:'Algarrobo',precio:57700,precio_original:60000,moneda:'ARS',descuento:4,tipo:'simple',categorias:[],imagen_principal:'/image.webp',promociones:[],destacado:true,disponible:true,variantes:[{id:'34'}],imagenes:[{url:'/image.webp'}],cuotas:{x:'large'},componentes:[{id:1}]};
 const cards=productCardData(p);for(const key of ['id_producto','nombre','descripcion','precio','precio_original','descuento','moneda','categorias','imagen_principal','promociones','destacado','disponible'])assert.deepEqual(cards[key],p[key]);
 for(const key of ['variantes','imagenes','cuotas','componentes'])assert.equal(Object.hasOwn(cards,key),false);
 assert.equal(p.variantes[0].id,'34');
 assert.equal(cards.slug,'imperial-premium-de-boca');
});
