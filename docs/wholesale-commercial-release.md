# Compra Mayorista: publicación comercial en Staging

Autorización del usuario el 3 de octubre de 2026, sobre `d650e66`: implementar y publicar exclusivamente Staging. Producción, main y PR #2 quedan fuera del alcance.

Los accesos de Inicio, navegación y Confianza Empresarial convergen en `/mayorista`. La ruta histórica de Regalos Empresariales redirige a la misma pantalla. El botón interno Realizar pedido mayorista ancla al catálogo.

El pedido combina los 11 productos aprobados. Todos cuentan una unidad, incluidos bombilla y yerbero; cada set cuenta una unidad, sin sumar componentes. Mínimo 10. Tramos calculados por unidades combinadas: 10–49, 50–99 y 100+. Precios aprobados en `deploy/staging/wholesale-commercial.sql`; bombilla base $5.000 según aclaración del usuario, $4.500 desde 50 y $3.900 desde 100. Grabado y packaging de regalo incluidos; packaging con logo bonificado desde 100. No se cobra seña automáticamente; producción luego de coordinación, presupuesto, diseño y acreditación de la seña correspondiente.

Staging sólo publica un producto minorista sintético. Algunos artículos comerciales carecen de variante equivalente; no se habilita el catálogo minorista histórico para vender mayorista. Se agrega una oferta comercial privada con ID separado, referencia opcional a variante minorista y sus tres precios. Estas solicitudes no descuentan inventario ni generan pedidos/pagos. La venta definitiva debe mapearse al flujo existente al coordinar manualmente. No se inventa una equivalencia Premium/Básico: son ofertas separadas. No se crean vendedores, referencias ni comisiones.

WhatsApp argentino móvil configurado como `5492266488213`. Se prepara mensaje desde la cotización persistida; las pruebas interceptan la apertura y no envían mensajes.

Imagen `preciomayorista.jpeg`: nueve recortes de las zonas fotográficas sin encabezados ni precios. Cuatro mates, termo, quencher, vaso térmico, set y yerbero. El set comparte foto ilustrativa, con aviso de cuchillo según variante. La bombilla no aparece en la imagen: foto pendiente explícita, oferta habilitada. Imágenes servidas desde `/src/assets/wholesale`; precios renderizados exclusivamente desde configuración del servidor.

Migraciones pendientes: `20261003202124_wholesale_requests.sql` y `20261003221931_wholesale_volume_catalog.sql`. Las 28 anteriores conservan hashes físicos y tokens. La segunda agrega tabla privada RLS sin acceso de cliente, vista invoker y cotización por volumen; no altera tablas/funciones minoristas. Configuración comercial separada y transaccional, sin clientes de prueba ni efectos sobre catálogo/inventario minorista.

Validación local: Node 22.23.3; 226/226 pruebas Node; rehearsal SQL completo, 66 límites para 11 productos, accesorios combinados, precio autoritativo, replay y ACL; Chrome 1440/360 catálogo/formulario/solicitud/WhatsApp sin desbordamiento; 23 casos Guest Checkout, provincias, Mi Cuenta y animación aprobada. Catálogo histórico 106/217 intacto; audit sin vulnerabilidades. Evidencias fuera de Git en `.codex/staging-preflight/wholesale-commercial-final`.

Preflight remoto: Supabase `rxccjczyywhewqqdfgxm`, 28 migraciones, 3 pedidos/3 pagos y stock 97/97. Render `srv-davbsjad0e5s73fcoc30`, rama `codex/staging-preparation`, Auto-Deploy OFF, Node 22.23.3, APP_ENV staging, mock persistente aprobado, origen y Supabase Staging comprobados, sin SMTP ni grupos heredados. Vercel proyecto `prj_CrDsy4AToxUT27bCsEbuaDmAceJh`, equipo `team_lIiIUZEuCy5NAdctFIrl8mt8`, Git link null; build/prebuilt Node 22 explícito y configuración estricta del repositorio. El setting Node del dashboard sigue 24.x: engines 22.x y prebuilt fijan el runtime de construcción, sin ejecución Node frontend.

Secuencia autorizada: push fast-forward del HEAD a staging sin mover el checkout original con pendientes; CI verde; baseline y respaldo; plan/aplicación de las dos migraciones; SQL comercial y WhatsApp; deployment manual Render; snapshot exacto/prebuilt auditado y deployment manual del proyecto Vercel Staging; pruebas Cloud y auditoría final. Resultado final e IDs en el informe de evidencias externo.
