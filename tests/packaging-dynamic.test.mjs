import test from 'node:test';
import assert from 'node:assert/strict';
import {packagingDecision,planPackages} from '../server/shipping/packaging.mjs';
const products=[{id:'s',tipo:'combo',categorias:['set-materos']},{id:'m',tipo:'simple',categorias:['mates']}];
const item=(id,cantidad)=>({producto_id:id,cantidad});
for(const quantity of [4,6,7,10,100])test(`${quantity} sets use approved compact parcels or manual quotation`,()=>{
 const d=packagingDecision([item('s',quantity)],products);
 if(quantity===4){assert.equal(d.status,'automatic');assert.equal(d.packages.length,2);assert.equal(d.packages.reduce((n,p)=>n+p.weight,0),5200);}
 else {assert.equal(d.status,'manual');assert.equal(d.packages,null);}
});
for(const [sets,mates] of [[2,2],[4,3],[6,7],[10,10]])test(`mixed ${sets} sets and ${mates} mates do not extrapolate dimensions`,()=>{
 const d=packagingDecision([item('s',sets),item('m',mates)],products);
 assert.equal(d.status,sets===2&&mates===2?'automatic':'manual');
 if(d.packages)assert.equal(d.packages.length,2);
});
test('large approved one-parcel packing wins over two parcels without inventing dimensions',()=>{
 // Synthetic approval fixture only; this is NOT a physical approval shipped to customers.
 const profiles=[{sets:6,mates:0,dimensions:{length:60,width:40,height:30,weight:7900}},
 {sets:3,mates:0,dimensions:{length:30,width:30,height:30,weight:4000}}];
 assert.deepEqual(planPackages([item('s',6)],products,{},profiles),[profiles[0].dimensions]);
 assert.equal(packagingDecision([item('s',10)],products,{},profiles).status,'manual');
});
test('two approved parcels minimize exterior volume and carry their approved gross weight',()=>{
 const profiles=[{sets:3,mates:0,dimensions:{length:30,width:30,height:30,weight:3950}},
 {sets:3,mates:0,dimensions:{length:40,width:40,height:40,weight:4000}}];
 assert.deepEqual(planPackages([item('s',6)],products,{},profiles),[profiles[0].dimensions,profiles[0].dimensions]);
});
test('invalid profiles cannot bypass provider dimension limits',()=>{
 for(const weight of [0,25001,Infinity])assert.equal(packagingDecision([item('s',6)],products,{},[
 {sets:6,mates:0,dimensions:{length:30,width:30,height:30,weight}}]).status,'manual');
 assert.equal(packagingDecision([item('s',-1)],products).status,'invalid');
});
test('public admission sum limit is independent from the adapter per-side bounds',()=>{
 assert.equal(packagingDecision([item('s',6)],products,{},[{sets:6,mates:0,dimensions:{length:150,width:150,height:150,weight:7900}}]).status,'manual');
});
