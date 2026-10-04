// One field contract for the browser and server. Transport mode determines the
// address requirements; submitted totals, profile emails and unknown keys vanish.
const limits={nombre:[2,100],apellido:[2,100],email:[3,254],telefono:[10,30],provincia:[2,100],ciudad:[2,100],codigo_postal:[4,8],calle:[2,150],numero:[1,20],piso:[0,20],departamento:[0,30],referencia:[0,300]};
const messages={nombre:'Ingresá el nombre del destinatario',apellido:'Ingresá el apellido del destinatario',email:'Ingresá un correo electrónico válido',telefono:'Revisá el número de teléfono argentino',provincia:'Seleccioná una provincia',ciudad:'Ingresá la localidad',codigo_postal:'El código postal no corresponde al formato esperado',calle:'Ingresá la calle de la dirección',numero:'Ingresá la altura de la dirección',piso:'Revisá el piso',departamento:'Revisá el departamento',referencia:'Revisá la referencia de entrega'};
export const recipientRequired=mode=>['nombre','apellido','email','telefono',...(mode==='correo_domicilio'?['provincia','ciudad','codigo_postal','calle','numero']:[])];
export function recipientResult(value,mode='correo_domicilio',provinces){
 const data={},fields={},required=new Set(recipientRequired(mode));
 if(!['retiro','correo_domicilio','correo_sucursal'].includes(mode))return {data,fields:{envio:'Elegí una modalidad de entrega disponible'}};
 for(const [key,[min,max]]of Object.entries(limits)){
  const raw=value?.[key];const text=typeof raw==='string'?raw.trim():'';
  // A pickup does not need the buyer's home address. Do not retain hidden data.
  const address=!['nombre','apellido','email','telefono'].includes(key);
  if(address&&mode!=='correo_domicilio'){data[key]='';continue;}
  data[key]=text;
  if((required.has(key)&&text.length<min)||text.length>max||(raw!=null&&typeof raw!=='string'))fields[key]=messages[key];
 }
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email||''))fields.email=messages.email;
 const phone=data.telefono||'',digits=phone.replace(/\D/g,'');
 if(!/^[+0-9 ()-]+$/.test(phone)||!(/^[1-9]\d{9}$/.test(digits)||/^0[1-9]\d{9}$/.test(digits)||/^54(?:9)?[1-9]\d{9}$/.test(digits)))fields.telefono=messages.telefono;
 if(mode==='correo_domicilio'){
  if(!/^(?:\d{4}|[A-Za-z]\d{4}[A-Za-z]{3})$/.test(data.codigo_postal))fields.codigo_postal=messages.codigo_postal;
  data.codigo_postal=data.codigo_postal.toUpperCase();
  if(!/^[1-9]\d{0,5}[A-Za-z]?$/.test(data.numero))fields.numero=messages.numero;
  if(provinces&&!provinces.some(p=>p.name===data.provincia))fields.provincia=messages.provincia;
 }
 return {data,fields};
}
export function validateRecipient(value,mode='correo_domicilio',provinces){
 const {data,fields}=recipientResult(value,mode,provinces);
 if(Object.keys(fields).length)throw Object.assign(Error('Hay campos que requieren corrección.'),{status:400,code:'INVALID_RECIPIENT',fields});
 return data;
}
