import test from 'node:test';
import assert from 'node:assert/strict';
import { MATE_BOX, SET_BOX, planPackages, quotePackages } from '../server/shipping/packaging.mjs';
import { createApp } from '../server/app.mjs';

const products = [
  { id: '1', tipo: 'simple', categorias: ['mates-grabados'] },
  { id: '2', tipo: 'combo', categorias: ['set-materos'] },
  { id: '3', tipo: 'simple', categorias: ['termos'] },
];
const mate = cantidad => ({ producto_id: '1', cantidad });
const set = cantidad => ({ producto_id: '2', cantidad });

test('one mate uses one 17 cm cube weighing 550 g', () => {
  assert.deepEqual(planPackages([mate(1)], products), [MATE_BOX]);
});
test('two mates use two joined small boxes weighing 1100 g', () => {
  assert.deepEqual(planPackages([mate(2)], products), [{ length: 34, width: 17, height: 17, weight: 1100 }]);
});
test('one set uses one 30 × 30 × 20 cm box weighing 1300 g', () => {
  assert.deepEqual(planPackages([set(1)], products), [SET_BOX]);
});
test('two sets share one large footprint weighing 2600 g', () => {
  assert.deepEqual(planPackages([set(2)], products), [{ ...SET_BOX, weight: 2600 }]);
});
test('one set plus one loose mate produces separate conservative parcels', () => {
  assert.deepEqual(planPackages([set(1), mate(1)], products), [SET_BOX, MATE_BOX]);
});
test('three sets split into two large parcels', () => {
  assert.deepEqual(planPackages([set(3)], products), [{ ...SET_BOX, weight: 2600 }, SET_BOX]);
});
test('mixed orders group sets first, then mate boxes, regardless of line order', () => {
  const expected = [{ ...SET_BOX, weight: 2600 }, SET_BOX,
    { length: 34, width: 17, height: 17, weight: 1100 }, MATE_BOX];
  assert.deepEqual(planPackages([mate(3), set(3)], products), expected);
  assert.deepEqual(planPackages([set(1), mate(2), set(2), mate(1)], products), expected);
});
test('unsupported goods need a verified single-item profile', () => {
  assert.equal(planPackages([{ producto_id:'3', cantidad:1 }], products), null);
  assert.deepEqual(planPackages([{ producto_id:'3', cantidad:1 }], products, { '3': { length:20,width:20,height:20,weight:700 } }),
    [{ length:20,width:20,height:20,weight:700 }]);
  assert.equal(planPackages([{ producto_id:'3', cantidad:2 }], products, { '3': MATE_BOX }), null);
  assert.equal(planPackages([mate(1), { producto_id:'3', cantidad:1 }], products), null);
});
test('multi-parcel total sums actual carrier quotes for the same service', async () => {
  const calls = [], expires = '2030-01-01T00:00:00Z';
  const provider = { quote: async request => {
    calls.push(request);
    return [{ provider:'correo_argentino', service:'CP', name:'Paq.ar Clásico',
      carrierCost: request.dimensions.weight === 1300 ? 7000.25 : 8000.10, validTo:expires }];
  } };
  const packages = planPackages([set(1), mate(1)], products);
  const rates = await quotePackages(provider, { destinationPostalCode:'7000', deliveryType:'D', packages });
  assert.deepEqual(calls.map(call => call.dimensions), packages);
  assert.equal(rates[0].carrierCost, 15000.35);
  assert.equal(rates[0].packageCount, 2);
  assert.equal(rates[0].service, 'CP');
});

test('checkout quotes the server-derived parcels and persists only carrier-returned cost', async t => {
  const seen = { dimensions: [], inserted: null };
  const selection = { id:'11111111-1111-4111-8111-111111111111', items:[set(1),mate(1)], total:70_000 };
  const admin = {
    rpc:async name=>({data:name==='mb_comercio'?selection:name==='mb_shipping_fingerprint'?'a'.repeat(64):{items:[],subtotal:70_000,moneda:'ARS'},error:null}),
    from:table=>{
      if(table==='producto') return {select:()=>({in:async()=>({data:[
        {id_producto:1,tipo:'simple',catalogo_producto_categoria:[{catalogo_categoria:{slug:'mates-grabados'}}]},
        {id_producto:2,tipo:'combo',catalogo_producto_categoria:[{catalogo_categoria:{slug:'set-materos'}}]},
      ],error:null})})};
      if(table==='checkout_cotizacion_envio') return {insert:row=>{
        seen.inserted=row;
        return {select:()=>({single:async()=>({data:{id:'22222222-2222-4222-8222-222222222222'},error:null})})};
      }};
      return {select:()=>({in:async()=>({data:table==='metodo_envio'?
        [{codigo:'correo_domicilio',activo:true},{codigo:'retiro',activo:false}]:[],error:null})})};
    },
  };
  const correo = {ready:true,quote:async ({dimensions})=>{
    seen.dimensions.push(dimensions);
    return [{provider:'correo_argentino',service:'CP',name:'Paq.ar Clásico',carrierCost:dimensions.weight===1300?7000:8000,
      validTo:'2030-01-01T00:00:00Z'}];
  }};
  const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},{
    admin,correo,mercadoPago:{ready:false},authFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'buyer',email:'buyer@example.test'}}})}}),
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const context=await (await fetch(base+'/api/checkout/contexto')).json();
  assert.equal(context.deliveries.find(option=>option.codigo==='correo_domicilio').activo,true);
  const response=await fetch(base+'/api/checkout/cotizar-envio',{method:'POST',headers:{origin:'https://matebreak.test','content-type':'application/json'},
    body:JSON.stringify({modalidad:'correo_domicilio',destinatario:{nombre:'Ana',apellido:'Pérez',email:'ana@example.test',telefono:'2494123456',
      codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Pinto',numero:'623'},costo_envio:0})});
  assert.equal(response.status,200,await response.clone().text());
  assert.deepEqual(seen.dimensions,[SET_BOX,MATE_BOX]);
  assert.equal(seen.inserted.costo_transportista,15000);
  const options=await response.json();
  assert.equal(options[0].customerShippingCost,15000);
  assert.equal(options[0].packageCount,2);
});
