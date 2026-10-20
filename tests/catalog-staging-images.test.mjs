import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogImageUrl} from '../server/modules/catalog/images.mjs';
const base=new URL('../src/assets/catalog-staging/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('610 verified temporary images have exact bytes, unique associations and a bounded static artifact',()=>{
 const historical=JSON.parse(readFileSync(new URL('../supabase/catalog/20260928-public-store.json',import.meta.url),'utf8'));
 const originals=new Map(historical.flatMap(p=>p.imagenes).map(e=>[e.storage_path,e.sha256]));assert.equal(originals.size,610);
 assert.equal(manifest.entries.length,610);assert.equal(new Set(manifest.entries.map(e=>e.sourcePath)).size,610);
 assert.equal(manifest.entries.filter(e=>e.poster).length,88);let bytes=0;
 for(const e of manifest.entries){assert.equal(originals.get(e.sourcePath),e.sourceSha256);assert.match(e.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(e.sourcePath.startsWith('products/assets/'+e.sourceSha256+'.'));assert.equal(e.path,'/src/assets/catalog-staging/'+e.sha256+'.webp');const b=readFileSync(new URL(e.sha256+'.webp',base));assert.equal(sha(b),e.sha256);assert.equal(b.length,e.bytes);assert.equal(b.subarray(8,12).toString(),'WEBP');assert.ok(e.width<=1200&&e.height<=1200);bytes+=b.length;}
 assert.ok(bytes<40_000_000);assert.equal(readdirSync(base).length,611);
});
test('only nonproduction Staging uses verified local paths; unknown images cannot leak or fail the catalogue',()=>{
 const admin={storage:{from:b=>({getPublicUrl:p=>({data:{publicUrl:'https://storage.test/'+b+'/'+p}})})}};
 const entry=manifest.entries[0];
 assert.equal(catalogImageUrl(admin,{staging:true,production:false},entry.sourcePath),entry.path);
 assert.equal(catalogImageUrl(admin,{staging:true,production:false},'unknown'),null);
 assert.equal(catalogImageUrl(admin,{staging:true,production:false},null),null);
 for(const config of [{staging:false},{staging:true,production:true},undefined])assert.equal(catalogImageUrl(admin,config,entry.sourcePath),'https://storage.test/product-images/'+entry.sourcePath);
});
