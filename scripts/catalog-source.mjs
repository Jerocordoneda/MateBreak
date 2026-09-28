import { load } from 'cheerio';
import { createHash } from 'node:crypto';

export const ORIGIN = 'https://matebreak.com.ar';
export const hash = data => createHash('sha256').update(data).digest('hex');
export const clean = text => (text || '').replace(/\s+/g, ' ').trim();
export function canonical(value, base = ORIGIN) {
  try { const u = new URL(value, base); if (u.origin !== ORIGIN) return null; u.hash = ''; u.search = ''; return u.href.replace(/\/?$/, '/'); } catch { return null; }
}
export const isProduct = url => /^https:\/\/matebreak\.com\.ar\/productos\/[^/]+\/$/.test(url || '');
export function money(text) {
  if (text == null || clean(String(text)) === '') return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const digits = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return digits && Number.isFinite(Number(digits)) ? Number(digits) : null;
}
export function assignmentJSON(html, name) {
  const start = html.indexOf(name + ' ='); if (start < 0) return null;
  const offset = html.indexOf('[', start), end = html.indexOf('];', offset);
  if (offset < 0 || end < 0) return null;
  return JSON.parse(html.slice(offset, end + 1));
}
export function imageUrl(value, base = ORIGIN) {
  if (!value) return null;
  try { const u = new URL(value, base); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
export function parseListing(html, url) {
  const $ = load(html);
  const products = new Set();
  $('.js-product-table a[href]').each((_, a) => { const u = canonical($(a).attr('href'), url); if (isProduct(u)) products.add(u); });
  const links = new Set();
  $('a[href]').each((_, a) => { const u = canonical($(a).attr('href'), url); if (u) links.add(u); });
  const count = html.match(/LS\.productsCount\s*=\s*(\d+)/);
  return { products: [...products], links: [...links], count: count ? Number(count[1]) : null,
    title: clean($('h1').first().text()), hasMore: $('.js-load-more').length > 0 };
}

export function parseProduct(html, sourceUrl, featured = new Set()) {
  const $ = load(html), revisions = [];
  const raw = assignmentJSON(html, 'LS.variants');
  if (!raw?.length) throw Error('No se encontró LS.variants: requiere revisión del extractor');
  const name = clean($('h1.js-product-name').first().text());
  if (!name) throw Error('Falta nombre del producto');
  const externalId = String(raw[0].product_id);
  if (!raw.every(v => String(v.product_id) === externalId)) throw Error('Variantes de productos distintos');
  const desc = $('.product-description.user-content').first();
  const descCopy = desc.clone(); descCopy.find('br').replaceWith('\n');
  descCopy.find('p,li,h1,h2,h3,h4').each((_, n) => { $(n).append('\n'); });
  descCopy.find('script,style').remove();
  const description = descCopy.text().split('\n').map(clean).filter(Boolean).join('\n');
  const page = $('script[type="application/ld+json"]').toArray().map(n => { try { return JSON.parse($(n).text()); } catch { return null; } }).find(n => n?.mainEntity?.['@type'] === 'Product');
  const categories = (page?.breadcrumb?.itemListElement || []).map(c => ({ nombre:clean(c.name), source_url:canonical(c.item) })).filter(c => c.source_url && c.source_url !== ORIGIN + '/' && !isProduct(c.source_url)).map(c=>({...c,slug:new URL(c.source_url).pathname.split('/').filter(Boolean).join('--')}));
  const options = [];
  $('#product_form select[name^="variation"]').each((_, node) => {
    const s = $(node), position = Number(s.attr('name').match(/\d+/)[0]);
    const label = clean(s.closest('.form-group').find('label').first().text()) || clean($(`label[for="${s.attr('id')}"]`).first().text());
    if (!label) throw Error('Opción sin etiqueta');
    options.push({ posicion:position,nombre:label,valores:s.find('option').toArray().map(o=>$(o).attr('value')).filter(Boolean) });
  });
  const variants = raw.map(v => ({ external_id:String(v.id), opciones:Object.fromEntries(options.map(o=>[o.nombre,v['option'+o.posicion]])),
    precio:v.price_number ?? null, precio_original:v.compare_at_price_number > 0 ? v.compare_at_price_number : null,
    precio_transferencia:money(v.price_with_payment_discount_short), cuotas:v.installments_data ? JSON.parse(v.installments_data) : null,
    disponible:typeof v.available === 'boolean' ? v.available : null, stock:v.stock ?? null, sku:v.sku ?? null,
    imagen:imageUrl(v.image_url), visible:v.is_visible ?? null }));
  const priceNode = $('#price_display');
  const price = priceNode.attr('data-product-price') ? Number(priceNode.attr('data-product-price')) / 100 : money(priceNode.text());
  const original = money($('#compare_price_display').text());
  const selected = variants.find(v=>v.precio === price) || variants[0];
  const images = [], seen = new Set();
  function addImage(url, role, alt) { url = imageUrl(url); if (url && !seen.has(url)) { seen.add(url); images.push({source_url:url,rol:role,alt:clean(alt)||name,posicion:images.length}); } }
  $('[data-fancybox="product-gallery"]').each((_, a) => addImage($(a).attr('href'),'galeria',$(a).find('img').attr('alt')));
  desc.find('img').each((_, i)=>addImage($(i).attr('data-src')||$(i).attr('src'),'descripcion',$(i).attr('alt')));
  variants.forEach(v=>addImage(v.imagen,'variante',name));
  const main = $('#product_form').closest('[data-store^="product-detail"], .js-product-container');
  const scope = main.length ? main : $('[data-store^="product-info-"]').first();
  const promos = [...new Set(scope.find('[data-promotion-type]').toArray().filter(n=>!($(n).attr('style')||'').includes('display:none')&&!($(n).attr('style')||'').includes('display: none')).map(n=>clean($(n).text())).filter(Boolean))];
  const free = scope.find('[data-promotion-type="free-shipping"]').toArray().some(n=>!/display\s*:\s*none/.test($(n).attr('style')||'')) ? true : null;
  const combo = /\b(set|combo)\b/i.test(name);
  const components = combo ? description.split('\n').filter(s=>/incluy|además|por último|regalo incluido|contiene/i.test(s)).map(evidencia=>({evidencia,source_url:null})) : [];
  if(combo) revisions.push('Componentes descritos sin correspondencia inequívoca a SKU: revisar antes de reservar stock');
  if(variants.some(v=>v.stock===null)) revisions.push('La tienda no publica cantidad de stock para una o más variantes');
  if(!categories.length) revisions.push('Sin categoría en breadcrumb');
  if(page?.mainEntity?.offers?.price && Number(page.mainEntity.offers.price)!==price) revisions.push('Precio JSON-LD difiere del visible: se priorizó el precio visible y LS.variants');
  const customization = description.split('\n').filter(s=>/personaliz|grab|tu dise[ñn]o|nombre|escudo/i.test(s));
  const materials = [...new Set((description + ' ' + name).match(/\b(algarrobo|calabaza|acero inoxidable|ecocuero|alpaca|cuero|madera)\b/gi)?.map(x=>x.toLowerCase())||[])];
  return {external_id:externalId,source_url:canonical(sourceUrl),slug:new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1),nombre:name,
    descripcion:description||null,descripcion_html:desc.html()||null,tipo:combo?'combo':'simple',precio:price,precio_original:original>0?original:null,
    precio_transferencia:money($('.js-payment-discount-price-product').first().text()),
    descuento:clean(scope.find('.js-offer-percentage').first().text()) ? Number(clean(scope.find('.js-offer-percentage').first().text())) : null,
    moneda:page?.mainEntity?.offers?.priceCurrency||null,cuotas:selected.cuotas,disponible:variants.some(v=>v.disponible===true),
    envio_gratis:free,destacado:featured.has(canonical(sourceUrl)),material:materials.length===1?materials[0]:null,
    categorias:categories,opciones:options,variantes:variants,imagenes:images,promociones:promos,
    personalizacion:customization,componentes:components,revision:revisions,
    atributos:{materiales_mencionados:materials,peso:page?.mainEntity?.weight??null,disponibilidad_schema:page?.mainEntity?.offers?.availability??null,
      personalizable_explicitamente:/personaliz|cre[áa] tu/i.test(name),
      tipo_de_producto:combo?'set':/bombilla/i.test(name)?'bombilla':/matera/i.test(name)?'matera':/termo/i.test(name)?'termo':/imperial|camionero|mate/i.test(name)?'mate':null,
      descuento_calculado:original>price?Math.round((1-price/original)*100000)/1000:null,
      cuotas_texto:clean(scope.find('.js-max-installments').first().text())||null},
    source_hash:hash(html),extraido_en:new Date().toISOString()};
}
export function validateProduct(p) {
  if(!p.external_id||!p.nombre||!isProduct(p.source_url)||!p.slug) throw Error('Identidad incompleta');
  if(p.moneda!=='ARS') throw Error('La moneda del catálogo debe ser ARS');
  for(const v of [p,...p.variantes]) for(const k of ['precio','precio_original','precio_transferencia']) if(v[k]!==null&&(!Number.isFinite(v[k])||v[k]<0)) throw Error(`Precio inválido: ${k}`);
  if(new Set(p.variantes.map(v=>v.external_id)).size!==p.variantes.length) throw Error('Variantes duplicadas');
  if(!p.imagenes.length) throw Error('No se encontraron imágenes');
  return p;
}
