# Provincias: catálogo autoritativo y contrato de checkout

server/shipping/provinces.mjs define 23 provincias y CABA, con nombres canónicos y los códigos MiCorreo existentes. Un Map evita acceso a propiedades heredadas. NFKD elimina tildes y normaliza mayúsculas y espacios Unicode consecutivos. CABA es un alias explícito; códigos sueltos o provincias desconocidas no se aceptan como destinatario.

/api/checkout/contexto publica el catálogo. El selector de destinatario utiliza nombres canónicos; el de sucursal utiliza los códigos del mismo catálogo. No se mantiene una segunda lista comercial en JavaScript. Si el catálogo no llega completo, el selector permanece deshabilitado.

Cotización, solicitud manual y confirmación pasan por validateRecipient. shippingSnapshot utiliza la misma normalización y conserva los códigos provinciales. No se modifica SQL, ninguna cotización histórica ni la comparación exacta de destinatarios de la base. Una cotización anterior con un nombre no canónico debe volver a cotizarse: no se autoriza silenciosamente un destinatario distinto.

Publicación futura: backend primero, luego frontend. El campo provinces es aditivo y compatible con el frontend anterior; el nuevo frontend necesita el nuevo catálogo. Pruebas unitarias de 24 destinos, Unicode y propiedades heredadas, contexto HTTP y argumentos de la transacción del checkout: tests/provinces.test.mjs. Chrome comprueba ambos selectores en 1440 y 360 px usando APIs sintéticas.
