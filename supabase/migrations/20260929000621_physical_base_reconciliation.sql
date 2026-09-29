-- Keep the service-only reporting RPC under the caller's privileges.
alter function public.mb_inventario_reconciliacion() security invoker;

-- Commercially confirmed physical bases. Existing stock values are untouched.
update public.producto p set nombre=x.nombre,actualizado_en=now()
from (values
 ('MB-TER-NEG','Termo negro 1L media manija'),
 ('MB-TER-PLA','Termo plateado 1L media manija'),
 ('MB-MATERA','Matera ecocuero negra'),
 ('MB-QUENCHER','Vaso Quencher negro grabable'),
 ('MB-TABLA','Tabla de madera 20 × 30 cm'),
 ('MB-CUC-INOX','Cuchillo inoxidable para sets')
) x(sku,nombre) join private.inventario_ficha f on f.sku=x.sku
where p.id_producto=f.producto_id;
update public.producto_simple s set material='Ecocuero',diseno='Negra sin grabar'
from private.inventario_ficha f where f.producto_id=s.id_producto and f.sku='MB-MATERA';
update public.producto_simple s set diseno='Negro sin grabar'
from private.inventario_ficha f where f.producto_id=s.id_producto and f.sku='MB-QUENCHER';

-- No received quantity was supplied: zero means no units recorded for sale.
do $$ declare physical_id bigint; begin
 if not exists(select 1 from private.inventario_ficha where sku='MB-BOM-PICO-LORO') then
  insert into public.producto(nombre,precio,tipo,activo,moneda)
  values('Bombilla de acero pico de loro',null,'simple',false,'ARS') returning id_producto into physical_id;
  insert into public.producto_simple(id_producto,material,categoria,diseno,stock)
  values(physical_id,'Acero inoxidable','Bombillas','Sin grabar',0);
  insert into private.inventario_ficha(producto_id,sku,abastecimiento,aproximado,notas)
  values(physical_id,'MB-BOM-PICO-LORO','stock',true,
   'Sin cantidad física confiable; registrar conteo o recepción al llegar. Todas las presentaciones comparten este SKU.');
  insert into private.inventario_ajuste(operacion_id,producto_id,actor_nombre,tipo,cantidad_declarada,
   disponible_anterior,disponible_nuevo,reservado,motivo)
  values(gen_random_uuid(),physical_id,'Alta de SKU físico','inicial',0,0,0,0,
   'SKU creado sin declarar existencias; pendiente de conteo administrativo');
 end if;
end $$;

-- A line may reserve multiple blank pieces; engraving is tracked per component.
alter table public.catalogo_variante_componente add column requiere_grabado boolean not null default false;
update public.catalogo_variante_componente mc set requiere_grabado=true
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
where mc.variante_id=cv.id and (p.nombre like 'IMPERIAL PREMIUM%' or p.nombre like 'MI MATE %'
 or (p.nombre like 'CAMIONERO%' and p.nombre<>'CAMIONERO DE ALGARROBO'));

create temporary table mb_map_plan (
 variante_id bigint not null,sku text not null,cantidad integer not null,
 requiere_grabado boolean not null,evidencia text not null,
 primary key(variante_id,sku)
) on commit drop;

-- 49 add-on bombillas. The mate base is selected from explicit model/name;
-- club art and leather finish are not stock identities.
with candidate as (
 select cv.id,p.nombre,
  case when cv.opciones->>'MODELO DE MATE'='IMPERIAL DE CALABAZA' then 'MB-IMP-CAL'
   when cv.opciones->>'MODELO DE MATE'='IMPERIAL DE ALGARROBO' then 'MB-IMP-ALG'
   when p.nombre like 'CAMIONERO%' or p.nombre like 'MI MATE CAMIONERO%' then 'MB-CAM-ALG'
   when p.nombre like '%IMPERIAL%ALGARROBO%' then 'MB-IMP-ALG'
   when p.nombre in ('IMPERIAL NEGRO DE ALPACA','MI MATE IMPERIAL - CREÁ TU DISEÑO ACÁ') then 'MB-IMP-CAL' end base_sku
 from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
 left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
 where m.variante_id is null and p.tipo='simple' and cv.vigente and cv.disponible and cv.precio is not null
  and exists(select 1 from jsonb_each_text(cv.opciones) kv where kv.key ilike '%BOMBILLA%' and kv.value='SI')
)
insert into mb_map_plan(variante_id,sku,cantidad,requiere_grabado,evidencia)
select id,base_sku,1,
 nombre like 'IMPERIAL PREMIUM%' or nombre like 'MI MATE %' or (nombre like 'CAMIONERO%' and nombre<>'CAMIONERO DE ALGARROBO'),
 'Modelo/nombre de mate físico; opción bombilla SI se reserva aparte'
from candidate where base_sku is not null;
insert into mb_map_plan(variante_id,sku,cantidad,requiere_grabado,evidencia)
select variante_id,'MB-BOM-PICO-LORO',1,false,'Opción bombilla SI; SKU único confirmado por operación'
from mb_map_plan where sku<>'MB-BOM-PICO-LORO';

-- The previously ambiguous calabaza finishes now share the confirmed blank.
insert into mb_map_plan
select cv.id,'MB-IMP-CAL',1,p.nombre like 'MI MATE %',
 'Descripción: imperial de calabaza; el acabado de cuero/alpaca no separa stock'
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where m.variante_id is null and p.nombre in ('IMPERIAL NEGRO DE ALPACA','MI MATE IMPERIAL - CREÁ TU DISEÑO ACÁ')
 and cv.vigente and cv.disponible and cv.precio is not null
 and cv.opciones->>'Agregar BOMBILLA DE ACERO'='NO';
-- The custom mate uses a different source option label.
insert into mb_map_plan
select cv.id,'MB-IMP-CAL',1,true,
 'Descripción: imperial personalizado de calabaza; cuero negro no separa stock'
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where m.variante_id is null and p.nombre='MI MATE IMPERIAL - CREÁ TU DISEÑO ACÁ'
 and cv.opciones->>'Agregar BOMBILLA PICO LORO ACERO'='NO' and cv.vigente and cv.disponible;

insert into mb_map_plan
select cv.id,'MB-BOM-PICO-LORO',1,false,'Bombilla de acero pico de loro vendida individualmente'
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where m.variante_id is null and p.nombre='BOMBILLA DE ACERO PICO DE LORO' and cv.vigente;
insert into mb_map_plan
select cv.id,'MB-MATERA',1,false,'Matera ecocuero negra confirmada como base física'
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where m.variante_id is null and p.nombre='MATERA NEGRA ECOCUERO' and cv.vigente;
insert into mb_map_plan
select cv.id,case p.nombre when 'TERMO MEDIA MANIJA PLATEADO' then 'MB-TER-PLA' else 'MB-TER-NEG' end,
 1,false,'Color y media manija explícitos; SKU físico confirmado'
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where m.variante_id is null and p.nombre in ('TERMO MEDIA MANIJA PLATEADO','TERMO PREMIUM NEGRO 1L') and cv.vigente;

-- All 13 parrillero descriptions specify exactly one 20x30 board and one knife.
insert into mb_map_plan
select cv.id,f.sku,1,true,'catalogo_componente: tabla 20x30 y cuchillo premium grabados'
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
join public.catalogo_componente cc on cc.combo_id=p.id_producto
join private.inventario_ficha f on f.sku in ('MB-TABLA','MB-CUC-INOX')
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where m.variante_id is null and p.nombre like 'SET PARRILLERO%' and cv.vigente
 and cc.evidencia ilike '%tabla%' and cc.evidencia ilike '%cuchillo%'
 and cc.evidencia ilike '%20x30%';

do $$ declare count_variants integer; count_components integer; begin
 select count(distinct variante_id),count(*) into count_variants,count_components from mb_map_plan;
 if count_variants<>68 or count_components<>130 then
  raise exception 'Plan incompleto: % variantes / % componentes; se esperaban 68 / 130',count_variants,count_components;
 end if;
 if exists(select 1 from mb_map_plan plan left join private.inventario_ficha f on f.sku=plan.sku
  where f.producto_id is null) then raise exception 'Plan con SKU inexistente'; end if;
end $$;
insert into public.catalogo_variante_mapeo(variante_id,aprobado,revisado_en,nota)
select distinct variante_id,true,now(),'Bases físicas confirmadas por operación; composición completa'
from mb_map_plan;
insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia,requiere_grabado)
select plan.variante_id,f.producto_id,plan.cantidad,plan.evidencia,plan.requiere_grabado
from mb_map_plan plan join private.inventario_ficha f on f.sku=plan.sku;

-- Unselected thermo colour and gift packaging remain manual review items.
insert into public.catalogo_revision(producto_id,motivo)
select p.id_producto,'Color de termo no seleccionado: definir variante física antes de aprobar mapping'
from public.producto p where (p.nombre like 'TERMO%' and p.nombre not in
 ('TERMO MEDIA MANIJA PLATEADO','TERMO PREMIUM NEGRO 1L'))
 or p.nombre like 'SET MATERO%' or p.nombre like 'SET PREMIUM%'
on conflict do nothing;
insert into public.catalogo_revision(producto_id,motivo)
select id_producto,'Caja de regalo incluida sin SKU físico ni regla de consumo confirmada'
from public.producto where nombre like 'SET DELUXE%'
on conflict do nothing;
