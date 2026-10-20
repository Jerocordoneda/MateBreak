import {readFileSync} from 'node:fs';
// Temporary Staging delivery only. Database paths and original hashes remain
// suitable for the later Storage migration; production continues using Storage.
const manifest=JSON.parse(readFileSync(new URL('../../../src/assets/catalog-staging/manifest.json',import.meta.url),'utf8'));
const paths=new Map(manifest.entries.map(e=>[e.sourcePath,e.path]));
export function catalogImageUrl(admin,config,path){
  if(!path)return null;
  if(config?.staging===true&&config.production!==true){
    return paths.get(path)||null;
  }
  return admin.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
