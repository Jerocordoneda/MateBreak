begin;
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to service_role;

create table private.equipo_inventario (
 usuario_id uuid primary key references auth.users(id) on delete cascade,
 activo boolean not null default true,
 creado_en timestamptz not null default now()
);
create table private.inventario_ficha (
 producto_id bigint primary key references public.producto_simple(id_producto) on delete restrict,
 sku text not null unique check(length(sku) between 1 and 50),
 abastecimiento text not null default 'stock' check(abastecimiento in ('stock','a_pedido')),
 aproximado boolean not null default true,
 minimo integer not null default 0 check(minimo between 0 and 1000000),
 notas text not null default '' check(length(notas)<=1000),
 actualizado_en timestamptz not null default now()
);
create table private.inventario_ajuste (
 id uuid primary key default gen_random_uuid(),
 operacion_id uuid not null unique,
 producto_id bigint not null references private.inventario_ficha(producto_id) on delete restrict,
 actor_id uuid references auth.users(id) on delete set null,
 actor_nombre text not null,
 tipo text not null check(tipo in ('inicial','ingreso','egreso','conteo')),
 cantidad_declarada integer not null check(cantidad_declarada between 0 and 1000000),
 disponible_anterior integer not null check(disponible_anterior>=0),
 disponible_nuevo integer not null check(disponible_nuevo>=0),
 reservado integer not null check(reservado>=0),
 diferencia integer generated always as (disponible_nuevo-disponible_anterior) stored,
 motivo text not null check(length(trim(motivo)) between 3 and 500),
 creado_en timestamptz not null default now()
);
create index inventario_ajuste_producto_fecha_idx on private.inventario_ajuste(producto_id,creado_en desc);
create index inventario_ajuste_actor_idx on private.inventario_ajuste(actor_id);
alter table private.equipo_inventario enable row level security;
alter table private.inventario_ficha enable row level security;
alter table private.inventario_ajuste enable row level security;
revoke all on private.equipo_inventario,private.inventario_ficha,private.inventario_ajuste from public,anon,authenticated;
grant select on private.equipo_inventario to service_role;
grant select,update on private.inventario_ficha to service_role;
grant select,insert on private.inventario_ajuste to service_role;
-- Membership can only be provisioned by a trusted database operator.
-- No customer or inventory screen can grant itself access or rewrite history.
revoke all on public.producto_simple from anon,authenticated;
alter table public.producto_simple enable row level security;

-- Unknown prices are NULL, never a fake selling price of zero.
alter table public.producto alter column precio drop not null;
alter table public.producto add constraint producto_activo_precio_requerido check(not activo or precio is not null);

create function public.mb_inventario_autorizado(p_usuario_id uuid)
returns boolean language sql security invoker set search_path='' as $$
 select p_usuario_id is not null and exists(select 1 from private.equipo_inventario where usuario_id=p_usuario_id and activo);
$$;
create function private.inventario_reservado(p_producto_id bigint)
returns integer language sql stable security invoker set search_path='' as $$
 select coalesce(sum(s.cantidad),0)::integer from public.pedido_stock s join public.pedido p on p.id=s.pedido_id
 where s.producto_simple_id=p_producto_id and p.estado in ('pendiente_pago','pagado','en_preparacion');
$$;

create function public.mb_inventario(p_usuario_id uuid,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 f private.inventario_ficha; a private.inventario_ajuste;
 v_stock integer; v_reservado integer; v_nuevo integer; v_cantidad integer;
 v_id bigint; v_operacion uuid; v_tipo text; v_motivo text; v_result jsonb;
begin
 if not public.mb_inventario_autorizado(p_usuario_id) then
  raise exception using errcode='42501',message='Acceso exclusivo del equipo de inventario';
 end if;
 if p_accion='listar' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nombre),'[]') into v_result from (
   select f.producto_id::text id,f.sku,p.nombre,s.material,s.categoria,s.diseno,
    s.stock disponible,private.inventario_reservado(f.producto_id) reservado,
    s.stock+private.inventario_reservado(f.producto_id) fisico,
    f.abastecimiento,f.aproximado,f.minimo,f.notas,f.actualizado_en,
    p.activo publicado,p.precio
   from private.inventario_ficha f join public.producto_simple s on s.id_producto=f.producto_id
   join public.producto p on p.id_producto=f.producto_id
  )x;
  return v_result;
 end if;
 if p_accion='historial' then
  v_id:=nullif(p_datos->>'producto_id','')::bigint;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
   select h.*,p.nombre from (
    select a.id,a.producto_id,a.tipo,a.diferencia,a.disponible_anterior,a.disponible_nuevo,a.reservado,a.motivo,a.actor_nombre,a.creado_en,null::uuid pedido_id
    from private.inventario_ajuste a where v_id is null or a.producto_id=v_id
    union all
    select m.id,m.producto_simple_id,m.motivo,m.cantidad,null::integer,null::integer,null::integer,
     case m.motivo when 'reserva' then 'Reserva de pedido' else 'Cancelacion o vencimiento de pedido' end,
     'Sistema de pedidos',m.creado_en,m.pedido_id
    from public.movimiento_stock m where v_id is null or m.producto_simple_id=v_id
   )h join public.producto p on p.id_producto=h.producto_id order by h.creado_en desc limit 200
  )x),'[]');
 end if;
 if p_accion not in ('ajustar','configurar') then raise exception 'Operacion de inventario invalida'; end if;
 -- Same first lock as checkout/cancellation/shipment: a physical recount must
 -- not race an order reservation or a shipment leaving the warehouse.
 perform pg_advisory_xact_lock(782204, 1);
 v_id:=(p_datos->>'producto_id')::bigint;
 select * into f from private.inventario_ficha where producto_id=v_id for update;
 if not found then raise exception 'Articulo no encontrado'; end if;
 if p_accion='configurar' then
  if p_datos->>'abastecimiento' not in ('stock','a_pedido') or
   (p_datos->>'minimo')::integer not between 0 and 1000000 or p_datos->>'notas' is null then raise exception 'Configuracion invalida'; end if;
  update private.inventario_ficha set abastecimiento=p_datos->>'abastecimiento',minimo=(p_datos->>'minimo')::integer,
   notas=p_datos->>'notas',actualizado_en=clock_timestamp() where producto_id=v_id returning * into f;
  return to_jsonb(f);
 end if;
 v_tipo:=p_datos->>'tipo'; v_cantidad:=(p_datos->>'cantidad')::integer;
 v_operacion:=(p_datos->>'idempotencia')::uuid; v_motivo:=trim(p_datos->>'motivo');
 if v_operacion is null or v_tipo is null or v_tipo not in ('ingreso','egreso','conteo') or v_cantidad is null or
  v_cantidad not between 0 and 1000000 or (v_tipo<>'conteo' and v_cantidad=0) or
  v_motivo is null or length(v_motivo) not between 3 and 500 then raise exception 'Indica cantidad, tipo y motivo validos'; end if;
 select * into a from private.inventario_ajuste where operacion_id=v_operacion;
 if found then
  if a.actor_id is distinct from p_usuario_id or a.producto_id<>v_id or a.tipo<>v_tipo or
   a.cantidad_declarada<>v_cantidad or a.motivo<>v_motivo then raise exception 'Esta operacion ya se uso para otro ajuste'; end if;
  return to_jsonb(a);
 end if;
 select stock into v_stock from public.producto_simple where id_producto=v_id for update;
 v_reservado:=private.inventario_reservado(v_id);
 if v_stock is distinct from (p_datos->>'disponible_esperado')::integer or
  v_reservado is distinct from (p_datos->>'reservado_esperado')::integer then
  raise exception 'El stock cambio. Actualiza el inventario antes de guardar';
 end if;
 v_nuevo:=case v_tipo when 'ingreso' then v_stock+v_cantidad when 'egreso' then v_stock-v_cantidad else v_cantidad-v_reservado end;
 if v_nuevo<0 then raise exception 'No podes descontar las unidades reservadas para pedidos'; end if;
 update public.producto_simple set stock=v_nuevo where id_producto=v_id;
 update private.inventario_ficha set aproximado=case when v_tipo='conteo' then false else aproximado end,
  actualizado_en=clock_timestamp() where producto_id=v_id;
 insert into private.inventario_ajuste(operacion_id,producto_id,actor_id,actor_nombre,tipo,cantidad_declarada,
  disponible_anterior,disponible_nuevo,reservado,motivo)
 values(v_operacion,v_id,p_usuario_id,coalesce(nullif((select nombre from public.perfil where id=p_usuario_id),''),p_usuario_id::text),
  v_tipo,v_cantidad,v_stock,v_nuevo,v_reservado,v_motivo) returning * into a;
 return to_jsonb(a);
end $$;
revoke all on function public.mb_inventario_autorizado(uuid),public.mb_inventario(uuid,text,jsonb),private.inventario_reservado(bigint) from public,anon,authenticated;
grant execute on function public.mb_inventario_autorizado(uuid),public.mb_inventario(uuid,text,jsonb),private.inventario_reservado(bigint) to service_role;

-- Keep existing commerce behavior and permissions; add the consistent first
-- advisory lock to the already-installed, inspected functions.
do $$ declare fn regprocedure; definition text; begin
 foreach fn in array array['public.mb_comercio(text,uuid,text,jsonb)'::regprocedure,
  'public.mb_actualizar_envio(uuid,text,text,text)'::regprocedure,
  'public.mb_confirmar_pago(uuid,text,numeric,text)'::regprocedure,
  'public.mb_expirar_reservas()'::regprocedure] loop
  definition:=pg_get_functiondef(fn);
  if position('pg_advisory_xact_lock(782204, 1)' in definition)=0 then
   definition:=regexp_replace(definition,'\mbegin\M','begin perform pg_advisory_xact_lock(782204, 1);','i');
   execute definition;
  end if;
 end loop;
end $$;

-- One base product per physical blank; future engraving is order
-- personalization, not a second independently stocked "River" product.
do $$ declare r record; v_id bigint; begin
 for r in select * from (values
  ('MB-IMP-CAL','Mate imperial de calabaza','Calabaza','Mates',1200,'stock','Liso, sin grabar'),
  ('MB-IMP-ALG','Mate imperial de algarrobo','Algarrobo','Mates',1200,'stock','Liso, sin grabar'),
  ('MB-CAM-ALG','Mate camionero de algarrobo','Algarrobo','Mates',700,'stock','Liso, sin grabar'),
  ('MB-MAT-ACE','Mate de acero','Acero','Mates',700,'stock','Liso, sin grabar'),
  ('MB-TER-NEG','Termo negro','Por confirmar','Termos',800,'stock',null),
  ('MB-TER-PLA','Termo plateado','Por confirmar','Termos',24,'stock',null),
  ('MB-CUC-INOX','Cuchillo de acero inoxidable','Acero inoxidable','Cocina',500,'stock',null),
  ('MB-MATERA','Matera','Por confirmar','Accesorios',60,'stock',null),
  ('MB-QUENCHER','Vaso Quencher','Por confirmar','Vasos',70,'stock',null),
  ('MB-YERBERA','Yerbera','Por confirmar','Accesorios',100,'stock',null),
  ('MB-TABLA','Tabla','Madera','Cocina',0,'a_pedido',null)
 ) as seed(sku,nombre,material,categoria,cantidad,modo,diseno) loop
  if exists(select 1 from private.inventario_ficha where sku=r.sku) then continue; end if;
  insert into public.producto(nombre,precio,tipo,activo) values(r.nombre,null,'simple',false) returning id_producto into v_id;
  insert into public.producto_simple(id_producto,material,categoria,diseno,stock) values(v_id,r.material,r.categoria,r.diseno,r.cantidad);
  insert into private.inventario_ficha(producto_id,sku,abastecimiento,aproximado,notas)
   values(v_id,r.sku,r.modo,true,case when r.modo='a_pedido' then 'Se solicita al carpintero. Sin existencias confirmadas; registrar ingreso al recibir.'
    else 'Cantidad inicial aproximada informada por el equipo. Pendiente de recuento fisico.' end);
  insert into private.inventario_ajuste(operacion_id,producto_id,actor_nombre,tipo,cantidad_declarada,disponible_anterior,disponible_nuevo,reservado,motivo)
   values(gen_random_uuid(),v_id,'Carga inicial del equipo','inicial',r.cantidad,0,r.cantidad,0,
   case when r.modo='a_pedido' then 'Fabricacion a pedido; no se presume stock disponible' else 'Stock inicial aproximado informado por el equipo (08/09/2026)' end);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
