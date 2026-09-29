-- Seller-recorded sales use the same physical boxes as catalogue checkout.
-- Packaging is private inventory consumption, not a priced sales line.
do $$ begin
 if exists(select 1 from private.venta_manual_item i
  join public.producto_simple s on s.id_producto=i.producto_id
  where s.categoria='Mates') then
  raise exception 'Revisar ventas manuales históricas de mates antes de activar caja obligatoria';
 end if;
end $$;
create table private.venta_manual_empaque (
 venta_id uuid not null references private.venta_manual(id) on delete restrict,
 linea integer not null,
 producto_id bigint not null references private.inventario_ficha(producto_id) on delete restrict,
 cantidad integer not null check(cantidad between 1 and 10000),
 primary key(venta_id,linea)
);
create index venta_manual_empaque_producto_idx on private.venta_manual_empaque(producto_id,venta_id);
alter table private.venta_manual_empaque enable row level security;
revoke all on private.venta_manual_empaque from public,anon,authenticated;
grant select,insert on private.venta_manual_empaque to service_role;

create or replace function private.inventario_reservado(p_producto_id bigint)
returns integer language sql stable security invoker set search_path='' as $$
 select ((select coalesce(sum(s.cantidad),0) from public.pedido_stock s join public.pedido p on p.id=s.pedido_id
  where s.producto_simple_id=p_producto_id and p.estado in ('pendiente_pago','pagado','en_preparacion'))+
 (select coalesce(sum(i.cantidad),0) from private.venta_manual_item i join private.venta_manual v on v.id=i.venta_id
  where i.producto_id=p_producto_id and v.estado in ('por_grabar','por_entregar'))+
 (select coalesce(sum(e.cantidad),0) from private.venta_manual_empaque e join private.venta_manual v on v.id=e.venta_id
  where e.producto_id=p_producto_id and v.estado in ('por_grabar','por_entregar')))::integer;
$$;

create function private.mb_caja_venta_manual_item()
returns trigger language plpgsql security invoker set search_path='' as $$
declare box_id bigint; box_stock integer; reserved integer; actor uuid; actor_name text;
begin
 if not exists(select 1 from public.producto_simple where id_producto=new.producto_id and categoria='Mates') then
  return new;
 end if;
 perform pg_advisory_xact_lock(782204,1);
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 if box_id is null then raise exception 'Falta el SKU físico de caja para mate'; end if;
 select stock into box_stock from public.producto_simple where id_producto=box_id for update;
 if box_stock<new.cantidad then raise exception 'Stock insuficiente de cajas para mate'; end if;
 select vendedor_id,vendedor_nombre into actor,actor_name from private.venta_manual where id=new.venta_id;
 reserved:=private.inventario_reservado(box_id);
 update public.producto_simple set stock=stock-new.cantidad where id_producto=box_id;
 update private.inventario_ficha set actualizado_en=now() where producto_id=box_id;
 insert into private.inventario_ajuste(operacion_id,producto_id,actor_id,actor_nombre,tipo,
  cantidad_declarada,disponible_anterior,disponible_nuevo,reservado,motivo)
 values(gen_random_uuid(),box_id,actor,actor_name,'egreso',new.cantidad,box_stock,box_stock-new.cantidad,
  reserved,'Caja para mate en venta manual '||new.venta_id::text||' línea '||new.linea::text);
 insert into private.venta_manual_empaque(venta_id,linea,producto_id,cantidad)
 values(new.venta_id,new.linea,box_id,new.cantidad);
 return new;
end $$;
revoke all on function private.mb_caja_venta_manual_item() from public,anon,authenticated;
create trigger mb_caja_venta_manual_item
after insert on private.venta_manual_item
for each row execute function private.mb_caja_venta_manual_item();

create function private.mb_caja_venta_manual_entrega()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r record; available integer;
begin
 if new.estado<>'entregada' or old.estado='entregada' then return new; end if;
 for r in select producto_id,sum(cantidad)::integer cantidad from private.venta_manual_empaque
  where venta_id=new.id group by producto_id order by producto_id loop
  select stock into available from public.producto_simple where id_producto=r.producto_id for update;
  insert into private.inventario_ajuste(operacion_id,producto_id,actor_id,actor_nombre,tipo,
   cantidad_declarada,disponible_anterior,disponible_nuevo,reservado,motivo)
  values(gen_random_uuid(),r.producto_id,new.vendedor_id,new.vendedor_nombre,'egreso',0,
   available,available,private.inventario_reservado(r.producto_id)+r.cantidad,
   'Entrega de venta manual '||new.id::text||': salen '||r.cantidad||' cajas ya reservadas');
 end loop;
 return new;
end $$;
revoke all on function private.mb_caja_venta_manual_entrega() from public,anon,authenticated;
create trigger mb_caja_venta_manual_entrega
after update of estado on private.venta_manual
for each row execute function private.mb_caja_venta_manual_entrega();
