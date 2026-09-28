import test from 'node:test';
import assert from 'node:assert/strict';
import {money,canonical,parseListing,parseProduct,validateProduct,assignmentJSON} from '../scripts/catalog-source.mjs';
const variant={product_id:123,id:456,price_number:97800,compare_at_price_number:115000,price_with_payment_discount_short:'$83.130,00',available:true,stock:null,option0:'CALABAZA',image_url:'//acdn-us.mitiendanube.com/river.webp',installments_data:'{"Tarjeta":{"3":{"installment_value":32600,"without_interests":true}}}'};
const source=`<script>LS.variants = ${JSON.stringify([variant])};</script>
<script type="application/ld+json">${JSON.stringify({mainEntity:{'@type':'Product',offers:{price:115000,priceCurrency:'ARS'}},breadcrumb:{itemListElement:[{name:'Inicio',item:'https://matebreak.com.ar/'},{name:'SETS',item:'https://matebreak.com.ar/set-materos/'},{name:'SET RIVER',item:'https://matebreak.com.ar/productos/river/'}]}})}</script>
<div class="js-product-container"><h1 class="js-product-name">SET RIVER</h1><span id="price_display" data-product-price="9780000">$97.800,00</span><span id="compare_price_display">$115.000,00</span><span class="js-payment-discount-price-product">$83.130,00</span><span class="js-offer-percentage">15</span>
<div data-promotion-type="free-shipping">Envío gratis</div><form id="product_form"><div class="form-group"><label for="model">MODELO</label><select id="model" name="variation[0]"><option value="CALABAZA">CALABAZA</option></select></div></form>
<a data-fancybox="product-gallery" href="//acdn-us.mitiendanube.com/river.webp"><img alt="River"></a><div class="product-description user-content"><p>Incluye un mate de calabaza.</p><p>Texto completo &amp; grabado.</p><img src="https://example.com/detail.gif"></div></div>`;
test('extracts visible price rather than inconsistent JSON-LD; keeps unknown stock null',()=>{
 const p=validateProduct(parseProduct(source,'https://matebreak.com.ar/productos/river/'));
 assert.equal(p.precio,97800);assert.equal(p.precio_transferencia,83130);assert.equal(p.descuento,15);assert.equal(p.moneda,'ARS');
 assert.equal(p.variantes[0].stock,null);assert.deepEqual(p.variantes[0].opciones,{MODELO:'CALABAZA'});
 assert.equal(p.tipo,'combo');assert.equal(p.componentes.length,1);assert.equal(p.componentes[0].source_url,null);
 assert.match(p.descripcion,/Texto completo & grabado/);assert.equal(p.imagenes.length,2);assert.equal(p.imagenes[1].rol,'descripcion');assert.equal(p.categorias.length,1);
 assert.equal(p.envio_gratis,true);assert.ok(p.revision.some(r=>r.includes('JSON-LD')));
});
test('missing price never becomes zero; variant data is parsed without executing scripts',()=>{
 assert.equal(money(''),null);assert.equal(money(null),null);assert.equal(money('$1.234,56'),1234.56);
 assert.throws(()=>assignmentJSON('LS.variants = [process.exit()];','LS.variants'));
 assert.throws(()=>parseProduct('<h1>Not a product</h1>','https://matebreak.com.ar/productos/x/'));
});
test('listing deduplicates products and exposes expected pagination count',()=>{
 const p=parseListing('<script>LS.productsCount = 106;</script><div class="js-product-table"><a href="/productos/a/?x=1">a</a><a href="/productos/a/#b">a</a></div><a class="js-load-more">Más</a>','https://matebreak.com.ar/productos/');
 assert.deepEqual(p.products,['https://matebreak.com.ar/productos/a/']);assert.equal(p.count,106);assert.equal(p.hasMore,true);assert.equal(canonical('https://elsewhere.test/productos/x/'),null);
});
