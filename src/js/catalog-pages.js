import {mountCatalog} from './catalog-ui.js';
for(const target of document.querySelectorAll('[data-catalog]'))mountCatalog(target,{
 category:target.dataset.category||'',search:target.dataset.search||'',featured:target.dataset.catalog==='featured',
 limit:target.dataset.limit?Number(target.dataset.limit):null,filters:target.dataset.catalog!=='featured'
});
