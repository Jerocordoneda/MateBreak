// One-time migration of legacy mock product grids, preserving page shells/branding.
import {readFile,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
const shop=await readFile('src/pages/tienda.html','utf8');
const brand=shop.match(/<a data-page-brand class="mb-site-brand mb-page-brand"[\s\S]*?<\/a>/)[0];
const detail=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Producto · MateBreak</title><link rel="stylesheet" href="/src/css/commerce.css"><link rel="stylesheet" href="/src/css/site-brand.css"><link rel="stylesheet" href="/src/css/catalog.css"><script type="module" src="/src/features/catalog/product-detail.js"></script><script type="module" src="/src/js/header-account.js"></script></head><body data-brand-shell="commerce"><a class="skip-link" href="#product-content">Saltar al producto</a><main>${brand}<nav class="commerce-sections" aria-label="Mi compra"><a href="/tienda#catalogo">Catálogo</a><a href="/tienda#carrito" data-cart-link>Mi carrito</a><a href="/mi-cuenta" data-account-link>Mi cuenta</a></nav><div id="product-content" aria-live="polite"><p>Cargando producto…</p></div></main><footer class="site-footer"><a href="/">MateBreak®</a><span>Una buena pausa cambia el día.</span></footer></body></html>`;
await writeFile('src/pages/producto.html',detail);
const pages={
 'index.html':{featured:true},
 'src/pages/algarrobo.html':{search:'algarrobo'},'src/pages/calabaza.html':{search:'calabaza'},
 'src/pages/camionero.html':{search:'camionero'},'src/pages/mates-personalizados.html':{category:'mates-grabados'},
 'src/pages/termos.html':{category:'termos'},'src/pages/termos-exclusivos.html':{category:'termos'},
 'src/pages/termos-personalizados.html':{category:'termos--termos-personalizados'},
 'src/pages/sets.html':{category:'set-materos'},'src/pages/sets-materos.html':{category:'set-materos--combos-personalizados'},
 'src/pages/sets-parrilleros.html':{category:'set-materos--set-parrilleros-premium'},
 'src/pages/sets-premium.html':{category:'set-materos--sets-premium'},'src/pages/accesorios.html':{category:'accesorios'}
};
for(const [file,options]of Object.entries(pages)){
 let html;try{html=await readFile(file,'utf8');}catch{continue;}
 const $=load(html,{sourceCodeLocationInfo:true});
 if($('[data-catalog]').length)continue;
 const candidates=$('div.grid').toArray().filter(n=>$(n).find('a').length&&(/ARS|\$[\d.]+/.test($(n).text()))&&!$(n).parents('div.grid').length);
 const ranges=candidates.map(n=>n.sourceCodeLocation).filter(Boolean).sort((a,b)=>b.startOffset-a.startOffset);
 const mount=`<div class="catalog-home" data-catalog="${options.featured?'featured':'all'}" ${options.featured?'data-limit="4"':''} data-category="${options.category||''}" data-search="${options.search||''}"></div>`;
 for(const r of ranges)html=html.slice(0,r.startOffset)+mount+html.slice(r.endOffset);
 if(!ranges.length){console.log('Sin cuadrícula localizada:',file);continue;}
 html=html.replace('</head>','<link rel="stylesheet" href="/src/css/catalog.css"><script type="module" src="/src/features/catalog/catalog-pages.js"></script></head>');
 await writeFile(file,html);console.log(file,':',ranges.length,'cuadrículas conectadas');
}
