import test from 'node:test';
import assert from 'node:assert/strict';
import {searchCatalog} from '../src/features/catalog/search-model.mjs';
import {productCardData} from '../server/modules/catalog/routes.mjs';
test('public search combines accent-insensitive terms, category/material/type and stable name ranking',()=>{
 const products=[{slug:'a',nombre:'Imperial',descripcion:'Calabaza',tipo:'combo',categorias:[{nombre:'Mates premium',slug:'mates'}]},{slug:'b',nombre:'Termo Acero',descripcion:'Con mate imperial',tipo:'simple',categorias:[]}];
 assert.deepEqual(searchCatalog(products,'  MÁTES calabáza ').map(p=>p.slug),['a']);
 assert.deepEqual(searchCatalog(products,'imperial').map(p=>p.slug),['a','b']);
 assert.equal(searchCatalog(products,'combo')[0],products[0]);
 assert.deepEqual(searchCatalog(products,'acero inexistente'),[]);assert.deepEqual(searchCatalog(products,'  '),[]);
});
test('card price represents real lowest variant and Desde only for varying variant prices',()=>{
 const p={precio:10,variantes:[{precio:25,precio_original:30},{precio:20,precio_original:24}]};
 const card=productCardData(p);assert.equal(card.precio_card,20);assert.equal(card.precio_card_original,24);assert.equal(card.precio_desde,true);assert.equal(card.precio,10);assert.equal(card.variantes,undefined);
 assert.equal(productCardData({variantes:[{precio:20},{precio:20}]}).precio_desde,false);
 assert.equal(productCardData({precio:15,variantes:[{precio:null},{precio:'bad'}]}).precio_card,undefined);
});
