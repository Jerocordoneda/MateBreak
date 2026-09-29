-- Commercial clarification: every physical knife includes its sheath.
-- Complete the two previously held premium variants without a sheath SKU.
create temporary table mb_premium_pending on commit drop as
select cv.id variante_id, cv.opciones,
 case cv.opciones->>'MODELO DE MATE'
  when 'IMPERIAL DE CALABAZA' then 'MB-IMP-CAL'
  when 'IMPERIAL DE ALGARROBO' then 'MB-IMP-ALG' end mate_sku
from public.catalogo_variante cv
join public.producto p on p.id_producto=cv.producto_id
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where p.nombre='SET PREMIUM PERSONALIZADO - TU PROPIO DISEÑO'
 and p.tipo='combo' and p.descripcion ~* 'cuchillo.*funda'
 and cv.vigente and cv.disponible and cv.precio is not null
 and m.variante_id is null;

do $$ begin
 if (select count(*) from mb_premium_pending)<>2
  or exists(select 1 from mb_premium_pending where mate_sku is null)
 then raise exception 'Cambió la composición o las opciones del set premium personalizado'; end if;
 if (select count(distinct mate_sku) from mb_premium_pending)<>2
 then raise exception 'Falta uno de los dos modelos físicos de mate'; end if;
end $$;

-- This changes only the description of an existing physical SKU; stock is untouched.
update public.producto set nombre='Cuchillo inoxidable para sets (vaina incluida)'
where id_producto=(select producto_id from private.inventario_ficha where sku='MB-CUC-INOX');
update private.inventario_ficha
set notas=concat_ws(' ',notas,'Cada cuchillo incluye su vaina; ambos consumen una sola unidad de MB-CUC-INOX.')
where sku='MB-CUC-INOX';

insert into public.catalogo_variante_mapeo(variante_id,aprobado,revisado_en,nota)
select variante_id,true,now(),
 'Composición completa: la vaina está incluida en MB-CUC-INOX; caja automática por mate físico'
from mb_premium_pending;

insert into public.catalogo_variante_componente
 (variante_id,producto_simple_id,cantidad,evidencia,requiere_grabado)
select v.variante_id,f.producto_id,1,parts.evidencia,parts.requiere_grabado
from mb_premium_pending v
cross join lateral (values
 (v.mate_sku,'Opción MODELO DE MATE fija el mate físico del set',true),
 ('MB-TER-PLA','Termo plateado confirmado en la galería importada',true),
 ('MB-BOM-PICO-LORO','Bombilla física incluida en la composición publicada',false),
 ('MB-TABLA','Tabla 20 × 30 cm incluida en la composición publicada',true),
 ('MB-CUC-INOX','Cuchillo personalizado con su vaina incluida en la misma unidad física',true)
) as parts(sku,evidencia,requiere_grabado)
join private.inventario_ficha f on f.sku=parts.sku;

update public.catalogo_revision r set resuelto=true
from public.producto p where r.producto_id=p.id_producto
 and p.nombre='SET PREMIUM PERSONALIZADO - TU PROPIO DISEÑO'
 and r.motivo='El set personalizado menciona funda de cuchillo; confirmar si está incluida en MB-CUC-INOX o necesita SKU propio';

do $$ declare box_id bigint; begin
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 if (select count(*) from public.catalogo_variante_mapeo where aprobado)<>217
  or (select count(*) from public.catalogo_variante_componente c
      join mb_premium_pending v on v.variante_id=c.variante_id)<>12
  or exists(select 1 from mb_premium_pending v
      left join public.catalogo_variante_componente c
       on c.variante_id=v.variante_id and c.producto_simple_id=box_id
      where c.cantidad is distinct from 1)
 then raise exception 'Mappings premium, cuchillo o caja incompletos'; end if;
end $$;
