# MiCorreo: arquitectura preparada, integración real desactivada

Revisión del 30/09/2026. SHIPPING_MODE=mock sigue siendo el valor por defecto.
En producción el arranque falla cerrado hasta elegir real explícitamente y configurar el ambiente
production; no se permite activar automáticamente por NODE_ENV. No se cambiaron .env ni métodos remotos.
Los tests usan fetch inyectado y datos ficticios, nunca credenciales/calls del proveedor real.

## Capas del adaptador

createCorreoArgentino(config, fetcher, runtime): una instancia por configuración/ambiente.
Config backend: environment, username/password API, customerId, originPostalCode, timeoutMs (1–30000).
runtime.now/sleep son puntos de inyección para pruebas, no entradas HTTP.
Auth: authReady y authenticate(); rating: ready/ratingReady y quote(); import: importReady y
importShipment(); agencias: agenciesReady/agencies(); diagnóstico: validateAccount().
No hay ruta pública de token ni de validación de cuenta.

POST /token usa Basic y cache en memoria con JWT exp UTC, margen de 30s y single-flight.
Si expires carece de zona horaria y el JWT no tiene exp utilizable, no se adivina zona ni se cachea.
La vigencia de tokens opacos requerirá confirmación del proveedor. Instancias no comparten cache.
GET agencies y POST rates son consultas: hasta dos retries adicionales para 429/5xx con backoff
100/200ms, y una renovación ante 401. Auth, validación de cuenta e importación no se repiten
automáticamente. Timeout explícito en todas las llamadas.

CORREO_MICORREO_USER/PASSWORD son credenciales API entregadas por Correo para el ambiente.
No sustituirlas por email/password normal. validateAccount recibe credenciales de cuenta efímeras,
devuelve solo customerId y no las retiene. No es parte del checkout ni un endpoint frontend.
Los hosts test/production son constantes del backend; nunca una URL arbitraria del navegador.

## Cotización y snapshot

quote({destinationPostalCode,deliveryType,dimensions:{weight,height,width,length}})
devuelve provider/service/name/deliveryType/carrierCost/validTo.
Precio: número finito >=0 o string decimal explícito; rechaza null/boolean/vacío/NaN/Infinity
y coerciones hex/exponenciales/espacios. Se conserva cero explícito; no se inventan tarifas.
Una respuesta sin rates/fecha válida no es utilizable; customerId retornado debe coincidir.
Datos parcelarios vienen de packaging.mjs, con las mismas reglas de embalaje estimadas anteriores.

quotePackages conserva costo/dimensiones de cada bulto, intersecta servicios y suma en centavos;
vencimiento mínimo entre bultos. Máximo 20. No mezcla distintos servicios.
El BFF guarda snapshot + fingerprint y la tarifa de backend, nunca montos/dimensiones del browser.
El snapshot V1 incluye cartItems canónicos, ambiente/cuenta, origen/remitente si están configurados,
recipient/address/agency, deliveryType y parcels[{dimensions,carrierCost}].
Config.correo.sender es opcional backend; por defecto la importación usa los datos de cuenta del
proveedor. Antes de activar real, confirmar remitente/origen de esa cuenta y suministrar snapshot
sender si hace falta. No obtener direcciones personales/productivas para estas pruebas.

mb_shipping_fingerprint hace SHA256 de JSONB canónico con carrito, snapshot completo y estado
actual de variantes/productos/cantidades/personalización/categorías, con orden explícito.
Además exige que cartItems proporcionados por el servidor coincidan con la DB: un cambio durante
cotización produce NULL y el BFF rechaza guardarla. Un cambio posterior invalida la cotización.
Checkout toma los mismos locks de la lifecycle validada, bloquea carrito y valida usuario,
carrito, destinatario, modalidad, vigencia y fingerprint. La operación/reserva permanece atómica.
La función anterior queda privada, SECURITY INVOKER y sin permisos browser.

pedido.cotizacion_envio_id conserva relación protegida. envio.snapshot añade quoteId/service/cost/
validTo/fingerprint y declaredValue por bulto. Cotización/snapshot/relación no son mutables.
Valor declarado: mercadería después del descuento, repartida en centavos iguales por bulto
con residuo determinístico; total reconciliado. Es política de aplicación, pendiente de aprobación
comercial/aseguramiento antes de real. No viene del browser ni incluye el costo de transporte.
No se recalcula embalaje días después. Cotizaciones viejas sin snapshot requieren recotizar.
Pedidos previos sin snapshot quedan no_preparado; no se inventa un envío para ellos.

## Importación y recuperación

importShipment({extOrderId,orderNumber,sender,recipient,shipping}) recibe únicamente datos de backend.
El job construye el payload desde el snapshot persistido. /rates conserva deliveredType;
la importación conserva shipping.deliveryType. No se agrega productType a un contrato que no lo pide.
createdAt es el único dato de éxito retenido: no hay tracking, etiquetas o URLs inventadas.

private.envio_bulto: PK pedido/bulto, extOrderId único, estado, intento, claim/fecha y próximo intento.
private.envio_importacion_intento: un registro por claim, fechas, resultado, tipo/status/requestId
sanitizados. Sin body crudo/JWT/Basic/credenciales. Tablas con RLS y acceso backend exclusivo.
Referencia estable MB-<UUID pedido>-<número bulto>; misma en todos los retries.
Formato elegido conservador (<=80); confirmar límites de longitud oficiales antes de real.

Un trigger de pedido pagado prepara envio.estado_integracion=pendiente, tanto para transferencia
confirmada como para Mercado Pago verificado. Claims solo toman pedidos pagados, del ambiente
correspondiente, usando FOR UPDATE SKIP LOCKED. Un pedido tiene varios trabajos por bulto.
El job runShipmentJob usa mock por defecto y rechaza proveedores reales sin opt-in.
**No está programado en server/index ni conectado a importaciones reales automáticamente.**
Un rollout real requiere revisión, credenciales API, scheduling explícito y cuenta validada.

Solo 429 explícito tiene retry diferido, máximo tres intentos, misma referencia.
Timeout/5xx/JSON malformado/duplicado quedan revision, nunca nuevo extOrderId.
Un claim abandonado >2min se marca revision y se audita; no se reclama automáticamente.
Si falta registrar un resultado tras llamar al proveedor, hay que conciliar el claim.
Fallo logístico no toca pedido/pago/stock; envio.estado_integracion es independiente.
Un bulto importado no se vuelve a reclamar. Estados: esperando_pago/pendiente/importado/error/
revision/no_preparado; public.envio.estado comercial permanece separado.

Recuperación manual: comprobar por extOrderId en MiCorreo si el envío existe y sus datos.
Si está confirmado, registrar conciliación auditada del bulto; si se confirmó que no existe,
habilitar retry de ese mismo bulto y referencia. No considerar el texto de duplicado prueba
suficiente de entrega ni llamar automáticamente otra vez tras timeout.
No hay herramienta de conciliación con tracking ni UI operativa automática en esta iteración:
la API documentada no garantiza búsqueda/etiquetas/tracking; es procedimiento administrativo
pendiente del acceso a MiCorreo. Mantener worker real apagado hasta definirlo/probarlo.

## Sucursales

agencies(provinceCode) acepta códigos oficiales y filtra ACTIVE + pickupAvailability, misma
provincia y CP no vacío. Consulta services=pickup_availability.
BFF revalida selección, conserva code/provinceCode/postalCode y cotiza el CP de sucursal.
El frontend tiene provincia -> agencias -> selección -> nueva validación backend; está oculto/
deshabilitado (pickupEnabled=false) también en producción. Nunca acepta solo un code sin validar.

## Errores y verificación

MiCorreoError retiene provider/endpoint/status/requestId/type sin body o secret.
HTTP devuelve mensaje genérico 503; log interno solo esos campos y requestId de aplicación.
No se imprimen JWT ni credenciales. Tests comprueban también secretos ausentes de HTTP/logs.

53 tests nuevos: auth/hosts/cache/expiry/20 simultáneos, precios inválidos, respuestas/errores/
timeout/retries, límites, agencias activas/CP, payloads D/S, import ambiguo/duplicado, diagnóstico,
jobs financieros, seguridad HTTP/log y servicios múltiples.
Además SQL local verifica variantes/cantidades/bultos, ownership/vigencia, inmutabilidad, relación,
multi-bulto, paid-only claims, asignación de valor y aislamiento financiero.
Auth local verifica los 3 nuevos RPC cerrados a anon/A/B; un job mock real local prueba dos
claims simultáneos, una importación y ningún reenvío de un bulto completado.

Limitaciones pendientes antes de real: credenciales API test/prod, validación de cuenta/origen,
dimensiones estimadas medidas, declaredValue aprobado, largo de referencias, servicio importado
compatible con el cotizado y conciliación administrativa de ambigüedades.
[Contrato oficial](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiMiCorreo.pdf).
