# Flujos principales

Los proveedores reales dibujados representan el contrato diseñado, pendiente de validación oficial. Los tests de esta iteración se ejecutan con mocks y Supabase local.

## Arquitectura

```mermaid
flowchart LR
  H[HTML y CSS] --> F[Features JS]
  F --> E[Express / createApp]
  E --> A[Auth y cookies]
  E --> M[Módulos comerciales]
  M --> DB[(Supabase PostgreSQL)]
  M --> P[Pagos / shipping]
  P --> X[Adaptadores mock o real]
  J[Jobs backend] --> DB
  J --> X
```

## Usuario, frontend, backend y Supabase

```mermaid
sequenceDiagram
  participant U as Usuario
  participant F as Frontend
  participant B as Express
  participant A as Supabase Auth
  participant D as PostgreSQL
  U->>F: Navegar / elegir variante
  F->>B: fetch /api con cookies
  B->>A: getUser
  A-->>B: Identidad verificada
  B->>D: Consulta o RPC autorizada
  D-->>B: Datos allowlist
  B-->>F: JSON
  F-->>U: Renderizar
```

## Carrito, checkout y pedido

```mermaid
flowchart LR
  C[Carrito / variante] --> CT[Contexto checkout]
  CT --> D[Destinatario y entrega]
  D --> Q[Cotizar embalaje aprobado]
  Q --> P[Elegir pago]
  P --> I[Idempotencia]
  I --> RPC[mb_checkout_minorista]
  RPC --> O[Pedido y reservas]
  O --> R[Resultado consultado por propietario]
  Q -. sin perfil físico .-> M[Solicitud manual / conservar carrito]
```

En mock normal, `createMockCheckoutStore` sustituye la rama RPC/persistencia; no hay reserva real. La persistencia mock local sí usa esa rama SQL.

## Reserva de stock

```mermaid
flowchart TD
  V[Variantes y cantidades] --> K[Resolver SKUs físicos y cajas]
  K --> L[Transacción / locks]
  L --> S{Stock disponible}
  S -->|Sí| R[Reserva por SKU + pedido]
  S -->|No| E[Error sin reserva parcial]
  R --> P{Estado de pago}
  P -->|Aprobado| C[Confirmar transición]
  P -->|Cancelado o vencido| F[Liberar reserva]
  P -->|Pendiente| T[Esperar / mb_expirar_reservas]
```

## Pago aprobado o rechazado

```mermaid
flowchart TD
  W[Webhook] --> SIG[Verificar firma]
  SIG --> API[Consultar pago autenticado]
  API --> VALID[Validar dueño, importe y moneda]
  VALID --> STATE{Estado externo}
  STATE -->|Approved| CONF[mb_confirmar_pago idempotente]
  STATE -->|Rejected / cancelled| CANCEL[Cancelar y liberar reserva]
  STATE -->|Pending| KEEP[Mantener pendiente hasta expiry]
  CONF --> CLAIM[Pedido pagado elegible para job]
```

Los tests mock llaman su camino de simulación; no forjan un webhook de proveedor real. Transferencias pasan por `transferAdminRoutes` y `mb_confirmar_transferencia`, con autorización de administrador.

## Cotización, snapshot e importación MiCorreo

```mermaid
flowchart LR
  A[Perfiles aprobados] --> RATE[Tarifa por bulto]
  RATE --> SNAP[shippingSnapshot + fingerprint]
  SNAP --> QUOTE[Cotización con expiry]
  QUOTE --> ORDER[Pedido conserva snapshot]
  ORDER --> PAID[Pago confirmado]
  PAID --> JOB[Claim transaccional por bulto]
  JOB --> IMP[importShipment / external ID estable]
  IMP --> OK[Guardar importación]
  IMP -. resultado ambiguo .-> REV[Revisión manual]
```

## Administración

```mermaid
flowchart LR
  UI[Cuenta / pantallas internas] --> AUTH[getUser]
  AUTH --> ROLE[Rol o permiso DB]
  ROLE --> API[Rutas account / inventory / logistics]
  API --> CHECK[Validar actor, target e idempotencia]
  CHECK --> RPC[RPC comercial o recuperación]
  RPC --> AUDIT[Estado y auditoría]
  AUDIT --> UI
```

## Migraciones locales

```mermaid
flowchart LR
  GUARD[Validar localhost y propiedad del contenedor] --> START[supabase:start]
  START --> PLATFORM[Bootstrap plataforma local]
  PLATFORM --> MIG[26 migraciones históricas sin editar]
  MIG --> TEST[SQL / Auth / Storage / concurrencia]
  TEST --> RESET[Reset local de fixtures]
  RESET --> STOP[supabase:stop]
  START --> REH[Rehearsal adopción / fallo / convergencia]
  REH --> STOP
```

Los scripts locales no admiten targets remotos ni credenciales heredadas. No hay flecha de este flujo a producción.
