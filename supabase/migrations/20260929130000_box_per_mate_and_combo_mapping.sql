-- Packaging is one physical box per physical mate, including mates in sets.
-- The box is an inactive inventory article, not a retail publication.
do $$ declare box_id bigint; begin
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 if box_id is null then
  insert into public.producto(nombre,precio,tipo,activo,moneda)
   values('Caja para mate',null,'simple',false,'ARS') returning id_producto into box_id;
  insert into public.producto_simple(id_producto,material,categoria,diseno,stock)
   values(box_id,'Por confirmar','Packaging','Caja para mate',0);
  insert into private.inventario_ficha(producto_id,sku,abastecimiento,aproximado,notas)
   values(box_id,'MB-CAJA-MATE','stock',true,
    'Una caja por cada mate físico vendido. Existencia real pendiente de carga administrativa; no es una publicación comercial.');
  insert into private.inventario_ajuste(operacion_id,producto_id,actor_nombre,tipo,cantidad_declarada,
   disponible_anterior,disponible_nuevo,reservado,motivo)
   values(gen_random_uuid(),box_id,'Alta de SKU físico','inicial',0,0,0,0,
    'Caja para mate creada sin declarar existencias; pendiente de conteo o recepción');
 end if;
 if (select stock from public.producto_simple where id_producto=box_id) is null
  then raise exception 'El stock de MB-CAJA-MATE debe ser un número conocido'; end if;
end $$;

-- A single source of truth: physical mate components are the rows whose
-- inventory category is Mates. This works for individual products, sets and
-- future mate SKUs without a rule for each catalogue publication.
create function private.mb_sync_caja_mate(p_variante_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
declare box_id bigint; boxes integer;
begin
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 if box_id is null then raise exception 'Falta el SKU físico de caja para mate'; end if;
 select coalesce(sum(c.cantidad),0)::integer into boxes
 from public.catalogo_variante_componente c
 join public.producto_simple s on s.id_producto=c.producto_simple_id
 where c.variante_id=p_variante_id and s.categoria='Mates';
 if boxes=0 then
  delete from public.catalogo_variante_componente
   where variante_id=p_variante_id and producto_simple_id=box_id;
 else
  insert into public.catalogo_variante_componente
   (variante_id,producto_simple_id,cantidad,evidencia,requiere_grabado)
  values(p_variante_id,box_id,boxes,
   'Regla física: una caja por unidad de mate base en esta variante',false)
  on conflict(variante_id,producto_simple_id) do update
   set cantidad=excluded.cantidad,evidencia=excluded.evidencia,requiere_grabado=false;
 end if;
end $$;
revoke all on function private.mb_sync_caja_mate(bigint) from public,anon,authenticated;
grant execute on function private.mb_sync_caja_mate(bigint) to service_role;

create function private.mb_sync_caja_mate_trigger()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 -- The helper writes the box row, which fires this trigger a second time.
 if pg_trigger_depth()>1 then return null; end if;
 if tg_op='DELETE' then
  perform private.mb_sync_caja_mate(old.variante_id);
 else
  perform private.mb_sync_caja_mate(new.variante_id);
  if tg_op='UPDATE' and old.variante_id<>new.variante_id then
   perform private.mb_sync_caja_mate(old.variante_id);
  end if;
 end if;
 return null;
end $$;
revoke all on function private.mb_sync_caja_mate_trigger() from public,anon,authenticated;
create trigger mb_caja_mate_componente
after insert or update or delete on public.catalogo_variante_componente
for each row execute function private.mb_sync_caja_mate_trigger();

-- Reconcile already-approved mates before adding the remaining combinations.
do $$ declare v record; begin
 for v in select distinct c.variante_id from public.catalogo_variante_componente c
  join public.producto_simple s on s.id_producto=c.producto_simple_id where s.categoria='Mates' loop
  perform private.mb_sync_caja_mate(v.variante_id);
 end loop;
end $$;

-- All currently imported sets have one explicit mate option. The 31 set
-- galleries were reviewed: only SET MATERO MUNDIAL 2026 has a black thermo;
-- the other 30 show a silver thermo. This is a one-time current-catalogue
-- reconciliation, not an inference rule for products added in the future.
create temporary table mb_combo_plan (
 variante_id bigint not null,sku text not null,cantidad integer not null,
 requiere_grabado boolean not null,evidencia text not null,
 primary key(variante_id,sku)
) on commit drop;
create temporary table mb_combo_candidate on commit drop as
select cv.id variante_id,p.nombre,p.descripcion,cv.opciones,
 case cv.opciones->>'MODELO DE MATE'
  when 'IMPERIAL DE CALABAZA' then 'MB-IMP-CAL'
  when 'IMPERIAL DE ALGARROBO' then 'MB-IMP-ALG' end mate_sku,
 case when p.nombre like 'SET MATERO%' or p.nombre like 'SET PREMIUM%'
  then case when p.nombre='SET MATERO MUNDIAL 2026' then 'MB-TER-NEG' else 'MB-TER-PLA' end end termo_sku
from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where m.variante_id is null and cv.vigente and cv.disponible and cv.precio is not null
 and p.tipo='combo' and (p.nombre like 'SET DELUXE%' or p.nombre like 'SET MATERO%' or p.nombre like 'SET PREMIUM%')
 -- The sheath mentioned only by this set has no confirmed physical identity.
 and p.nombre<>'SET PREMIUM PERSONALIZADO - TU PROPIO DISEÑO';

do $$ declare n integer; begin
 select count(*) into n from mb_combo_candidate;
 if n<>84 then raise exception 'Cambió el catálogo de combos: % variantes; se esperaban 84',n; end if;
 if exists(select 1 from mb_combo_candidate where mate_sku is null) then
  raise exception 'Combo sin modelo físico de mate explícito'; end if;
 if exists(select 1 from mb_combo_candidate where
  (nombre like 'SET DELUXE%' and (descripcion !~* 'tabla' or descripcion !~* 'cuchillo'))
  or (nombre like 'SET PREMIUM%' and (descripcion !~* 'tabla' or descripcion !~* 'cuchillo' or descripcion !~* 'bombilla'))
  or ((nombre like 'SET MATERO%' or nombre like 'SET PREMIUM%') and descripcion !~* 'termo')) then
  raise exception 'La composición de un combo ya no coincide con la importación revisada'; end if;
end $$;

insert into mb_combo_plan
select variante_id,mate_sku,1,true,'Opción MODELO DE MATE fija la pieza física, grabada para este set'
from mb_combo_candidate;
insert into mb_combo_plan
select variante_id,termo_sku,1,true,
 'Termo de la galería importada: cuerpo negro solo en Mundial 2026, plateado en los demás sets'
from mb_combo_candidate where termo_sku is not null;
insert into mb_combo_plan
select variante_id,'MB-BOM-PICO-LORO',1,false,
 'Bombilla física del set, confirmada en texto o galería importada'
from mb_combo_candidate where termo_sku is not null;
insert into mb_combo_plan
select variante_id,'MB-TABLA',1,true,'Tabla 20 × 30 cm indicada en la composición importada'
from mb_combo_candidate where nombre like 'SET DELUXE%' or nombre like 'SET PREMIUM%';
insert into mb_combo_plan
select variante_id,'MB-CUC-INOX',1,true,'Cuchillo utilizado en los sets publicados'
from mb_combo_candidate where nombre like 'SET DELUXE%' or nombre like 'SET PREMIUM%';

do $$ declare n integer; begin
 select count(*) into n from mb_combo_plan;
 if n<>296 then raise exception 'Plan incompleto de componentes: %; se esperaban 296',n; end if;
 if exists(select 1 from mb_combo_plan p left join private.inventario_ficha f on f.sku=p.sku
  where f.producto_id is null) then raise exception 'Plan de combos con SKU físico inexistente'; end if;
end $$;
insert into public.catalogo_variante_mapeo(variante_id,aprobado,revisado_en,nota)
select variante_id,true,now(),
 'Componentes físicos completos; una caja por mate se añade por regla central de inventario'
from mb_combo_candidate;
insert into public.catalogo_variante_componente
 (variante_id,producto_simple_id,cantidad,evidencia,requiere_grabado)
select p.variante_id,f.producto_id,p.cantidad,p.evidencia,p.requiere_grabado
from mb_combo_plan p join private.inventario_ficha f on f.sku=p.sku;

-- Superseded review notes described a special premium gift box. The shared
-- physical mate box resolves those notes; the knife sheath remains separate.
update public.catalogo_revision r set resuelto=true
from public.producto p where r.producto_id=p.id_producto
 and (p.nombre like 'SET DELUXE%' or p.nombre like 'SET MATERO%' or p.nombre like 'SET PREMIUM%')
 and r.motivo in ('Caja de regalo incluida sin SKU físico ni regla de consumo confirmada',
  'Caja de regalo premium incluida sin SKU físico ni regla de abastecimiento confirmada');
insert into public.catalogo_revision(producto_id,motivo)
select id_producto,'El set personalizado menciona funda de cuchillo; confirmar si está incluida en MB-CUC-INOX o necesita SKU propio'
from public.producto where nombre='SET PREMIUM PERSONALIZADO - TU PROPIO DISEÑO'
on conflict do nothing;

do $$ declare box_id bigint; bad integer; begin
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 select count(*) into bad from (
  select m.variante_id,
   coalesce(sum(c.cantidad) filter(where s.categoria='Mates'),0) mates,
   coalesce(sum(c.cantidad) filter(where c.producto_simple_id=box_id),0) cajas
  from public.catalogo_variante_mapeo m
  join public.catalogo_variante_componente c on c.variante_id=m.variante_id
  join public.producto_simple s on s.id_producto=c.producto_simple_id
  where m.aprobado group by m.variante_id
 ) x where mates<>cajas;
 if bad<>0 then raise exception 'Hay % mappings con cantidad incorrecta de cajas',bad; end if;
end $$;
