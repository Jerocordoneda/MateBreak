import {catalogImageUrl} from './images.mjs';
const selection = `id_producto,nombre,descripcion,precio,tipo,activo,slug,moneda,
 catalogo_producto!inner(disponible,precio_original,precio_transferencia,descuento,cuotas,envio_gratis,destacado,publicado,personalizacion,atributos),
 catalogo_producto_categoria(catalogo_categoria(id,nombre,slug,padre_id)),
 catalogo_opcion(posicion,nombre,valores),
 catalogo_variante(id,opciones,precio,precio_original,precio_transferencia,cuotas,disponible,imagen_origen,vigente),
 catalogo_imagen(source_url,posicion,rol,alt,vigente,catalogo_asset(storage_path)),
 catalogo_promocion(texto),combo(catalogo_componente!catalogo_componente_combo_id_fkey(evidencia,cantidad,producto_simple_id))`;

export function catalogRoutes(app, {admin,config}) {
  let cached, until=0, pending;
  async function products() {
    if(cached&&Date.now()<until)return cached;
    if(pending)return pending;
    pending=(async()=>{
      const rows=[];
      const signal=AbortSignal.timeout(15000);
      for(let offset=0;;offset+=200){
        let query=admin.from('producto').select(selection).eq('catalogo_producto.publicado',true).order('id_producto').range(offset,offset+199);
        if(typeof query.abortSignal==='function')query=query.abortSignal(signal);
        const {data,error}=await query;
        if(error)throw Object.assign(Error('No se pudo cargar el catálogo'),{status:503});
        rows.push(...data);if(data.length<200)break;
      }
      let availabilityQuery=admin.rpc('mb_catalogo_disponibilidad');
      if(typeof availabilityQuery.abortSignal==='function')availabilityQuery=availabilityQuery.abortSignal(signal);
      const {data:availability,error:availabilityError}=await availabilityQuery;
      if(availabilityError)throw Object.assign(Error('No se pudo consultar la disponibilidad'),{status:503});
      const inventory=new Map(availability.map(v=>[String(v.variante_id),v]));
      cached=rows.map(row=>{
        const {catalogo_producto:details,catalogo_producto_categoria,catalogo_opcion,catalogo_variante,catalogo_imagen,catalogo_promocion,combo,...base}=row;
        const images=catalogo_imagen.filter(i=>i.vigente).sort((a,b)=>a.posicion-b.posicion).map(i=>({url:catalogImageUrl(admin,config,i.catalogo_asset?.storage_path),alt:i.alt,rol:i.rol,source:i.source_url})).filter(i=>i.url);
        return {...base,...details,id_producto:String(row.id_producto),
          categorias:catalogo_producto_categoria.map(c=>c.catalogo_categoria),opciones:catalogo_opcion.sort((a,b)=>a.posicion-b.posicion),
          variantes:catalogo_variante.filter(v=>v.vigente).map(({imagen_origen,vigente,...v})=>({...v,id:String(v.id),comprable:inventory.get(String(v.id))?.comprable??false,con_stock:inventory.get(String(v.id))?.con_stock??false,imagen:images.find(i=>i.source===imagen_origen)?.url||null})),
          imagenes:images.map(({source,...i})=>i),imagen_principal:images[0]?.url||null,
          promociones:catalogo_promocion.map(p=>p.texto),componentes:combo?.catalogo_componente||[]};
      });until=Date.now()+30000;return cached;
    })();
    try{return await pending;}finally{pending=null;}
  }
  app.get('/api/productos',async(req,res)=>{
    let result=await products();
    const term=typeof req.query.q==='string'?req.query.q.trim().toLocaleLowerCase('es'):'';
    if(term)result=result.filter(p=>(p.nombre+' '+p.descripcion).toLocaleLowerCase('es').includes(term));
    if(typeof req.query.categoria==='string')result=result.filter(p=>p.categorias.some(c=>c.slug===req.query.categoria));
    if(req.query.destacados==='true')result=result.filter(p=>p.destacado);
    res.json(result);
  });
  app.get('/api/productos/:slug',async(req,res)=>{
    const p=(await products()).find(p=>p.slug===req.params.slug);
    if(!p)return res.status(404).json({error:'Producto no encontrado'});res.json(p);
  });
  app.get('/api/categorias',async(req,res)=>{
    const categories=new Map();for(const p of await products())for(const c of p.categorias)categories.set(c.id,c);
    res.json([...categories.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')));
  });
}
