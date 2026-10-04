import {province} from '../shipping/provinces.mjs';
const fail=message=>Object.assign(Error(message),{status:400});
const text=(value,name,max,required=true)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw fail('Revisá '+name);return value.trim();};
export function phone(value){const v=text(value,'el teléfono',40);if(!/^\+?[0-9 ()-]+$/.test(v)||!/^\d{7,15}$/.test(v.replace(/\D/g,'')))throw fail('Indicá un WhatsApp de 7 a 15 dígitos');return v;}
export function registration(body){
 const nombre=text(body.nombre,'el nombre',75),apellido=text(body.apellido,'el apellido',74);
 return {nombre:nombre+' '+apellido,whatsapp:phone(body.whatsapp),provincia:province(body.provincia).name,localidad:text(body.localidad,'la localidad',100),empresa:text(body.empresa??'','la empresa',150,false)};
}
export function completion(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw fail('Datos comerciales inválidos');
 const result={};for(const k of Object.keys(body)){if(!['nombre','whatsapp','provincia','localidad','empresa'].includes(k))throw fail('Campo comercial inválido');result[k]=k==='whatsapp'?phone(body[k]):k==='provincia'?province(body[k]).name:text(body[k],k,k==='localidad'?100:150,k!=='empresa');}if(!Object.keys(result).length)throw fail('Completá los datos faltantes');return result;
}
export async function persistRegistration(auth,user){
 const input=user?.user_metadata?.mayorista;if(!input)return;
 let data;try{data=completion(input);}catch{return;} // Editable display metadata never authorizes access.
 const result=await auth.rpc('mb_wholesale_profile_complete',{p_data:data});
 if(result.error)throw Object.assign(Error('No pudimos guardar tus datos mayoristas. Podés completarlos desde el catálogo.'),{status:503});
}

