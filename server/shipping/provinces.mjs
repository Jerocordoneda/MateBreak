// Canonical destination names and MiCorreo codes. The browser consumes this catalog.
export const provinces=Object.freeze([
 ['Salta','A'],['Buenos Aires','B'],['Ciudad Autónoma de Buenos Aires','C'],['San Luis','D'],
 ['Entre Ríos','E'],['La Rioja','F'],['Santiago del Estero','G'],['Chaco','H'],['San Juan','J'],
 ['Catamarca','K'],['La Pampa','L'],['Mendoza','M'],['Misiones','N'],['Formosa','P'],['Neuquén','Q'],
 ['Río Negro','R'],['Santa Fe','S'],['Tucumán','T'],['Chubut','U'],['Tierra del Fuego','V'],
 ['Corrientes','W'],['Córdoba','X'],['Jujuy','Y'],['Santa Cruz','Z'],
].map(([name,code])=>Object.freeze({name,code})));
const key=value=>typeof value==='string'?value.normalize('NFKD').replace(/\p{M}/gu,'').replace(/\s+/gu,' ').trim().toLowerCase():'';
const byName=new Map(provinces.map(p=>[key(p.name),p]));
byName.set('caba',provinces.find(p=>p.code==='C'));
export function province(value){
 const selected=byName.get(key(value));
 if(!selected)throw Object.assign(Error('Provincia de destino inválida'),{status:400});
 return selected;
}
export const provinceCode=value=>province(value).code;
