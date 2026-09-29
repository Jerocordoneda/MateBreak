-- Anonymous cart, login binding, quantity, distinct variants and removal.
begin;
do $$
declare buyer uuid; token text:=md5(random()::text)||md5(random()::text);
 first_id bigint; second_id bigint; combo_id bigint; cart jsonb;
begin
 select id into buyer from auth.users order by created_at limit 1;
 select min(cv.id),max(cv.id) into first_id,second_id
  from public.catalogo_variante cv join public.producto p on p.id_producto=cv.producto_id
  where p.nombre='IMPERIAL PREMIUM DE RIVER';
 select min(cv.id) into combo_id from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id where p.nombre='SET MATERO DE BELGRANO';
 if buyer is null or first_id is null or second_id=first_id or combo_id is null
 then raise exception 'Faltan variantes para carrito'; end if;
 cart:=public.mb_comercio(token,null,'carrito');
 if jsonb_array_length(cart->'items')<>0 or public.mb_carrito_cantidad(token,null)<>0
 then raise exception 'Carrito anónimo no comenzó vacío'; end if;
 perform public.mb_comercio(token,null,'variante',jsonb_build_object('variante_id',first_id,'cantidad',2));
 if public.mb_carrito_cantidad(token,null)<>2 then raise exception 'Cantidad anónima incorrecta'; end if;
 cart:=public.mb_comercio(token,null,'carrito');
 if jsonb_array_length(cart->'items')<>1 then raise exception 'Refresh perdió carrito anónimo'; end if;
 perform public.mb_comercio(token,buyer,'vincular');
 if public.mb_carrito_cantidad(token,buyer)<>2
  or public.mb_carrito_cantidad(token,null)<>0
 then raise exception 'Login no vinculó carrito o dejó acceso anónimo'; end if;
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',second_id,'cantidad',1));
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',combo_id,'cantidad',1));
 cart:=public.mb_comercio(token,buyer,'carrito');
 if jsonb_array_length(cart->'items')<>3 or public.mb_carrito_cantidad(token,buyer)<>4
 then raise exception 'Variantes del mismo producto y combo se fusionaron'; end if;
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',first_id,'cantidad',5));
 if public.mb_carrito_cantidad(token,buyer)<>7 then raise exception 'Cambio de cantidad falló'; end if;
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',first_id,'cantidad',0));
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',second_id,'cantidad',0));
 perform public.mb_comercio(token,buyer,'variante',jsonb_build_object('variante_id',combo_id,'cantidad',0));
 cart:=public.mb_comercio(token,buyer,'carrito');
 if jsonb_array_length(cart->'items')<>0 or public.mb_carrito_cantidad(token,buyer)<>0
 then raise exception 'El carrito no quedó vacío al quitar líneas'; end if;
end $$;
rollback;
