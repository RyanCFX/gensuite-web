# Despacho / Reservas / Abastecimiento — guía completa de implementación para el frontend

> **Para quien recibe este documento.** El backend implementó por completo
> `docs/plans/PLAN_DESPACHO_RESERVAS_ABASTECIMIENTO.md` (8 fases, todas commiteadas). Esto agrega
> al BFF un módulo nuevo — **Despachos** (`Delivery Note` nativo de ERPNext) — y modifica el
> comportamiento de varios módulos ya existentes: **Pedidos**, **Facturación**, **Cotizaciones**,
> **Compras (Órdenes)**, **Transferencias**, **Configuración** y **Reportes**. Nada de esto es
> opcional de leer: casi todos los cambios de comportamiento existente son **condicionales a un
> interruptor por tenant** (`despacho_habilitado`), así que el frontend tiene que aprender a
> comportarse distinto según ese flag esté prendido o apagado — incluyendo tenants que hoy lo
> tienen apagado y lo prenden mañana sin ningún despliegue de por medio.
>
> **En el repo del frontend hay un `openapi.json` actualizado con la documentación completa del
> API** (generado desde el backend: `GET /api/docs-json`). Ahí está el shape exacto y tipado de
> cada request/response, incluidos todos los campos nuevos, con sus DTOs, validaciones y
> ejemplos. **Regenerá los tipos/cliente desde ese archivo antes de empezar** y usalo como fuente
> de verdad campo por campo (nombres exactos, opcionalidad, tipos). Este documento no lo
> reemplaza: explica el flujo de negocio, el orden de las llamadas, qué pantalla toca qué
> endpoint, qué mostrar en cada estado, y cómo manejar cada error. **Cuando este documento y el
> `openapi.json` difieran en un nombre de campo o una ruta, gana el `openapi.json`** — puede haber
> quedado desactualizado algún detalle menor de este prompt tras la implementación final.
>
> Documentos relacionados que conviene tener a mano: `docs/PERMISOS.md` (sistema de permisos y
> `acciones`), `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos del frontend),
> `docs/plans/PLAN_DESPACHO_RESERVAS_ABASTECIMIENTO.md` (el plan original de negocio, con la
> justificación completa de cada regla — léelo si alguna decisión de este prompt no te queda
> clara, ahí está el porqué).

---

## 0. Resumen ejecutivo

### 0.1 Qué es "despacho" y por qué existe

Hoy (sin este módulo), la **factura de venta** es, a la vez, el documento fiscal (NCF/e-CF) y el
documento de inventario: al someterla, ERPNext descuenta el Stock Ledger en ese mismo momento
(`update_stock = 1`). Eso funciona bien cuando facturar y entregar la mercancía son la misma
acción física (mostrador, POS). Pero muchos negocios facturan primero y entregan después (o en
partes): venta a crédito con entrega programada, pedidos que se completan según llega mercancía,
ventas con recogida en otra sucursal, etc. Con `update_stock=1` eso no se puede modelar: la
factura descuenta todo de una vez, exista o no la mercancía físicamente lista para salir.

**Despacho** es la funcionalidad nativa de ERPNext para resolver esto: el **Delivery Note**
(guía de despacho / nota de entrega) pasa a ser el documento de inventario, separado de la
factura. Cuando un tenant activa el módulo:

- La factura deja de tocar el Stock Ledger (`update_stock = 0`). Es puramente el documento
  fiscal — asigna NCF/e-CF y registra la cuenta por cobrar, pero **no mueve inventario**.
- La salida física de mercancía ocurre al **someter un Delivery Note**, que puede crearse antes
  de facturar (despachar y luego facturar) o después de facturar (facturar y luego despachar,
  el caso más común), y puede cubrir una factura o pedido **en varias entregas parciales**.
- ERPNext reserva stock nativamente (`Stock Reservation Entry`) para que la mercancía comprometida
  con un pedido no se le escape a otro cliente, y soporta **abastecimiento**: comprar justo lo que
  falta para cumplir pedidos pendientes, consolidando varios pedidos en una sola orden de compra.

Es un **interruptor por tenant** (`Facturacion Config.despacho_habilitado`), apagado por default.
Un tenant que nunca lo activa no ve ningún cambio de comportamiento — todo lo que sigue en este
documento solo aplica cuando está prendido. El frontend tiene que:

1. Leer el flag al cargar (ver §1) y decidir en base a eso si muestra el módulo Despachos, el
   flujo de facturación con despacho, etc.
2. Ofrecer en Configuración el botón para activarlo/desactivarlo (§8).
3. Adaptarse a que el flag puede cambiar en caliente sin redeploy — no lo hardcodees ni lo cachees
   más allá de la sesión/vista actual.

### 0.2 Mapa de pantallas — qué es nuevo, qué cambia

| Pantalla | Qué cambia |
|---|---|
| **Despachos** (nueva) | Pantalla completa nueva: listado, detalle, crear desde pedido/factura/directo, asignar tracking, someter, cancelar, facturar, devolución, imprimir PDF. Ver §2. |
| **Facturación** (factura de venta) | Sin cambios de UI directos, pero el comportamiento post-submit cambia radicalmente si el tenant tiene despacho activo: la factura ya NO descuenta inventario, y debe ofrecer un CTA claro hacia "Despachar". Ver §3. |
| **Pedidos** | Los apartados (layaway) ahora reservan stock de verdad al someter (antes fallaba en silencio) — mostrar `stockReserved`/`warning` en la respuesta del submit. Ver §4. |
| **Cotizaciones** | Sin cambios de UI — fix interno (facturar desde cotización ahora descuenta inventario correctamente cuando el despacho está apagado). No requiere trabajo de frontend, pero está documentado en §4.3 para que quede constancia. |
| **Compras → Órdenes** | Pantalla nueva "Abastecimiento": ver líneas de pedidos pendientes de comprar y generar una orden de compra consolidada (multi-pedido, FIFO, con alerta de margen negativo). Ver §5. |
| **Transferencias** | Nueva validación: no se puede transferir stock que está reservado para un pedido de otro cliente. Mostrar el error tal cual lo devuelve el servidor. Ver §6. |
| **Compras → Recepción de Mercancía** | Mensaje de error de sobre-recepción ahora viene traducido y explicado — mostrar tal cual, ya no hace falta interpretarlo. Ver §6.4. |
| **Inventario** | El endpoint expone más campos del `Bin` (reservado, comprometido, en tránsito, disponible real) — vale la pena mostrarlos si la tabla de inventario tiene espacio. Ver §7. |
| **Configuración** | Nueva sección/toggle "Despacho" para habilitar/deshabilitar el módulo, con manejo del 409 que lista qué lo bloquea. Nuevo campo `roleAllowedToOverDeliverReceive` en Ajustes de Inventario. Ver §8. |
| **Reportes** | 4 reportes nativos nuevos bajo un grupo "Despacho": Margen real, Reservas de stock, Faltantes, Pendientes de comprar. Ver §9. |

### 0.3 Principio general de diseño

**No reinventes lo que ERPNext ya resuelve** (regla #3 de `CLAUDE.md`, aplica también al
frontend): varios endpoints de este módulo son wrappers finos sobre métodos nativos de ERPNext
(`make_delivery_note`, `make_sales_invoice`, `make_purchase_order`, `make_sales_return`). Eso
significa que el servidor ya resuelve por vos qué líneas están pendientes, cuánto queda por
despachar, cómo prorratear impuestos, etc. — el frontend no necesita (ni debe) recalcular nada de
eso client-side. Tu trabajo es: llamar al endpoint correcto en el momento correcto, mostrar lo que
el servidor devuelve, y traducir los errores tal como se documentan abajo.

---

## 1. El interruptor `despachoHabilitado` — cómo leerlo y por qué importa en cada pantalla

### 1.1 De dónde sale

`GET /api/v1/config/facturacion` (el mismo endpoint de configuración de facturación que ya
consume el frontend para NCF, POS, etc.) ahora incluye:

```json
{
  "success": true,
  "data": {
    "...": "...campos existentes sin cambios...",
    "despachoHabilitado": false
  }
}
```

Pedilo al iniciar sesión / al entrar al layout principal, junto con el resto de la config de
facturación que ya cargás, y guardalo en el store global (junto a `vertical`, `acciones`, etc. —
mismo patrón que ya usás para esos flags).

### 1.2 Qué gatea

**Mostrar solo si `despachoHabilitado === true`:**

- El ítem de menú **Despachos** y toda su pantalla (§2).
- El ítem de menú **Abastecimiento** dentro de Compras → Órdenes (§5).
- El botón/CTA "Despachar" en el detalle de una factura o un pedido sometidos (§3, §4).
- El grupo de reportes **Despacho** (§9).
- El toggle debe mostrarse como "Activado" en Configuración → Despacho.

**Mostrar siempre** (no gatear por el flag): la sección Configuración → Despacho en sí misma
(necesitás poder activarlo desde ahí), y los campos nuevos de solo-lectura en Inventario (§7) —
esos existen independientemente del flag, son datos del `Bin` que ERPNext siempre mantiene.

**El servidor es la barrera real**, igual que con `vertical` en otros módulos: si el flag está
apagado y igual pegás a `/despachos/*`, el servidor responde **400** con
`"El despacho no está habilitado para este tenant (ver POST /config/despacho/habilitar)."` en
los endpoints de creación (`crearDesdePedido`, `crearDesdeFactura`, `create`). Los endpoints de
solo lectura (`findAll`, `findOne`, `pendientes`) **no** están gateados por el flag en el
servidor — un tenant que desactivó despacho después de haber tenido despachos sometidos sigue
pudiendo consultarlos (auditoría/histórico). Si ves ese 400 en producción con el flag prendido en
tu store, es que el store quedó desincronizado — volvé a pedir `GET /config/facturacion`.

### 1.3 El flag puede cambiar en caliente

No asumas que el flag es estático por sesión. Si el usuario (u otro usuario del mismo tenant, en
otra pestaña/dispositivo) lo activa o desactiva desde Configuración, tu store debe refrescarse —
como mínimo, volvé a pedir `GET /config/facturacion` después de un `POST
/config/despacho/habilitar` o `/deshabilitar` exitoso (§8) y actualizá el store antes de navegar.

---

## 2. Módulo nuevo: Despachos (`/despachos`)

### 2.1 Concepto y vocabulario en la UI

Un **despacho** es un `Delivery Note` de ERPNext. En la UI, usá siempre "Despacho" (nunca "Nota
de entrega" ni "Delivery Note" — mantené el vocabulario en español consistente con el resto del
sistema). Un despacho tiene:

- **Estado de documento** (`status` en la respuesta): `draft` (Borrador, editable), `submitted`
  (Sometido, inmutable — ahí ocurrió la salida física de inventario), `cancelled` (Cancelado).
  Estos tres son los que gobiernan qué acciones mostrar/ocultar (mismo patrón de máquina de
  estados que ya usás para facturas y pedidos: Borrador → Sometido → [Cancelado]).
- **Estado nativo de ERPNext** (`deliveryStatus`, campo `status` crudo del Delivery Note):
  `Draft`, `To Bill`, `Completed`, `Return`, `Return Issued`, `Cancelled`, `Closed`. Es **más
  granular** que el anterior — mostralo como badge secundario/tooltip informativo (p.ej. "Sometido
  · Por facturar" quiere decir `status=submitted` + `deliveryStatus=To Bill`), pero **no lo uses
  para decidir qué botones mostrar** — para eso usá siempre `status`/`docstatus`, que es la fuente
  de verdad binaria que gobierna inmutabilidad.

### 2.2 Tres formas de crear un despacho — cuál usar y cuándo

Esta es la decisión de negocio más importante de todo el módulo. Hay tres endpoints de creación,
y **no son intercambiables** — cada uno resuelve un caso distinto:

| Endpoint | Cuándo usarlo | Qué hace |
|---|---|---|
| `POST /despachos/desde-factura/:siId` | **Caso más común**: ya existe una factura sometida (con `update_stock=0`) y hay que entregar la mercancía. | Trae del servidor un Delivery Note pre-armado con TODO lo pendiente de esa factura específica (`qty - delivered_qty`), vinculado línea por línea (`si_detail`/`against_sales_invoice`). Recomendado siempre que exista factura — deja el `delivered_qty` de la factura exacto. |
| `POST /despachos/desde-pedido/:soId` | Existe un pedido sometido pero **todavía no se ha facturado**, y el negocio quiere despachar primero y facturar después. | Igual que el anterior pero contra el `Sales Order`. Úsalo solo cuando no hay factura todavía — si ya existe factura, preferí `desde-factura`. |
| `POST /despachos` (creación directa, con body) | **Venta mostrador sin pedido previo**: el despacho habilitado no obliga a que toda venta pase por un pedido. | El operador arma las líneas a mano (artículo, cantidad, almacén). Es el único camino donde el frontend construye el body completo — los otros dos son de un solo click. |

**En la UI**: en el detalle de una factura sometida con `update_stock=0` (§3.3), el botón
"Despachar" debe llamar a `desde-factura`. En el detalle de un pedido sometido y aún no facturado
(§4.2), el botón "Despachar" debe llamar a `desde-pedido`. La pantalla de listado de Despachos
debe tener un botón "Nuevo despacho" que abra el formulario de creación directa (`POST
/despachos`) para el caso mostrador. **No expongas los tres caminos como opciones intercambiables
en un mismo formulario** — cada uno vive en el contexto donde tiene sentido.

Los tres devuelven el despacho recién creado **en estado Borrador** (`status: "draft"`) — nunca
se somete automáticamente. El operador debe revisar cantidades/almacén y someter explícitamente
(§2.6).

### 2.3 Pantalla de pendientes de despachar — `GET /despachos/pendientes`

Antes de crear despachos uno por uno desde cada factura/pedido, conviene una vista de trabajo
tipo "cola de despacho": líneas sueltas de todo lo que está pendiente de salir, sin importar de
qué documento vienen. Este endpoint devuelve exactamente eso — úsalo para una pantalla o panel
"Pendientes de despachar" (accesible desde el menú Despachos, o como tab dentro de la pantalla de
listado).

Query params: `customer`, `itemCode`, `warehouse` (todos opcionales, filtros exactos), más
paginación estándar (`limit`/`offset`).

Cada fila de la respuesta trae:

```json
{
  "origen": "factura" | "pedido",
  "documentoId": "SINV-2026-00042",
  "customer": "CUST-0001",
  "customerName": "Juan Pérez",
  "itemCode": "ITEM-0001",
  "itemName": "Producto X",
  "warehouse": "Almacén Principal - EMP",
  "qtyPendiente": 5
}
```

**Diseño recomendado**: tabla agrupable por `documentoId`, con una acción por fila (o por grupo)
"Despachar" que dispara `desde-factura`/`desde-pedido` según `origen` — así el operador nunca
tiene que ir a buscar la factura o el pedido manualmente, arranca directo desde la cola de
pendientes.

**Nota de priorización de negocio** (para explicarle al usuario si pregunta por qué una línea
aparece dos veces): si un pedido ya tiene factura, la línea de la factura (`origen: "factura"`)
es la que representa el pendiente exacto; la del pedido (`origen: "pedido"`) puede seguir
apareciendo si el pedido todavía tiene algo sin facturar. No hay deduplicación automática porque
representan situaciones distintas (comprometido sin facturar vs. facturado sin entregar) — no
trates esto como un bug.

### 2.4 Listado — `GET /despachos`

Filtros disponibles: `customer`, `status` (`draft`/`submitted`/`cancelled`/`all`, default trae
Borrador+Sometido), `warehouse`, `branch`, `fechaDesde`, `fechaHasta`, `salesOrder`,
`salesInvoice`, más paginación y `orderBy` (campos ordenables: `id`, `postingDate`, `customer`,
`customerName`, `status`, `createdAt`, `modifiedAt`).

Columnas recomendadas: ID, Cliente, Fecha, Estado (badge con el mapeo de §2.1), Sucursal,
Pedido/Factura de origen (si aplica), acciones según estado.

### 2.5 Detalle — `GET /despachos/:id`

Shape de la respuesta (`data`):

```json
{
  "id": "MAT-DN-2026-00012",
  "customer": "CUST-0001",
  "customerName": "Juan Pérez",
  "postingDate": "2026-01-15",
  "status": "draft",
  "deliveryStatus": "Draft",
  "isReturn": false,
  "returnAgainst": null,
  "salesOrder": "SAL-ORD-2026-00007",
  "salesInvoice": null,
  "branch": "Sucursal Norte",
  "department": "Ventas",
  "perBilled": 0,
  "items": [
    {
      "itemCode": "ITEM-0001",
      "itemName": "Producto X",
      "qty": 5,
      "rate": 250,
      "amount": 1250,
      "warehouse": "Almacén Principal - EMP",
      "uom": "Unidad",
      "deliveredQty": 0,
      "againstSalesOrder": "SAL-ORD-2026-00007",
      "soDetail": "abc123...",
      "againstSalesInvoice": null,
      "siDetail": null
    }
  ],
  "amendedFrom": null,
  "createdAt": "2026-01-15 10:30:00",
  "modifiedAt": "2026-01-15 10:30:00"
}
```

Notas de UI:

- `isReturn: true` marca que este despacho **es** una devolución (viene de "Crear Devolución",
  §2.9) — mostrar un badge distinto (p. ej. rojo, "Devolución") y `returnAgainst` como link al
  despacho original.
- `perBilled` es el % ya facturado de este despacho (0–100) — útil como barra de progreso si el
  despacho se factura parcialmente en varias facturas.
- Cada línea trae de dónde viene (`againstSalesOrder`/`againstSalesInvoice`) — mostralo como link
  contextual al pedido/factura de origen cuando corresponda.

### 2.6 Acciones sobre un despacho — estados, botones, y qué endpoint dispara cada uno

| Acción | Visible cuando | Endpoint | Permiso (`acciones`) |
|---|---|---|---|
| Editar | `status === "draft"` | `PUT /despachos/:id` | `despachos.editar` |
| Asignar tracking (serial/lote) | `status === "draft"` y hay líneas con artículos serializados/loteados sin bundle asignado | `POST /despachos/:id/asignar-tracking` | `despachos.editar` |
| Someter | `status === "draft"` | `POST /despachos/:id/submit` | `despachos.someter` |
| Cancelar | `status === "submitted"` | `POST /despachos/:id/cancel` | `despachos.cancelar` |
| Facturar | `status === "submitted"` y `salesInvoice === null` (no facturado aún) | `POST /despachos/:id/facturar` | `despachos.facturar` |
| Crear devolución | `status === "submitted"` y `isReturn === false` | `POST /despachos/:id/devolucion` | `despachos.devolver` |
| Imprimir PDF | `status === "submitted"` (o cualquiera, según se defina en el resto del sistema para otros documentos — seguí el mismo criterio que ya usás para facturas/pedidos) | `GET /despachos/:id/print` | `despachos.imprimir` |

Un despacho en Borrador **nunca se puede eliminar desde esta pantalla como "delete"** — no hay
endpoint `DELETE`. Si el operador se equivoca en un Borrador, lo edita o simplemente lo deja sin
someter (queda huérfano pero no afecta nada real hasta que se somete). No ofrezcas un botón
"Eliminar" a menos que confirmes que existe el endpoint estándar de ERPNext para borrar
documentos en Draft que ya use el resto del sistema (`DELETE /api/resource/...` vía el patrón que
uses en otros módulos) — si no está expuesto explícitamente en el controller de despachos, no lo
inventes.

### 2.7 Editar Borrador — `PUT /despachos/:id`

Solo cantidades y almacén por línea (`items: [{ itemCode, qty, warehouse? }]`). Es un
**reemplazo completo** de las líneas cuando se envía `items` — el mismo patrón que ya usás para
`PUT /pedidos/:id`. Caso de uso típico: reducir cantidades para una **entrega parcial** (el
operador solo tiene 3 de las 5 unidades pendientes en el almacén hoy — edita el despacho a 3,
somete, y el resto sigue pendiente para un próximo despacho contra el mismo pedido/factura).

No se pueden agregar líneas nuevas que no vinieran ya en el despacho generado — es edición de lo
existente, no expansión. Si el operador necesita despachar un artículo que no estaba en el
Borrador original, debe crear un despacho nuevo (o usar la creación directa).

### 2.8 Asignar tracking (serial/lote) — `POST /despachos/:id/asignar-tracking`

**Por qué existe**: si alguna línea del despacho es un artículo con número de serie o lote
(`has_serial_no`/`has_batch_no`), ERPNext **exige** que la línea tenga un `Serial and Batch
Bundle` asignado antes de poder someter el documento — es la forma en que ERPNext registra *qué
unidad física concreta* está saliendo. Ni la creación directa ni los tres caminos de generación
automática (`desde-pedido`/`desde-factura`) lo resuelven solos, porque nadie más que el operador
sabe qué serial/lote específico está entregando.

**Cuándo mostrar esta pantalla/modal**: al intentar someter un despacho (§2.6) que tiene líneas
de artículos con tracking sin bundle asignado, el submit va a fallar del lado de ERPNext con un
error de "Serial and Batch Bundle" faltante. **La UI debe detectar esto proactivamente**: al
abrir el detalle de un despacho en Borrador, si alguna línea corresponde a un artículo
serializado/loteado (necesitás el catálogo de artículos para saber cuáles lo son — mismo dato que
ya usás en Facturación/Compras para pedir serial/lote al operador), mostrar un CTA "Asignar
serial/lote" antes de habilitar el botón "Someter".

Body:

```json
{
  "items": [
    {
      "itemCode": "ITEM-SERIALIZADO",
      "serials": ["SN-001", "SN-002"]
    },
    {
      "itemCode": "ITEM-LOTEADO",
      "batches": [
        { "batchId": "BATCH-0001", "qty": 3 },
        { "batchId": "BATCH-0002", "qty": 2 }
      ]
    }
  ]
}
```

Reglas:

- `serials` para artículos con número de serie (uno por unidad — la cantidad de seriales debe
  coincidir con `qty` de la línea).
- `batches` para artículos loteados (arreglo de `{ batchId, qty }` que sume `qty` de la línea).
- El servidor busca, por `itemCode`, **una línea del despacho que todavía no tenga bundle
  asignado** — si mandás dos requests para el mismo `itemCode` sin que haya dos líneas
  disponibles, el segundo falla con 400 ("No se encontró... una línea sin serial/lote ya
  asignado"). Si el despacho tiene varias líneas del mismo artículo (por ejemplo, viniendo de
  varias reservas), hacé un request por línea en el orden que quieras cubrir.
- El serial/lote debe **existir y estar disponible** en el almacén de esa línea — si no, ERPNext
  rechaza con su propio mensaje de error (ver §2.10, tabla de errores).
- Solo funciona sobre despachos en Borrador — un despacho sometido es inmutable.

Después de un `asignar-tracking` exitoso, refrescá el detalle del despacho (la respuesta ya trae
el documento actualizado) y recién ahí habilitá "Someter".

### 2.9 Facturar un despacho sometido — `POST /despachos/:id/facturar`

Caso inverso al más común: primero se despachó (venta mostrador con entrega inmediata pero
facturación diferida, por ejemplo), y ahora hay que generar la factura. Sin body. Respuesta:

```json
{
  "success": true,
  "data": {
    "invoiceId": "SINV-2026-00050",
    "despachoId": "MAT-DN-2026-00012",
    "message": "Despacho facturado en SINV-2026-00050 (Draft). Revise y someta para asignar NCF."
  }
}
```

La factura queda **en Borrador** — el flujo normal continúa en la pantalla de Facturación
(navegá a `invoiceId` tras esta llamada, mismo patrón de "ir a revisar el borrador generado" que
uses en conversión de cotización→factura). El NCF/e-CF se asigna recién al someter esa factura,
como cualquier otra.

### 2.10 Devolución de un despacho — `POST /despachos/:id/devolucion`

**Regla crítica de negocio, léela con cuidado**: este endpoint **solo funciona si el despacho NO
tiene una factura sometida encima**. Si el despacho ya fue facturado (vía §2.9, o porque nació de
`desde-factura` y esa factura ya se sometió), el servidor rechaza con 400:

```
"Este despacho ya fue facturado (SINV-2026-00050). Use POST /devoluciones con
invoiceId="SINV-2026-00050" para que la devolución emita la Nota de Crédito fiscal."
```

**Por qué**: devolver mercancía por el lado del Delivery Note reingresa el stock, pero no toca la
factura ni el saldo del cliente — y sobre todo, no emite el comprobante fiscal de devolución
(Nota de Crédito, NCF tipo B04) que la DGII exige. El camino correcto cuando ya hay factura es la
pantalla de **Devoluciones** normal del sistema (`POST /devoluciones` con `invoiceId`), que sí
emite la NC.

**En la UI**: el botón "Crear Devolución" en el detalle de un despacho debe, ante este error
específico (400 con el mensaje de arriba), **ofrecer navegar directo a la pantalla de
Devoluciones con el `invoiceId` extraído del mensaje pre-cargado** — no lo trates como un error
genérico a mostrar en un toast y listo; es una redirección de flujo. Si el mensaje del servidor
cambia de forma, siempre podés extraer el ID de factura porque sigue el patrón `SINV-...` — pero
preferí, si el backend lo expone en el futuro como un campo estructurado en vez de solo texto,
usar ese campo (revisá el `openapi.json` por si ya lo tiene un shape más estructurado al momento
de implementar).

Si el despacho **no** tiene factura, el endpoint sí completa la devolución: crea un nuevo
`Delivery Note` con `is_return: true` y cantidades en negativo, **en Borrador**, para que el
operador ajuste cantidades antes de someter (misma UX que las devoluciones de factura normales —
no se somete solo).

### 2.11 Someter — `POST /despachos/:id/submit`

Sin body. Acá ocurre la salida física real de inventario. Puede fallar con errores nativos de
ERPNext que el backend ya traduce — ver tabla completa de errores en §2.13. Los dos casos
explícitamente traducidos a español son:

- **Reserva de otro cliente** (`Stock Reservation Warehouse Mismatch`): "No se puede despachar:
  la mercancía de este almacén está reservada para otro cliente (Stock Reservation Entry).
  Verifique el almacén o la reserva antes de someter."
- **Stock físico insuficiente**: "No se puede despachar: no hay stock físico suficiente en el
  almacén indicado."

Cualquier otro error de ERPNext en el submit llega como 500 con el mensaje crudo del servidor —
mostralo igual (no lo ocultes), pero no intentes traducirlo vos; si ves un patrón de error
recurrente que valdría la pena traducir, es trabajo de backend, no de frontend.

### 2.12 Cancelar — `POST /despachos/:id/cancel`

Requiere motivo obligatorio (`reason`, string de 10 a 500 caracteres — mismo patrón que
cancelación de pedidos/facturas, mostrar un textarea con validación de longitud mínima antes de
habilitar el botón de confirmar).

**Regla crítica de negocio — cancelaciones encadenadas (léela completa, es la parte más delicada
del módulo)**: con despacho activo, la factura y el despacho son documentos de inventario
independientes. Eso crea una dirección donde cancelar puede dejar huérfano al otro documento:

- **Si el despacho ya fue facturado** (vía §2.9, "Facturar"), el servidor **bloquea** la
  cancelación del despacho mientras esa factura siga viva (Borrador o Sometida), con 400:
  `"No se puede cancelar: este despacho ya fue facturado (SINV-...). Cancele o elimine esa
  factura antes de cancelar el despacho."` — mostrar este mensaje tal cual, con link a la
  factura si el ID se puede extraer.
- **En el sentido contrario** (una factura que generó un despacho vía §2.2 `desde-factura`), **sí
  se puede cancelar la factura** aunque el despacho generado desde ella siga sometido — eso es
  intencional, no un bug: el despacho es el documento "raíz" ahí (nació antes, contiene el
  movimiento físico real) y la factura es la "dependiente"; cancelarla no lo huérfana, es
  exactamente la forma correcta de deshacer un error de facturación después de haber despachado
  ya. El backend documenta esto extensamente porque la primera versión de esta validación
  bloqueaba ambos sentidos y producía un **deadlock real** (ninguno de los dos podía cancelarse) —
  fue corregido, no reintroduzcas ese bloqueo simétrico si en algún momento decidís replicar esta
  lógica de validación en el cliente (no deberías: dejá que el servidor decida, el frontend solo
  muestra el resultado).

En la práctica para el frontend: **no intentes precalcular si un despacho es cancelable** —
mostrá siempre el botón "Cancelar" cuando `status === "submitted"`, y manejá el 400 del servidor
como cualquier otro error de validación de negocio (toast/modal con el mensaje tal cual). No
hace falta lógica condicional adicional de tu lado.

### 2.13 Tabla de errores del módulo Despachos

| Situación | Código | Mensaje (mostrar tal cual, en español ya viene) |
|---|---|---|
| Despacho activo apagado, intento de crear | 400 | "El despacho no está habilitado para este tenant..." |
| No se pudo resolver almacén en creación directa | 400 | "No se pudo resolver el almacén para \"X\" — indique uno explícito." |
| Stock reservado para otro cliente (V3) | 400 | "Stock insuficiente o reservado para otro cliente: ... disponible N, solicitado M..." |
| Stock físico insuficiente (pre-chequeo en creación directa) | 400 | Mensaje de `assertStockDisponible` — mismo helper que usa Facturación, formato ya familiar |
| Editar despacho ya sometido | 400 | "Solo se puede editar un despacho en Borrador..." |
| Asignar tracking sin línea disponible | 400 | "No se encontró en este despacho una línea sin serial/lote ya asignado para el artículo..." |
| Asignar tracking en despacho no-borrador | 400 | "Solo se puede asignar serial/lote a un despacho en borrador..." |
| Someter con reserva de otro cliente | 400 | "No se puede despachar: la mercancía de este almacén está reservada para otro cliente..." |
| Someter sin stock físico | 400 | "No se puede despachar: no hay stock físico suficiente..." |
| Cancelar ya cancelado | 400 | "El despacho ya está cancelado." |
| Cancelar un Borrador | 400 | "El despacho está en Borrador — elimínelo en vez de cancelarlo." |
| Cancelar con factura vinculada viva | 400 | "No se puede cancelar: este despacho ya fue facturado (SINV-...)..." |
| Devolución con factura ya sometida encima | 400 | "Este despacho ya fue facturado (SINV-...). Use POST /devoluciones..." — **redirigir**, ver §2.10 |
| Despacho no encontrado | 404 | "Despacho \"X\" no encontrado" |

---

## 3. Facturación — comportamiento condicional al flag

### 3.1 Qué NO cambia

El formulario de crear/editar factura **no cambia en absoluto**. Los campos, validaciones, NCF,
todo sigue igual. El cambio es puramente de **qué pasa después de someter**.

### 3.2 Qué cambia al someter, con despacho activo

Con `despachoHabilitado === true`, `update_stock` se manda como `0` (antes siempre `1`) en el
payload de creación de la Sales Invoice — esto lo hace el backend automáticamente, **el frontend
no manda este campo, nunca lo mandó**. La diferencia observable es de resultado: una factura
sometida en un tenant con despacho activo **no genera movimiento de Stock Ledger**. Si tu UI
muestra en algún lado "movimientos de inventario de esta factura" (p. ej. un tab o sección en el
detalle), va a aparecer vacío — eso es correcto, no un bug, mientras no se haya despachado nada
todavía.

### 3.3 CTA "Despachar" en el detalle de una factura sometida

Este es el cambio de UI real que hay que construir. En el detalle de una factura **sometida**
(`docstatus === 1`), cuando `despachoHabilitado === true` **y** la factura tiene
`update_stock === 0` (o, de forma más robusta: consultá si tiene pendiente sin entregar
comparando `qty` vs `delivered_qty` por línea si esos campos están disponibles en la respuesta de
factura — revisá el `openapi.json` de `GET /invoices/:id` para el shape exacto), mostrar un botón
destacado "Despachar" que:

1. Llama a `POST /despachos/desde-factura/:siId` con el ID de esa factura.
2. Si la respuesta es exitosa, navega al detalle del despacho recién creado (queda en Borrador) o
   muestra un modal de confirmación con resumen antes de navegar — seguí el mismo patrón de UX
   que uses para "convertir cotización a factura" (flujo similar: genera un documento nuevo en
   Borrador para revisar).
3. Si la factura no tiene nada pendiente de despachar (todo ya se despachó en entregas previas),
   el servidor puede devolver un mapeo vacío — en ese caso mostrar un mensaje informativo ("Esta
   factura ya fue despachada por completo") en vez de crear un despacho vacío. Verificá contra el
   `openapi.json`/comportamiento real si el servidor ya previene esto devolviendo error, o si hay
   que chequearlo del lado del cliente comparando cantidades.

**Importante**: no muestres este CTA si `despachoHabilitado === false` — en ese caso la factura
ya descontó inventario al someterse, no hay nada que despachar, y el módulo Despachos ni siquiera
debería estar en el menú (§1.2).

### 3.4 Cancelación de una factura ya despachada

Si el usuario intenta cancelar una factura sometida que ya tiene un despacho **sometido** enlazado
(generado vía `desde-factura`), el servidor rechaza con 400:

```
"No se puede cancelar: esta factura ya fue despachada (MAT-DN-...). Cancele primero el despacho
(POST /despachos/MAT-DN-.../cancel) antes de anular la factura."
```

Mismo criterio que en despachos (§2.12): mostrar el mensaje tal cual, con link/navegación directa
al despacho mencionado si querés dar una mejor UX (extraer el ID del mensaje, o revisar si el
`openapi.json` expone esto de forma más estructurada al momento de implementar). No necesitás
precalcular esto del lado del cliente — dejá que el submit de cancelación falle y manejá el error.

---

## 4. Pedidos — apartados con reserva de stock real

### 4.1 El fix (contexto, no requiere UI nueva)

Antes de esta implementación, someter un apartado (`isLayaway: true`) decía "reservado" en la
respuesta pero en realidad la llamada a ERPNext fallaba en silencio (endpoint inexistente en
v16) — nunca se reservaba nada de verdad. Ya está corregido: ahora se usa el método nativo
correcto. **Este fix cambia el shape de la respuesta del submit de un apartado** — revisalo si
tu UI ya consumía este endpoint:

`POST /pedidos/:id/submit` sobre un pedido con `isLayaway: true`, respuesta:

```json
{
  "success": true,
  "data": {
    "pedidoId": "SAL-ORD-2026-00007",
    "isLayaway": true,
    "stockReserved": true,
    "warning": "opcional — solo si reserved:false o hubo un problema parcial",
    "message": "Apartado sometido y stock reservado. Registre el anticipo del cliente y facture cuando regrese a retirar el producto."
  }
}
```

**Mostrar en la UI**: si `stockReserved === true`, un mensaje de éxito normal. Si
`stockReserved === false`, mostrar el `warning` de forma visible (no un simple toast que
desaparece — es información operativa importante: el apartado quedó sometido pero sin garantía de
que la mercancía siga disponible cuando el cliente regrese). El `message` ya viene redactado por
el servidor, listo para mostrar.

### 4.2 Botón "Despachar" en un pedido sometido (no-apartado)

Igual que en Facturación (§3.3): en el detalle de un **pedido** sometido y **aún no facturado**,
con `despachoHabilitado === true`, mostrar CTA "Despachar" → `POST /despachos/desde-pedido/:soId`.
Si el pedido ya tiene factura, preferí que el operador despache desde la factura (§3.3), no desde
el pedido — si tu UI puede detectar que ya existe una factura vinculada al pedido, ocultá este
botón y mostrá en su lugar un link a la factura con su propio CTA de despacho.

### 4.3 Cotizaciones — nada que construir, solo contexto

Facturar desde una cotización ahora manda `update_stock: 1` correctamente cuando el despacho
está apagado (antes no lo mandaba y ERPNext lo trataba como `0`, dejando la venta sin descontar
inventario — bug silencioso). No hay cambio de shape de request/response ni de UI. Se documenta
acá solo para que quede constancia de que el comportamiento de "facturar desde cotización" ahora
es consistente con "facturar desde pedido" y "factura directa".

---

## 5. Compras → Abastecimiento (multi-pedido)

### 5.1 Concepto

Cuando hay pedidos de venta comprometidos con clientes pero sin stock suficiente para cumplirlos,
el negocio necesita comprar exactamente lo que falta. Esta funcionalidad consolida **líneas
pendientes de comprar de varios pedidos** en una sola orden de compra a un proveedor, sin
mezclar entre sí las cantidades de pedidos distintos (cada línea de la orden de compra resultante
queda vinculada a su pedido de origen — importante para trazabilidad y para que la reserva de
stock nativa de ERPNext, al recibir la mercancía, sepa para cuál pedido es).

### 5.2 Pantalla nueva: "Pendientes de comprar" — `GET /compras/ordenes/pendientes-abastecimiento`

Vista de trabajo, similar en espíritu a §2.3 pero del lado de compras. Query params: `itemCode`,
`customer` (opcionales), más paginación. Cada fila:

```json
{
  "salesOrder": "SAL-ORD-2026-00007",
  "transactionDate": "2026-01-10",
  "customer": "CUST-0001",
  "customerName": "Juan Pérez",
  "itemCode": "ITEM-0001",
  "itemName": "Producto X",
  "warehouse": "Almacén Principal - EMP",
  "rate": 250,
  "qtyPendiente": 10
}
```

Viene **ya ordenado FIFO por `transactionDate`** (el pedido más antiguo primero) — respetá ese
orden en la tabla, es información de negocio (prioridad de atención), no la reordenes
arbitrariamente por otra columna sin que el usuario lo pida explícitamente.

**Diseño recomendado**: tabla con selección múltiple (checkboxes) por fila, agrupable
visualmente por `itemCode` para que el operador vea de un vistazo cuánto se necesita comprar de
cada artículo en total, aunque venga de pedidos distintos. Un botón "Generar orden de compra" que
tome las filas seleccionadas y arme el body de §5.3. Si el operador selecciona filas de
artículos/pedidos distintos con **un solo proveedor** (el flujo asume un proveedor por orden), el
formulario de destino debe pedir el proveedor una sola vez.

### 5.3 Crear la orden consolidada — `POST /compras/ordenes/desde-pedidos`

```json
{
  "supplier": "PROV-0001",
  "items": [
    { "salesOrder": "SAL-ORD-2026-00007", "itemCode": "ITEM-0001" },
    { "salesOrder": "SAL-ORD-2026-00009", "itemCode": "ITEM-0001" }
  ],
  "transactionDate": "2026-01-15",
  "confirmarMargenNegativo": false
}
```

- `items`: pares `(salesOrder, itemCode)` de las filas seleccionadas en §5.2 — **no se manda
  cantidad**, el servidor toma automáticamente todo el pendiente de esa línea (`qty - ordered_qty`
  al momento de la llamada). Si el operador quiere comprar menos de lo pendiente en esta orden,
  no hay forma de indicarlo en este endpoint — tendría que usar la creación manual de orden de
  compra normal en su lugar. No inventes un campo `qty` que el backend no acepta.
- `transactionDate`: opcional, default hoy.
- `confirmarMargenNegativo`: ver §5.4, el flujo de dos pasos.

### 5.4 Alerta de margen negativo — flujo de confirmación en dos pasos

**Esto es lo más importante de esta pantalla, prestale atención.** Antes de crear la orden, el
servidor compara el costo de compra (rate del proveedor) contra el precio al que se le vendió
esa mercancía al cliente en el pedido original. Si para alguna línea el costo de compra es **igual
o mayor** al precio de venta (comprar más caro de lo que se le va a cobrar al cliente — margen
negativo o nulo), el servidor **no crea la orden** en el primer intento:

```json
{
  "success": true,
  "data": {
    "requiereConfirmacion": true,
    "warnings": [
      {
        "itemCode": "ITEM-0001",
        "salesOrder": "SAL-ORD-2026-00007",
        "precioVenta": 250,
        "costoCompra": 280,
        "margen": -30
      }
    ],
    "message": "..."
  }
}
```

**Flujo de UI obligatorio**:

1. Primer submit del formulario: `confirmarMargenNegativo` no se manda (u omitido/false).
2. Si la respuesta trae `requiereConfirmacion: true`, **no está creada la orden todavía** — mostrar
   un modal de confirmación claro, con una tabla listando cada `warnings[]` (artículo, pedido,
   precio de venta vs. costo de compra, y el margen resultante en rojo si es negativo). Redactar
   el modal para que quede clarísimo que comprar así implica perder dinero en esa venta
   específica — esto es una alerta de negocio real, no un tecnicismo a esconder en un tooltip.
3. Si el operador confirma explícitamente ("Sí, crear de todas formas"), reenviar el mismo
   request con `confirmarMargenNegativo: true`. Recién ahí el servidor crea la orden.
4. Si el operador cancela, no reenviar nada — el formulario queda como estaba, nada se creó (el
   primer intento con `requiereConfirmacion: true` no tiene efectos secundarios, es seguro
   reintentar o abandonar).

No agregues tu propio cálculo de margen en el cliente para "adelantarte" al servidor — los
precios de venta reales viven en el `Sales Order Item` del servidor (no en una price list que el
cliente pueda tener cacheada desactualizada), así que la validación tiene que ser siempre la
respuesta del servidor, nunca una que vos calcules antes de enviar.

### 5.5 Errores específicos de este endpoint

| Situación | Código | Mensaje |
|---|---|---|
| Pedido referenciado no está sometido | 400 | "El pedido \"X\" debe estar sometido para poder comprarle mercancía." |
| Pedido sin cantidad pendiente para esos artículos | 400 | "El pedido \"X\" no tiene cantidad pendiente de comprar para: ..." |
| Ningún artículo con pendiente | 400 | "Ningún artículo indicado tiene cantidad pendiente de comprar." |

---

## 6. Transferencias y Recepción de Mercancía — nuevas validaciones

### 6.1 Transferencias — no mover stock reservado

`POST /transferencias` (crear una transferencia entre almacenes) ahora valida, **por cada línea**,
que la cantidad a transferir no exceda `actual_qty - reserved_stock` del almacén de origen — el
mismo cálculo de "disponible real" que usa el módulo de despachos (V3, §2.13). Si una línea
excede lo disponible (porque parte del stock está reservado para un pedido de otro cliente), el
servidor rechaza con 400 y el mismo formato de mensaje que en despachos:

```
"Stock insuficiente o reservado para otro cliente: "ITEM-X" en el almacén "Y" — disponible N,
solicitado M. Verifique si hay reservas de stock (apartados o pedidos pendientes de recibir)
sobre este artículo."
```

**En la UI**: no hace falta prevalidar esto en el cliente (no tenés forma barata de calcular
`reserved_stock` sin pegarle a un endpoint) — simplemente mostrar el error del servidor tal cual
si el submit de la transferencia falla con este mensaje. Si querés dar mejor UX proactiva, podés
mostrar en el formulario de transferencia el campo `disponibleParaVender` que ya expone
`GET /inventory` (§7) para el artículo/almacén seleccionado, como ayuda visual antes de que el
operador intente la transferencia — pero la validación real siempre la hace el servidor al
enviar.

### 6.2 Este cambio aplica siempre, no solo con despacho activo

A diferencia de la mayoría de los cambios de este documento, **esta validación no depende de
`despachoHabilitado`** — protege reservas de apartados también en tenants sin despacho activo
(un apartado ya reserva stock vía `Stock Reservation Entry` independientemente del módulo de
despacho, ver §4.1). No la gatees por el flag.

### 6.3 Recepción de mercancía — mensaje de sobre-recepción traducido

Sin cambios de flujo ni de endpoints. Solo el **mensaje de error** cuando la cantidad recibida
excede el límite de tolerancia configurado (`Configuración > Inventario > % de tolerancia de
sobre-recepción de compra`) cambió de un mensaje técnico en inglés a español, ya explicativo:

```
"No se puede recibir: la cantidad supera el límite de sobre-recepción permitido (Configuración >
Inventario > "% de tolerancia de sobre-recepción de compra"). Ajuste la cantidad, aumente la
tolerancia, o pida el rol autorizado a recibir de más."
```

Si tu UI tenía lógica propia para detectar/traducir este error (parseando el mensaje en inglés de
ERPNext), **eliminala** — ya no hace falta, el servidor lo traduce. Mostrar el mensaje del 400 tal
cual.

### 6.4 Nuevo campo en Configuración: rol autorizado a recibir/entregar de más

Ver §8.4 — el campo `roleAllowedToOverDeliverReceive` vive en Ajustes de Inventario, relacionado
directamente con el mensaje de arriba.

---

## 7. Inventario — nuevos campos del `Bin`

### 7.1 Qué cambió

`GET /inventory` (listado de inventario) ahora:

1. **Ya no oculta artículos con stock físico en cero** — antes filtraba `actual_qty > 0`; ahora
   un artículo con `actual_qty = 0` pero con `reserved_qty > 0` (comprometido en un pedido
   pendiente de entregar) **aparece en el listado**. Si tu tabla de inventario tenía algún filtro
   implícito del lado del cliente replicando ese `> 0`, quitalo — ahora es responsabilidad del
   servidor decidir qué aparece, y hay casos legítimos de mostrar algo en cero físico.
2. Expone campos nuevos por artículo/almacén:

```json
{
  "...": "...campos existentes sin cambios (itemCode, warehouse, actualQty, etc.)...",
  "reservedQty": 3,
  "reservedStock": 2,
  "orderedQty": 5,
  "indentedQty": 0,
  "projectedQty": 6,
  "disponibleParaVender": 8
}
```

| Campo | Significado |
|---|---|
| `reservedQty` | Cantidad comprometida en pedidos de venta sometidos aún sin entregar (`Sales Order` pendiente). |
| `reservedStock` | Cantidad con **reserva nativa de ERPNext** sobre ese stock específico (`Stock Reservation Entry`) — subconjunto de lo comprometido que ya tiene stock físico apartado para un pedido concreto, no solo "prometido". Es este campo el que se usa en la validación V3 (§2.13, §6.1) para calcular lo realmente disponible. |
| `orderedQty` | Cantidad ya pedida a proveedores (orden de compra sometida, aún sin recibir). |
| `indentedQty` | Cantidad en solicitudes de material/compra pendientes (previo a orden de compra). |
| `projectedQty` | Proyección de ERPNext: `actualQty + orderedQty + indentedQty - reservedQty` (aproximado — es el cálculo nativo de ERPNext, no lo recalcules). |
| `disponibleParaVender` | **El campo más útil para la UI**: `actualQty - (reservedStock ?? 0)` — lo que realmente se le puede prometer a un cliente nuevo ahora mismo, descontando lo ya reservado. Usalo en vez de `actualQty` a secas en cualquier lugar donde la UI le diga al operador "cuánto hay disponible" (selector de artículos en Facturación/Pedidos/Despachos, por ejemplo), si tenés espacio para ese cambio sin romper el flujo actual de esas pantallas — como mínimo, mostralo en la pantalla de Inventario. |

### 7.2 No es un cambio gateado por el flag

Estos campos existen siempre, independientemente de `despachoHabilitado` — son datos del `Bin`
que ERPNext mantiene para cualquier tenant. Tiene sentido mostrarlos siempre que haya espacio en
la tabla de Inventario (agregalos como columnas opcionales/expandibles si la tabla ya está
llena, no es necesario que estén todos visibles por default).

---

## 8. Configuración

### 8.1 Nueva sección: Despacho

En la pantalla de Configuración (donde ya vive el resto de ajustes de Facturación — NCF, POS,
etc.), agregar una card/sección "Despacho (Delivery Note)" con:

- Estado actual: leído de `despachoHabilitado` (§1.1).
- Descripción corta explicando qué hace (podés basarte en §0.1 para la redacción, en tono
  breve — "Separa la entrega física de inventario de la factura. Al activarlo, las facturas
  nuevas dejan de descontar inventario; la salida física se registra con un despacho (Delivery
  Note).").
- Un botón que alterna entre "Activar" y "Desactivar" según el estado actual.

### 8.2 Activar — `POST /config/despacho/habilitar`

Sin body. Éxito:

```json
{ "success": true, "data": { "message": "Despacho habilitado. Las facturas nuevas dejarán de descontar inventario — la salida física se registrará con un Delivery Note." } }
```

Mostrar este mensaje en un toast/confirmación, y **refrescar el store del flag** (volver a pedir
`GET /config/facturacion`, §1.3) antes de que el usuario navegue — así el menú "Despachos" aparece
sin necesidad de recargar la página. Es **idempotente** del lado servidor (activar dos veces no
rompe nada), pero no hace falta que el frontend lo llame más de una vez por click.

Detrás de este botón el servidor también activa 3 ajustes internos de `Stock Settings` de ERPNext
(reserva de stock, reserva parcial, auto-reserva al recibir compra) — no requieren ningún input ni
confirmación adicional del operador, es transparente. No los expongas como checkboxes separados a
menos que el negocio pida explícitamente poder desactivar alguno de forma independiente — hoy es
un solo botón, un solo efecto.

### 8.3 Desactivar — `POST /config/despacho/deshabilitar`

Sin body. Puede fallar con **409** si hay trabajo de despacho a medias que quedaría huérfano:

```json
{
  "message": "No se puede desactivar el despacho: 2 despacho(s) en borrador; 1 pedido(s) pendiente(s) de despacho. Despache o cancele los documentos pendientes antes de desactivarlo.",
  "details": {
    "despachosBorrador": ["MAT-DN-2026-00012", "MAT-DN-2026-00013"],
    "pedidosPendientes": ["SAL-ORD-2026-00007"],
    "facturasPendientesDespacho": [],
    "reservasVivas": []
  }
}
```

**Manejo obligatorio del 409**: no lo muestres como un simple mensaje de error — el `details`
trae listas de IDs concretos que el operador necesita resolver. Mostrar un modal/panel con cada
categoría no vacía de `details` como una lista de links navegables (a Despachos, Pedidos,
Facturación o al reporte de Reservas según corresponda), para que el usuario pueda ir
directamente a resolver cada bloqueo sin tener que adivinar dónde buscar. Las cuatro categorías
posibles:

| Campo en `details` | Qué representa | A dónde navegar |
|---|---|---|
| `despachosBorrador` | IDs de `Delivery Note` en Borrador | Detalle de cada despacho (§2.5) |
| `pedidosPendientes` | IDs de `Sales Order` sometidos con estado "por entregar" | Detalle de cada pedido |
| `facturasPendientesDespacho` | IDs de `Sales Invoice` con `update_stock=0` que aún tienen líneas sin despachar completamente | Detalle de cada factura, con el CTA "Despachar" de §3.3 |
| `reservasVivas` | Arreglo de `{ id, status }` de `Stock Reservation Entry` sin entregar del todo | Reporte de Reservas (§9.3) filtrado por ese ID, si el reporte soporta ese filtro; si no, mostrar el ID y el status tal cual |

Si `bloqueos.length === 0` de tu lado no aplica — el 409 solo llega cuando hay al menos un
bloqueo, así que siempre vas a tener al menos una categoría no vacía en `details` cuando manejes
este error.

Éxito (200): `{ "success": true, "data": { "message": "Despacho desactivado" } }` — refrescar el
store del flag igual que en §8.2.

Si el flag ya estaba desactivado y se intenta desactivar de nuevo, 409 distinto y más simple:
`"El despacho ya está desactivado para este tenant."` — no debería ocurrir normalmente si tu UI
solo muestra el botón "Desactivar" cuando el estado local es activo, pero manejalo igual por si
el store quedó desincronizado entre pestañas.

### 8.4 Nuevo campo en Ajustes de Inventario: `roleAllowedToOverDeliverReceive`

En la sección de Configuración → Inventario (donde ya vive el ajuste de "% de tolerancia de
sobre-recepción/sobre-entrega", si existe en tu UI actual — si no existe todavía esa sección,
puede que este campo llegue como parte de un formulario ya existente de ajustes de stock, revisá
el `openapi.json` para el endpoint exacto `GET`/`PUT` de settings), agregar un campo:

- **Label sugerido**: "Rol autorizado para recibir/entregar de más"
- **Tipo**: selector de un Role de ERPNext (string), opcional.
- **Ayuda contextual**: "Los usuarios con este rol pueden recibir compras o despachar ventas por
  encima del porcentaje de tolerancia configurado, sin que el sistema lo bloquee."

Se lee y escribe en el mismo endpoint de ajustes de stock que ya uses (campo
`roleAllowedToOverDeliverReceive` en el DTO — confirmar el path exacto en `openapi.json`, es
parte del bloque de "Stock Settings" que ya expone `GET/PUT /config/*` para inventario).

---

## 9. Reportes — grupo nuevo "Despacho"

Cuatro reportes nativos nuevos, todos bajo `GET /reportes/despacho/*`, gateados por
`despachoHabilitado` en el menú (§1.2) y cada uno con su propia acción de permiso
(`reportes.despacho.<nombre>.ver`). Son reportes **nativos de ERPNext** expuestos tal cual — no
tienen filtros ni columnas custom del BFF más allá de lo que ERPNext ya define, así que el
frontend simplemente arma una tabla/vista a partir de lo que el endpoint devuelve (confirmá el
shape exacto de columnas en el `openapi.json`, puede variar según la versión de ERPNext del
servidor).

### 9.1 Margen real — `GET /reportes/despacho/margen`

Basado en el reporte nativo **Gross Profit** de ERPNext. Margen real por factura/artículo,
calculado **a posteriori con el costo real** (no el costo estimado al momento de vender) — útil
para detectar ventas que terminaron con menos margen del esperado, complementario a la alerta de
margen negativo en compras (§5.4), que es *preventiva* (antes de comprar); este reporte es
*retrospectivo* (después de vender). Query params: los mismos filtros de ventas que ya uses en
otros reportes de facturación (`VentasFilterDto` en el `openapi.json` — típicamente rango de
fechas, cliente, sucursal).

### 9.2 Reservas de stock — `GET /reportes/despacho/reservas`

Basado en **Reserved Stock** de ERPNext. Detalle de `Stock Reservation Entry` vigentes en el
rango — útil como vista operativa de "qué está comprometido ahora mismo y para quién". Es el
reporte al que conviene enlazar desde `reservasVivas` en el 409 de desactivar despacho (§8.3).
Filtros: `InventoryReportFilterDto` (almacén, rango de fechas — confirmar en `openapi.json`).

### 9.3 Faltantes — `GET /reportes/despacho/faltantes`

Basado en **Item Shortage Report** de ERPNext. Artículos con `projected_qty < 0` en un almacén —
es decir, comprometidos por encima de lo que hay más lo que viene en camino. Complementa
directamente a la pantalla de Abastecimiento (§5): este reporte responde "qué me está faltando en
general", mientras que "Pendientes de comprar" (§5.2) responde "qué pedido específico está
generando ese faltante". Vale la pena, si el diseño lo permite, poner un link cruzado entre ambas
pantallas (desde una fila de faltante, ir a §5.2 filtrado por ese `itemCode`).

### 9.4 Pendientes de comprar — `GET /reportes/despacho/pendientes-compra`

Basado en **Pending SO Items For Purchase Request** de ERPNext, la vista nativa equivalente
(aunque no idéntica en columnas) a la pantalla custom de §5.2 — este es el reporte "de solo
lectura, vista rápida", mientras que §5.2 es la pantalla accionable que genera la orden de compra.
Sin query params (`GET /reportes/despacho/pendientes-compra` no acepta filtros — confirmá en el
controller/`openapi.json` si esto cambió).

---

## 10. Checklist de QA end-to-end (antes de dar por cerrado el trabajo)

Con un tenant de prueba con `despachoHabilitado` en `false` primero, y después en `true`:

**Con el flag apagado:**
- [ ] El menú no muestra Despachos, Abastecimiento, ni Reportes de Despacho.
- [ ] Facturar y confirmar un pedido sigue descontando inventario normalmente (comportamiento
      histórico, sin cambios visibles).
- [ ] Un apartado sometido en un pedido con stock disponible muestra `stockReserved: true` sin
      warning.
- [ ] Un apartado sometido sin stock disponible muestra `stockReserved: false` con un `warning`
      legible, y el submit no falla (no es un error 500).
- [ ] Transferir stock reservado por un apartado a otro almacén falla con el mensaje de V3.
- [ ] Configuración → Despacho muestra "Activar despacho".

**Activando el flag** (`POST /config/despacho/habilitar` desde Configuración):
- [ ] El toast de éxito aparece y el menú se actualiza sin recargar la página (aparecen Despachos,
      Abastecimiento, Reportes de Despacho).

**Con el flag prendido:**
- [ ] Crear y someter una factura — verificar que NO aparece movimiento de Stock Ledger asociado
      hasta que se despache.
- [ ] Desde el detalle de esa factura, el botón "Despachar" crea un despacho en Borrador con las
      líneas correctas.
- [ ] Asignar tracking a una línea con artículo serializado/loteado, y confirmar que "Someter" se
      habilita recién después.
- [ ] Someter el despacho — verificar que ahora sí hay movimiento de Stock Ledger.
- [ ] Facturar un despacho creado directamente (sin pedido) vía "Facturar" — llega a una factura
      en Borrador.
- [ ] Cancelar una factura que ya tiene un despacho sometido encima → error claro, no permite.
- [ ] Cancelar el despacho generado desde esa factura → error claro (factura viva), luego
      cancelar/eliminar la factura y confirmar que ahora sí se puede cancelar el despacho.
- [ ] Crear un despacho, facturarlo (§2.9), y confirmar que "Crear Devolución" sobre ese despacho
      redirige a Devoluciones con el `invoiceId` correcto en vez de fallar en seco.
- [ ] Desactivar el flag con un despacho en Borrador pendiente → 409 con `details` completo,
      modal con links navegables a cada bloqueo.
- [ ] Resolver todos los bloqueos y desactivar exitosamente.
- [ ] Pantalla de Abastecimiento: seleccionar líneas de dos pedidos distintos del mismo artículo,
      generar orden — si hay margen negativo, confirmar que aparece el modal de confirmación
      antes de crear, y que reenviar con `confirmarMargenNegativo: true` sí crea la orden.
- [ ] Los 4 reportes de Despacho cargan sin error con datos del tenant de prueba.
- [ ] Inventario muestra los campos nuevos (`reservedQty`, `disponibleParaVender`, etc.) y ya no
      oculta artículos con `actualQty = 0` pero `reservedQty > 0`.

No hay harness de e2e automatizado del lado del backend para este módulo (verificación manual
contra un tenant real, documentada en el histórico de implementación) — este checklist es, por
ahora, la referencia más cercana a un plan de pruebas formal; ejecutalo a mano contra un tenant de
staging antes de considerar el trabajo terminado.
