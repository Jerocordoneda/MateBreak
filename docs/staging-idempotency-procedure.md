# Replay de idempotencia — procedimiento futuro, no ejecutado en Cloud

Este procedimiento requiere autorización expresa para una NUEVA compra de una unidad del fixture, envío mock a domicilio y pago mock aprobado, total ARS 18.500. No reconstruye el request de la compra anterior ni utiliza sus registros. No autoriza por sí mismo compras, modificaciones o reintentos.

## Preparación

1. Reconfirmar destino Staging, proveedores mock, stocks y baseline de pedidos/pagos/reservas/logística. Mantener una única pestaña de checkout y la sesión autenticada del navegador.
2. Antes de confirmar el nuevo pedido, abrir Chrome DevTools → Sources → Snippets. Ejecutar el archivo local `tools/staging-idempotency-replay.js` como snippet. No instalarlo en el sitio, no incluirlo en el despliegue y no exportar Network/HAR, cookies, encabezados, tokens, contraseña ni datos del destinatario.
3. El helper admite exclusivamente el origen `https://matebreak-staging.vercel.app` o un servidor aislado `http://127.0.0.1:puerto`. Intercepta la llamada existente a `/api/checkout/pedidos`, carrito ordinario, Mercado Pago mock y correo a domicilio. Rechaza formatos no soportados antes de enviar; no inventa ni modifica la clave o la cotización.
4. Confirmar una sola vez desde la UI después de verificar importes y alcance. El helper conserva en una clausura de esta pestaña el cuerpo literal y los headers permitidos. La sesión se envía automáticamente por el navegador, sin leer cookies. Tras recibir el primer resultado, mantiene pendiente la promesa del frontend para impedir que éste borre la clave o navegue antes de la auditoría.

## Auditoría y única repetición

5. Consultar `mbStagingReplay.inspect()`. Sólo devuelve indicadores de control, UUID del pedido, importe y clave de idempotencia; no devuelve body, contacto, cookies ni credenciales. Debe mostrar `ready: true`, `used: false` y total 18500. Requiere además respuesta inicial mock aprobada, pedido pagado y moneda ARS.
6. Auditar por SQL de sólo lectura el NUEVO UUID: un pedido pagado, un pago mock aprobado, las reservas y movimientos esperados, stocks disminuidos una vez y logística pendiente. Si hay cualquier diferencia o incertidumbre de sesión, detenerse. No enviar otra compra ni otra cotización.
7. Sólo después de esa auditoría, llamar `mbStagingReplay.confirmAudit('UUID-del-nuevo-pedido')`. Esta llamada registra la aprobación manual de la auditoría; no sustituye las consultas SQL.
8. Ejecutar UNA vez `await mbStagingReplay.replayOnce()`. Reutiliza literalmente la URL, body, clave, cotización y opciones originales, con la misma sesión del navegador. El intento se consume antes del envío, incluso ante timeout/error. Rechaza un UUID, estado, moneda o total diferente. No tiene reintentos automáticos.
9. Auditar nuevamente por SQL: el mismo pedido, pago y reservas, sin movimientos ni consumo adicional de stock. Conservar solamente UUIDs, estados, importes y conteos necesarios en el informe.
10. Llamar `mbStagingReplay.release()` para restaurar fetch, liberar la respuesta original a la UI y retirar el control de la página. No recargar/navegar antes de completar o detener la auditoría. Ante fallo, conservar evidencia mínima, liberar el control si corresponde y solicitar instrucciones; no repetir pedidos.

El helper no protege contra una sesión que cambie deliberadamente durante la espera: no cerrar sesión, no cambiar cuentas ni abrir otra operación de checkout. No detecta automáticamente escrituras concurrentes; por eso requiere baseline y auditoría SQL antes/después.

## Componentes probados localmente

Tests Node aislados verifican captura literal, clave original, auditoría previa obligatoria, sesión gestionada por el navegador, uso único aun ante fallo, rechazo de origen productivo y headers de credenciales, y errores genéricos que no revelan body privado.

La vista `tests/staging-ux-preview.mjs` implementa un servidor exclusivo de loopback con respuesta en memoria y cookie ficticia HttpOnly. Se verificaron en un navegador real dos requests, un único registro simulado, body literal idéntico y la misma sesión. No es una prueba de idempotencia del backend desplegado ni crea registros PostgreSQL. La prueba externa sigue pendiente de autorización.

El helper y la vista local quedan fuera de `dist`; `.vercelignore` excluye explícitamente el helper y la carpeta tests. No se modifican los mecanismos productivos de idempotencia.
