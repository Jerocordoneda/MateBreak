-- The current retail publication fixes the physical thermo. Imported titles
-- and descriptions do not contradict the pictured body colour. All gallery
-- photos were reviewed together: 15 silver publications, one black Mundial.
-- These are explicit current publications, not a rule for future titles.
create temporary table mb_thermo_publication (
 nombre text primary key, sku text not null
) on commit drop;
insert into mb_thermo_publication(nombre,sku) values
 ('TERMO DE BELGRANO','MB-TER-PLA'),
 ('TERMO DE CENTRAL','MB-TER-PLA'),
 ('TERMO DE ESTUDIANTES','MB-TER-PLA'),
 ('TERMO DE INDEPENDIENTE','MB-TER-PLA'),
 ('TERMO DE LA ACADEMIA','MB-TER-PLA'),
 ('TERMO DE LANÚS','MB-TER-PLA'),
 ('TERMO DE NEWELL´S','MB-TER-PLA'),
 ('TERMO DE TALLERES','MB-TER-PLA'),
 ('TERMO DE VELEZ','MB-TER-PLA'),
 ('TERMO DEL CICLÓN','MB-TER-PLA'),
 ('TERMO DEL MILLONARIO','MB-TER-PLA'),
 ('TERMO DEL XENEIZE','MB-TER-PLA'),
 ('TERMO PERSONALIZADO - CREÁ TU DISEÑO ACÁ','MB-TER-PLA'),
 ('TERMO PREMIUM ARGENTINO','MB-TER-PLA'),
 ('TERMO PREMIUM DE LA SELECCIÓN','MB-TER-PLA'),
 ('TERMO PREMIUM MUNDIAL','MB-TER-NEG');

do $$ declare n integer; begin
 select count(*) into n from mb_thermo_publication t
 join public.producto p on p.nombre=t.nombre
 join public.catalogo_variante cv on cv.producto_id=p.id_producto
 left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
 join private.inventario_ficha f on f.sku=t.sku
 where p.tipo='simple' and cv.vigente and cv.disponible and cv.precio is not null
  and cv.imagen_origen is not null and m.variante_id is null;
 if n<>16 then raise exception 'Publicaciones de termo cambiaron: % variantes, se esperaban 16',n; end if;
 if exists(select 1 from mb_thermo_publication t join public.producto p on p.nombre=t.nombre
   where (t.sku='MB-TER-PLA' and (p.nombre ilike '%NEGRO%' or p.descripcion ~* 'termo[^.]{0,40}negro'))
    or (t.sku='MB-TER-NEG' and (p.nombre ilike '%PLATEADO%' or p.descripcion ~* 'termo[^.]{0,40}plateado')))
  then raise exception 'El texto contradice la foto de algún termo'; end if;
end $$;

insert into public.catalogo_variante_mapeo(variante_id,aprobado,revisado_en,nota)
select cv.id,true,now(),
 'Publicación minorista fija el color. Galería importada revisada: cuerpo '
 || case when t.sku='MB-TER-NEG' then 'negro' else 'plateado' end
 || '; título y descripción no lo contradicen.'
from mb_thermo_publication t join public.producto p on p.nombre=t.nombre
join public.catalogo_variante cv on cv.producto_id=p.id_producto;

insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia,requiere_grabado)
select cv.id,f.producto_id,1,
 'Termo físico '||case when t.sku='MB-TER-NEG' then 'negro' else 'plateado' end
 ||' en galería importada ('||cv.imagen_origen||'); publicación minorista sin elección de color.',true
from mb_thermo_publication t join public.producto p on p.nombre=t.nombre
join public.catalogo_variante cv on cv.producto_id=p.id_producto
join private.inventario_ficha f on f.sku=t.sku;

-- The older review requested a customer colour selector. Resolve that note
-- for these 16 publications and replace the equivalent set note with the
-- actual remaining blocker: premium gift packaging lacks a physical SKU.
update public.catalogo_revision r set resuelto=true
from public.producto p join mb_thermo_publication t on t.nombre=p.nombre
where r.producto_id=p.id_producto
 and r.motivo='Color de termo no seleccionado: definir variante física antes de aprobar mapping';
update public.catalogo_revision r set resuelto=true
from public.producto p
where r.producto_id=p.id_producto and (p.nombre like 'SET MATERO%' or p.nombre like 'SET PREMIUM%')
 and r.motivo='Color de termo no seleccionado: definir variante física antes de aprobar mapping';
insert into public.catalogo_revision(producto_id,motivo)
select id_producto,'Caja de regalo premium incluida sin SKU físico ni regla de abastecimiento confirmada'
from public.producto where nombre like 'SET MATERO%' or nombre like 'SET PREMIUM%'
on conflict do nothing;
