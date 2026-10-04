import {securityEvent} from '../security.mjs';
import {reconcilePayment} from './reconciliation.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function paymentRoutes(app,{admin,mercadoPago}) {
 app.post('/api/pagos/mercadopago/webhook',async(req,res)=>{
  if(!mercadoPago.ready)throw fail(503,'Mercado Pago no está habilitado');
  const paymentId=req.query['data.id'];
  if(req.query.type!=='payment'||typeof paymentId!=='string'||!/^\d{1,30}$/.test(paymentId))return res.sendStatus(200);
  if(!mercadoPago.verifyWebhook({signature:req.headers['x-signature'],requestId:req.headers['x-request-id'],dataId:paymentId})){
   securityEvent('INVALID_WEBHOOK_SIGNATURE',req,{status:401});throw fail(401,'Firma de Mercado Pago inválida');
  }
  // Browser/body status are never evidence. SQL locks the order and reconciles
  // version/digest, confirmation and financial hold in one transaction.
  const outcome=await reconcilePayment({admin,provider:mercadoPago,paymentId});
  if(outcome?.review)securityEvent('PAYMENT_REVIEW',req,{status:409});
  res.sendStatus(200);
 });
}
