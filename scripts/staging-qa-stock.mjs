// Offline SQL generator only. No Cloud client, credential discovery or auto-apply.
// The operator must explicitly select the approved Staging project in its connector.
export const project = 'rxccjczyywhewqqdfgxm';
export const fixture = 'qa-catalog-2026-10-07-v1';
export const components = [[1,'MB-IMP-CAL'],[2,'MB-IMP-ALG'],[5,'MB-TER-NEG'],[6,'MB-TER-PLA'],[7,'MB-CUC-INOX'],[8,'MB-MATERA'],[118,'MB-BOM-PICO-LORO']];
export const protectedQuery = `select jsonb_build_object(
 'orders',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.pedido t),
 'payments',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.pago t),
 'reserves',(select md5(jsonb_agg(to_jsonb(t) order by pedido_id,producto_simple_id)::text) from public.pedido_stock t),
 'movements',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.movimiento_stock t),
 'products',(select md5(jsonb_agg(to_jsonb(t) order by id_producto)::text) from public.producto t),
 'catalog',(select md5(jsonb_agg(to_jsonb(t) order by producto_id)::text) from public.catalogo_producto t),
 'variants',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.catalogo_variante t),
 'images',(select md5(jsonb_agg(to_jsonb(t) order by producto_id,source_url)::text) from public.catalogo_imagen t),
 'mapping',(select md5(jsonb_agg(to_jsonb(t) order by variante_id,producto_simple_id)::text) from public.catalogo_variante_componente t),
 'mapping_approval',(select md5(jsonb_agg(to_jsonb(t) order by variante_id)::text) from public.catalogo_variante_mapeo t),
 'inventory_metadata',(select md5(jsonb_agg(to_jsonb(t) order by producto_id)::text) from private.inventario_ficha t))`;
const lit = v => "'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
export function fixtureSql(baseline, action='apply') {
 if(!['apply','rollback'].includes(action)||!baseline||Object.values(baseline).some(v=>v!==null&&!/^[a-f0-9]{32}$/.test(v)))throw Error('Invalid fixture baseline/action');
 const rows=components.map(([id,sku])=>`(${id},'${sku}')`).join(',');
 return `-- Explicit QA stock; NOT a migration. Existing inventory ledger, no commercial history edits.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(782204,1);
LOCK TABLE public.producto_simple,private.inventario_ajuste IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.pedido,public.pago,public.pedido_stock,public.movimiento_stock,
 public.producto,public.catalogo_producto,public.catalogo_variante,public.catalogo_imagen,
 public.catalogo_variante_componente,public.catalogo_variante_mapeo,private.inventario_ficha IN SHARE MODE;
DO $qa$ DECLARE r record; n integer; op uuid;
BEGIN
 IF current_setting('matebreak.environment',true) IS DISTINCT FROM 'staging'
 OR current_setting('matebreak.qa_stock_project',true) IS DISTINCT FROM '${project}' THEN RAISE EXCEPTION 'Staging QA target required';END IF;
 -- Configuration flags alone cannot authorize this operation. Require this exact
 -- paid TEST order, collector and authoritative observation in the database.
 IF NOT EXISTS(SELECT 1 FROM public.pedido p JOIN public.pago g ON g.pedido_id=p.id
 JOIN private.mp_payment_observation o ON o.pedido_id=p.id
 WHERE p.id='61604aac-1393-460e-94a4-fa1cbcbbc6da' AND p.estado='pagado' AND p.total=29300
 AND g.estado='aprobado' AND g.referencia_externa='181813204213' AND NOT g.simulado
 AND o.payment_id='181813204213' AND o.environment='test' AND o.collector_id='3741487042' AND o.outcome='aplicado')
 THEN RAISE EXCEPTION 'Approved Staging TEST identity missing';END IF;
 IF EXISTS(SELECT 1 FROM private.mp_payment_observation WHERE environment<>'test') THEN RAISE EXCEPTION 'Non-TEST database refused';END IF;
 SELECT count(*) INTO n FROM private.inventario_ajuste WHERE motivo='${fixture}:apply';
 IF n NOT IN (0,7) THEN RAISE EXCEPTION 'Partial or conflicting QA fixture';END IF;
 IF '${action}'='apply' AND n=7 THEN
  IF EXISTS(SELECT 1 FROM private.inventario_ajuste WHERE motivo='${fixture}:rollback') THEN RAISE EXCEPTION 'Reverted fixture cannot be reapplied';END IF;
  FOR r IN SELECT * FROM (VALUES ${rows}) x(id,sku) LOOP
   IF NOT EXISTS(SELECT 1 FROM private.inventario_ajuste WHERE operacion_id=md5('${fixture}:apply:'||r.id)::uuid
     AND producto_id=r.id AND actor_id IS NULL AND tipo='ingreso' AND cantidad_declarada=100
     AND disponible_anterior=0 AND disponible_nuevo=100 AND reservado=0 AND motivo='${fixture}:apply')
   THEN RAISE EXCEPTION 'QA ledger identity mismatch';END IF;
  END LOOP;
  RETURN; -- No refill, even if later QA purchases have consumed stock.
 END IF;
 IF '${action}'='rollback' AND n=0 THEN RAISE EXCEPTION 'Fixture not applied';END IF;
 IF '${action}'='rollback' AND (SELECT count(*) FROM private.inventario_ajuste WHERE motivo='${fixture}:rollback')=7 THEN RETURN;END IF;
 IF (${protectedQuery}) IS DISTINCT FROM ${lit(baseline)} THEN RAISE EXCEPTION 'Protected baseline changed';END IF;
 IF (SELECT stock FROM public.producto_simple WHERE id_producto=3)<>79 OR
    (SELECT stock FROM public.producto_simple WHERE id_producto=119)<>79 THEN RAISE EXCEPTION 'Preserved mate/box stock changed';END IF;
 FOR r IN SELECT * FROM (VALUES ${rows}) x(id,sku) LOOP
  IF NOT EXISTS(SELECT 1 FROM private.inventario_ficha f JOIN public.producto_simple s ON s.id_producto=f.producto_id
   WHERE f.producto_id=r.id AND f.sku=r.sku AND f.abastecimiento='stock'
   AND s.stock=CASE WHEN '${action}'='apply' THEN 0 ELSE 100 END AND private.inventario_reservado(r.id)=0)
  THEN RAISE EXCEPTION 'Component stock/mode/identity changed: %',r.id;END IF;
  IF NOT EXISTS(SELECT 1 FROM public.catalogo_variante_componente WHERE producto_simple_id=r.id)
   OR EXISTS(SELECT 1 FROM public.catalogo_variante_componente WHERE producto_simple_id=r.id AND cantidad>100)
  THEN RAISE EXCEPTION 'Unsupported QA component requirement';END IF;
  op:=md5('${fixture}:${action}:'||r.id)::uuid;
  IF EXISTS(SELECT 1 FROM private.inventario_ajuste WHERE operacion_id=op) THEN RAISE EXCEPTION 'Conflicting QA operation';END IF;
  UPDATE public.producto_simple SET stock=CASE WHEN '${action}'='apply' THEN 100 ELSE 0 END WHERE id_producto=r.id;
  INSERT INTO private.inventario_ajuste(operacion_id,producto_id,actor_id,actor_nombre,tipo,cantidad_declarada,disponible_anterior,disponible_nuevo,reservado,motivo)
  VALUES(op,r.id,NULL,'Fixture QA Staging - inventario ficticio',CASE WHEN '${action}'='apply' THEN 'ingreso' ELSE 'egreso' END,100,
   CASE WHEN '${action}'='apply' THEN 0 ELSE 100 END,CASE WHEN '${action}'='apply' THEN 100 ELSE 0 END,0,'${fixture}:${action}');
 END LOOP;
 IF (${protectedQuery}) IS DISTINCT FROM ${lit(baseline)} THEN RAISE EXCEPTION 'Protected baseline mutated';END IF;
 IF '${action}'='apply' AND (SELECT count(*) FROM public.mb_catalogo_disponibilidad() WHERE comprable AND con_stock AND variante_id<=217)<>217
 THEN RAISE EXCEPTION 'Full real catalog QA availability not achieved';END IF;
END $qa$;
COMMIT;
`;
}
