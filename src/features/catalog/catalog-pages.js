import {mountCatalog} from './catalog-ui.js';
if(location.pathname==='/tienda'&&location.hash==='#carrito')location.replace('/carrito');
const params = new URLSearchParams(location.search);
for(const target of document.querySelectorAll('[data-catalog]'))mountCatalog(target,{
 category:params.get('categoria')||target.dataset.category||'',search:params.get('q')||target.dataset.search||'',featured:target.dataset.catalog==='featured',
 limit:target.dataset.limit?Number(target.dataset.limit):null,filters:target.dataset.catalog!=='featured'
});
