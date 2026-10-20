import {authFieldErrors} from './auth-validation.mjs';
const form=document.querySelector('#signin');
const summary=document.createElement('p');summary.id='auth-error-summary';summary.className='auth-field-error';summary.setAttribute('role','alert');summary.hidden=true;form.querySelector('div').append(summary);
export function clearAuthErrors(){summary.hidden=true;summary.textContent='';for(const control of form.querySelectorAll('[aria-invalid]')){control.removeAttribute('aria-invalid');control.removeAttribute('aria-describedby');}for(const note of form.querySelectorAll('[data-auth-error]'))note.remove();}
export function showAuthErrors(errors={},message='Revisá los campos indicados para continuar.'){
 clearAuthErrors();summary.textContent=message;summary.hidden=false;
 for(const [name,text]of Object.entries(errors)){
  const control=form.elements.namedItem(name);if(!control||control.closest('label')?.hidden||control.closest('fieldset')?.hidden)continue;
  const note=document.createElement('small');note.id='auth-error-'+name;note.dataset.authError=name;note.className='auth-field-error';note.textContent=text;
  control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',note.id);control.closest('label').append(note);
 }
 requestAnimationFrame(()=>form.querySelector('[aria-invalid=true]')?.focus());summary.scrollIntoView({block:'nearest'});
}
export function validateAuth(){
 const errors=authFieldErrors(Object.fromEntries(new FormData(form)),{register:form.dataset.mode==='registro',provinceNames:[...form.querySelector('[name=provincia]').options].map(o=>o.value).filter(Boolean)});
 if(Object.keys(errors).length){showAuthErrors(errors);return false;}clearAuthErrors();return true;
}
form.addEventListener('input',event=>{const control=event.target;if(!control.matches('[aria-invalid=true]'))return;control.removeAttribute('aria-invalid');control.removeAttribute('aria-describedby');form.querySelector('[data-auth-error="'+control.name+'"]')?.remove();});
