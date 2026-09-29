-- Read-only catalogue and physical-mapping invariants. Safe on the live DB.
do $$
declare box_id bigint;
begin
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 if (select count(*) from public.catalogo_variante)<>217
  or (select count(distinct producto_id) from public.catalogo_variante)<>106
  or (select count(*) from public.catalogo_variante_mapeo where aprobado)<>217
 then raise exception 'Cantidad de productos, variantes o mappings inesperada'; end if;
 if exists(select 1 from public.catalogo_variante cv
   join public.producto p on p.id_producto=cv.producto_id
   join public.catalogo_producto cp on cp.producto_id=p.id_producto
   where p.activo and cp.publicado and cv.vigente and cv.disponible
    and (p.moneda<>'ARS' or cv.precio is null or cv.precio<=0))
 then raise exception 'Variante publicada sin precio ARS válido'; end if;
 if exists(select 1 from public.catalogo_variante_mapeo m
   where m.aprobado and not exists(select 1 from public.catalogo_variante_componente c
     where c.variante_id=m.variante_id))
 then raise exception 'Mapping aprobado sin componente físico'; end if;
 if exists(select 1 from public.catalogo_variante_componente c
   left join public.producto_simple s on s.id_producto=c.producto_simple_id
   left join private.inventario_ficha f on f.producto_id=c.producto_simple_id
   where c.cantidad<=0 or s.id_producto is null or f.producto_id is null)
 then raise exception 'Componente con cantidad inválida o SKU físico inexistente'; end if;
 if (select count(*) from public.producto p where p.tipo='combo' and exists(
    select 1 from public.catalogo_variante cv join public.catalogo_variante_mapeo m
     on m.variante_id=cv.id and m.aprobado where cv.producto_id=p.id_producto))<>56
  or exists(select 1 from public.producto p where p.tipo='combo' and exists(
    select 1 from public.catalogo_variante cv where cv.producto_id=p.id_producto
     and not exists(select 1 from public.catalogo_variante_mapeo m
      where m.variante_id=cv.id and m.aprobado)))
 then raise exception 'Combo con composición incompleta'; end if;
 if exists(select 1 from (
   select c.variante_id,
    coalesce(sum(c.cantidad) filter(where s.categoria='Mates'),0) mates,
    coalesce(sum(c.cantidad) filter(where c.producto_simple_id=box_id),0) cajas
   from public.catalogo_variante_componente c
   join public.producto_simple s on s.id_producto=c.producto_simple_id
   group by c.variante_id
  ) quantities where mates<>cajas)
 then raise exception 'Cajas distintas de mates físicos en un mapping'; end if;
 if exists(select 1 from public.producto p where p.id_producto=box_id
   and (p.activo or p.precio is not null))
  or exists(select 1 from public.catalogo_variante cv where cv.producto_id=box_id)
 then raise exception 'Caja expuesta como producto comercial'; end if;
 if position('MB-' in pg_get_functiondef('public.mb_checkout_catalogo(text,uuid,jsonb)'::regprocedure))>0
 then raise exception 'Checkout depende de un SKU hardcodeado'; end if;
end $$;
