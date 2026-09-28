-- A sale without a bombilla consumes the documented blank camionero de algarrobo.
-- Product descriptions state the material; the design is engraving, not a SKU.
do $$
declare candidate_count integer; physical_id bigint;
begin
 select f.producto_id into physical_id from private.inventario_ficha f
 join public.producto_simple s on s.id_producto=f.producto_id
 where f.sku='MB-CAM-ALG' and f.abastecimiento='stock' and s.stock is not null;
 if physical_id is null then raise exception 'Falta MB-CAM-ALG apto para reserva'; end if;
 select count(*) into candidate_count
 from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
 left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
 where m.variante_id is null and p.tipo='simple' and cv.vigente and cv.disponible and cv.precio is not null
  and ((p.nombre like 'CAMIONERO%' and p.descripcion ilike 'MATE CAMIONERO DE ALGARROBO%'
        and cv.opciones->>'BOMBILLA ACERO INOX'='NO')
   or (p.nombre='MI MATE CAMIONERO - CREÁ TU DISEÑO ACÁ'
        and p.descripcion ilike 'CAMIONERO DE ALGARROBO PERSONALIZADO%'
        and cv.opciones->>'Agregar BOMBILLA PICO LORO ACERO'='NO'));
 if candidate_count<>6 then raise exception 'La regla esperaba 6 variantes, encontró %',candidate_count; end if;
 insert into public.catalogo_variante_mapeo(variante_id,aprobado,revisado_en,nota)
 select cv.id,true,now(),'Camionero de algarrobo explícito, sin bombilla; base física MB-CAM-ALG'
 from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
 left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
 where m.variante_id is null and p.tipo='simple' and cv.vigente and cv.disponible and cv.precio is not null
  and ((p.nombre like 'CAMIONERO%' and p.descripcion ilike 'MATE CAMIONERO DE ALGARROBO%'
        and cv.opciones->>'BOMBILLA ACERO INOX'='NO')
   or (p.nombre='MI MATE CAMIONERO - CREÁ TU DISEÑO ACÁ'
        and p.descripcion ilike 'CAMIONERO DE ALGARROBO PERSONALIZADO%'
        and cv.opciones->>'Agregar BOMBILLA PICO LORO ACERO'='NO'));
 insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia)
 select variante_id,physical_id,1,'Descripción: camionero de algarrobo personalizado; opción de bombilla NO'
 from public.catalogo_variante_mapeo
 where nota='Camionero de algarrobo explícito, sin bombilla; base física MB-CAM-ALG';
end $$;

-- Service-only read model for the reusable reconciliation report. No public
-- inventory quantities or privileges are exposed to the browser.
create function public.mb_inventario_reconciliacion()
returns table(producto_id bigint,sku text,nombre text,material text,abastecimiento text,stock integer)
language sql stable security definer set search_path='' as $$
 select f.producto_id,f.sku,p.nombre,s.material,f.abastecimiento,s.stock
 from private.inventario_ficha f join public.producto p on p.id_producto=f.producto_id
 join public.producto_simple s on s.id_producto=f.producto_id order by f.sku;
$$;
revoke all on function public.mb_inventario_reconciliacion() from public,anon,authenticated;
grant execute on function public.mb_inventario_reconciliacion() to service_role;
