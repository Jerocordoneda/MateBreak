import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProductSelection} from '../src/features/catalog/product-selection.mjs';

const product={opciones:[{nombre:'MODELO DE MATE'},{nombre:'BOMBILLA'}],variantes:[
  {id:34,precio:57700,opciones:{'MODELO DE MATE':'ALGARROBO',BOMBILLA:'NO'}},
  {id:35,precio:63600,opciones:{'MODELO DE MATE':'ALGARROBO',BOMBILLA:'SI'}},
  {id:36,precio:73400,opciones:{'MODELO DE MATE':'CALABAZA',BOMBILLA:'NO'}},
  {id:37,precio:79300,opciones:{'MODELO DE MATE':'CALABAZA',BOMBILLA:'SI'}}]};
test('partial model change previews matching price immediately without authorizing purchase',()=>{
  for(const [model,id,price] of [['ALGARROBO',34,57700],['CALABAZA',36,73400],['ALGARROBO',34,57700]]){
    const result=resolveProductSelection(product,{'MODELO DE MATE':model});
    assert.equal(result.variant,null);assert.equal(result.preview.id,id);assert.equal(result.preview.precio,price);assert.equal(result.model,model);
  }
});
test('every complete combination resolves its exact variant; fast repeated selections have no retained state',()=>{
  for(const id of [34,36,37,35,34]){
    const v=product.variantes.find(v=>v.id===id),result=resolveProductSelection(product,v.opciones);
    assert.equal(result.variant,v);assert.equal(result.preview,v);
  }
});
test('invalid or ambiguous combinations never resolve to a purchasable variant',()=>{
  assert.equal(resolveProductSelection(product,{'MODELO DE MATE':'OTHER',BOMBILLA:'NO'}).preview,null);
  assert.equal(resolveProductSelection({...product,variantes:[product.variantes[0],product.variantes[0]]},product.variantes[0].opciones).variant,null);
});
test('no-option products and missing prices retain consultation behavior',()=>{
  const v={id:1,precio:null,opciones:{}};
  assert.equal(resolveProductSelection({opciones:[],variantes:[v]},{}).variant,v);
  assert.equal(resolveProductSelection({opciones:[],variantes:[]},{}).preview,null);
});
