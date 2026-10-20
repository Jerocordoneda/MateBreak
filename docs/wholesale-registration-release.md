# Iteración local de registro mayorista — informe de entrega

Rama `codex/wholesale-registration`, basada en Staging publicado 9894e3a. No se hizo push, deploy, merge ni se escribieron datos de negocio en Cloud.

## Implementación

Inicio conserva un solo botón REALIZAR REGALO EMPRESARIAL en Confianza Empresarial, hacia `/regalos-empresariales`; elemento duplicado eliminado del HTML. Catálogo privado retira los dos CTAs de su presentación; el CTA público y WhatsApp del recibo MAY permanecen.

Registro desde `volver=mayorista` pide nombre/apellido, email/contraseña, WhatsApp, provincia canónica, localidad y empresa opcional. Registro general mantiene sus campos. Supabase Auth sigue siendo único sistema; los datos comerciales de metadata no dan permisos y se persisten con identidad verificada por callback/login y RPC autenticado.

Nueva migración `20261004065346_wholesale_profile_details.sql`: columnas provincia/localidad/empresa y RPC SECURITY INVOKER con `auth.uid()`, fill-only atómico y ACL autenticada. No reescribe las 31 migraciones anteriores ni solicitudes históricas. WhatsApp se conserva como texto, 7–15 dígitos y máximo30 caracteres de formato, compatible con el formulario MAY.

Para cuentas existentes se consultan perfil/email y direcciones propias AR, y se muestran solo campos faltantes. Varias direcciones conservan selección explícita. El formulario se autocompleta sin sobrescribir edición manual; edición comercial se guarda en snapshot MAY y no cambia el perfil. Logout limpia datos y revoca acceso mayorista.

## Evidencia local

- Node22.23.3: 239/239, cero fallos. Audit dependencias producción: cero avisos de vulnerabilidad.
- SQL aislado: 32 migraciones, fill-only concurrente, RLS A/B, rechazo de spoofing, provincia/teléfono y preservación de perfil; acceso mayorista con sesiones/idempotencia/historial; 66 límites del catálogo y no escrituras minoristas; checkout invitado concurrente sin sobreventa y outbox único.
- Chrome real: 34 casos de flujo mayorista en1440/360, más8 de perfil incompleto/error/reintento/logout y2 de CTA/responsive. Mi Cuenta/checkout invitado:23 casos con API interceptada local. Auth/email se simulan localmente; Express y SQL del flujo mayorista son reales y aislados. No se enviaron mensajes externos.
- Build Staging con backend exacto pasa; baseline --check y catálogo histórico pasan. Prebuilt final y HEAD/manifest quedan en informe externo para evitar autorreferencia del commit.

La prueba Chrome principal se ejecuta en procesos separados por viewport para respetar la cuota real de seis solicitudes/minuto; no se debilitó el limitador. La auditoría antigua `audit-architecture.mjs after` compara la totalidad de migraciones con un snapshot anterior y falla al agregar migraciones; no se alteró ese snapshot. La preservación histórica se comprobó directamente con los31 hashes remotos y Git; no se declara esa auditoría antigua aprobada.

## Preparación preproducción

Entregables: [seguridad](preproduction-security-20261004.md), [correo transaccional](transactional-email-plan.md), [integraciones externas](commercial-integration-status.md), [PR2/main y rollback](integration-main-plan.md). Es una hoja de ruta; las brechas altas señaladas impiden declarar producción comercial lista.

## Preflight read-only y siguiente publicación

Targets exactos: Supabase `rxccjczyywhewqqdfgxm`; Render `srv-davbsjad0e5s73fcoc30`; Vercel `prj_CrDsy4AToxUT27bCsEbuaDmAceJh`, equipo `team_lIiIUZEuCy5NAdctFIrl8mt8` / copplex1. Render sigue Live en9894, deploy `dep-db0uje1srm7s73989300`, Auto-Deploy OFF/rama Staging. Vercel Ready, deploy `dpl_AqnEkpM2uunr4K2X8KNwuri2eRqD`, alias Staging. El frontend prebuilt puede usar target production dentro del proyecto Staging; no significa publicar MateBreak producción.

Supabase conserva31 migraciones equivalentes por hash de tokens SQL. Pedidos3, pagos3, stock97/97 y sus huellas coinciden con publicación anterior. Se encontraron5 solicitudes/5 eventos: el responsable confirmó que creó una solicitud al probar Staging. Las cuatro solicitudes y eventos históricos conservan exactamente sus hashes; nueva solicitud número5 del4 de octubre06:36:41 UTC (03:36 local), asociada a cuenta. Baseline actualizado:5/5, sin reparación ni borrado.

CLI dry-run explícito a Staging enumera exclusivamente `20261004065346_wholesale_profile_details.sql`, sin seeds/roles; no aplica DDL. El callback mayorista exacto ya fue permitido por publicación anterior y no necesita ampliación. SMTP propio, MP real y Correo real siguen fuera del alcance; reconfirmar valores privados/proveedores y callbacks justo antes de publicación autorizada.

Tras una nueva autorización: reconfirmar baseline5/5 e identidades/configuración, push FF únicamente a codex/staging-preparation, esperar Security checks SUCCESS del HEAD exacto, backup fresco y ensayo, aplicar exclusivamente migración32, Render manual y prebuilt auditado Vercel Staging. Confirmar Live/Ready, hashes/rutas,31→32 migraciones y huellas intactas. No generar nuevos registros/compras/solicitudes/pagos/emails sin autorización independiente. Ante cambio inexplicado o fallo, detener sin repair/restauración automática.

La migración es aditiva y compatible con backend anterior, reduciendo ventana de incompatibilidad. El registro nuevo necesita esquema32 y backend actualizado; publicar frontend después de Render Live. CI remoto del candidato todavía no existe porque no se hizo push.
