import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviders, resolveProviderModes,resolveMiCorreoEnvironment } from '../server/providers.mjs';
import { createMockShipping } from '../server/shipping/mock.mjs';
import { quotePackages, MATE_BOX, SET_BOX } from '../server/shipping/packaging.mjs';
import { createMockPayment } from '../server/payments/mock.mjs';

test('MiCorreo environment supports canonical name, legacy alias and fails closed on conflict',()=>{
  assert.equal(resolveMiCorreoEnvironment({}),'test');
  assert.equal(resolveMiCorreoEnvironment({CORREO_MICORREO_ENVIRONMENT:'production'}),'production');
  assert.equal(resolveMiCorreoEnvironment({CORREO_ENVIRONMENT:'production'}),'production');
  assert.equal(resolveMiCorreoEnvironment({CORREO_MICORREO_ENVIRONMENT:'test',CORREO_ENVIRONMENT:'test'}),'test');
  assert.throws(()=>resolveMiCorreoEnvironment({CORREO_MICORREO_ENVIRONMENT:'test',CORREO_ENVIRONMENT:'production'}),/disagree/);
  assert.throws(()=>resolveMiCorreoEnvironment({CORREO_MICORREO_ENVIRONMENT:'invalid'}),/inválido/);
});
test('development defaults to mock and production defaults to real', () => {
  assert.deepEqual(resolveProviderModes({}), { shippingMode:'mock',paymentsMode:'mock' });
  assert.throws(()=>resolveProviderModes({ NODE_ENV:'production' }), /mock no se permiten/);
  assert.deepEqual(resolveProviderModes({ NODE_ENV:'production',SHIPPING_MODE:'real' }), { shippingMode:'real',paymentsMode:'real' });
  assert.throws(()=>resolveProviderModes({SHIPPING_MODE:'invalid'}));
  assert.throws(()=>resolveProviderModes({NODE_ENV:'production',PAYMENTS_MODE:'mock'}));
  assert.throws(()=>resolveProviderModes({SHIPPING_MODE:'mock',PAYMENTS_MODE:'real'}));
});

test('provider selection keeps mock and real behind the same server interfaces', async () => {
  const mock = createProviders({origin:'http://localhost:3000',production:false,shippingMode:'mock',paymentsMode:'mock',
    mockPaymentResult:'approved',mercadoPago:{},correo:{}});
  assert.equal(mock.shipping.ready,true);
  assert.equal(mock.shipping.mock,true);
  assert.equal(mock.payment.ready,true);
  assert.equal(mock.payment.mock,true);
  assert.equal(mock.webhook.ready,false);

  const realShipping={ready:true,quote:async()=>[]}, realMp={ready:true,createPreference:async()=>({id:'pref-1',redirectUrl:'https://mp.example.test/'})};
  const real=createProviders({origin:'https://matebreak.test',production:false,shippingMode:'real',paymentsMode:'real'},
    {correo:realShipping,mercadoPago:realMp});
  assert.equal(real.shipping,realShipping);
  assert.deepEqual(await real.payment.startPayment({id:'order'}),{
    provider:'mercadopago',paymentId:'pref-1',status:'redirect',redirectUrl:'https://mp.example.test/',mock:false,
  });
  assert.equal(real.webhook,realMp);
});

test('mock shipping quotes one and multiple actual package requests at an explicitly fake rate', async () => {
  const shipping=createMockShipping({originPostalCode:'7000'});
  const one=await shipping.quote({destinationPostalCode:'1704',deliveryType:'D',dimensions:MATE_BOX});
  assert.equal(one[0].carrierCost,8500);
  assert.equal(one[0].originPostalCode,'7000');
  assert.equal(one[0].mock,true);
  const multiple=await quotePackages(shipping,{destinationPostalCode:'1704',deliveryType:'D',packages:[SET_BOX,MATE_BOX]});
  assert.equal(multiple[0].carrierCost,17000);
  assert.equal(multiple[0].packageCount,2);
  await assert.rejects(shipping.quote({destinationPostalCode:'bad',deliveryType:'D',dimensions:MATE_BOX}));
});

for(const status of ['approved','rejected','pending']) test(`mock payment returns ${status} without external calls`,async()=>{
  const payment=createMockPayment({result:status});
  const result=await payment.startPayment({id:'order',total:42_000,currency:'ARS'});
  assert.equal(result.status,status);
  assert.equal(result.mock,true);
  assert.match(result.paymentId,/^TEST-[0-9a-f-]+$/);
});

test('real mode fails clearly with missing credentials and never falls back to mock', () => {
  assert.throws(()=>createProviders({origin:'http://localhost:3000',production:false,shippingMode:'real',paymentsMode:'mock',correo:{}}),
    /SHIPPING_MODE=real requiere/);
  assert.throws(()=>createProviders({origin:'http://localhost:3000',production:false,shippingMode:'real',paymentsMode:'real',
    correo:{username:'u',password:'p',customerId:'c',originPostalCode:'7000'},mercadoPago:{}}),
  /Mercado Pago requiere|PAYMENTS_MODE=real requiere/);
  assert.throws(()=>createMockPayment({result:'invalid'}),/MOCK_PAYMENT_RESULT/);
});
