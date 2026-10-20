// Real local Auth/PostgREST/Express, synthetic inventory only, no intercepts.
import {createApp} from '../server/app.mjs';
import {localStatus,mustSql} from './local-test-runtime.mjs';
const status=localStatus();
if(await mustSql('select count(*)from public.pedido;')!=='0')throw Error('Preview requires a freshly reset owned local database');
await mustSql("update public.producto_simple set stock=100 where id_producto in(select producto_id from private.inventario_ficha);update public.metodo_pago set activo=true where codigo in('mercadopago','transferencia');update public.metodo_envio set activo=true where codigo in('retiro','correo_domicilio','correo_sucursal');");
const {app}=createApp({url:status.API_URL,publishable:status.ANON_KEY,secret:status.SERVICE_ROLE_KEY,origin:'http://localhost:3000',production:false,localPersistMock:true,localPickupMock:true,shippingMode:'mock',paymentsMode:'mock',authRecoveryEnabled:true,wholesaleWhatsapp:'5492266488213'});
const server=app.listen(3000,'127.0.0.1',()=>console.log('Local actual Express + Supabase preview at http://localhost:3000; synthetic stock; no external transports'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
