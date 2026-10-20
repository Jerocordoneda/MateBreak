# Preparación de integraciones comerciales

Estado revisado el 4 de octubre de 2026. Staging conserva mocks; no se realizaron pagos, envíos ni mensajes reales. Una implementación con fixtures no demuestra homologación del proveedor.

| Integración | Disponible y validado localmente | Falta antes de operar comercialmente |
| --- | --- | --- |
| Mercado Pago Checkout Pro | Adaptador/preferencia, retorno informativo, pago obtenido desde API, firma webhook, comparación de importe/moneda/referencia, SQL transaccional, auditoría y replay; checkout invitado con reservas concurrentes. | Credenciales de cuenta y ambiente, secreto de webhook, URLs registradas, compradores/vendedores de prueba, homologación de rechazo/aprobación y eventos tardíos; validar collector/live_mode; refunds/contracargos y conciliación. |
| MiCorreo/Correo Argentino | Adaptador separado mock/real, credenciales solo backend, validación provincias/CP, embalajes y jobs persistidos; resultados inciertos van a revisión; allowReal falla cerrado. | Cuenta/contrato habilitado para API, customerId y credenciales del producto exacto, origen/servicio y acuerdo comercial, documentación vigente y homologación de cotización/alta/etiqueta/tracking. Credenciales de login humano no prueban acceso API. |
| Embalaje minorista | Perfiles y reglas de bultos/peso/dimensiones con pruebas; elegibilidad y tarifas desde servidor. | Medir físicamente cada combinación vendida, tara/protección, límites/servicios y tarifación homologada; revisión manual para perfiles faltantes. |
| Embalaje mayorista | Solicitud/MAY guarda cotización y datos comerciales; no reserva stock ni compra envío. | Definir packs reales de 10/50/100, dimensiones, fragilidad y proceso de cotización por varios bultos. No extrapolar caja minorista ni prometer tarifa definitiva al crear MAY. |
| Confirmaciones | Snapshot y outbox durable; plantilla escapada, capability privada y adaptador mock; WhatsApp MAY manual. | SMTP/Auth y adaptador API de correo real, webhooks de entrega/supresión, remitente/DNS y piloto autorizado. Ver plan de correo. |
| Tareas automáticas | Expiración de reservas en proceso cada 60 s; claims y estados retry/review en SQL; worker Staging explícitamente mock. | Worker/scheduler siempre disponible, alertas/backlog, conciliación y recuperación de claims; no depender del proceso Free suspendido. |

Podemos terminar sin secretos: ampliar estados de pago y pruebas de eventos tardíos, contratos fake de API, clasificación de errores, workers/alertas, política de privacidad, CSP, scripts de piloto y matriz de mediciones. Requieren decisión comercial: packs/pesos, contrato, proveedor, remitente, alcance de devoluciones y responsable operativo. Requieren secretos externos: accesos habilitados y homologación; no introducir claves de ejemplo como si fueran reales.

No reutilizar documentación de otro producto Correo como contrato de MiCorreo: el [PDF oficial PAQ.AR API v2](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiPaqAr-v2.pdf) describe PAQ.AR; cotejar producto y versión con el contrato actual. Las [FAQ oficiales MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/faqs) ayudan con el acceso humano, no certifican compatibilidad del adaptador.

Para Mercado Pago, cotejar la integración con [documentación Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/overview) y contrato vigente de notificaciones durante homologación. No afirmar un piloto real aprobado por las pruebas mock.

Orden propuesto: seguridad financiera/sesiones → workers/conciliación → correo Staging autorizado → MP sandbox autorizado → Correo homologación → mediciones de embalaje → piloto acotado de ambos canales → autorización comercial de producción. Cada etapa tiene evidencia, responsable y criterio de detención; ninguna se activó en esta iteración.
