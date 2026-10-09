# Preparación de hosting (sin desplegar)

Evaluación del código y fuentes oficiales consultadas el 2026-10-01. No se crearon cuentas, servicios, conexiones, secrets ni automatismos de despliegue.

## Opción inicial

Un servicio Node permanente en Render o Railway puede servir frontend, API, callback Auth y pantallas internas desde el mismo origen. Reutiliza `server/index.mjs`, no necesita Docker de aplicación, un nuevo framework ni otra base de datos: Supabase continúa siendo PostgreSQL/Auth/Storage. Build: `npm ci`; start: `npm start`; Node 22+; `PORT` lo asigna el proveedor. El listener no local permite interfaces externas. Health check: `/healthz` (liveness, no readiness de DB).

Persistencia de negocio: PostgreSQL/Storage. No depender del filesystem efímero para pedidos, imágenes subidas o snapshots. `.env` no se despliega: las variables se cargan en el gestor de secretos del host. No registrar bodies, tokens, cookies ni direcciones; los eventos de seguridad y fallos del job son sanitizados.

## Vercel para frontend

Build local verificable: `npm ci && npm run build:frontend`; output `dist`. Solo se copian `index.html` y `src`, excluyendo backend, `.env`, node_modules y migraciones. La reconstrucción no elimina artefactos antiguos; para un release se usa un checkout/build directory limpio.

El JS usa `/api` y cookies `same-origin`: separar dominios sin proxy rompería sesiones/CSRF. Usar [rewrites externos de Vercel](https://vercel.com/docs/routing/rewrites) preservando origen, Set-Cookie y querystrings. Orden propuesto para una configuración futura revisada, con URL backend de staging:

1. `/api/:path*`, `/auth/:path*` y `/interno/:path*` al backend (pantallas/activos internos requieren autorización).
2. `/tienda` a `/src/pages/catalogo.html`, `/carrito` a `/src/pages/tienda.html`.
3. `/checkout/resultado` a `/src/pages/checkout-resultado.html`, `/checkout` a `/src/pages/checkout.html`.
4. `/productos/:slug` a `/src/pages/producto.html`, `/mi-cuenta` a `/src/pages/cuenta.html`.
5. Archivos públicos bajo `/src` y home desde el output estático.

`APP_ORIGIN` debe ser el origen público del frontend, no el dominio interno del backend; Auth callback y URLs de pago deben corresponder a ese origen. Validar en staging las cookies HttpOnly/Secure, cache de rutas autenticadas, Origin y redirects. No se agregó `vercel.json` con endpoints ficticios ni se configuró proxy externo. El output por sí solo no ofrece API ni rutas amigables.

## CORS, proxy y staging

La estrategia es mismo origen mediante el servicio único o proxy. No se habilita CORS permisivo; `securityMiddleware` verifica Origin de escrituras. La app no confía automáticamente en X-Forwarded-For; su rate limiter usa socket remoto. Con un proxy, varios clientes pueden compartir IP: antes de lanzar hay que definir una política de proxies confiables y repetir tests de spoof/rate limiting; no activar `trust proxy` indiscriminadamente.

Separar proyecto Supabase local, staging y producción, con callback allowlist y secrets independientes. Staging con mocks requiere `NODE_ENV=development`; `production` rechaza mocks. La persistencia de mocks es exclusivamente localhost y no debe activarse en cloud. Para staging real se necesitan credenciales oficiales de prueba y `CORREO_MICORREO_ENVIRONMENT=test`; la app productiva exige entorno MiCorreo production. No se creó un nuevo modo staging que pudiera evadir estos guards. Esta preparación no activa proveedores.

Variables: las del README; perfiles de embalaje solo backend. No hay variables públicas con service/secret key. `MP_PUBLIC_KEY` no es utilizada por el checkout actual. El sender necesario para importación real debe completarse/revisarse en una iteración de integración: el loader actual no expone una configuración completa del remitente. No ocultar esa limitación con un ejemplo de producción aparentemente listo.

## Workers

La expiración de reservas ya corre en `server/jobs/expire-reservations.mjs`, cada minuto y sin solapamiento dentro del proceso web. Mantener una instancia inicial permite reutilizarlo; no añadir Redis ni otra cola. En varias réplicas el guard es por proceso, por lo que corresponde verificar concurrencia/idempotencia SQL y separar scheduling antes de escalar.

`server/shipping/jobs.mjs` exporta `runShipmentJob({admin,provider,allowReal})`; usa claims transaccionales por bulto, external ID estable y cuarentena de resultados ambiguos. No está programado desde el servidor web. Render ofrece [background workers](https://render.com/docs/background-workers); Railway puede alojar otro servicio Node. Un futuro entrypoint deberá llamar a esa función, incorporar backoff/shutdown y revisión explícita de `allowReal`. No existe aún un comando worker persistente listo para activar; crearlo y habilitar importaciones reales requiere el ensayo con proveedor. No se inventa un `npm run worker` que hoy no existe. El frontend no puede disparar importaciones.

## Render vs Railway

Supuestos: una tienda pequeña con API siempre disponible, Supabase externo, sin disco persistente local; opcionalmente un worker separado. USD/mes, sin impuestos, dominios, Supabase, Vercel ni costos de proveedores. No usar tiers dormidos/gratuitos para prometer disponibilidad de reservas o webhooks.

| Aspecto | Render | Railway |
| --- | --- | --- |
| Modelo | Instancias por servicio/tamaño; workspace y consumo adicional según plan | Mínimo del plan con créditos y consumo de CPU/RAM/egress |
| API/worker | Web service y background worker explícitos | Servicios independientes con su start command |
| Costos de referencia | Starter web/worker figura desde USD 7/mes por servicio; dos instancias de ese tamaño darían USD 14 antes de extras | Hobby mínimo USD 5 con USD 5 de uso; Pro mínimo USD 20 con USD 20 de uso, según requisitos del workspace |
| Presupuestar | Más previsible si el tamaño alcanza; worker suma una instancia | Medir recursos de ambos servicios; el mínimo no es el costo fijo de cualquier carga |
| Operación | Adecuado para API y worker con lifecycle explícito | Flexible para agrupar servicios y pagar uso real |

Fuentes: [Render precios](https://render.com/pricing), [planes de cómputo Render](https://render.com/docs/compute-plans), [Railway precios](https://railway.com/pricing) y [planes Railway](https://docs.railway.com/pricing/plans). Confirmar en la selección de servicio antes de contratar: los planes/workflows específicos y precios pueden cambiar.

Ejemplo Railway de capacidad, no cotización: 30 días continuos, 0.5 GB RAM y CPU media 0.1 vCPU por servicio; usando las tarifas publicadas de USD 0.00000386/GB/s y USD 0.00000772/vCPU/s resulta aproximadamente USD 7 por servicio/mes. Dos servicios similares ~USD 14 de uso; Hobby cobraría el mínimo o el uso total según créditos, Pro tendría su mínimo de USD 20. Agregar egress (publicado USD 0.05/GB), picos y cualquier extra. La memoria y CPU reales deben medirse; los recursos reservados de Render no equivalen al consumo de Railway.

Decisión sugerida: comenzar con frontend+API en un único servicio Node para reducir coordinación; elegir Render por presupuesto por instancia o Railway si se quiere medir consumo. Añadir Vercel y un worker solo cuando haya una razón operativa y staging verificado. Ninguna opción implica activar deploy automático.
