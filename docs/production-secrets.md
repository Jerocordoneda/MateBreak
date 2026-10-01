# Inventario de configuración y secretos para una futura liberación

No se recopilaron valores reales. Mantener secretos por ambiente en secret manager
del hosting/operador; nunca frontend, Git, argumentos de procesos ni logs.
Hosting aún no está conectado, según confirmó el usuario. Elegir proveedor/gestor
antes de activar servicios; no guardar secretos productivos en .env.example.

| Área | Variable/credencial | Sensibilidad y destino |
|---|---|---|
| Supabase | SUPABASE_URL | Config pública de endpoint, separar localhost/prod |
| Supabase | SUPABASE_PUBLISHABLE_KEY / alias SUPABASE_ANON_KEY | Clave pública con RLS; no sustituye autorización |
| Supabase | SUPABASE_SECRET_KEY / alias SUPABASE_SERVICE_ROLE_KEY | Secreto solo BFF; bypass RLS, no navegador |
| Supabase operador | Token CLI / password DB / servicio libpq | Secret manager del operador, permisos mínimos; no tests/CI normal |
| Mercado Pago | MP_ACCESS_TOKEN / alias MERCADOPAGO_ACCESS_TOKEN | Secreto backend, ambiente explícito |
| Mercado Pago | MERCADOPAGO_WEBHOOK_SECRET | Secreto backend para firma; no respuestas/logs |
| Mercado Pago | MP_PUBLIC_KEY | Pública si algún flujo futuro la requiere; Checkout Pro actual no la usa |
| MiCorreo | CORREO_MICORREO_USER, CORREO_MICORREO_PASSWORD | Credenciales API oficiales backend; no login normal de MiCorreo |
| MiCorreo | CORREO_MICORREO_CUSTOMER_ID | Identificador de cuenta backend, no secreto de autenticación; no exponer innecesariamente |
| MiCorreo | CORREO_MICORREO_ENVIRONMENT, CORREO_ORIGIN_POSTAL_CODE | Config backend del ambiente/origen; test no es producción |
| MiCorreo | CORREO_VERIFIED_PARCELS_JSON | Config backend con medidas verificadas, sin datos personales |
| Hosting | Accesos deploy, TLS, observabilidad, gestor de secretos | Secretos del operador/hosting; rotación y auditoría propias |
| App | APP_ORIGIN, NODE_ENV, PORT, SHIPPING_MODE, PAYMENTS_MODE | Config explícita por ambiente; mock local nunca cobrar real |
| Local | MATEBREAK_LOCAL_ONLY, MATEBREAK_LOCAL_PERSIST_MOCK, MATEBREAK_LOCAL_PICKUP_MOCK, MOCK_PAYMENT_RESULT, MOCK_ORIGIN_POSTAL_CODE | Solo stack sintético loopback, no producción |

CORREO_MICORREO_ENVIRONMENT se implementó en la RC; CORREO_ENVIRONMENT permanece
como alias legacy. Si ambos se configuran con valores distintos el inicio se detiene.
Default test; producción exige production explícito junto a SHIPPING_MODE=real y
credenciales API oficiales. Cambiar el nombre no activa proveedores ni workers.
El selector MATEBREAK_LOCAL_PICKUP_MOCK=1 exige LOCAL_ONLY y ambos modos mock con
Supabase/origen loopback; está OFF por defecto y rechazado en producción.

Checklist del responsable:

- Separar todos los ambientes y confirmar identidad/entorno sin imprimir valores.
- Usar credenciales de proveedor API oficiales; JWT MiCorreo solo caché backend.
- Revisar que deploy/CI/logs no interpolen valores; no ponerlos en URL o comando.
- Acceso mínimo, registro de cambios y rotación; cerrar checkout/jobs ante incidentes.
- Backups/history seguros fuera del repo; nunca copiar producción a fixtures locales.
- Deshabilitar Deploy to production antes de publicar/alinear history y verificar
  que no haya otra integración que aplique migraciones por push/merge.
- Conservar la edición original del customerId fuera de Git; .env.example de la RC
  debe mantener placeholders vacíos, sin trasladar el valor original.
