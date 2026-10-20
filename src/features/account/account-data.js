export function dateTime(value,fallback='Sin registrar'){
 if(!value)return fallback;const date=new Date(value);
 return Number.isNaN(date.getTime())?fallback:date.toLocaleString('es-AR',{dateStyle:'medium',timeStyle:'short'});
}
export const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function filterRecords(records,query,state,text,stateKey='estado'){
 const search=normalize(query);
 return records.filter(r=>(!state||r[stateKey]===state)&&(!search||normalize(text(r)).includes(search)));
}
export function saleTotals(sales){
 return sales.reduce((totals,s)=>{
  totals.cents+=Math.round(Number(s.total)*100);
  totals.units+=(s.items??[]).reduce((n,i)=>n+Number(i.cantidad),0);
  if(s.estado!=='entregada')totals.reserved+=(s.items??[]).reduce((n,i)=>n+Number(i.cantidad),0);
  return totals;
 },{cents:0,units:0,reserved:0});
}
