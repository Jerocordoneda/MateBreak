# Catálogo público histórico

`20260928-public-store.json` conserva 106 publicaciones / 217 variantes extraídas
de las páginas públicas de https://matebreak.com.ar el 28 de septiembre de 2026.
La fuente es el archivo offline `.catalog-import/products.json` creado por el
extractor del repositorio, no una consulta ni un export de la base Supabase.
Los metadatos de 929 referencias a imágenes se recuperaron de su caché local;
se comprobó el SHA256 y tamaño de cada binario antes de incorporarlos.
No se incluyen binarios, credenciales ni filas de clientes/pedidos/pagos.
El snapshot no contiene patrones de direcciones de correo electrónico.

## Separación de responsabilidades

- Migraciones: estructura, invariantes y reconciliaciones históricas.
- Este archivo: datos comerciales congelados necesarios para reproducir esa historia.
- Fixtures de tests: usuarios, pedidos y stock ficticios, separados del catálogo.
- Producción: ninguna fila recuperada de Supabase.

`node scripts/build-historical-catalog.mjs` genera la migración puente
`20260928162850_restore_historical_public_catalog.sql`; `--check` comprueba que
la versión SQL corresponde exactamente al JSON. El generador no consulta redes
ni bases de datos. Usa el importador SQL histórico ya versionado.

El puente se ubica después de la definición de `mb_importar_catalogo` y antes
del primer mapping de variantes. Un seed normal no resuelve esta dependencia:
Supabase lo ejecuta **después** de todas las migraciones.
No editar este snapshot al actualizar la tienda: nuevas versiones del catálogo
deben tener archivos/versiones e importación explícita separados.

Los paths de Storage son metadatos históricos: el replay no sube imágenes y por
eso no demuestra que una imagen del catálogo exista en Storage local. Los tests
de Storage deben subir objetos ficticios propios.

Los stocks publicados en la tienda son `stock_origen` comercial, no existencias
físicas actuales. Las cantidades de inventario operativo inicial provienen de
la migración existente `20260908093541_inventory_admin.sql`, sin export remoto.
