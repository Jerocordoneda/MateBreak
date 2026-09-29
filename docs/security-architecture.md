# Arquitectura de seguridad

Revisión 2026-09-29. El navegador solo usa `/api` y archivos estáticos permitidos. Express conserva la clave secreta de Supabase, identifica al usuario con `auth.getUser()`, valida entradas y llama a RPC/queries parametrizadas. Los roles de equipo se leen de membresías privadas. El cliente no decide totales, stock, costo de envío ni identidad. Mercado Pago/MiCorreo se conectan desde adaptadores con hosts fijos. La clave publicable solo sirve para Auth/RLS; la secreta evita RLS y por eso el backend aplica autorización explícita.

Cookies de Auth y carrito: HttpOnly, Secure en HTTPS, SameSite=Lax. El token de carrito es aleatorio y solo su SHA-256 llega a SQL. En producción `APP_ORIGIN` exige HTTPS y origen exacto; mutaciones requieren JSON y `Origin` exacto. Express no confía en `X-Forwarded-For`; el límite usa `remoteAddress`. Tras un proxy, configurar una cadena de confianza concreta en infraestructura y un limitador compartido. La aplicación no activa `trust proxy` automáticamente.

Cabeceras globales: HSTS en producción, anti-framing, nosniff, política de referentes, permisos mínimos y CSP parcial (`base-uri`, `frame-ancestors`, `object-src`, `form-action`). La CSP de scripts/estilos queda pendiente por páginas heredadas con inline/CDN. `/api` y vistas privadas usan `no-store`; los errores no entregan stack. Logs de seguridad solo incluyen tipo, ruta, status y request ID, sin cuerpo, cookie, email o IP. La IP se conserva transitoriamente en memoria para limitar tráfico. Los eventos no son un audit log persistente.

Límites por minuto y dirección de socket: Auth 8, checkout/cotización 12, admin 60, webhook 60 y otras API 180. El mapa se limpia por vencimiento y tiene tope de 10.000 entradas. Esta protección sirve para un proceso; antes de múltiples réplicas se necesita control compartido en CDN/gateway. `Retry-After` informa el bloqueo.

Pago: el webhook firmado es una señal; se consulta el estado real al proveedor, se compara pedido, importe y ARS, y SQL confirma/cancela de forma idempotente. No se procesan tarjetas. Envío: destino validado, paquete derivado del catálogo en servidor y host del proveedor fijo. El estado real de ambos proveedores aún no se activó.

Contrato de notificaciones: [Mercado Pago Webhooks](https://www.mercadopago.com.ar/developers/es/docs/prestashop/additional-content/your-integrations/notifications/webhooks). Las pruebas locales cubren firma y conciliación con mocks, pero queda validar la configuración de la aplicación real.

## Inventario SQL observado (solo lectura)

Proyecto `nwpdfqwqxrkokluqqqfs` el 2026-09-29. `S/I/U/D` indica GRANT de SELECT/INSERT/UPDATE/DELETE; `—` ningún GRANT. Todas las tablas siguientes tienen RLS. Backend = `service_role`/administrador SQL, sujeto a autorización de la API; no equivale al rol comercial admin. La matriz describe **GRANT**, no visibilidad efectiva de filas: una tabla sin política RLS deniega filas a roles normales aun si tiene GRANT.

| Objeto | Schema | anon | authenticated | Backend/admin | RLS | Motivo |
| --- | --- | --- | --- | --- | --- | --- |
| carrito, carrito_item, carrito_variante | public | — | — | completo | sí | Carrito solo por RPC. |
| catalogo_asset, catalogo_categoria, catalogo_componente, catalogo_imagen | public | — | — | completo | sí | Catálogo por API. |
| catalogo_opcion, catalogo_producto, catalogo_producto_categoria, catalogo_promocion | public | — | — | completo | sí | Catálogo por API. |
| catalogo_revision, catalogo_variante, catalogo_variante_componente, catalogo_variante_mapeo | public | — | — | completo | sí | Mapeo e inventario no son editables por cliente. |
| checkout_cotizacion_envio | public | — | — | completo | sí | Cotizaciones server-side. |
| combo, combo_item | public | SIUD* | SIUD* | completo | sí | Sin políticas; GRANT heredado a revocar. |
| direccion | public | — | SIUD | completo | sí | Política de propietario `auth.uid()`. |
| email_contacto | public | — | SID | completo | sí | Políticas por propietario. |
| envio | public | — | S | completo | sí | Lectura de envío propio. |
| mercadopago_intento | public | — | — | completo | sí | Intento interno. |
| metodo_envio, metodo_pago | public | — | — | completo | sí | Consulta vía API. |
| movimiento_stock | public | — | — | completo | sí | Mutación por RPC de equipo. |
| pago | public | — | S | completo | sí | Lectura de pago propio. |
| pago_webhook_auditoria | public | — | — | completo | sí | Auditoría de webhook. |
| pedido | public | — | S | completo | sí | Lectura de pedido propio. |
| pedido_abastecimiento | public | — | — | completo | sí | Proceso interno. |
| pedido_item | public | — | S | completo | sí | Lectura de líneas propias. |
| pedido_preparacion, pedido_stock | public | — | — | completo | sí | Preparación y reservas internas. |
| perfil | public | — | SIU | completo | sí | Política de perfil propio. |
| producto | public | SIUD* | SIUD* | completo | sí | Sin políticas; GRANT heredado a revocar. |
| producto_simple | public | — | — | completo | sí | Stock físico interno. |
| cambio_rol, confirmacion_transferencia, equipo_inventario, equipo_vendedores | private | — | — | completo | sí | Schema privado sin USAGE cliente. |
| inventario_ajuste, inventario_ficha, inventario_recepcion, preparacion_evento | private | — | — | completo | sí | Operación interna. |
| venta_manual, venta_manual_empaque, venta_manual_evento, venta_manual_item | private | — | — | completo | sí | Ventas internas. |
| buckets, objects y otras 6 tablas `storage` | storage | grants propios de Storage | grants propios de Storage | servicio Storage | sí | Bucket `product-images` público, MIME imágenes y límite 50 MiB; sin políticas de escritura de aplicación observadas. |

`*` La migración nueva revoca esos GRANTs y USAGE de tres secuencias públicas. Todavía no está aplicada. `public` tiene 35 tablas, `private` 12, `storage` 8; ninguna tabla `public` sin RLS. No hay vistas ni vistas materializadas en `public`. Nueve políticas observadas cubren `direccion`, `email_contacto`, `envio`, `pago`, `pedido`, `pedido_item` y `perfil`; las demás tablas públicas son de acceso server-side. Las 40 alertas INFO `rls_enabled_no_policy` del Advisor corresponden a tablas deliberadamente cerradas, no a una autorización abierta. El Advisor además reporta protección de contraseñas filtradas desactivada (WARN).

Las funciones `public` observadas no son ejecutables por `anon` ni `authenticated`; `public.rls_auto_enable` es SECURITY DEFINER con `search_path=pg_catalog` y EXECUTE revocado. Las funciones `private` observadas no tienen USAGE del schema para clientes ni EXECUTE; son SECURITY INVOKER con `search_path` vacío. Hay cuatro triggers públicos relacionados con caja de mate, preparación y despacho. Las tres secuencias de `public` tenían USAGE para ambos roles de navegador. Los privilegios por defecto de `postgres` y `supabase_admin` concedían tablas, secuencias y funciones futuras a esos roles: la migración corrige ese desvío sin tocar producción.

Fuentes: [RLS y GRANTs](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones SECURITY DEFINER](https://supabase.com/docs/guides/database/functions), [Security Advisor](https://supabase.com/docs/guides/observability/advisors).
