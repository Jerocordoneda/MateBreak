-- Additive profile data. No historic orders/requests or Auth permissions change.
begin;
alter table public.perfil
 add column provincia text not null default '' check(length(provincia)<=100),
 add column localidad text not null default '' check(length(localidad)<=100),
 add column empresa text not null default '' check(length(empresa)<=150);
create function public.mb_wholesale_profile_complete(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); r public.perfil;
begin
 if u is null then raise exception 'Iniciá sesión' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('nombre','whatsapp','provincia','localidad','empresa'))
 or exists(select 1 from jsonb_each(p_data) x where jsonb_typeof(x.value)<>'string') then raise exception 'Datos inválidos';end if;
 if p_data?'whatsapp' and (length(p_data->>'whatsapp')>30 or (p_data->>'whatsapp')!~ '^\+?[0-9 ()-]+$' or length(regexp_replace(p_data->>'whatsapp','[^0-9]','','g')) not between 7 and 15) then raise exception 'Teléfono inválido';end if;
 if p_data?'provincia' and (p_data->>'provincia') not in ('Salta','Buenos Aires','Ciudad Autónoma de Buenos Aires','San Luis','Entre Ríos','La Rioja','Santiago del Estero','Chaco','San Juan','Catamarca','La Pampa','Mendoza','Misiones','Formosa','Neuquén','Río Negro','Santa Fe','Tucumán','Chubut','Tierra del Fuego','Corrientes','Córdoba','Jujuy','Santa Cruz') then raise exception 'Provincia inválida';end if;
 if exists(select 1 from jsonb_each_text(p_data) x where (x.key<>'empresa' and length(trim(x.value))=0) or length(x.value)>case when x.key='localidad' then 100 else 150 end) then raise exception 'Datos inválidos';end if;
 insert into public.perfil(id,nombre,telefono,provincia,localidad,empresa)
 values(u,coalesce(trim(p_data->>'nombre'),''),coalesce(trim(p_data->>'whatsapp'),''),coalesce(p_data->>'provincia',''),coalesce(trim(p_data->>'localidad'),''),coalesce(trim(p_data->>'empresa'),''))
 on conflict(id) do update set
 nombre=case when trim(perfil.nombre)='' then excluded.nombre else perfil.nombre end,
 telefono=case when trim(perfil.telefono)='' then excluded.telefono else perfil.telefono end,
 provincia=case when trim(perfil.provincia)='' then excluded.provincia else perfil.provincia end,
 localidad=case when trim(perfil.localidad)='' then excluded.localidad else perfil.localidad end,
 empresa=case when trim(perfil.empresa)='' then excluded.empresa else perfil.empresa end
 returning * into r;
 return jsonb_build_object('nombre',r.nombre,'whatsapp',r.telefono,'provincia',r.provincia,'localidad',r.localidad,'empresa',r.empresa);
end $$;
revoke all on function public.mb_wholesale_profile_complete(jsonb) from public,anon,service_role;
grant execute on function public.mb_wholesale_profile_complete(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

