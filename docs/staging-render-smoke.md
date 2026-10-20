# Smoke test Render y Supabase Staging — 2026-10-01

Backend: https://matebreak-api-staging.onrender.com.
Source informado por el responsable: 308b1d1. Sólo GET y SELECT explícitos.

| Comprobación | Resultado |
| --- | --- |
| GET /healthz | 200, {"status":"ok"}, Cache-Control no-store; 555 ms en esta muestra |
| GET /api/productos | 200; 542 ms en esta muestra; un producto sintético |
| Producto | ID 13, STAGING Mate sintético, ARS 10000 |
| Variante | ID 2; comprable=true, con_stock=true |
| SELECT explícito rxccjczyywhewqqdfgxm | Mismo producto/precio/variante/disponibilidad |
| Migraciones | 26 |
| Usuarios / pedidos / pagos / envíos | 0 / 0 / 0 / 0 |
| Headers | HSTS, CSP, X-Content-Type-Options y respuestas sin caché |

La respuesta del backend coincide con el fixture exclusivo de Staging. Es una
prueba funcional de lectura de catálogo y RPC de disponibilidad a través de
Supabase; /healthz solo no habría probado conectividad DB.
El código desplegado comprueba el proyecto aprobado y excluye el ref productivo.
No se leyeron claves ni variables privadas del runtime.

El responsable confirmó Shipping mock / Payments mock en los logs de arranque.
No existe herramienta de lectura de logs Render disponible en esta sesión:
la revisión independiente del stream interno sigue pendiente en el Dashboard.
La consola del navegador mostró el warning del CDN Tailwind y ningún error
capturado de script; eso no sustituye los logs del servidor.

Se abrió la raíz Render para inspeccionar sus archivos públicos. Su consulta de
resumen de carrito es de lectura; no se crearon cuentas, pedidos, pagos o envíos.
No se probaron registro, checkout o callbacks Auth.

## Hallazgos funcionales pendientes

El fixture conserva metadatos públicos históricos fuera de los campos aprobados:
opción BOMBILLA ACERO INOX, promociones y cuotas de variante con importes 39100.
El precio base y de variante sí es 10000. No se alteró SQL para corregir esos
metadatos. Revisar cómo se muestran en la futura prueba de ficha/checkout mock.
La home pide productos destacados y el fixture tiene destacado=false: muestra
cero destacados; el catálogo /tienda sí debe contener el fixture.

No se desplegó Vercel ni se modificaron producción, migraciones o proveedores.
