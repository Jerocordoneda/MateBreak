-- Approved commercial configuration, applied only to verified Staging.
-- Wholesale namespace; no retail updates, inventory effects or synthetic customers.
begin;
do $$begin
 if exists(select 1 from private.wholesale_commercial_offer) then
  raise exception 'Commercial configuration is not empty; review before applying';
 end if;
end$$;
insert into private.wholesale_commercial_offer(id,name,category,image,price_10,price_50,price_100,active) values
 (700001,'Imperial calabaza premium','MATES','/src/assets/wholesale/imperial-calabaza.jpg',26900,26300,25800,true),
 (700002,'Imperial algarrobo','MATES','/src/assets/wholesale/imperial-algarrobo.jpg',22500,22000,21500,true),
 (700003,'Camionero algarrobo','MATES','/src/assets/wholesale/camionero-algarrobo.jpg',17500,17000,16500,true),
 (700004,'Mate acero inoxidable','MATES','/src/assets/wholesale/mate-acero.jpg',12900,12500,12000,true),
 (700005,'Yerbero cuero','MATES','/src/assets/wholesale/yerbero-cuero.jpg',9900,9500,9000,true),
 (700006,'Bombilla pico loro acero inox','MATES',null,5000,4500,3900,true),
 (700007,'Termo media manija negro','SETS, VASOS Y TERMOS','/src/assets/wholesale/termo-media-manija.jpg',29900,29500,28900,true),
 (700008,'Vaso quencher','SETS, VASOS Y TERMOS','/src/assets/wholesale/vaso-quencher.jpg',28900,28000,27000,true),
 (700009,'Vaso térmico 475 ml','SETS, VASOS Y TERMOS','/src/assets/wholesale/vaso-termico.jpg',16500,15900,15500,true),
 (700010,'Set parrillero Premium · DAGGER inoxidable','SETS, VASOS Y TERMOS','/src/assets/wholesale/set-parrillero.jpg',26500,26000,25500,true),
 (700011,'Set parrillero Básico · cuchillo acero carbono','SETS, VASOS Y TERMOS','/src/assets/wholesale/set-parrillero.jpg',22800,22000,21000,true);
update private.wholesale_settings set minimum_units=10 where singleton;
commit;
