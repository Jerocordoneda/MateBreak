import {recipientResult,recipientRequired} from './recipient-validation.mjs';
import {streetNumber} from './street-number.mjs';
export function recipientForm(form,{mode,provinces,notice,flexible=()=>false}){
 const controls=[...form.querySelectorAll('input[name]:not([type=radio]),select[name],#pickup-province,#pickup-agency')];
 form.noValidate=true;
 const nodes=new Map();
 // Home delivery sends the street height as the server accepts it (1234 bis → 1234 + a note in
 // Referencia). The visible fields keep what the shopper typed, so no generated note goes stale.
 function values(){const data=Object.fromEntries(new FormData(form));if(mode()!=='correo_domicilio'||data.numero===undefined||flexible())return {data};const street=streetNumber(data.numero,data.referencia);return {data:{...data,numero:street.numero,referencia:street.referencia},hint:street.hint,referenceHint:street.referenceHint};}
 function check(){const {data,hint,referenceHint}=values(),result=recipientResult(data,mode(),provinces(),{flexibleStreetNumber:flexible()});if(hint)result.fields.numero=hint;if(referenceHint)result.fields.referencia=referenceHint;return result;}
 for(const input of controls){
  const field=input.name||input.id;input.id ||= 'recipient-'+field;
  const label=input.closest('label');
  const message=document.createElement('span');message.id=input.id+'-error';message.className='field-error';message.hidden=true;
  input.setAttribute('aria-describedby',message.id);label.append(message);nodes.set(field,{input,message,label});
  input.addEventListener('input',()=>{if(input.getAttribute('aria-invalid')==='true'){const result=check();if(!result.fields[input.name])clear(input.name);}});
  input.addEventListener('change',()=>{if(input.getAttribute('aria-invalid')==='true'){const result=check();if(field.startsWith('pickup-')?Boolean(input.value):!result.fields[field])clear(field);}});
 }
 function clear(key){const n=nodes.get(key);if(!n)return;n.input.removeAttribute('aria-invalid');n.message.textContent='';n.message.hidden=true;}
 function show(fields){for(const key of nodes.keys())clear(key);for(const [key,text]of Object.entries(fields)){const n=nodes.get(key);if(n){n.input.setAttribute('aria-invalid','true');n.message.textContent=text;n.message.hidden=false;}}notice('Hay campos que requieren corrección. Revisá los mensajes indicados.');[...nodes.values()].find(n=>n.input.getAttribute('aria-invalid')==='true'&&!n.input.disabled)?.input.focus();}
 return {show,sync(){const required=new Set(recipientRequired(mode()));for(const [key,n]of nodes){if(key.startsWith('pickup-')){n.label.hidden=mode()!=='correo_sucursal';clear(key);continue;}const address=!['nombre','apellido','email','telefono'].includes(key);n.input.disabled=address&&mode()!=='correo_domicilio';n.label.hidden=n.input.disabled;n.input.required=required.has(key);clear(key);}},read(){const result=check();if(mode()==='correo_sucursal')for(const [key,n]of nodes)if(key.startsWith('pickup-')&&!n.input.value)result.fields[key]=key==='pickup-province'?'Seleccioná la provincia de la sucursal':'Seleccioná una sucursal de retiro';if(Object.keys(result.fields).length){show(result.fields);throw Object.assign(Error('Hay campos que requieren corrección.'),{fields:result.fields});}return result.data;}};
}
