create or replace function public.mb_importar_catalogo(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare pid bigint; nuevo boolean; r jsonb; cid bigint; parentid bigint; ids bigint[]:='{}';
begin
 perform pg_advisory_xact_lock(hashtextextended('matebreak_catalog_import',0));
 if nullif(p->>'external_id','') is null or nullif(p->>'nombre','') is null
 or p->>'source_url' not like 'https://matebreak.com.ar/productos/%' then raise exception 'Producto invalido'; end if;
 select id_producto into pid from public.producto where external_id=p->>'external_id';
 nuevo:=pid is null;
 if nuevo then
  insert into public.producto(nombre,descripcion,precio,tipo,activo,source_url,external_id,slug,moneda)
  values(p->>'nombre',p->>'descripcion',(p->>'precio')::numeric,p->>'tipo',
   (p->>'precio') is not null,p->>'source_url',p->>'external_id',p->>'slug',p->>'moneda') returning id_producto into pid;
 else
  update public.producto set nombre=p->>'nombre',descripcion=p->>'descripcion',precio=(p->>'precio')::numeric,
   activo=(p->>'precio') is not null,source_url=p->>'source_url',slug=p->>'slug',moneda=p->>'moneda',actualizado_en=now()
   where id_producto=pid;
  if (select tipo from public.producto where id_producto=pid)<>p->>'tipo' then raise exception 'Cambio de tipo requiere revision'; end if;
 end if;
 if p->>'tipo'='simple' then
  insert into public.producto_simple(id_producto,material,stock) values(pid,p->>'material',null) on conflict(id_producto) do nothing;
 else insert into public.combo(id_producto) values(pid) on conflict do nothing; end if;
 insert into public.catalogo_producto(producto_id,disponible,precio_original,precio_transferencia,descuento,cuotas,envio_gratis,destacado,
  descripcion_origen,personalizacion,atributos,source_hash,extraido_en,publicado)
 values(pid,(p->>'disponible')::boolean,(p->>'precio_original')::numeric,(p->>'precio_transferencia')::numeric,
  (p->>'descuento')::numeric,p->'cuotas',(p->>'envio_gratis')::boolean,(p->>'destacado')::boolean,
  p->>'descripcion_html',p->'personalizacion',p->'atributos',p->>'source_hash',(p->>'extraido_en')::timestamptz,true)
 on conflict(producto_id) do update set disponible=excluded.disponible,precio_original=excluded.precio_original,
  precio_transferencia=excluded.precio_transferencia,descuento=excluded.descuento,cuotas=excluded.cuotas,
  envio_gratis=excluded.envio_gratis,destacado=excluded.destacado,descripcion_origen=excluded.descripcion_origen,
  personalizacion=excluded.personalizacion,atributos=excluded.atributos,source_hash=excluded.source_hash,
  extraido_en=excluded.extraido_en,importado_en=now(),publicado=true;
 -- Replace only imported descriptive relations; preserve products, assets and cart lines.
 delete from public.catalogo_producto_categoria where producto_id=pid;
 delete from public.catalogo_opcion where producto_id=pid;
 delete from public.catalogo_promocion where producto_id=pid;
 parentid:=null;
 for r in select * from jsonb_array_elements(p->'categorias') loop
  insert into public.catalogo_categoria(nombre,slug,source_url,padre_id)
   values(r->>'nombre',r->>'slug',r->>'source_url',parentid)
   on conflict(source_url) do update set nombre=excluded.nombre returning id into cid;
  insert into public.catalogo_producto_categoria values(pid,cid) on conflict do nothing;
  parentid:=cid;
 end loop;
 for r in select * from jsonb_array_elements(p->'opciones') loop
  insert into public.catalogo_opcion values(pid,(r->>'posicion')::integer,r->>'nombre',r->'valores')
  on conflict(producto_id,posicion) do update set nombre=excluded.nombre,valores=excluded.valores;
 end loop;
 update public.catalogo_variante set vigente=false where producto_id=pid;
 for r in select * from jsonb_array_elements(p->'variantes') loop
  insert into public.catalogo_variante(producto_id,external_id,opciones,precio,precio_original,precio_transferencia,cuotas,disponible,stock_origen,sku,imagen_origen)
  values(pid,r->>'external_id',r->'opciones',(r->>'precio')::numeric,(r->>'precio_original')::numeric,
   (r->>'precio_transferencia')::numeric,r->'cuotas',(r->>'disponible')::boolean,(r->>'stock')::integer,r->>'sku',r->>'imagen')
  on conflict(external_id) do update set opciones=excluded.opciones,precio=excluded.precio,precio_original=excluded.precio_original,
   precio_transferencia=excluded.precio_transferencia,cuotas=excluded.cuotas,disponible=excluded.disponible,
   stock_origen=excluded.stock_origen,sku=excluded.sku,imagen_origen=excluded.imagen_origen,vigente=true;
 end loop;
 update public.catalogo_imagen set vigente=false where producto_id=pid;
 for r in select * from jsonb_array_elements(p->'imagenes') loop
  insert into public.catalogo_asset values(r->>'sha256',r->>'storage_path',r->>'mime_type',(r->>'bytes')::bigint) on conflict do nothing;
  insert into public.catalogo_imagen values(pid,r->>'source_url',r->>'sha256',(r->>'posicion')::integer,r->>'rol',r->>'alt',true)
  on conflict(producto_id,source_url) do update set asset_hash=excluded.asset_hash,posicion=excluded.posicion,rol=excluded.rol,alt=excluded.alt,vigente=true;
 end loop;
 for r in select * from jsonb_array_elements(p->'promociones') loop
  insert into public.catalogo_promocion values(pid,r#>>'{}') on conflict do nothing;
 end loop;
 for r in select * from jsonb_array_elements(p->'componentes') loop
  insert into public.catalogo_componente(combo_id,evidencia,source_url) values(pid,r->>'evidencia',r->>'source_url') on conflict do nothing;
 end loop;
 for r in select * from jsonb_array_elements(p->'revision') loop
  insert into public.catalogo_revision(producto_id,motivo) values(pid,r#>>'{}') on conflict do nothing;
 end loop;
 return jsonb_build_object('id',pid::text,'creado',nuevo);
end $$;
