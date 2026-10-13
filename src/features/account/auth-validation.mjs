export function authFieldErrors(data,{register=false,provinceNames=[]}={}){
 const errors={},text=name=>typeof data[name]==='string'?data[name].trim():'';
 const email=text('email'),password=typeof data.password==='string'?data.password:'';
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.email='Ingresá un email válido, por ejemplo nombre@correo.com.';
 if(!password)errors.password='Ingresá tu contraseña.';
 else if(password.length>128||(register&&password.length<10))errors.password=register?'La contraseña debe tener entre 10 y 128 caracteres.':'La contraseña supera los 128 caracteres.';
 if(register){
  for(const [name,label,max]of [['nombre','nombre',75],['apellido','apellido',74],['localidad','localidad',100]])if(text(name).length<2||text(name).length>max)errors[name]=`Ingresá tu ${label}, entre 2 y ${max} caracteres.`;
  const phone=text('whatsapp');if(phone.length>30||!/^\+?[0-9 ()-]+$/.test(phone)||!/^\d{7,15}$/.test(phone.replace(/\D/g,'')))errors.whatsapp='Ingresá un teléfono / WhatsApp válido de 7 a 15 dígitos.';
  if(!text('provincia')||!provinceNames.some(name=>name.toLocaleLowerCase('es-AR')===text('provincia').toLocaleLowerCase('es-AR')))errors.provincia='Seleccioná una provincia de la lista.';
  if(data.confirmacion!==undefined&&!data.confirmacion)errors.confirmacion='Repetí tu contraseña para confirmarla.';
  else if(data.confirmacion!==undefined&&data.confirmacion!==password)errors.confirmacion='Las contraseñas no coinciden. Repetí la misma contraseña.';
 }
 return errors;
}
