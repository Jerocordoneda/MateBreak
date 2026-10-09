# Catálogo Staging: imágenes temporales

Staging sirve 610 originales verificados como WebP estáticos de hasta 1200 px,
deduplicados por SHA-256 del archivo resultante. Los 88 GIF animados utilizan su
primer fotograma original, decisión autorizada para esta etapa. Los originales
y las 929 asociaciones históricas se conservan intactos. No se crean buckets,
no se suben fotos a Supabase ni se cambia de plan.

`src/assets/catalog-staging/manifest.json` vincula cada ruta/hash original con
su asset web y registra tamaño, dimensiones y uso de fotograma. El lote ocupa
aproximadamente 31 MB. El artefacto completo debe auditarse antes de publicar y
permanecer debajo de 100 MB, con margen. Las imágenes de tarjetas/descripciones
y mayorista conservan el lazy loading existente.

El resolver compartido usa estas rutas solamente con `config.staging=true` y
`config.production!==true`. El resto conserva Supabase Storage. Las rutas
`catalogo_asset.storage_path` y hashes originales no se reescriben: para la
migración futura a Storage se cargarán los originales verificados en esas rutas
y se retirará este resolver temporal mediante un candidato revisado.

## Recuperación limitada

Se compara el catálogo actual de MateBreak2 con Staging y se excluyen timestamps,
stock, pedidos, pagos, reservas, movimientos, conciliación, auditorías, Auth,
mappings y componentes. El fixture había reutilizado producto 13/variante 2.
La secuencia autorizada restaura primero los otros 105 productos, verifica la
publicación y luego devuelve al 13 su identidad histórica; los snapshots de
artículos de pedidos no cambian.

`scripts/rehearse-staging-catalog-recovery.mjs` consume snapshots locales y el
delta actual, crea un PostgreSQL desechable con las 40 migraciones, comprueba
ambas etapas dos veces, rollback exacto y rechazo de cambios concurrentes. No
posee cliente Cloud. Emite DML con locks, guards por fila y hashes de las 62
tablas protegidas; cualquier divergencia aborta toda la transacción. El snapshot
de metadatos y su hash permiten recuperar únicamente las filas afectadas.

Los archivos de diagnóstico, baseline y SQL generado se guardan fuera del
artefacto público. El rollback sólo se ejecuta ante un fallo comprobado y con
un baseline reconfirmado; nunca restaura stock ni reemplaza la base.
