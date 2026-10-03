# Mi Cuenta: carga progresiva local

La identidad y el panel se muestran inmediatamente después de verificar /api/sesion. Perfil, pedidos, emails y direcciones cargan en paralelo y tienen estados independientes y reintentos por sección. El perfil no admite escrituras antes de cargarse. Sólo las lecturas tienen timeout; no se reintentan escrituras automáticamente.

Una revisión de sesión invalida las respuestas anteriores y aborta las lecturas. Logout y HTTP 401 vacían el panel privado. Se conservan getUser, roles y autorización del servidor; no hay cambios SQL, RLS ni permisos.

Medición aislada comparable: el diagnóstico anterior agregó aproximadamente 2533 ms de espera del panel cuando pedidos tardaba artificialmente 2400 ms. La nueva implementación muestra el panel al verificar la sesión, sin esperar pedidos. Las mediciones definitivas quedan en el informe local de Chrome; no representan latencia de Cloud. No elimina el tiempo real de getUser ni la reactivación de Render Free.

Regresión: tests/account-progressive.test.mjs y la suite completa. El ensayo Chrome integrado se encuentra en tests/guest-ux-browser.mjs, ejecutado sobre dist con API sintética, incluyendo logout con respuestas tardías, errores secundarios y expiración de sesión. Ninguna cuenta real ni compra se utiliza.
