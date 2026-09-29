# Modelo de amenazas de MateBreak

Estado: 2026-09-29, base `c2248fc`. Alcance: tienda, equipo, inventario, checkout, pagos y envíos. Esta revisión es una evaluación de código y metadatos SQL de solo lectura del proyecto Supabase, más pruebas locales; no certifica seguridad total.

## Activos y límites de confianza

| Activo | Sensibilidad | Límite |
| --- | --- | --- |
| Credenciales Supabase, Mercado Pago y MiCorreo | Crítica | Solo variables del proceso servidor; nunca HTML, JS, logs ni Git. |
| Sesión Auth y credencial de carrito | Alta | Cookies HttpOnly/Secure/SameSite; el servidor verifica el usuario con Supabase Auth; el SQL recibe hash de carrito. |
| Pedidos, direcciones, pagos, stock y costos | Alta | Navegador → API Express → Supabase con clave secreta. La API valida identidad, rol, campos y totales; RLS protege acceso directo autenticado. |
| Publicaciones y precios | Media | Datos de catálogo de solo lectura al cliente; precio y disponibilidad se recalculan en SQL. |
| Notificaciones y cotizaciones externas | Alta | Mercado Pago/MiCorreo → adaptadores fijos; webhook firmado se reconcilia con API autenticada. |

Actores: visitante, cliente autenticado, vendedor, equipo de inventario, administrador, proveedor de pago/envío, atacante remoto y operador con acceso a infraestructura. Un cliente puede modificar completamente requests, cookies no HttpOnly propias, URLs y datos de su cuenta; no se confía en ninguna cifra enviada por navegador.

## Riesgos priorizados

| Riesgo | Severidad | Estado / control |
| --- | --- | --- |
| Secreto de backend expuesto o credencial comprometida | Crítica | `.env` ignorado; escaneo heurístico de archivos/historia sin coincidencias de patrones conocidos. Rotación, secretos del hosting y acceso GitHub requieren verificación manual. |
| Privilegios por defecto de `public` para `anon`/`authenticated` | Alta | Hallazgo confirmado en metadatos reales. Migración `20260929214717_harden_default_privileges.sql` preparada y probada localmente; **no aplicada** al proyecto real. |
| Publicación accidental de una tabla/RPC futura | Alta | RLS automático existente y migración de privilegios por defecto. Toda migración nueva debe probar GRANT + RLS + EXECUTE; CI local no sustituye revisión de cada objeto. |
| Sobreventa o reserva parcial bajo concurrencia | Alta | Advisory lock, transacción y tests aislados: 20/20, ciclo 9/9 y concurrencia minorista 2/2. Migración previa de ciclo aún no aplicada al proyecto real. |
| Pago falso, webhook repetido o de otro importe | Alta | Firma con ventana temporal, consulta del pago a Mercado Pago, referencia/importe/moneda y RPC idempotente. Proveedor real no activado ni probado extremo a extremo. |
| Fuerza bruta y agotamiento de API | Media/Alta | Límite por tipo de ruta, cuerpo JSON de 16 KiB, timeouts y eventos mínimos. El limitador es por proceso; falta límite compartido en el edge antes de escalar. |
| XSS en contenido dinámico o plantillas heredadas | Media/Alta | JS de datos usa DOM/texto, no `innerHTML` con datos de usuario en las rutas revisadas. `base-uri`, `object-src` y anti-framing activos; falta CSP estricta porque páginas heredadas cargan scripts/estilos inline y CDN. |
| CSRF o CORS erróneo | Media | Mutaciones JSON requieren `Origin` exacto, Fetch Metadata no cross-site y cookies SameSite. Webhook se autentica con firma. No hay `Access-Control-Allow-Origin` arbitrario. |
| Acceso cruzado entre clientes o elevación por metadata | Alta | IDs de usuario salen de Auth verificado; RLS por `auth.uid()` en perfil/dirección/pedido. Roles se consultan en tablas del equipo, no `user_metadata`. Pruebas con fixtures; faltan pruebas RLS A/B contra stack Supabase local completo. |
| Configuración de Auth, red, backup y monitoreo | Alta | Fuera del repositorio. Advisor señala protección de contraseñas filtradas desactivada; ver checklist. |

Referencias de criterios: [OWASP ASVS 5.0](https://owasp.org/projects/asvs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase API](https://supabase.com/docs/guides/api/securing-your-api).
