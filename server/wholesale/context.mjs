import {province} from '../shipping/provinces.mjs';
export function commercialContext(user,profile,addresses){
 const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
 const buyer={nombre:text(profile?.nombre||user.user_metadata?.nombre,150),email:text(user.email,150),whatsapp:text(profile?.telefono,30)};
 const rows=addresses.filter(d=>d.pais==='AR').map(d=>{let canonical='';try{canonical=province(d.departamento).name;}catch{}return{id:d.id,label:[text(d.destinatario,150),text(d.calle,250),text(d.ciudad,100),text(d.departamento,100)].filter(Boolean).join(' · '),whatsapp:text(d.telefono,30),localidad:text(d.ciudad,100),provincia:canonical};});
 return {accountId:user.id,buyer,addresses:rows};
}
