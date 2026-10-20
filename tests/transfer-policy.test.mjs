import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTotals} from '../server/checkout/policy.mjs';
import {transferInstructions} from '../server/payments/transferencia.mjs';
import {paymentState} from '../src/features/checkout/result-state.mjs';
import {renderOrderEmail} from '../server/email/templates.mjs';
for(const n of [1,2,3])for(const method of ['mercadopago','transferencia'])test(n+' physical mates / '+method+' applies only the selected payment discount',()=>{
 const original=n*10000,quote=n>=2?original*.8:original;
 const totals=calculateTotals({merchandiseSubtotal:quote,carrierCost:8500,method});
 assert.equal(totals.total,quote*(method==='transferencia'?.9:1)+8500);
 assert.equal(totals.discount,method==='transferencia'?quote*.1:0);
});
test('the approved transfer instructions retain account data, receipt channel and 24h; URL cannot prove payment',()=>{
 const instructions=transferInstructions();assert.equal(instructions.expiresHours,24);
 assert.match(instructions.message,/COMPROBANTE/);assert.match(instructions.message,/Instagram\/WhatsApp/);
 assert.equal(paymentState({estado:'pendiente_pago',pagos:[{metodo:'transferencia',estado:'pendiente'}],approved:true}),'pending');
});
test('received transfer email is pending; paid email refuses an unconfirmed payment',()=>{
 const order={id:'local',estado:'pendiente_pago',total:9000,subtotal_mercaderia:10000,descuento_productos:1000,pagos:[{metodo:'transferencia',estado:'pendiente'}],items:[]};
 const args={order,origin:'https://matebreak.test',orderUrl:'https://matebreak.test/src/pages/pedido.html#private'};
 const result=renderOrderEmail({...args,kind:'received'});
 assert.match(result.text,/todavía no está pagado/);assert.match(result.text,/24 horas/);assert.match(result.html,/VER MI PEDIDO/);
 assert.throws(()=>renderOrderEmail({...args,kind:'paid'}),/not confirmed/);
});
