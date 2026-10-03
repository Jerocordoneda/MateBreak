import {province} from '../shipping/provinces.mjs';
const fail=message=>Object.assign(Error(message),{status:400});
export function buyer(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('Completá tus datos');
 const result={};
 for(const [key,min,max] of [['nombre',2,150],['email',3,150],['whatsapp',7,30],['localidad',2,100],['provincia',2,100],['empresa',0,150],['comentarios',0,1000]]){
  const text=value[key]??'';if(typeof text!=='string')throw fail('Revisá '+key);
  result[key]=text.normalize('NFC').trim();if(result[key].length<min||result[key].length>max)throw fail('Revisá '+key);
 }
 result.provincia=province(result.provincia).name;result.email=result.email.toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)||!/^[+0-9 ()-]+$/.test(result.whatsapp)||result.whatsapp.replace(/\D/g,'').length<7)throw fail('Revisá email y WhatsApp');
 return result;
}
export function selection(items){
 if(!Array.isArray(items)||items.length<1||items.length>50)throw fail('Elegí entre 1 y 50 variantes');
 const selected=items.map(i=>{
  if(!i||typeof i!=='object'||!/^[1-9]\d{0,18}$/.test(String(i.id))||(typeof i.id==='number'&&!Number.isSafeInteger(i.id))||BigInt(i.id)>9223372036854775807n||!Number.isInteger(i.cantidad)||i.cantidad<1||i.cantidad>1000)throw fail('Producto o cantidad inválidos');
  return{id:String(i.id),cantidad:i.cantidad};
 });
 if(new Set(selected.map(i=>i.id)).size!==selected.length)throw fail('Variante duplicada');
 return selected.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
}
export function whatsappNumber(value){if(!/^[1-9]\d{9,14}$/.test(value||''))throw Object.assign(Error('El contacto mayorista todavía no está configurado'),{status:503});return value;}
export function whatsappMessage(receipt){
 if(!/^MAY-\d{4,}$/.test(receipt.number)||!receipt.quote?.items?.length)throw Error('Respuesta comercial inválida');
 const lines=receipt.quote.items.map(i=>`${i.quantity} × ${String(i.name).replace(/[\r\n]/g,' ').slice(0,150)}`);
 return `Hola MateBreak, quiero consultar por mi solicitud mayorista ${receipt.number}.\n\nProductos:\n${lines.map(l=>'- '+l).join('\n')}\n\nImporte preliminar: ${new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(receipt.quote.total)}.\n\nPersonalización y entrega: a coordinar; dejé comentarios en la solicitud.\nQuiero conversar para confirmar el presupuesto y luego coordinar la seña del 50%.`;
}
