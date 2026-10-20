// Static, synthetic email previews. No database or mail transport.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {renderOrderEmail} from '../server/email/templates.mjs';
const origin='https://preview.example.test',local='http://127.0.0.1:3042';
const order={id:'11111111-1111-4111-8111-111111111111',numero:'1001',estado:'pagado',subtotal_mercaderia:16000,descuento_productos:0,costo_envio:8500,total:24500,items:[{nombre:'Mate sintético',cantidad:2,precio_original:10000,precio_unitario:8000,opciones:{'BOMBILLA ACERO INOX':'NO'},personalizacion:'ANA'}],direccion_entrega:{destinatario:{nombre:'Ana',apellido:'Prueba',calle:'Calle sintética',numero:'123',ciudad:'Tandil',provincia:'Buenos Aires',codigo_postal:'7000'}},pagos:[{metodo:'mercadopago',estado:'aprobado',simulado:true}]};
createServer((req,res)=>{const url=new URL(req.url,local);res.setHeader('Cache-Control','no-store');
 const asset=url.pathname.match(/^\/src\/assets\/email\/(matebreak-logo|mercadopago-official)\.png$/);
 if(asset){res.setHeader('Content-Type','image/png');res.end(readFileSync(new URL('../src/assets/email/'+asset[1]+'.png',import.meta.url)));return;}
 if(!['/received','/shipped','/card','/transfer'].includes(url.pathname)){res.writeHead(404);res.end();return;}
 const kind=url.pathname==='/shipped'?'shipped':'received';let demo={...order};
 if(kind==='shipped')demo={...order,pagos:[{metodo:'mercadopago',estado:'aprobado'}],tracking:{codigo:'SYNTHETIC1234',estado:'in_transit'}};
 if(url.pathname==='/card')demo={...order,pagos:[{metodo:'mercadopago',estado:'aprobado',card_brand:'visa',card_last4:'5365'}]};
 if(url.pathname==='/transfer')demo={...order,estado:'pendiente_pago',descuento_productos:1600,total:22900,pagos:[{metodo:'transferencia',estado:'pendiente'}]};
 const message=renderOrderEmail({kind,order:demo,origin,orderUrl:origin+'/src/pages/pedido.html#'+'a'.repeat(43),contact:'Vista previa local · datos ficticios'});
 if(url.searchParams.get('format')==='text'){res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(message.text);return;}
 let html=message.html.replaceAll(origin,local);if(url.searchParams.get('images')==='blocked')html=html.replace(/src="[^"]+"/g,'src="/missing.png"');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
}).listen(3042,'127.0.0.1',()=>console.log('Synthetic email previews: '+local+'/received and /shipped'));
