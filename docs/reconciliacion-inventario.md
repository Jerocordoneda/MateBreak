# Reconciliación de inventario — 28/09/2026

Se analizaron las 176 variantes que estaban pendientes en `main` (`1a00b71`) con las fichas existentes de Supabase, sus categorías, opciones, descripciones y 107 evidencias de `catalogo_componente`. No se volvió a scrapear. Las 107 evidencias pertenecen a los 56 combos y ninguna tenía un `producto_simple_id` confirmado.

## Resultado aplicado

Se aprobó una regla común para seis variantes de camionero personalizado: la ficha dice expresamente *camionero de algarrobo*, la opción de bombilla es `NO`, y el insumo físico existente es `MB-CAM-ALG` (mate camionero de algarrobo liso). El grabado es personalización y no otro SKU. Son `CAMIONERO "CAMINO QATAR"`, `CAMIONERO DE INDEPENDIENTE`, `CAMIONERO DEL CICLÓN`, `CAMIONERO DEL MILLONARIO`, `CAMIONERO DEL XENEIZE` y `MI MATE CAMIONERO - CREÁ TU DISEÑO ACÁ`. La migración aplica la regla sólo si encuentra exactamente seis coincidencias. Cada variante consume una unidad de `MB-CAM-ALG`.

| Estado | Variantes | Productos |
| --- | ---: | ---: |
| Comprables antes | 41 | 22 |
| Nuevas inequívocas, tipo A | 6 | 6 |
| Comprables ahora | 47 | 28 |
| Pendientes probables, tipo B | 58 | — |
| Pendientes sin SKU de bombilla, tipo C | 112 | — |
| Combos con composición completa | 0 de 56 | 0 |

El archivo [`reconciliacion-variantes.csv`](reconciliacion-variantes.csv) registra **cada una de las 170 variantes aún pendientes** con ID, producto, opciones, categorías, clasificación, SKU sugerido, motivo y componentes faltantes. Puede regenerarse con `npm run catalog:reconcile`; el script consulta catálogo e inventario actuales y sólo escribe el reporte, nunca aprueba mappings.

## Grupos para decidir una sola regla por familia

| Grupo | Variantes | SKU físico probable | Evidencia y dato pendiente |
| --- | ---: | --- | --- |
| Bombilla vendida sola | 1 | Falta SKU | Ficha: bombilla de acero pico de loro. Ningún SKU de bombilla existe. |
| Bombilla opcional `SI` | 49 | Mate base conocido en varios casos + bombilla sin SKU | El `SI` agrega una pieza física. Confirmar si es la misma bombilla de acero/pico de loro y crear su SKU con stock real. |
| Set matero o premium | 62 | Mate imperial por modelo; termo negro/plateado probable; bombilla sin SKU | Los 31 productos combinan un mate elegido y termo media manija con bombilla. Los 12 sets premium añaden tabla y cuchillo. La falta de bombilla bloquea todas estas variantes; además hay que confirmar el termo exacto y, en premium, tabla y cuchillo. |
| Imperial negro / imperial cuero negro | 2 | `MB-IMP-CAL?` | Ficha: calabaza, alpaca y cuero negro. El SKU base sólo dice mate imperial de calabaza; no confirma ese acabado. |
| Matera negra ecocuero | 1 | `MB-MATERA?` | El SKU físico no especifica color ni material. |
| Set deluxe y parrillero | 37 | `MB-TABLA?` + `MB-CUC-INOX?`; deluxe también `MB-IMP-CAL`/`MB-IMP-ALG` | Las fichas especifican tabla 20×30 y cuchillo premium grabado; los SKU existentes son genéricos. `MB-TABLA` está marcado `a_pedido` y tiene stock 0, por lo que no puede reservarse con la semántica vigente aunque se confirme la equivalencia. |
| Termos individuales | 18 | `MB-TER-NEG?` / `MB-TER-PLA?` | Las fichas indican termo de 1 L y/o media manija grabable; los SKU físicos sólo indican color, sin capacidad ni modelo. |

Los 56 combos se revisaron: 12 deluxe, 19 materos, 13 parrilleros y 12 premium. Cada grupo está representado por todas sus variantes en el CSV. Ninguno se aprobó parcialmente: una compra sólo puede reservar un combo cuando *todos* los componentes sean inequívocos y stockables. Los mates de los combos sí se distinguen por la opción `MODELO DE MATE`, pero eso no resuelve el termo, la bombilla, la tabla o el cuchillo.

## Decisiones comerciales agrupadas

1. **Bombilla (112 variantes afectadas):** indicar si la bombilla de acero pico de loro vendida sola, las opciones `SI` y las incluidas en los sets consumen un mismo modelo físico. Crear el SKU real correspondiente con su stock; si son modelos distintos, indicar cuáles son.
2. **Termos (18 individuales y 62 variantes de sets):** confirmar si `MB-TER-NEG` y `MB-TER-PLA` son los termos de 1 L media manija aptos para grabado, y cuál se usa cuando la ficha no fija color. Si son distintos, hacen falta SKU físicos específicos.
3. **Tabla y cuchillo (37 variantes deluxe/parrilleras; 24 premium adicionales):** confirmar si `MB-TABLA` corresponde a la tabla 20×30 y `MB-CUC-INOX` al cuchillo premium grabable. Definir stock real de la tabla o una operación para pedidos a fabricar antes de permitir reservas.
4. **Bases particulares (3 variantes):** confirmar si `MB-IMP-CAL` incluye los acabados de alpaca/cuero negro de dos imperiales y si `MB-MATERA` es la matera negra de ecocuero.

El siguiente paso comercial sigue siendo resolver estas identidades y existencias. Esta reconciliación no activa Mercado Pago ni cambia el checkout, los locks, las reservas, la idempotencia o RLS.
