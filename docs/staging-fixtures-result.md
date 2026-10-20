# Resultado de fixtures Supabase Staging — 2026-10-01

Destino exclusivo: matebreak-staging, `rxccjczyywhewqqdfgxm`.
Commit base: `308b1d10784e43b256fa0dbf272b5233c877f477`.
Autorización expresa del responsable recibida antes de modificar datos.

## Resultado

Aplicación correcta dentro de una única transacción SERIALIZABLE.
13 comprobaciones previas y 22 comprobaciones antes del COMMIT pasaron.
La consulta devolvió `all_precommit_checks_passed`; la lectura posterior
confirmó los cambios persistidos. No hubo errores ni migration repair.

| Verificación posterior | Resultado |
| --- | --- |
| Productos | 119 conservados; sólo producto 13 activo |
| Publicaciones | 106 conservadas; sólo producto 13 publicado |
| Mate | STAGING Mate sintético; slug staging-mate-sintetico; ARS 10000 |
| Variantes | 217 conservadas; sólo variante 2 vigente |
| Disponibilidad RPC | Variante 2: comprable=true, con_stock=true; única comprable |
| Componente MB-CAM-ALG, ID 3 | Stock 100 (antes 700) |
| Caja MB-CAJA-MATE, ID 119 | Stock 100 (antes 0) |
| Otros productos simples | 61 con stock 0; total 63 conservados |
| Imágenes | 929 conservadas, ninguna vigente |
| Pagos | Sólo código mercadopago activo para adapter mock |
| Envíos | Sólo retiro y correo_domicilio activos |
| Usuarios / pedidos / ventas manuales / pagos / envíos | 0 / 0 / 0 / 0 / 0 |
| Mapping / componentes / ficha de caja | Iguales a la copia previa; mapping aprobado |
| Integridad del catálogo | Sin publicaciones o variantes huérfanas |

El precio de transferencia 9000 se conserva como metadato del fixture;
el método transferencia permanece inactivo. No se creó una imagen sintética.
Los registros históricos se conservan; los valores modificados originales
se guardaron antes de ejecutar la transacción.

## Copia recuperable local

Antes de cualquier UPDATE se guardaron y volvieron a leer los valores originales
de todos los campos afectados en las siete tablas, con sus claves de recuperación.
La copia sólo contiene datos del catálogo/inventario/métodos de Staging;
no contiene usuarios Auth, credenciales ni datos personales productivos.

La copia y el SQL de restauración se mantienen fuera del repositorio.
SHA-256 de original-values.json:
`d761f99f39cd051f1ae45bcdd086b5398e2d21f30b398f9a712ad0d22e20abe4`.
SHA-256 de restore-original-values.sql:
`78e439e4fbf5e2cd405d4c1ef997b25a024fc74be1b5bf289a011ab374341c8b`.

El SQL de restauración actualiza por claves y termina en ROLLBACK por defecto.
No se ejecutó. Una recuperación requiere revisión y autorización separadas.

## Migraciones, estructura y permisos

- 26 versiones y nombres remotos sin cambios; los 26 SHA-256 locales coinciden
  con el manifiesto aprobado.
- Fixture original sin modificaciones, SHA-256:
  `b6c0efa687c7adab3d0273403bf671908308b5c76914cbbf7500036aafb2f133`.
- Huella de metadatos antes/después idéntica:
  `2cd84c811ffc0b0fb9fca164ef6235b5` (MD5 como comparación de metadatos).
- La huella incluye tablas/columnas/constraints/índices, funciones,
  triggers, secuencias, policies, RLS, ACL, esquemas, privilegios por
  defecto y event triggers.
- Conteos estructurales: 50 tablas, 341 columnas, 234 constraints,
  111 índices, 46 funciones, 12 triggers, 4 secuencias, 9 policies.

El wrapper añadió destino explícito por conector, bloqueo de las tablas,
comparación con la preimagen, guardas y controles previos al COMMIT.
El script original deploy/staging/fixtures.sql conserva el hash aprobado.
No se creó una migración, tabla temporal/persistente, función o policy.

## Límites y próximos pasos

No se consultó ni modificó producción. No se crearon cuentas.
No se conectó GitHub Integration ni se desplegó Render/Vercel.
No se llamó Mercado Pago/MiCorreo ni otro proveedor.
Los métodos SQL no cambian las variables del backend:
PAYMENTS_MODE=mock y SHIPPING_MODE=mock deben mantenerse.

Esto verifica datos y disponibilidad SQL. La validación externa de navegador,
registro/login, checkout, pagos y logística mock queda pendiente de posteriores
autorizaciones para cuentas de prueba y despliegues.

## Evidencias para revisión

Se prepararon informes resumidos y el comparativo estructural para revisar el diff.
Las capturas completas, logs crudos, preimagen y SQL de recuperación permanecen
locales. No hubo commit, push ni publicación.
