# Prompt para el agente de frontend — Ocultar módulos, campos, filtros y configuración según los features contratados por el tenant

Copia y pega este prompt completo al agente de frontend. Es una feature transversal (toca menú,
rutas, formularios y pantallas de varios módulos a la vez) — léela completa antes de empezar, no
la trates como una lista de checkboxes independientes.

Antes de implementar, abre `openapi.json` y confirma ahí los tipos exactos de cada
campo/endpoint mencionado — lo que sigue es la explicación funcional completa del comportamiento.
El backend ya está implementado y desplegado (Fases 2 a 5 y 7 de
`docs/plans/PLAN_FEATURES_TENANT.md`, ver también `docs/plans/PROMPT_COMPLETAR_FEATURES_TENANT.md`
si querés el detalle de cómo se construyó) — acá no hay nada que negociar con backend salvo lo que
se marca explícitamente como *pendiente/decisión de UI*.

---

## 1. Qué problema resuelve esto

GenSuite Control (el panel de administración de planes, otro sistema) enciende o apaga **módulos**
para cada tenant según lo que tiene contratado — Compras, Inventario, Tesorería, Relaciones
Comerciales B2B, reportes puntuales, etc. Hoy el frontend no sabe nada de esto: muestra **todos**
los módulos a **todos** los tenants, y si un tenant sin, por ejemplo, `inventario` contratado hace
clic ahí, se entera con un 403 a mitad de camino.

El objetivo es que la UI refleje lo que el tenant tiene contratado **antes** de que alguien haga
clic — igual que ya hacés con permisos (ver `docs/frontend/PROMPT_PERMISOS_FRONTEND.md`, si ese
prompt ya está implementado en tu repo) y con `tenant.vertical` (farmacia vs general).

**Importante, mismo principio que con permisos:** ocultar un módulo en el frontend **no es
seguridad**, es UX. La aplicación real ya la hace `FeatureGuard` en cada request — si la UI se
equivoca y deja ver un botón de más, el servidor devuelve 403 y no pasa nada grave; si oculta uno
de más, el usuario se queja de que "no encuentra" algo que sí tiene contratado. Preferí la
exactitud, pero no dupliques lógica de negocio en el cliente más allá de leer estos booleanos.

**Este frontend nunca enciende ni apaga features.** Eso lo hace GenSuite Control, escribiendo
directo en Postgres — acá solo **leés** `GET /me/features` y decidís qué mostrar. No construyas
ninguna pantalla de "activar módulo X" en este repo.

---

## 2. Modelo mental: features (qué tiene contratado) vs permisos (qué puede hacer)

Son dos capas **independientes**, las dos hace falta:

| Capa | Responde a | Endpoint | Granularidad |
|---|---|---|---|
| **Features** (este documento) | ¿Este **tenant** contrató este módulo? | `GET /me/features` | Por módulo/reporte (20 módulos + 15 reportes) |
| **Permisos** (ya implementado, ver su propio prompt) | ¿Este **usuario** puede hacer esta acción? | `GET /me/permissions` | Por acción (368 acciones) |

**Un ítem de menú se muestra solo si las DOS son verdaderas**: el feature está encendido para el
tenant **Y** el usuario tiene permiso sobre al menos una acción de ese módulo. Ninguna de las dos
capas reemplaza a la otra — un tenant puede tener Compras contratado y aun así un usuario sin rol
de Compras no debe verlo; un usuario con rol de Compras en un tenant que no contrató ese módulo
tampoco debe verlo.

Mismo patrón que ya usás para `tenant.vertical` (farmacia vs general) — esto es una tercera capa
del mismo tipo: un dato del tenant, resuelto una vez al iniciar sesión, que decide qué mostrar.

---

## 3. Contrato — `GET /me/features`

```
GET /api/v1/me/features
Authorization: Bearer <jwt>
X-Tenant: <slug>
```

```json
{
  "success": true,
  "data": {
    "features": {
      "compras": true,
      "comprasOrdenes": true,
      "comprasSolicitudes": false,
      "devolucionesCompras": true,
      "gastos": true,
      "proveedores": true,
      "caja": false,
      "contabilidad": false,
      "cuentasPorCobrar": true,
      "cuentasPorPagar": true,
      "tesoreria": false,
      "inventario": true,
      "servicios": false,
      "relacionesComerciales": false,
      "cotizaciones": false,
      "despacho": true,
      "devoluciones": true,
      "notasCredito": true,
      "notasDebito": true,
      "pedidos": true
    },
    "reportesHabilitados": ["ventas_por_periodo", "compras_por_periodo", "stock_valorizado"],
    "limites": {
      "maxUsuarios": 10,
      "maxSucursales": null,
      "usuariosActuales": 4,
      "sucursalesActuales": 2
    }
  }
}
```

Pedilo **una sola vez al iniciar sesión** (o al cambiar de tenant, si tu app permite eso sin
recargar), guardalo en el mismo store donde ya tenés `permissions`/`vertical`. No lo vuelvas a
pedir por cada pantalla.

**Garantías del backend que podés asumir sin validar vos:**
- `features` **siempre** trae las **20** claves de `type='modulo'` (tabla §4.1 — 19 reales +
  `servicios`, reservada, siempre `false`), como booleano — nunca falta una clave ni viene
  `null`/`undefined`. Podés hacer `features.features['inventario']` directo, sin `?? false`.
  Corrección (2026-09-23): una versión anterior de este documento decía "19 claves", contando
  solo las implementadas — el shape real trae 20, `servicios` incluida. Ver
  `MeFeaturesResponseDto` (`src/modules/me/dto/me-features-response.dto.ts`) y el schema real en
  `GET /api/docs-json`, agregado en esta misma revisión (antes solo había prosa, sin JSON Schema).
- `reportesHabilitados` es un array de las claves de reporte que SÍ están encendidas (§4) — un
  reporte ausente ahí está apagado, no hay booleano por reporte.
- `limites.maxUsuarios`/`maxSucursales`: `null` = sin límite (plan ilimitado o tenant legado).
  `usuariosActuales`/`sucursalesActuales` ya vienen calculados — no los recalcules contando otra
  lista que ya tengas cargada, pueden desincronizarse (paginación, filtros, etc.).

---

## 4. El catálogo real — usá esta tabla, no inventes claves

**Corrección (2026-09-23), tras la auditoría de las 4 divergencias que reportaron:** la columna
`rutas` de `public.features` que esta tabla mostraba en la versión anterior **no es el prefijo
HTTP real** — es la carpeta bajo `src/modules/` que usa `feature-coverage.spec.ts` (un trinquete
interno de este repo) para saber si un controller declaró `@RequiereFeature`. Coincide con el
prefijo HTTP la mayoría de las veces, pero no siempre (ej. la carpeta es `proveedores`, el HTTP
real es `/suppliers`). **Esta tabla ahora muestra el prefijo `@Controller(...)` real**, verificado
línea por línea contra el código — es la que necesitás para tu propio mapeo (`catalog.ts` o como
lo hayas llamado). Si tu mapeo actual ya funciona con tests E2E en verde, no lo reescribas entero
por esto — usá esta tabla solo para los casos puntuales corregidos abajo (§4.1, filas marcadas) y
como referencia de aquí en más.

### 4.1 Módulos (`features.<key>` — booleano)

| `key` | Categoría | Nombre | Prefijo(s) HTTP real que gatea (`@Controller`) | Depende de |
|---|---|---|---|---|
| `compras` | Compras | Compras | `/compras`, `/compras/costos-importacion`, `/compras/purchase-receipt` | — |
| `comprasOrdenes` | Compras | Órdenes de compra | `/compras/ordenes` | `compras` |
| `comprasSolicitudes` | Compras | Solicitudes de compra | `/compras/solicitudes` | `compras` |
| `devolucionesCompras` | Compras | Devoluciones de compras | `/devoluciones-compras` | `compras` |
| `gastos` | Compras | Gastos | `/gastos` | — |
| `proveedores` | Compras | Proveedores | `/suppliers` **(no `/proveedores` — corregido)** | — |
| `caja` | Finanzas | Caja / POS | `/caja`, `/pos`, `/pos/cajas` | — |
| `contabilidad` | Finanzas | Contabilidad | `/journal-entry`, `/centros-costo`, `/departamentos`, `/contabilidad/cierre-periodo`, **`/cuentas`** (Plan de Cuentas — corregido, ver §17.2 de `PLAN_FEATURES_TENANT.md`) | — |
| `cuentasPorCobrar` | Finanzas | Cuentas por cobrar | `/cobros` | — |
| `cuentasPorPagar` | Finanzas | Cuentas por pagar | `/pagos`, `/catalog/cuentas-por-pagar` **(nuevo gate agregado — antes sin feature)** | — |
| `tesoreria` | Finanzas | Tesorería | `/tesoreria/emisiones`, `/tesoreria/tipos-documento`, `/tesoreria/depositos`, `/tesoreria/cheque-print-templates`, `/tesoreria/cheques`, `/tesoreria/movimientos`, `/tesoreria/transferencias-internas`, `/cuentas-bancarias/bancos`, y `/cuentas-bancarias` **salvo su `GET` de listado** (ver corrección de abajo — el listado quedó SIN gate, es dato de referencia) | — |
| `inventario` | Inventario | Inventario | `/inventory`, `/inventory/carga-inicial`, `/inventory/zonas`, `/inventory/ubicaciones`, `/inventory/counts`, `/transferencias` | — |
| `servicios` | Inventario | Servicios | *(ninguno — `implementado: false`, ver 4.3)* | — |
| `relacionesComerciales` | Relaciones | Relaciones comerciales (B2B) | `/relaciones`, `/relaciones/invitaciones`, `/relaciones/directorio`, `/relaciones/ventas`, `/relaciones/bloqueos`, `/relaciones/transacciones` | `compras` |
| `cotizaciones` | Ventas | Cotizaciones | `/quotations` **(no `/invoicing/quotations`)** | — |
| `despacho` | Ventas | Despacho | `/despachos` | — |
| `devoluciones` | Ventas | Devoluciones | `/devoluciones` | — |
| `notasCredito` | Ventas | Notas de crédito | `/credit-notes` **(ruta propia, no compartida — ver §5)** | — |
| `notasDebito` | Ventas | Notas de débito | `/debit-notes` **(ruta propia, no compartida — ver §5)** | — |
| `pedidos` | Ventas | Pedidos | `/pedidos` | — |

**Confirmado correcto para tu tabla del punto 1:** `pagos`→`cuentasPorPagar`; `/cuentas`→ahora
`contabilidad` (no `cuentasPorPagar`, era el bug); `/config/bancos` (proxy de solo lectura del
doctype nativo `Bank`) **no tiene ningún gate de feature**, solo permiso — no lo confundas con
`/cuentas-bancarias/bancos` (con gate `tesoreria`, CRUD real de bancos usados al dar de alta una
cuenta).

**Corrección posterior (mismo día, 2026-09-23) sobre `/cuentas-bancarias`:** reportaron ustedes
mismos los consumidores reales del `GET /cuentas-bancarias` (listado) — `RegistrarPagoPage` (CxP),
`PagoPage`/`CobrosPage` (CxC), `PaymentLinesEditor` (facturación núcleo, Caja, CxC),
`PagoContadoModal` (Compras/Gastos al contado), `CreditNotesPage` (reembolsos NC),
`useMetodoPagoCurrencies` — y tenían razón: gatear el listado completo tras `tesoreria` rompía
todos esos flujos núcleo para un tenant sin Tesorería. Se corrigió exactamente como propusieron:
- `GET /cuentas-bancarias` (listado, `findAll`) → **sin gate de feature**, dato de referencia,
  mismo criterio que los métodos de pago. Sigue exigiendo el permiso RBAC de siempre.
- Todo lo demás de ese controller (`POST`/`PUT`/`DELETE`, `GET tipos`, `GET
  inconsistencias-moneda`, `GET :id`, `GET :id/balance`) sigue exigiendo `tesoreria` — bajado de
  la clase al método, sin cambio de comportamiento para esos endpoints.
- `/cuentas-bancarias/bancos` (catálogo de bancos) no se tocó — nadie lo reportó como usado fuera
  de la pantalla de administración de cuentas bancarias, se queda gateado por `tesoreria` entero.

**Segunda corrección (mismo día):** reportaron que `GET /cuentas-bancarias/:id` (detalle) también
lo consume `CobroDetail` (CxC) para resolver la cuenta bancaria de un cobro puntual — un tenant
con `cuentasPorCobrar` sin `tesoreria` recibía un 403 real ahí (mitigado con `retry: false` de tu
lado, pero el error seguía siendo incorrecto). Mismo fix aplicado: `GET /cuentas-bancarias/:id`
(`findOne`) también queda **sin gate de feature**, mismo criterio que el listado — sigue exigiendo
permiso RBAC. `GET :id/balance` sigue gateado (no reportado como usado fuera de Tesorería).

Tu pantalla `/config/cuentas-bancarias` (CRUD admin) puede seguir gateada por `tesoreria` sin
problema — solo el listado y el detalle por id que consumen las pantallas núcleo quedaron
abiertos.

**"Depende de"** es informativo para vos (explica por qué, por ejemplo, `comprasOrdenes` nunca
está encendido si `compras` está apagado — el backend ya lo garantiza, nunca vas a ver esa
combinación imposible) — no necesitás recalcular ni validar dependencias en el frontend, solo leer
el booleano final de cada clave.

### 4.2 Reportes (`reportesHabilitados` — presencia en el array)

**Hallazgo importante (2026-09-23):** `reportes.controller.ts` **no tiene ningún `@RequiereFeature`
en ningún endpoint** — solo `@RequierePermiso` (RBAC). Esto significa que, hoy, **el servidor no
bloquea ningún reporte por feature/plan** — `reportesHabilitados` es puramente el dato que vos
usás para decidir qué tarjeta mostrar, no algo que el backend haga cumplir si alguien pega la URL
directo. Tu comportamiento fail-open (permiso solamente) para los tipos sin clave mapeada es, en
la práctica, exactamente igual de "seguro" que el de los que sí tienen clave — ninguno se aplica
server-side todavía. Ver `PLAN_FEATURES_TENANT.md` §17.4 para el plan de cerrar esto (requiere
extender el guard, no es solo agregar `@RequiereFeature` — no está implementado todavía).

| `key` | Nombre | Requiere feature | Estado |
|---|---|---|---|
| `ventas_por_periodo` | Ventas por período | — | Real |
| `compras_por_periodo` | Compras por período | — | Real |
| `cuentas_por_cobrar` | Cuentas por cobrar (reporte) | — | Real |
| `cuentas_por_pagar` | Cuentas por pagar (reporte) | — | Real |
| `stock_valorizado` | Stock valorizado | — | Real |
| `movimientos_inventario` | Movimientos de inventario | — | Real |
| `flujo_caja` | Flujo de caja | — | Real |
| `balance_general` | Balance general | `contabilidad` | Real |
| `estado_resultados` | Estado de resultados | `contabilidad` | Real |
| `reporte_606` | Reporte 606 DGII | `contabilidad` | Real |
| `reporte_607` | Reporte 607 DGII | `contabilidad` | Real |
| `top_productos` | Top productos | — | **`implementado: false` — sin endpoint, no construyas pantalla** |
| `top_clientes` | Top clientes | — | **`implementado: false` — sin endpoint** |
| `ventas_por_vendedor` | Ventas por vendedor | — | **`implementado: false` — sin endpoint** |
| `gastos_por_periodo` | Gastos por período | — | **`implementado: false` — sin endpoint** |

Las 4 marcadas `implementado: false` nunca van a aparecer en `reportesHabilitados` de ningún
tenant (nada las enciende) — no necesitás construir pantalla para ellas ni tratarlas como
"pendientes", son reservas de nombre sin implementación detrás. Si alguna vez pasan a
`implementado: true`, este documento se actualiza con su endpoint real.

**Sobre tus 16 tipos sin clave** (`608`, `facturacion-fiscal`, `caja`, `cuadreTurno`,
`corteCajaDia`, `libroDiario`, `libroMayor`, `inventario-antiguedad`, `inventario-proyeccion`,
`pedidos-analitica`, `solicitudes`, `despacho-margen`, `despacho-reservas`, `despacho-faltantes`,
`despacho-pendientes-compra`) — **los 15 primeros SÍ existen como endpoint real** en
`reportes.controller.ts` (`farmacia-lotes`/`farmacia-facturas-ars` no existen en absoluto, no hay
reportes de farmacia implementados). Diseño recomendado (documentado en detalle en
`PLAN_FEATURES_TENANT.md` §17.4, pendiente de implementar del lado del guard):
- `608` → nueva clave `reporte_608` (hermano de 606/607, `contabilidad`) — **por ahora seguí
  tratándolo fail-open (permiso), no es `implementado: false`, es un reporte real sin gate todavía,
  no lo ocultes de tu lista de reportes disponibles**.
- `facturacion-fiscal` → sin feature, es núcleo (mismo criterio que `ecf`) — mostralo siempre que
  el permiso lo permita.
- `caja`/`cuadreTurno`/`corteCajaDia` → deberían gatearse por el módulo `caja`, no por una clave de
  reporte propia — hasta que el backend lo implemente, mismo criterio que arriba: fail-open.
- `libroDiario`/`libroMayor` → deberían atarse a `contabilidad`.
- `inventario-antiguedad`/`inventario-proyeccion` → a `inventario`.
- `pedidos-analitica` → a `pedidos`.
- `solicitudes` → a `comprasSolicitudes`.
- `despacho-margen`/`despacho-reservas`/`despacho-faltantes`/`despacho-pendientes-compra` → a
  `despacho`.

Ninguno de estos 15 casos necesita acción tuya ahora mismo más allá de mantenerlos fail-open (que
es lo que ya hacés) — es al backend al que le falta conectar el guard. No los muevas a
`implementado: false` de tu lado ni los saques de tu UI.

### 4.3 Lo que NUNCA se gatea (siempre visible, sin consultar `features`)

`dashboard`, catálogo de artículos, **Facturación de venta** (factura normal — `invoicing/invoices`
— esto es distinto de Cotizaciones/Pedidos/Notas, que sí se gatean), Clientes, Usuarios, toda
`Configuración`, `me`, y **Facturación Electrónica / e-CF** (`ecf`) — este último es mandato DGII,
nunca opcional por plan. Ningún tenant puede quedar sin poder facturar ni ver clientes, así que
estos módulos no tienen entrada en `features` — no busques una clave para ellos, no existe, y no
la agregues vos del lado del frontend.

`servicios` existe como clave reservada (`implementado: false`) pero el módulo no existe todavía en
el backend — nunca lo muestres como opción, ni siquiera deshabilitado. Si en algún momento pasa a
`implementado: true`, este mismo documento se actualiza con su ruta real.

---

## 5. Menú y rutas — la regla principal

Para cada ítem de menú/ruta que hoy tengas, buscá su `key` en la tabla §4.1 por el prefijo de ruta
que coincida:

```ts
function moduloVisible(featureKey: string | null, tenantFeatures: Record<string, boolean>, permisoDeAlgunaAccionDelModulo: boolean): boolean {
  // null = módulo núcleo (§4.3), siempre pasa esta capa — la de permisos igual aplica.
  const tieneFeature = featureKey === null || tenantFeatures[featureKey] === true;
  return tieneFeature && permisoDeAlgunaAccionDelModulo;
}
```

Aplica esto en el mismo lugar donde ya filtrás por permisos (menú lateral, guard de rutas,
redirección si alguien pega una URL directa a un módulo sin acceso). Si tu router ya tiene un guard
de permisos por ruta, agregale esta misma condición ahí — no un guard separado y paralelo que se
pueda desincronizar del de permisos.

**Corrección (2026-09-23):** `notasCredito`/`notasDebito` **no comparten backend** — son dos
controllers reales e independientes (`/credit-notes` y `/debit-notes`, confirmado en el código),
cada uno con su propio `@RequiereFeature`. El modelo de **dos rutas separadas** que ya implementó
el frontend (`/notas-credito`→`notasCredito`, `/notas-debito`→`notasDebito`) es el correcto y
coincide exactamente con el backend — no hace falta unificarlas en una pantalla con tabs. Si en
algún momento SÍ preferís una sola pantalla con tabs por UX, seguís pudiendo hacerlo (cada tab
gateada por su propia clave, igual que cualquier otro caso de dos rutas que dependan de features
distintos) — pero no es porque el backend las trate como una unidad, es una decisión de UI libre.

---

## 6. Secciones EMBEBIDAS dentro de pantallas núcleo — el caso fácil de olvidar

Algunas pantallas núcleo (§4.3, siempre visibles) tienen **secciones internas** que en realidad
pertenecen a un módulo que sí se gatea. Ocultar solo la ruta de nivel superior no alcanza acá —
revisá estos casos puntuales:

- **Detalle de Cliente**: si tiene una pestaña/sección de "Estado de cuenta" o "Cuentas por
  cobrar", esa sección pertenece a `cuentasPorCobrar` — ocultala si ese feature está apagado, aunque
  la pantalla de Cliente en sí siga siendo núcleo.
- **Detalle de Proveedor**: si tiene una sección de "Historial de compras" o "Cuentas por pagar",
  igual criterio con `cuentasPorPagar`/`compras` según corresponda.
- **Pantallas de Reportes** (`/reportes` o donde sea que armes el listado/dashboard de reportes):
  esta pantalla contenedora es núcleo, pero cada tarjeta/reporte individual se filtra por
  `reportesHabilitados` (§4.2) — un tenant sin `contabilidad` no debe ver la tarjeta de "Balance
  General" aunque la pantalla de Reportes en sí sea accesible.
- **Configuración**: las pantallas de `/config/*` son núcleo (siempre accesibles), pero algunas
  SECCIONES dentro corresponden a un módulo específico — ej. la config de Caja/POS (modos de pago
  de caja, turnos) solo tiene sentido con `caja` encendido; la config de Cobros con
  `cuentasPorCobrar`; la config de Tesorería con `tesoreria`. Si tu pantalla de Configuración es un
  menú de secciones, ocultá la sección entera cuando el feature correspondiente esté apagado — no
  dejes un formulario de configuración de algo que el tenant ni siquiera puede usar.
- **Dashboard**: si tenés widgets/tarjetas de resumen por módulo (ej. "Compras del mes", "Stock
  bajo", "Cuentas por cobrar vencidas"), cada tarjeta se oculta según su feature — el Dashboard en
  sí es núcleo, el contenido no.

No es una lista exhaustiva — es la forma de pensar el problema: **cualquier fragmento de UI que
muestre datos o acciones de un módulo gateado, sin importar en qué pantalla esté embebido, se
oculta con la misma regla que la ruta de ese módulo.** Si encontrás otro caso similar en tu propio
código que no está listado acá, aplicá el mismo criterio y no lo dejes sin gatear "porque no está
en la lista".

---

## 7. Perfiles de rol (`Role Profile`) — ya vienen filtrados, no reimplementes nada

`GET /roles/perfiles` **ya excluye del lado del backend** los perfiles cuyo módulo esté apagado
(ej. sin `compras`, el perfil "Compras" no aparece en esa lista, aunque exista en ERPNext). Si tu
formulario de "Nuevo usuario" ya consume ese endpoint para el selector de perfiles, **no hace falta
ningún cambio** — el filtrado por feature ya está aplicado antes de que la respuesta te llegue.

No filtres esa lista vos mismo por `features` — el backend puede tener reglas más finas que las
que ves acá (ej. un perfil oculto por más de un motivo). Confiá en la lista tal cual viene.

---

## 8. Límites — usuarios y sucursales

`limites.maxUsuarios`/`maxSucursales` (§3) con sus contadores actuales:

- Mostrá algo tipo **"4 de 10 usuarios"** cerca del botón "Nuevo usuario" (y "2 de ∞" o simplemente
  sin contador si `maxUsuarios` es `null`).
- Deshabilitá el botón "Nuevo" (usuario o sucursal) cuando `usuariosActuales >= maxUsuarios` (o el
  equivalente de sucursales) — con un tooltip explicando que se alcanzó el límite del plan. Mismo
  criterio para ambos límites, misma ubicación relativa del contador.
- Esto es una ayuda de UX, no la validación real — igual podés dejar que el submit intente y
  manejar el error (§9) por si el contador quedó desactualizado (alguien creó un usuario en otra
  pestaña un segundo antes).

---

## 9. Contrato de errores — manejo defensivo

Aunque la UI ya debería evitar llegar acá (menú oculto, botón deshabilitado), el backend sigue
validando todo — mismo formato de error que ya conocés de permisos:

```json
{
  "success": false,
  "error": {
    "code": "FEATURE_NO_CONTRATADO",
    "message": "Este módulo no está incluido en el plan de este tenant.",
    "statusCode": 403,
    "details": { "featuresFaltantes": ["inventario"] }
  }
}
```

| Código | HTTP | Cuándo | Qué mostrar |
|---|---|---|---|
| `FEATURE_NO_CONTRATADO` | 403 | Se llegó a una ruta de un módulo apagado — debería ser imposible si el menú está bien gateado; si aparece, es una señal de que falta ocultar algo en el punto 5/6 | Mensaje genérico ("Este módulo no está disponible en tu plan") + volver al inicio, no un error técnico |
| `LIMITE_USUARIOS_ALCANZADO` | 400 | `POST /usuarios` superó `maxUsuarios` | Mensaje con el límite exacto (`details.limite`) — mismo texto que el tooltip de §8 |
| `LIMITE_SUCURSALES_ALCANZADO` | 400 | `POST /sucursales` superó `maxSucursales` | Igual que arriba |
| `PERFIL_NO_CONTRATADO` | 400 | Se intentó asignar un `Role Profile` oculto por un feature apagado — no debería pasar si usás la lista de §7 tal cual viene | Mensaje genérico, y revisá que el selector de perfiles realmente esté usando `GET /roles/perfiles` en vivo, no una copia cacheada vieja |

---

## 10. Checklist de verificación

1. `GET /me/features` se pide una sola vez al iniciar sesión (o al cambiar de tenant) y se guarda
   junto con `permissions`/`vertical`.
2. El menú lateral/router filtra cada módulo de la tabla §4.1 por `features.<key> === true` **Y**
   por permiso (§2) — probá apagando `compras` para un tenant y confirmá que Compras, Órdenes,
   Solicitudes, Devoluciones de compras y Proveedores desaparecen juntos (todos dependen de o son
   `compras`).
3. Notas de Crédito y Notas de Débito se gatean como pestañas independientes dentro de la misma
   pantalla (§5), no como si fueran una sola.
4. Reportes: cada tarjeta/reporte individual se filtra por `reportesHabilitados`, no por un feature
   de módulo — probá con `contabilidad` apagado y confirmá que Balance General, Estado de
   Resultados, 606 y 607 desaparecen de la lista de reportes aunque el resto siga visible.
5. Las secciones embebidas de §6 (estado de cuenta en Cliente, historial en Proveedor, config de
   Caja/Cobros/Tesorería, widgets del Dashboard) se ocultan igual que una ruta de nivel superior.
6. `GET /roles/perfiles` se sigue consumiendo tal cual, sin un filtro adicional del lado del
   frontend.
7. El botón "Nuevo usuario"/"Nueva sucursal" muestra el contador "X de Y" y se deshabilita al
   llegar al límite, cuando el límite no es `null`.
8. `dashboard`, catálogo, Facturación (venta normal), Clientes, Usuarios, Configuración, `ecf` y
   `me` siguen siendo accesibles siempre, sin excepción, sin importar qué features estén apagados.
9. `servicios` no aparece en ningún lado de la UI (ni oculto ni deshabilitado — simplemente no
   existe todavía).
10. Todo contrastado contra `openapi.json` actualizado para los tipos exactos de `GET /me/features`.
