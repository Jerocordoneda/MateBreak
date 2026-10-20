# Compra Mayorista con cuenta — candidato local

Base publicada: `cefa31c342cdecd079da91599bb3f62185462f8e`. Implementación incremental, pendiente de autorización para Staging. No se modifica main, producción ni PR #2. No se crean compras, usuarios ni solicitudes en Cloud durante esta preparación.

## Recorrido

Los tres accesos de Inicio llevan a `/regalos-empresariales`. La presentación recupera el diseño y la imagen empresarial originales y se titula Compra Mayorista. Es pública, explica el mínimo de 10 unidades y los beneficios de 10/50/100 unidades. Su CTA consulta la sesión y lleva a `/mayorista` o a `/mi-cuenta?volver=mayorista`.

Mi Cuenta utiliza el Auth existente; sólo admite los destinos simbólicos mayorista/carrito. Registro conserva el retorno en cookie HttpOnly y en la URL de confirmación. Callback admite PKCE y token_hash email/signup verificados, limpia el token de la navegación y vuelve al catálogo. Un enlace vencido o PKCE abierto en otro dispositivo conserva el destino para iniciar sesión después de confirmar el correo. No acepta URLs arbitrarias ni aprobación administrativa.

El HTML estático privado es una estructura sin tarifas ni datos personales: el catálogo, formulario y solicitudes permanecen ocultos hasta verificar el acceso. Los endpoints requieren getUser del servidor y una sesión vigente de auth.sessions, vinculada al mismo usuario confirmado y no anónimo. Logout revoca el acceso aunque se reutilice una cookie anterior; el navegador limpia datos al recibir 401, cambiar de cuenta o recibir el aviso de logout. El checkout minorista sigue admitiendo invitados.

## Solicitudes y datos

Una migración nueva agrega account_id nullable, índice de propietario y permisos de lectura de columnas mínimas de Auth sólo para service_role. Las funciones son SECURITY INVOKER, con EXECUTE denegado a anon/authenticated. Las tablas mayoristas siguen privadas y con RLS.

El submit invitado se mueve al esquema private para reutilizar su bloqueo/idempotencia y cotización sin conservar un RPC público invitado. El nuevo submit recibe exclusivamente la identidad y sesión verificadas por backend. Una restricción comprueba la relación entre cuenta y owner_hash; un trigger impide cambiar una cuenta ya asociada. La clave idempotente se separa por cuenta, y un reintento devuelve los precios y datos guardados originalmente.

Las solicitudes anteriores conservan owner_hash, comprador, presupuesto, números y eventos; account_id queda NULL. No se deduce propietario a partir del email ni de cookies antiguas. Consulta propia filtra account_id; un ID ajeno responde 404. No se cambia el perfil permanente ni se generan pedidos, pagos o reservas de inventario.

El formulario reutiliza el nombre completo (el perfil actual guarda nombre y apellido juntos), email de Auth, teléfono del perfil y direcciones AR de Mi Cuenta. La provincia se normaliza con el catálogo existente; datos ausentes/incompatibles quedan para completar. Con varias direcciones el usuario elige. Las ediciones manuales, incluso un campo vaciado, tienen prioridad sobre respuestas tardías. Empresa, contacto comercial y personalización se guardan como copia de la solicitud.

Se mantienen las 11 ofertas, las fotografías, las escalas 10–49/50–99/100+, mínimo combinado, cotización autoritativa, recibo MAY y WhatsApp `5492266488213`. Primero se conversa, después se coordina la seña. No se introduce distribución de vendedores, comisiones ni cobros.

## Validación local

- Suite Node completa: 235 tests.
- PostgreSQL aislado con 31 migraciones: compatibilidad de solicitudes invitadas/eventos, aislamiento de dos cuentas y sesiones, propiedad inmutable, revocación/vencimiento, ACL/RLS e idempotencia concurrente.
- Catálogo: 66 límites de precio/mínimo, accesorios combinados y replay.
- Chrome real 1440/360: 30 casos del recorrido, Auth con proveedor sintético exclusivamente local, API Express real y SQL/RLS reales. Confirmación de correo simulada localmente; no se envían emails ni WhatsApp.
- Minorista: ensayo SQL de checkout invitado, concurrencia y reservas; Chrome con API local hasta Entrega → Pago, promociones y Comprar ahora con carrito ordinario independiente. Otros 23 casos Chrome usan respuestas API interceptadas para Mi Cuenta, provincias y animación del resultado.

## Preflight y publicación propuesta

Destino único: Supabase `rxccjczyywhewqqdfgxm`, Render `srv-davbsjad0e5s73fcoc30`, Vercel `prj_CrDsy4AToxUT27bCsEbuaDmAceJh` / `copplex1` / matebreak-staging.

La URL de Auth actual es https://matebreak-staging.vercel.app y su único redirect permitido es /auth/callback sin parámetros. Preparado en `deploy/staging/wholesale-auth-return.json`: agregar exactamente https://matebreak-staging.vercel.app/auth/callback?volver=mayorista, conservando el callback existente. No agregar comodines ni destinos externos.

SMTP propio continúa desactivado y se conservan las plantillas por defecto. Supabase limita el correo del proveedor por defecto a direcciones del equipo. Esto limita la comprobación de altas reales en Staging; no se declara probado un registro público por email en Cloud ni se activa un proveedor para resolverlo. Referencia: https://supabase.com/docs/guides/auth/auth-smtp.

Tras autorización:

1. Reconfirmar baseline, entornos mock, Auto-Deploy OFF/Git desconectado y referencias Git; guardar backup de esquema y huellas de negocio/comercial.
2. Push fast-forward sólo a codex/staging-preparation y esperar CI del HEAD exacto.
3. Agregar el redirect exacto; dry-run de Supabase debe listar exclusivamente `20261003230752_wholesale_account_access.sql`. Aplicarlo y comprobar que todos los leads previos siguen sin cuenta y conservan sus huellas (excluyendo la nueva columna NULL).
4. Publicación manual de Render del HEAD exacto y luego Vercel del prebuilt auditado en el proyecto de Staging. Coordinar la ventana: al retirar el RPC invitado, el backend anterior puede dejar de aceptar solicitudes hasta quedar Live el backend nuevo.
5. Comprobar salud, rutas públicas, rechazo 401 de endpoints privados sin sesión, noindex/no-store, hashes estáticos y baseline. No crear solicitudes, compras, usuarios ni enviar correos en Cloud sin autorización específica adicional.

Una recuperación conserva la migración y la protección de cuentas; se corrige hacia adelante si es necesario. No restaurar un backend que vuelva a servir tarifas sin autenticación. No se propone revertir datos ni habilitar de nuevo el canal invitado.

El informe externo del candidato contiene HEAD, commits, capturas, manifest y evidencias del prebuilt. El build se realiza con Node 22 / CLI 62.0.0 en Docker; no cambia el setting remoto Node 24 del frontend estático. No se publica durante este turno.
