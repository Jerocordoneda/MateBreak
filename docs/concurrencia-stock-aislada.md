# Concurrencia de stock en base aislada

La auditoría de concurrencia del 29/09/2026 ejecutó el checkout SQL real del repositorio en un cluster PostgreSQL 18 temporal, vacío y exclusivo, ligado a `127.0.0.1:55432`. No se conectó a Supabase ni se copiaron usuarios, pedidos o existencias reales. El esquema fixture reproduce solo las tablas que necesita la función; las funciones de precio, cotización, disponibilidad y checkout se extrajeron sin modificaciones de las migraciones existentes.

| Escenario | Resultado |
| --- | --- |
| SKU simple, última unidad | OK, 5/5 |
| Combo con un componente limitante | OK, 5/5 |
| Mate con caja `MB-CAJA-MATE` limitante | OK, 5/5 |
| Dos requests con la misma clave de idempotencia | OK, 5/5 |

En los primeros tres casos hubo un éxito, un rechazo por falta de stock, un pedido y una reserva por componente. En idempotencia, ambos requests devolvieron el mismo pedido, con una sola reserva y una sola caja. Se observó espera por el advisory lock en todas las repeticiones. No hubo stock negativo, reservas duplicadas ni reservas parciales.

Para repetir en Windows con PostgreSQL instalado y Node.js:

```powershell
$bin = 'C:\Program Files\PostgreSQL\18\bin'
$cluster = Join-Path $env:TEMP 'matebreak-concurrency-test'
& "$bin\initdb.exe" -D $cluster -U postgres -A trust --encoding=UTF8 --no-instructions
& "$bin\pg_ctl.exe" -D $cluster -o '-p 55432 -h 127.0.0.1' -l (Join-Path $cluster 'server.log') start
& "$bin\createdb.exe" -h 127.0.0.1 -p 55432 -U postgres matebreak_concurrency
$env:PSQL_BIN = "$bin\psql.exe"
$env:MB_CONCURRENCY_PORT = '55432'
$env:MB_CONCURRENCY_DB = 'matebreak_concurrency'
node scripts/test-stock-concurrency.mjs
& "$bin\pg_ctl.exe" -D $cluster stop
```

Usar un directorio temporal nuevo y una base vacía en cada repetición del comando completo. El script rechaza hosts remotos, el puerto PostgreSQL predeterminado y bases con tablas previas. El trigger del fixture introduce una espera de 350 ms al descontar stock para poder observar a la segunda sesión esperando el advisory lock. Se lanzan dos procesos `psql` simultáneos por escenario y se verifica `pg_stat_activity.wait_event='advisory'`.

La auditoría original registró 20/20 escenarios SQL y 36/36 tests Node; los 17 tests SQL de regresión disponibles entonces no se repitieron en esa iteración. Quedó publicada en `main` con el commit `6bcbba0`. En la revisión del ciclo de vida del pedido se repitieron los 20 escenarios: 20/20 OK. La prueba nueva de `mb_checkout_minorista` se documenta en [`ciclo-pedido-real.md`](ciclo-pedido-real.md).

`MB-QUENCHER` conserva su SKU físico sin publicación minorista. Esto no afecta la compra de los productos publicados y no requiere una publicación nueva para comenzar la integración de pagos.
