-- Transactional integration test: no test cart or stock changes persist.
begin;
do $$
declare token text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 v public.catalogo_variante; result jsonb; other_token text:=repeat('b',64); stock_before bigint;
begin
 select * into v from public.catalogo_variante where disponible and vigente and precio is not null order by id limit 1;
 if v.id is null then raise exception 'Import a real catalog product before running this test'; end if;
 select sum(stock) into stock_before from public.producto_simple;
 result:=public.mb_comercio(token,null,'variante',jsonb_build_object('variante_id',v.id,'cantidad',2,'precio',1,'personalizacion','Prueba transaccional'));
 if (result->>'total')::numeric<>v.precio*2 or result->>'moneda'<>'ARS' then raise exception 'Untrusted price or currency'; end if;
 if result->'items'->0->>'variante_id'<>v.id::text then raise exception 'Variant not preserved'; end if;
 if result->'items'->0->>'personalizacion'<>'Prueba transaccional' then raise exception 'Customization lost'; end if;
 result:=public.mb_comercio(token,null,'variante',jsonb_build_object('variante_id',v.id,'cantidad',3));
 if result->'items'->0->>'personalizacion'<>'Prueba transaccional' then raise exception 'Quantity update erased customization'; end if;
 if public.mb_carrito_cantidad(token,null)<>3 then raise exception 'Badge count wrong'; end if;
 begin
  perform public.mb_comercio(token,null,'cantidad',jsonb_build_object('producto_id',v.producto_id,'cantidad',1));
  raise exception 'Bypass accepted';
 exception when raise_exception then if sqlerrm<>'Selecciona una variante del producto' then raise; end if; end;
 begin
  perform public.mb_comercio(token,null,'checkout','{}');
  raise exception 'Guest checkout accepted';
 exception when raise_exception then if sqlerrm<>'Inicia sesion' then raise; end if; end;
 result:=public.mb_comercio(token,null,'variante',jsonb_build_object('variante_id',v.id,'cantidad',0));
 if jsonb_array_length(result->'items')<>0 then raise exception 'Removal failed'; end if;
 if (select sum(stock) from public.producto_simple)<>stock_before then raise exception 'Stock changed'; end if;
 if has_function_privilege('anon','public.mb_importar_catalogo(jsonb)','execute') then raise exception 'Public import privilege'; end if;
 if has_table_privilege('anon','public.carrito_variante','select') then raise exception 'Public cart privilege'; end if;
 if has_function_privilege('authenticated','public.mb_comercio(text,uuid,text,jsonb)','execute') then raise exception 'Direct client cart privilege'; end if;
end $$;
rollback;
