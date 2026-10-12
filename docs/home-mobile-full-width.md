# Home mobile: fondos a todo el ancho

Base `fa7eeb5`, rama `codex/frontend-recovery`.

La regla compartida mobile `main { padding-inline: 16px }` estrechaba también
los fondos blancos y el contenedor de la curva. A 390 px tenían x=16 y ancho=358,
dejando dos franjas oscuras de 16 px. El contenido tenía su propio padding.

La corrección se limita al home y a anchos hasta 760 px. Los fondos blancos y
la transición recuperan esos 32 px con ancho explícito y márgenes laterales de
-16 px. Sus wrappers de contenido incorporan el espacio compensado al padding
interno: textos, botones, imágenes y FAQ mantienen exactamente sus rectángulos
anteriores. No se añade ninguna regla para ocultar overflow. Se mantienen el
header, hero, mate, tarjetas, carrito, glow y lógica de contacto de la curva.

Archivos: `src/css/responsive.css`, prueba comparativa
`scripts/verify-home-mobile-width.mjs` y este informe.

Validación local: build completo y 342/342 pruebas PASS. Chrome compara
`fa7eeb5` contra el candidato en 320, 360, 375, 390, 414, 430, 768 y 1440 px:
fondos y transición desde x=0 hasta el extremo derecho; contenido, header,
hero y tarjetas en los mismos rectángulos; cero desbordes, glow intacto,
contacto correcto, búsqueda global y FAQ funcionando. Capturas externas al
commit: `outputs/mobile-width-staging/proof/` en el checkout original.

Publicación autorizada solo al proyecto Vercel `copplex/matebreak-staging`,
ID `prj_CrDsy4AToxUT27bCsEbuaDmAceJh`, dominio
https://matebreak-staging.vercel.app. Su entorno interno se llama `production`,
pero corresponde exclusivamente al proyecto separado de Staging. Se despliega
el checkout completo validado, sin editar configuraciones ni la rama del PR #4.
La configuración existente dirige API/Auth/health al Render staging confirmado.

Render responde HTTP 200 en `/healthz`. Backend, SQL e infraestructura son
idénticos a `595cc147`; no corresponde redesplegarlos por esta corrección CSS.
La inspección de subida Vercel confirma 823 entradas (~43 MB), con frontend,
assets y los tres scripts de build; sin archivos de backend, SQL, entornos ni
evidencia local. La publicación final y verificación del dominio se registran
fuera del commit en `outputs/mobile-width-staging/`.

No se realiza merge a main ni se modifica PR #4. El checkout original mantiene
su rama y los cambios locales anteriores.
