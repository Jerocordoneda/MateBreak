# Exposición de Supabase local en Windows

Comprobación 30/09/2026, Docker Desktop y Supabase CLI 2.118.0. Ningún cambio a firewall,
daemon global, Windows security, BIOS, particiones ni repositorio original.

| Puerto | Servicio | Docker HostIp efectivo | Windows listeners |
|---|---|---|---|
| 54321 | API gateway Kong (Auth/REST/Storage) | 0.0.0.0 y :: | :: y ::1 |
| 54322 | PostgreSQL | 0.0.0.0 y :: | :: y ::1 |
| 54323 | Studio | 0.0.0.0 y :: | :: y ::1 |
| 54324 | Mailpit | 0.0.0.0 y :: | :: y ::1 |

Se comprobó TCP desde Windows hacia su propia dirección Ethernet DHCP: los cuatro puertos
respondieron. Esto confirma que no están limitados a loopback. No se probó desde otra PC
y no se afirma que el firewall/router permitan acceso desde Internet o toda la LAN.
No se escanearon equipos ajenos. 54320 shadow no escuchaba; pooler/Realtime/Analytics/Edge
están deshabilitados en config local.

CLI --help no ofrece host bind para start; config expone puertos/URLs, no un bind general de
127.0.0.1. studio.api_url/API_URL/SUPABASE_URL solo cambian destino anunciado, no el listener.
Docker documenta defaults de binding por bridge y --publish explícito a loopback.
La prueba anterior con bridge privado + host_binding_ipv4=127.0.0.1 no cambió estos bindings
en Docker Desktop/CLI; no se repitió ese intento ni se adoptaron hacks de recrear contenedores
administrados por CLI. No hay solución limpia demostrada para este stack fijado sin cambiar
su mecanismo de despliegue/restricción. No se afirma aislamiento por URLs localhost.

Riesgo: existe solo con stack iniciado; DB/Studio/Mailpit y API de desarrollo pueden quedar
accesibles por interfaces no loopback según firewall/red. Claves locales no equivalen a
protección de red; no deben reutilizarse en otros ambientes.
Mitigación inmediata aplicada: usar únicamente fixtures, ventanas de tests cortas y stop al
final conservando volúmenes. Nunca dejarlo abierto en redes compartidas/no confiables.
Para aislamiento estricto futuro: entorno local aislado sin interfaz LAN, o despliegue soportado
que declare cada publicación 127.0.0.1:<puerto>:<interno> y verificarlo realmente en Windows.
Requiere planificación/revisión aparte; no alterar Docker global/firewall para ocultar el problema.
Antes de dejar desarrollo permanente activo, resolver ese aislamiento.
La suite detiene Supabase incluso si falla la limpieza posterior de Auth.

Fuentes: [config CLI](https://supabase.com/docs/guides/local-development/cli/config),
[binding Docker bridge](https://docs.docker.com/engine/network/drivers/bridge/).
