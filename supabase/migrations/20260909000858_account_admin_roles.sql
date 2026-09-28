-- Roles are private memberships, never values supplied during registration.
create table private.cambio_rol (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 usuario_id uuid references auth.users(id) on delete set null,
 anterior text not null check (anterior in ('cliente','vendedor','administrador')),
 nuevo text not null check (nuevo in ('cliente','vendedor','administrador')),
 creado_en timestamptz not null default now()
);
create index cambio_rol_actor on private.cambio_rol(actor_id);
create index cambio_rol_usuario on private.cambio_rol(usuario_id,creado_en desc);
alter table private.cambio_rol enable row level security;
revoke all on private.cambio_rol from public,anon,authenticated,service_role;
grant select,insert on private.cambio_rol to service_role;
grant insert(usuario_id,activo),update(activo) on private.equipo_inventario,private.equipo_vendedores to service_role;

create function public.mb_admin_roles(p_actor_id uuid,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_rol text; v_anterior text;
begin
 -- Serialize role changes, then recheck the actor in the same transaction.
 perform pg_catalog.pg_advisory_xact_lock(782204,2);
 if not public.mb_inventario_autorizado(p_actor_id) then
  raise exception 'Solo un administrador puede gestionar el equipo' using errcode='42501';
 end if;
 if p_accion='listar' then
  if jsonb_typeof(p_datos->'ids') is distinct from 'array' or jsonb_array_length(p_datos->'ids')>50 then raise exception 'Lista inválida'; end if;
  return coalesce((select jsonb_object_agg(x.id,public.mb_rol(x.id::uuid)) from jsonb_array_elements_text(p_datos->'ids') x(id)),'{}');
 end if;
 if p_accion is distinct from 'cambiar' then raise exception 'Operación inválida'; end if;
 v_id:=(p_datos->>'usuario_id')::uuid; v_rol:=p_datos->>'rol';
 if v_id is null or v_rol is null or v_rol not in ('cliente','vendedor','administrador') then raise exception 'Rol inválido'; end if;
 if v_id=p_actor_id then raise exception 'Tu propio rol no se modifica desde este panel'; end if;
 v_anterior:=public.mb_rol(v_id);
 if (p_datos->>'anterior') is distinct from v_anterior then raise exception 'El rol cambió. Actualizá la lista antes de guardar'; end if;
 if v_anterior=v_rol then return jsonb_build_object('rol',v_rol); end if;
 if v_anterior='administrador' and v_rol<>'administrador' and
  (select count(*) from private.equipo_inventario where activo)<=1 then raise exception 'Debe quedar al menos un administrador'; end if;
 insert into private.equipo_inventario(usuario_id,activo) values(v_id,v_rol='administrador')
 on conflict(usuario_id) do update set activo=excluded.activo;
 insert into private.equipo_vendedores(usuario_id,activo) values(v_id,v_rol='vendedor')
 on conflict(usuario_id) do update set activo=excluded.activo;
 insert into private.cambio_rol(actor_id,usuario_id,anterior,nuevo) values(p_actor_id,v_id,v_anterior,v_rol);
 return jsonb_build_object('rol',v_rol);
end;
$$;
revoke all on function public.mb_admin_roles(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mb_admin_roles(uuid,text,jsonb) to service_role;
