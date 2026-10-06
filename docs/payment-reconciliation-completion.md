# Cierre de conciliación y auditoría

El webhook verifica HMAC, encola el Payment y obtiene el recurso mediante API
autenticada. `mb_reconcile_mp_payment` conserva sus validaciones y efectos
comerciales. Después, `mb_complete_payment_reconciliation` finaliza el trabajo
usando exclusivamente la observación autoritativa persistida.

El finalizador exige observación y job existentes. Su transacción serializa por
el mismo advisory lock que la conciliación y escribe una auditoría por
Payment/estado externo. `recibido_en` conserva el primer enqueue; la auditoría
documenta el resultado de conciliación, no reemplaza la evidencia HMAC ni
representa una nueva entrega. Los jobs de síncrono pendientes/retry pasan a
`done`, o `review` ante retención financiera. `attempts` cuenta claims del worker,
por eso puede quedar en 0 para un job cerrado sin worker.

Un worker conserva su claim activo y lo termina con `mb_finish_*`. Si falla el
finalizador, el job durable queda recuperable. La recuperación de una observación
ya aplicada usa el mismo RPC finalizador (sólo service_role), sin insertar una
auditoría manual, reenviar webhooks ni volver a confirmar pedidos. No procesa
jobs sin observación. Las entregas posteriores consultan nuevamente el Payment;
los estados duplicados no repiten efectos comerciales ni auditorías.

La migración es aditiva y no hace backfill. Aplicarla antes del nuevo backend.
Para recuperar el backend anterior, desplegar su SHA; conservar la función y
auditorías, compatibles con el código previo. No borrar datos ni reparar el
historial de migraciones. No requiere cambio de frontend ni Vercel.
