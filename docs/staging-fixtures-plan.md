# Plan aprobado de fixtures Staging

Aplicado el 2026-10-01 tras autorización expresa. Este documento conserva el
plan previo; el resultado vigente está en [staging-fixtures-result.md](staging-fixtures-result.md).

Destino exclusivo: rxccjczyywhewqqdfgxm (matebreak-staging). Inspección SELECT
2026-10-01: 26 migraciones; cero usuarios, pedidos, ventas manuales, pagos y envíos.
No se ejecutó el fixture ni se modificó su script durante esta revisión.

Script revisado: deploy/staging/fixtures.sql. No INSERT/DELETE ni llamadas externas.
Reutiliza registros del catálogo público histórico; no crea un producto desde cero.

## Filas y modificaciones previstas

| Tabla | Filas actuales | Cambio |
| --- | ---: | --- |
| public.catalogo_producto | 106 | publicado=false para todas; publicado/disponible=true sólo producto 13 |
| public.producto | 119 | activo=false para todos; renombrar producto 13 a STAGING Mate sintético, slug staging-mate-sintetico, descripción/origen ficticios, precio ARS 10000, activo=true |
| public.producto_simple | 63 | stock=0 para todos; stock=100 sólo IDs 3 y 119 |
| public.catalogo_variante | 217 | vigente=false para todas; variante 2 disponible/vigente, precio ARS 10000, opciones Fixture e imagen_origen=null |
| public.catalogo_imagen | 929 | vigente=false para todas; no borrar filas ni descargar/copiar archivos |
| public.metodo_pago | 3 | activo sólo mercadopago, utilizado por el adapter mock |
| public.metodo_envio | 3 | activos retiro y correo_domicilio; correo_sucursal inactivo |

Producto seleccionado: 13, variante 2; mapping aprobado. La otra variante (3)
permanece deshabilitada. El componente ID 3/SKU MB-CAM-ALG requiere 1 unidad y
pasará de 700 a 100. La caja ID 119/SKU MB-CAJA-MATE requiere 1 unidad y pasará
de 0 a 100. Existe exactamente una ficha MB-CAJA-MATE. Ambas integran el mapping.
El precio de transferencia queda en 9000 como metadato; transferencia está inactiva.

Los registros históricos se conservan. El producto/variante reutilizados y los
stocks sí se sobrescriben: ocultar no equivale a conservar todos los valores
originales. Para reversión posterior guardar una preimagen de las filas afectadas,
exclusivamente catálogo/inventario/métodos de esta base staging, sin datos Auth.

## Ejecución controlada futura

1. Reconfirmar identidad por conector con project_id literal, historial 26 y el
   mismo hash del script revisado. Nunca utilizar el destino implícito CLI.
2. Repetir selección y conteos; detenerse si IDs, mapping, caja, stock o conteos
   difieren del plan, o aparecen usuarios/pedidos/ventas/pagos/envíos.
3. Usar una única transacción y SET LOCAL matebreak.environment='staging'.
   La marca no comprueba la referencia del proyecto por sí sola: la referencia
   explícita y su comprobación externa son obligatorias.
4. El procedimiento añadirá comprobaciones antes del COMMIT del script;
   cualquier incumplimiento provoca error y ROLLBACK. No hacer ensayo remoto
   que ejecute UPDATE antes de la autorización.
5. No ejecutar importadores, seeds automáticos ni crear cuentas en este paso.

## Verificaciones previas al COMMIT

- Conteos de las siete tablas sin cambios; ninguna inserción/eliminación.
- Exactamente un producto activo (13), publicación (13) y variante vigente (2).
- Nombre, slug, origen ficticio y precio base 10000; variante precio 10000.
- IDs 3 y 119 con stock 100, los otros 61 productos simples stock 0.
- Cero imágenes vigentes; histórico conservado.
- Sólo mercadopago habilitado; retiro/correo_domicilio habilitados.
- mb_catalogo_disponibilidad confirma fixture comprable y con stock.
- Siguen cero usuarios/pedidos/ventas/pagos/envíos y 26 migraciones.
- RLS, policies, grants y esquema sin cambios respecto de la auditoría previa.

## Proveedores

El fixture configura códigos de métodos, no modos de integración. El servidor
deberá seguir usando APP_ENV=staging, NODE_ENV=development,
MATEBREAK_STAGING_PERSIST_MOCK=1, PAYMENTS_MODE=mock y SHIPPING_MODE=mock.
El adapter de pago mock conserva el código mercadopago; eso no activa cobros reales.
Las guardas staging rechazan credenciales de proveedores reales. El fixture no
necesita claves en SQL ni consulta producción. Render/Vercel siguen sin deploy.

## Evidencias y publicación

Revisión por patrones: sin secret keys, access tokens, JWT, Bearer tokens, URLs DB
con credenciales ni credenciales de pago en los cinco archivos staging de evidencia.
La referencia staging es pública. La revisión por patrones no es una certificación.

Recomendación: versionar planes/informe resumidos, hashes/identidad pública y
staging-cloud-schema-comparison.json tras revisión de diff. Conservar locales
staging-cloud-schema.json (DDL/ACL detallados), staging-security-advisors.json
(hallazgos operativos completos) y staging-cli-dry-run.log (log crudo); resumir
sus resultados en el informe versionado. No contienen secretos detectados,
pero no es necesario publicar esas capturas completas.
Tras la ejecución autorizada, los informes resumidos y el comparativo se prepararon
con intent-to-add para revisar su diff; no hubo commit, push ni publicación.
Las capturas completas y logs se excluyen localmente mediante .git/info/exclude;
no se cambió .gitignore. Un commit futuro debe seleccionar rutas explícitas.
