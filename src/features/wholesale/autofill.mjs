// Dirty fields remain owned by the buyer, including deliberately cleared values.
export function applyDefaults(form,values,dirty){
 for(const [name,value] of Object.entries(values||{})){
  const field=form.elements.namedItem(name);
  if(field&&typeof value==='string'&&value&&!dirty.has(name)&&!field.value)field.value=value;
 }
}
export function applyAddress(form,address,dirty){
 for(const name of ['whatsapp','localidad','provincia']){
  const field=form.elements.namedItem(name);
  if(field&&typeof address?.[name]==='string'){field.value=address[name];dirty.add(name);}
 }
}
