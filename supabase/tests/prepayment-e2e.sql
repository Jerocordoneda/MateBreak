-- Reproducible catalogue -> cart -> order -> stock -> cancellation checks.
-- Every order, stock change and temporary payment method is rolled back.
begin;
update public.metodo_pago set activo=true where codigo='transferencia';
update public.metodo_envio set activo=true where codigo='retiro';
do $$
declare buyer uuid; box_id bigint; case_row record; variant_id bigint; token text;
 cart jsonb; quote jsonb; ordered jsonb; repeated jsonb; cancelled jsonb;
 order_id uuid; expected_count integer; before_stock integer; mate_count integer;
begin
 select id into buyer from auth.users order by created_at limit 1;
 select producto_id into box_id from private.inventario_ficha where sku='MB-CAJA-MATE';
 if buyer is null or box_id is null then raise exception 'Faltan fixtures de cliente o caja'; end if;
 for case_row in select * from (values
   ('IMPERIAL NEGRO DE ALPACA','MB-IMP-CAL',1),
   ('IMPERIAL DE ALGARROBO','MB-IMP-ALG',1),
   ('CAMIONERO DE ALGARROBO','MB-CAM-ALG',1),
   ('TERMO PREMIUM MUNDIAL','MB-TER-NEG',1),
   ('TERMO DE BELGRANO','MB-TER-PLA',1),
   ('BOMBILLA DE ACERO PICO DE LORO','MB-BOM-PICO-LORO',1),
   ('MATERA NEGRA ECOCUERO','MB-MATERA',1),
   ('SET MATERO DE BELGRANO','MB-IMP-ALG',3),
   ('SET PREMIUM DE BELGRANO','MB-IMP-ALG',1),
   ('SET PARRILLERO DE BELGRANO','MB-CUC-INOX',1),
   ('SET DELUXE DE BELGRANO','MB-IMP-ALG',1)
  ) as t(nombre,sku_principal,cantidad) loop
  select min(cv.id) into variant_id from public.producto p
   join public.catalogo_variante cv on cv.producto_id=p.id_producto
   join public.catalogo_variante_componente c on c.variante_id=cv.id
   join private.inventario_ficha f on f.producto_id=c.producto_simple_id
   where p.nombre=case_row.nombre and f.sku=case_row.sku_principal;
  if variant_id is null then raise exception 'Variante representativa ausente: %',case_row.nombre; end if;
  select count(*),coalesce(sum(c.cantidad) filter(where s.categoria='Mates'),0)
   into expected_count,mate_count
   from public.catalogo_variante_componente c
   join public.producto_simple s on s.id_producto=c.producto_simple_id
   where c.variante_id=variant_id;
  select stock into before_stock from public.producto_simple where id_producto=box_id;
  token:=md5(random()::text)||md5(random()::text);
  cart:=public.mb_comercio(token,buyer,'variante',jsonb_build_object(
   'variante_id',variant_id,'cantidad',case_row.cantidad,
   'personalizacion','Diseño auditado','precio',-1,'total',0,
   'usuario_id',gen_random_uuid(),'rol','administrador','sku','MB-TER-NEG',
   'componentes',jsonb_build_array(jsonb_build_object('sku','MB-TER-NEG','cantidad',999))));
  if jsonb_array_length(cart->'items')<>1 or (cart->'items'->0->>'variante_id')::bigint<>variant_id
   or (cart->'items'->0->>'cantidad')::integer<>case_row.cantidad
  then raise exception 'Carrito no preservó variante o cantidad: %',case_row.nombre; end if;
  quote:=public.mb_cotizar_catalogo((cart->>'id')::uuid,'transferencia');
  if quote->>'moneda'<>'ARS' or (quote->>'subtotal')::numeric<=0
  then raise exception 'Cotización inválida: %',case_row.nombre; end if;
  ordered:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
   'idempotencia',gen_random_uuid(),'pago','transferencia','envio','retiro',
   'precio',0,'total',-500,'usuario_id',gen_random_uuid(),'rol','administrador',
   'sku','MB-TER-NEG','componentes','[]'::jsonb));
  order_id:=(ordered->>'id')::uuid;
  if (ordered->>'subtotal')::numeric<>(quote->>'subtotal')::numeric
   or ordered->>'moneda'<>'ARS'
   or (select count(*) from public.pedido_item where pedido_id=order_id)<>1
   or not exists(select 1 from public.pedido_item i
     join public.catalogo_variante cv on cv.id=i.variante_id
     where i.pedido_id=order_id and i.variante_id=variant_id
      and i.producto_id=cv.producto_id and i.cantidad=case_row.cantidad
      and i.opciones=cv.opciones and i.personalizacion='Diseño auditado'
      and i.precio_unitario=(quote->'items'->0->>'precio_unitario')::numeric)
  then raise exception 'Snapshot, ARS o precio manipulable: %',case_row.nombre; end if;
  if exists(select 1 from (
    select c.producto_simple_id,c.cantidad*case_row.cantidad needed,
     coalesce(ps.cantidad,0)+coalesce(pa.cantidad_pendiente,0) actual
    from public.catalogo_variante_componente c
    left join public.pedido_stock ps on ps.pedido_id=order_id and ps.producto_simple_id=c.producto_simple_id
    left join public.pedido_abastecimiento pa on pa.pedido_id=order_id and pa.producto_simple_id=c.producto_simple_id
    where c.variante_id=variant_id
   ) parts where needed<>actual)
   or (select count(*) from public.pedido_stock where pedido_id=order_id)
      +(select count(*) from public.pedido_abastecimiento where pedido_id=order_id)<>expected_count
   or coalesce((select cantidad from public.pedido_stock
       where pedido_id=order_id and producto_simple_id=box_id),0)<>mate_count*case_row.cantidad
   or exists(select 1 from public.pedido_item where pedido_id=order_id and producto_id=box_id)
  then raise exception 'Reserva no coincide con composición física: %',case_row.nombre; end if;
  repeated:=public.mb_comercio(token,buyer,'checkout',jsonb_build_object(
   'idempotencia',ordered->>'idempotencia','pago','transferencia','envio','retiro'));
  if repeated->>'id'<>ordered->>'id'
   or (select count(*) from public.pedido where carrito_id=(cart->>'id')::uuid)<>1
  then raise exception 'Checkout no idempotente: %',case_row.nombre; end if;
  cancelled:=public.mb_comercio(token,buyer,'cancelar',jsonb_build_object('id',order_id));
  if cancelled->>'estado'<>'cancelado' then raise exception 'Cancelación falló: %',case_row.nombre; end if;
  repeated:=public.mb_comercio(token,buyer,'cancelar',jsonb_build_object('id',order_id));
  if repeated->>'estado'<>'cancelado'
   or (select stock from public.producto_simple where id_producto=box_id)<>before_stock
   or exists(select 1 from public.pedido_stock ps
      join public.catalogo_variante_componente c on c.producto_simple_id=ps.producto_simple_id
      where ps.pedido_id=order_id and c.variante_id=variant_id
       and (select count(*) from public.movimiento_stock ms
            where ms.pedido_id=order_id and ms.producto_simple_id=ps.producto_simple_id
             and ms.motivo='liberacion')<>1)
  then raise exception 'Cancelación duplicó o perdió reservas: %',case_row.nombre; end if;
 end loop;
end $$;
rollback;
