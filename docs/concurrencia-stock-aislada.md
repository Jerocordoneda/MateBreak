# Concurrencia de stock en base aislada

El 29/09/2026 se ejecutó el checkout SQL real del repositorio en un cluster
PostgreSQL 18 temporal, vacío y exclusivo, ligado a `127.0.0.1:55432`. No se
conectó a Supabase ni se copiaron usuarios, pedidos o existencias reales. El
esquema fixture reproduce sólo las tablas que necesita la función; las cinco
funciones de precio, cotización, disponibilidad y checkout se extrajeron sin
modificaciones de las migraciones existentes.

Para repetir en Windows con PostgreSQL instalado y Node.js:

```powershell
$bin = 'C:\Program Files\PostgreSQL\18\bin'
$cluster = Join-Path $env:TEMP 'matebreak-concurrency-test'
& "$bin\initdb.exe" -D $cluster -U postgres -A trust --encoding=UTF8 --no-instructions
& "$bin\pg_ctl.exe" -D $cluster -o '-p 55432 -h 127.0.0.1' -l (Join-Path $cluster 'server.log') start
& "$bin\createdb.exe" -h 127.0.0.1 -p 55432 -U postgres matebreak_concurrency
$env:PSQL_BIN = "$bin\psql.exe"
$env:MB_CONCURRENCY_DB = 'matebreak_concurrency'
node scripts/test-stock-concurrency.mjs
& "$bin\pg_ctl.exe" -D $cluster stop
```

Usar un directorio temporal nuevo y una base vacía en cada repetición del
comando completo. El script rechaza hosts remotos, el puerto PostgreSQL
predeterminado y bases con tablas previas. El trigger del fixture introduce
una espera de 350 ms al descontar stock para poder observar a la segunda
sesión esperando el advisory lock. Se lanzan dos procesos `psql` simultáneos
por escenario y se verifica `pg_stat_activity.wait_event='advisory'`.

Resultados: 5/5 SKU simple, 5/5 combo con un componente limitante, 5/5 mate
con caja `MB-CAJA-MATE` limitante, 5/5 requests con la misma clave de
idempotencia. En los primeros tres casos hubo un éxito, un rechazo por falta
de stock, un pedido y una reserva por componente. En idempotencia, ambos
requests devolvieron el mismo pedido, con una sola reserva y una sola caja.
No hubo stock negativo ni reservas parciales. `npm test`: 36/36. Los 17 tests
SQL de regresión corresponden a la auditoría previa y no se repitieron en esta
iteración, ya que requieren el esquema completo; la prueba SQL local nueva
ejecutó 20/20 escenarios reales.

`MB-QUENCHER` conserva su SKU físico sin publicación minorista. Este estado no
afecta la compra de los productos publicados y no requiere crear una nueva
publicación para comenzar pagos.
