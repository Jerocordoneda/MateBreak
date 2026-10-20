# Embalaje minorista dinámico

`server/shipping/packaging.mjs` mantiene el contrato `planPackages(items, products, verifiedProfiles, approvedRetailProfiles)`: devuelve dimensiones o `null`. `packagingDecision` agrega un estado explicativo (`automatic`, `manual`, `invalid`, `empty`). `server/checkout/packaging-service.mjs` obtiene las categorías desde PostgreSQL; nunca confía en dimensiones enviadas por el navegador.

El algoritmo suma las cantidades por tipo, independientemente del orden o partición de líneas. No recorre una lista fija de cinco pedidos permitidos. Busca coincidencias exactas con perfiles físicamente aprobados: primero un bulto, luego dos; dentro del mismo número de bultos elige menor volumen exterior. No deduce capacidad por volumen ni produce una caja por cada dos sets en un bucle.

Los perfiles existentes siguen siendo los únicos incorporados: un mate 17×17×17 cm/550 g; dos mates en cajas unidas 34×17×17 cm/1100 g; un set 30×30×20 cm/1300 g; dos sets en la misma huella/2600 g. Son estimaciones operativas brutas heredadas, incluyendo embalaje, no masas de productos medidas individualmente. No se añade margen ni se cambia su peso para obtener una tarifa menor. Antes del uso real hay que medirlos/pesarlos y confirmar las composiciones comerciales que cubren; la clasificación por categoría conserva la regla de la RC.

| Pedido | Perfiles incorporados |
| --- | --- |
| 1/2 mates o 1/2 sets | Un bulto |
| 3/4 sets o 3/4 mates | Dos bultos |
| 1 set + 1 mate, 2 sets + 2 mates | Dos bultos |
| 6, 7, 10 sets; 4 sets + 3 mates; 6 sets + 7 mates | Cotización manual; no se inventan medidas |

`CORREO_APPROVED_RETAIL_PROFILES_JSON` admite una lista de `{mates, sets, dimensions:{length,width,height,weight}}` aprobados por operación. Cada registro describe **exactamente** el contenido de un bulto y su peso bruto real estimado, no una capacidad máxima. Permite combinaciones grandes o mixtas sin tocar el algoritmo. El responsable debe validar ajuste físico, protección y peso de productos más caja/relleno antes de configurarlo. Los perfiles de seis sets en los tests son fixtures sintéticos, no aprobaciones de almacén; no se incluyen en el entorno de ejecución.

`CORREO_VERIFIED_PARCELS_JSON` conserva perfiles por producto para una unidad de artículos no clasificados. No se extrapolan a múltiples unidades ni mezclas.

`quotePackages` pide al transportista una cotización por bulto y suma únicamente servicios comunes y tarifas vigentes. El costo no se calcula con una fórmula inventada. La selección física minimiza bultos/volumen; el precio real depende del servicio, destino y contrato. No hay prueba de que menor volumen siempre implique menor costo; comparar configuraciones de distinto volumen contra tarifas reales queda para la validación oficial. El snapshot conserva dimensiones y costo por bulto para el job existente.

## Continuación manual

El contexto del checkout expone `manualQuoteAvailable`. Para una combinación sin embalaje automático, la cotización devuelve HTTP 202 con `manual_quote_required`, no un rechazo genérico. El frontend ofrece descargar una solicitud con las líneas/subtotal recalculados por el servidor y los datos de entrega ingresados. La persona la comparte por el canal habitual de atención y acuerda el presupuesto antes de pagar. El retiro sigue disponible si está habilitado por la configuración existente.

La descarga no envía mensajes, no crea una cola interna, no confirma un pedido, no cobra ni reserva stock. El carrito permanece. La edición y aprobación persistente del presupuesto dentro de la tienda es un desarrollo posterior; no se presenta como implementada. El documento descargado contiene datos personales y la UI lo informa.

## Referencias de transportista independientes

[FAQ oficial MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/faqs), consultada el 2026-10-01: admisión hasta 50 kg, suma de lados 300 cm, ningún lado superior a 200 cm. Los umbrales de voluminosos publicados (30 kg, lado 120 cm, suma 200 cm) no son esos máximos absolutos. Los precios usan el mayor entre peso real y volumétrico.

`server/shipping/carrier-limits.mjs` guarda esa referencia separada de las cajas MateBreak. El plan también pasa por `dimensions` del adaptador, cuyos límites conservadores heredados son 25 kg y 150 cm por lado. No se amplía el contrato API sin verificar su documentación/servicio real. Un perfil que incumpla cualquiera de ambas validaciones deriva a revisión manual. Las reglas de admisión públicas no demuestran compatibilidad de un payload concreto con `/rates`.

## Extensión mayorista futura

La planificación minorista limita su búsqueda a dos bultos; el transporte/snapshot/job sigue manejando colecciones de paquetes (límite técnico heredado 20). Un futuro editor mayorista podrá producir una lista validada de dimensiones/peso por paquete y tipos de caja, con aprobación y auditoría. No debe heredar el máximo operativo minorista. No se implementaron editor, presupuesto persistente, reglas de crédito ni circuito mayorista.
