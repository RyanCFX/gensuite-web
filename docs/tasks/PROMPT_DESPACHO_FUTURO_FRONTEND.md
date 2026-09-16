# Prompt para agente de frontend — Despacho a Futuro Configurable, Confirmación de Stock y Detalle de Inventario por Artículo

> **Para quien recibe este documento.** Esto **no** es un módulo nuevo — es una extensión del
> módulo de despacho que el frontend **ya tiene construido** (`/despachos`, la pantalla de
> Facturación con despacho habilitado, etc.). Describe 4 cambios de comportamiento y contrato que
> hay que reflejar en pantallas que ya existen, más 1 mejora en la pantalla de Inventario. Todo lo
> descrito acá ya está **implementado, probado y desplegado** del lado del backend — no hay nada
> pendiente de negociar con el equipo de backend salvo lo que se marque explícitamente.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable
> en Scalar en `https://gensapi.ryancfx.click/api/docs`). **Regenerá tu cliente/tipos desde ese
> archivo antes de empezar** — ahí está el shape exacto y tipado de cada campo nuevo
> (`despachoFuturo` en `POST /invoices`, el body de `PUT /config/despacho/futuro`, el query param
> `itemCode` de `GET /inventory`). Este documento no reemplaza el spec: explica el **flujo de
> negocio**, qué pantalla toca qué campo, en qué orden pasan las cosas, qué mostrar en cada estado
> y cómo manejar cada error. Si este documento y el `openapi.json` llegaran a diferir en el nombre
> exacto de un campo, **gana el `openapi.json`** — pero no debería pasar: todo lo escrito acá se
> extrajo directamente del código fuente ya mergeado, no de un diseño preliminar.
>
> Documento relacionado que asumimos ya tenés implementado, sin cambios en este documento:
> `PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos, `GET /me/permissions` → `data.acciones`).
> Este cambio agrega **una sola acción nueva**: `config.despacho.configurar` (ver §6).

---

## 0. Resumen ejecutivo — qué cambia y qué NO cambia

| | Antes de este cambio | Después de este cambio |
|---|---|---|
| Con despacho habilitado, ¿se puede facturar y despachar en el momento (venta mostrador con entrega inmediata)? | **No** — toda factura nueva pasaba a ser "a futuro" (`update_stock=0`) sin excepción | **Sí** — cada venta elige, con `despachoFuturo` en `POST /invoices` |
| ¿La empresa puede prohibir el despacho a futuro por venta? | No existía el concepto | Sí — `Facturacion Config.despacho_futuro_habilitado` |
| Al marcar una venta como despacho a futuro, ¿siempre se reserva el stock contra otros clientes? | Sí, siempre, sin opción | Configurable — `despacho_futuro_bloquea_venta` |
| Al facturar una venta inmediata con artículos de serial/lote, ¿quién elige el serial exacto? | Siempre la persona que factura, a mano, antes de someter | Configurable: puede auto-asignarlo el sistema — `despacho_confirmar_stock_asigna_seriales` |
| Ver, para UN artículo puntual, cuánto hay, cuánto está comprado y no ha llegado, cuánto está vendido en pedidos abiertos, y cuánto es realmente vendible ahora | La info ya existía en la lista general de inventario, pero **no se podía pedir de un solo artículo** — había que traer todo el listado y buscar | `GET /inventory?itemCode=X` — mismo shape de siempre, filtrado a un artículo |

**Lo que NO cambia:**
- El resto del ciclo de vida de una factura (`POST /invoices`, `.../submit`, `.../cancel`, etc.) es
  exactamente igual.
- El módulo `/despachos` (crear, editar, someter, cancelar, facturar, devolver un despacho) no
  tiene ningún endpoint nuevo ni renombrado — solo cambia si, al crearse, reserva stock o no
  (invisible para el flujo de la pantalla, solo cambia si aparece o no un aviso de reserva).
- Los tenants que **no** tienen despacho habilitado no ven ningún cambio de comportamiento en
  absoluto. Todo lo de este documento es condicional a `despacho_habilitado = true`.
- Los tenants que **ya** tenían despacho habilitado antes de este cambio **no ven ningún cambio de
  comportamiento a menos que un admin toque la configuración nueva a propósito** — los defaults se
  eligieron exactamente para preservar el comportamiento previo (todo a futuro, todo reservado).

---

## 1. Gating: cuándo mostrar todo esto

Todo lo de este documento **solo aplica a tenants con despacho habilitado**. Pedí
`GET /api/v1/config/facturacion` (mismo endpoint que ya usás para leer el resto de la
configuración de facturación) y mirá `data.despachoHabilitado`:

```jsonc
// GET /api/v1/config/facturacion
{
  "success": true,
  "data": {
    // ...el resto de los campos que ya conocés (roles de cancelación, POS, impresión, etc.)...
    "despachoHabilitado": true,
    "despachoFuturoHabilitado": true,
    "despachoFuturoBloqueaVenta": true,
    "despachoConfirmarStockAsignaSeriales": false
  }
}
```

- **`despachoHabilitado: false`** → no muestres NADA de lo que sigue. Ni el selector de
  "despacho a futuro" en el formulario de factura, ni la sección de configuración nueva. El
  tenant se comporta exactamente como si este cambio no existiera.
- **`despachoHabilitado: true`** → mostrá el selector "despacho a futuro" en el formulario de
  factura (§3) y la sección de configuración nueva (§2). El comportamiento exacto de esas
  pantallas depende de los otros 3 flags, detallado abajo.

Estos 4 campos viven en el **mismo** `Facturacion Config` que ya conocés — no es un doctype nuevo,
no es una pantalla nueva de configuración, es una sección más dentro de la que ya existe para
"Despacho (Delivery Note)".

---

## 2. Pantalla de Configuración — sección "Despacho"

Ya tenés (asumimos) los dos botones existentes "Habilitar despacho" / "Deshabilitar despacho"
(`POST /config/despacho/habilitar` y `POST /config/despacho/deshabilitar`, sin cambios). Agregá,
**dentro de esa misma sección, visible solo si `despachoHabilitado: true`**, tres controles nuevos
que se guardan con un endpoint dedicado:

### 2.1 `PUT /config/despacho/futuro`

**Request** — los tres campos son independientes y opcionales; mandá solo los que el usuario tocó
(no hace falta mandar los tres siempre):

```jsonc
{
  "futuroHabilitado": true,
  "futuroBloqueaVenta": true,
  "confirmarStockAsignaSeriales": false
}
```

Si no mandás ninguno de los tres, el backend responde `400` — "Indique al menos uno de:
futuroHabilitado, futuroBloqueaVenta, confirmarStockAsignaSeriales." (no debería pasarte nunca si
el formulario solo llama a este endpoint cuando el usuario cambió al menos un switch).

**Response:**

```jsonc
{ "success": true, "data": { "message": "Configuración de despacho a futuro actualizada" } }
```

Después de un `PUT` exitoso, **volvé a pedir `GET /config/facturacion`** para refrescar los 3
valores en pantalla — no asumas que el PUT devuelve el estado final (solo devuelve un mensaje).

### 2.2 Los tres switches — texto exacto sugerido para cada uno

| Switch | Campo | Default | Texto sugerido | Qué controla en la práctica |
|---|---|---|---|---|
| 1 | `futuroHabilitado` | `true` | **"Permitir despacho a futuro"** — "Si está activo, al facturar se puede elegir despachar ahora o después. Si está apagado, toda venta nueva se despacha de inmediato (se confirma que exista stock físico antes de facturar)." | Habilita/oculta el selector de §3 en el formulario de factura |
| 2 | `futuroBloqueaVenta` | `true` | **"El despacho a futuro reserva el stock"** — "Si está activo, mientras una venta a futuro no se despache, esas unidades no se le pueden vender a otro cliente. Si está apagado, la venta a futuro queda solo como una promesa — el mismo stock sigue disponible para cualquier otro cliente hasta que alguien lo despache primero." | Si al crear un despacho pendiente (`POST /despachos/desde-pedido/:id` o `.../desde-factura/:id`) se reserva stock (Stock Reservation Entry) o no |
| 3 | `confirmarStockAsignaSeriales` | `false` | **"Auto-asignar seriales/lotes al confirmar stock"** — "Solo aplica a ventas inmediatas (no a futuro). Si está activo, al someter la factura el sistema elige automáticamente los seriales/lotes disponibles. Si está apagado (recomendado si necesitás elegir manualmente cuál unidad exacta se vende), hay que asignarlos a mano antes de someter." | Si `InvoicesService.submit()` auto-asigna seriales/lotes o exige que ya estén asignados |

**Orden recomendado de estos 3 switches en la UI**: el 1 arriba (porque los otros dos solo tienen
sentido si el 1 está activo — podés atenuarlos/deshabilitarlos visualmente cuando `futuroHabilitado`
esté en `false`, aunque el backend los acepta igual — no da error, simplemente no tienen efecto
hasta que se vuelva a activar el primero).

**Permiso:** `config.despacho.configurar` (acción nueva, ver §6) — mismo criterio de gating de
botones que el resto de la pantalla de Configuración.

---

## 3. Formulario de Factura — elegir despacho a futuro por venta

### 3.1 El campo nuevo

`POST /invoices` (y `PUT /invoices/:id` mientras la factura siga en Borrador) acepta un campo
nuevo, **opcional**:

```jsonc
{
  // ...todos los campos que ya mandás hoy (customer, items, postingDate, etc.)...
  "despachoFuturo": false
}
```

- **Mostrar el selector solo si**: `despachoHabilitado: true` **y** `despachoFuturoHabilitado: true`
  (ambos de `GET /config/facturacion`, ver §1). Si `despachoFuturoHabilitado` es `false`, **no
  mandes el campo en absoluto** — ni siquiera `despachoFuturo: false` (aunque mandarlo en `false`
  no da error, ver tabla de abajo; lo más simple es omitirlo del todo cuando el selector no se
  muestra).
- **UI sugerida**: dos opciones tipo toggle/radio en el formulario de factura, justo antes o
  después del bloque de líneas: **"Despachar ahora"** (`despachoFuturo: false`) / **"Despachar
  después"** (`despachoFuturo: true`). Si no mostrás el selector (porque no aplica), no mandes el
  campo — el backend usa su propio default (ver tabla).

### 3.2 Qué significa cada valor — tabla de verdad completa

| `despachoFuturo` enviado | ¿Qué pasa? | ¿Cuándo pasa esto? |
|---|---|---|
| `false` (explícito) | **Inmediato**: la factura descuenta inventario al someterse (`update_stock=1`). Antes de someter, el backend confirma que existan físicamente las unidades en el almacén de cada línea (mismo chequeo de siempre, "Stock insuficiente..."). Si el tenant activó `confirmarStockAsignaSeriales`, además auto-asigna seriales/lotes en ese momento (ver §4). | Siempre — no depende de `despachoFuturoHabilitado` |
| `true` (explícito) | **A futuro**: la factura NO descuenta inventario al someterse (`update_stock=0`) — la salida física se hace después con `POST /despachos/desde-factura/:id`. No se valida stock físico al someter. | Solo si `despachoHabilitado: true` **y** `despachoFuturoHabilitado: true` — si no, `400` (ver §3.3) |
| **omitido** (no se manda el campo) | Se conserva el comportamiento de siempre del tenant: **a futuro** si el despacho está habilitado y permitido, **inmediato** si no. Es el default seguro para no romper nada si tu pantalla todavía no mostró el selector. | — |

### 3.3 Error si se pide despacho a futuro sin permiso

| Situación | HTTP | Mensaje exacto |
|---|---|---|
| `despachoFuturo: true` y el tenant **no tiene el despacho habilitado en absoluto** | `400` | `No se puede pedir despacho a futuro: el módulo de despacho no está habilitado para este tenant (ver POST /config/despacho/habilitar).` |
| `despachoFuturo: true` y el despacho está habilitado pero **`despachoFuturoHabilitado` está apagado** | `400` | `Este tenant no permite despacho a futuro por venta (ver PUT /config/despacho/futuro). Toda venta se despacha de inmediato: confirme la existencia física en el almacén.` |

Ninguno de los dos debería aparecer nunca si el gating de §3.1 está bien hecho (no muestres el
selector, o no lo dejes en `true`, si `despachoFuturoHabilitado` es `false`). Si lo ves en
producción, es una señal de que el selector se mostró quedó habilitado cuando no debía.

### 3.4 Respuesta de la factura — nada nuevo que leer

La respuesta de `POST /invoices` / `GET /invoices/:id` **no agrega ningún campo nuevo** — para
saber si una factura terminó siendo a futuro o inmediata, mirá el campo que ya usás:
`update_stock` no se expone directamente, pero si tu pantalla necesita saberlo, la señal
equivalente es si la factura aparece o no como pendiente de despacho en
`GET /despachos/pendientes` (endpoint ya existente, sin cambios).

---

## 4. Confirmación de stock y auto-asignación de seriales/lotes (ventas inmediatas)

Esto **no es un endpoint nuevo** — es un comportamiento que ya corre dentro de
`POST /invoices/:id/submit`, sin que el frontend tenga que llamar nada extra. Se activa
automáticamente cuando la factura resultó **inmediata** (§3.2).

### 4.1 Confirmación de existencia física (ya existía, sin cambios de contrato)

Si al someter no hay suficiente stock físico en el almacén de alguna línea, `POST
/invoices/:id/submit` responde `400` con el mismo mensaje de siempre:

```
Stock insuficiente: se necesitan 5 unidades de PROD-001 (Laptop HP) en el almacén Principal - JBC
a la fecha del documento (2026-09-14); disponible en ese momento: 3. Ingrese el inventario con una
fecha igual o anterior, ajuste la fecha del documento, o active "Permitir stock negativo" en
Configuración de Inventario.
```

**Lo único que cambia es CUÁNDO se activa este chequeo**: antes, se activaba siempre que
`despachoHabilitado` estuviera apagado; ahora se activa siempre que la venta **resultó inmediata**
(`despachoFuturo: false` o resuelto como tal), sin importar si el despacho está habilitado o no
para el tenant. El mensaje y el manejo de error de tu pantalla no cambian.

### 4.2 Auto-asignación de seriales/lotes (`despachoConfirmarStockAsignaSeriales: true`)

Si el tenant activó este switch (§2.2, punto 3), y la factura es inmediata, y alguna línea tiene un
artículo con serial o lote **y todavía no se le asignó uno** (no llamaste
`POST /invoices/:id/asignar-serial-lote` antes de someter), el backend elige automáticamente
seriales/lotes disponibles (el mismo criterio FIFO/FEFO — más antiguo primero, o por vencimiento
más próximo para lotes — que usa el propio ERPNext) **en el momento de someter**, sin que el
usuario tenga que elegir cuál unidad puntual se vende.

**Qué implica para tu formulario de factura:**

- Con este switch **activo**: podés **ocultar u opcionalizar** el paso de "elegir serial/lote" —
  el usuario puede facturar un artículo con tracking sin haber llamado
  `POST /invoices/:id/asignar-serial-lote`, y el submit igual funciona (a menos que no haya
  suficiente disponible, en cuyo caso cae en el mismo error de §4.1 — "Stock insuficiente").
- Con este switch **apagado** (default): **nada cambia** respecto a lo que ya tenés — seguí
  exigiendo que el usuario asigne serial/lote a mano antes de someter, exactamente como hoy.
- Si querés seguir ofreciendo la asignación manual aunque el switch esté activo (por si el usuario
  quiere elegir una unidad específica en vez de dejar que el sistema elija), no hay ningún
  problema: si la línea YA tiene un `serial_and_batch_bundle` asignado a mano, la auto-asignación
  la deja tal cual — nunca pisa una asignación manual ya hecha.
- **Ni la respuesta de `submit()` ni la de `GET /invoices/:id` exponen hoy qué serial/lote quedó
  asignado** (ni el elegido a mano, ni el auto-asignado) — el detalle de factura no trae ese campo
  en absoluto. Si necesitás mostrárselo al usuario, es un pedido aparte al backend (exponer
  `items[].serialAndBatchBundle` o equivalente en la respuesta), no algo que puedas leer hoy con
  este cambio.

---

## 5. Bloqueo de venta a otros clientes (`despachoFuturoBloqueaVenta`)

Esto afecta al módulo `/despachos` que ya tenés — específicamente a los dos endpoints que crean un
despacho **pendiente** a partir de un pedido o una factura ya facturados a futuro:

- `POST /despachos/desde-pedido/:soId`
- `POST /despachos/desde-factura/:siId`

**No hay ningún campo nuevo en el request de estos dos endpoints.** El comportamiento cambia solo
en si, al crear ese despacho en Borrador, el backend reserva stock contra otros clientes o no —
decidido por `despachoFuturoBloqueaVenta`, sin que el frontend tenga que mandar nada.

### 5.1 Con `despachoFuturoBloqueaVenta: true` (default — comportamiento de siempre)

Igual que hoy: se reserva la cantidad pendiente contra ese Pedido/Factura (Stock Reservation Entry
nativa). Si la reserva no se pudo hacer del todo (por ejemplo, "Enable Stock Reservation" está
apagado en ERPNext), la respuesta trae un campo `warning` — mismo comportamiento de siempre, sin
cambios:

```jsonc
{
  "success": true,
  "data": { /* el despacho recién creado, mismo shape de siempre */ },
  "warning": "No se pudo reservar stock automáticamente para todas las líneas pendientes..."
}
```

### 5.2 Con `despachoFuturoBloqueaVenta: false`

El despacho se crea exactamente igual (mismo Borrador, misma respuesta), pero **nunca aparece el
campo `warning` de reserva** — porque directamente no se intenta reservar nada. El stock de esas
líneas sigue apareciendo como vendible para cualquier otro cliente (en `GET /inventory`, en el
`disponibleParaVender` de cualquier artículo) hasta que alguien lo despache de verdad con
`POST /despachos/:id/submit`.

**No hay ningún indicador visual obligatorio que agregar acá** — es un cambio de comportamiento
puramente de backend. Si querés, podés mostrar un aviso informativo en la pantalla de "Pedidos/
Facturas pendientes de despachar" del tipo *"Este stock no está reservado — otro cliente podría
comprarlo antes de que se despache"* cuando `despachoFuturoBloqueaVenta` sea `false` (leelo de
`GET /config/facturacion` una vez al cargar la pantalla, no por despacho individual).

---

## 6. Permisos

Una acción nueva en el catálogo (`GET /me/permissions` → `data.acciones`), mismo contrato de
siempre:

| Acción | Controla |
|---|---|
| `config.despacho.configurar` | El formulario/sección de §2 completa (los 3 switches y el botón "Guardar") |

Las acciones ya existentes `config.despacho.habilitar` / `config.despacho.deshabilitar` no
cambian. `config.facturacion.ver` (que ya usás para leer el resto de la configuración) es
suficiente para **leer** los 4 flags nuevos de `GET /config/facturacion` — no hace falta ningún
permiso nuevo solo para verlos.

---

## 7. Detalle de Inventario por Artículo

### 7.1 El filtro nuevo

`GET /inventory` (el mismo endpoint de siempre, el que alimenta tu pantalla general de
Inventario) acepta ahora un query param opcional:

```
GET /api/v1/inventory?itemCode=PROD-001
GET /api/v1/inventory?itemCode=PROD-001&warehouse=Principal%20-%20JBC
```

- **Sin `warehouse`**: devuelve una fila por cada almacén donde ese artículo tiene movimiento
  (una fila por combinación artículo+almacén, igual que la lista general).
- **Con `warehouse` además**: devuelve como máximo una fila (ese artículo, ese almacén).
- Los demás filtros existentes (`branch`, `category`, `brand`, `stockStatus`) se pueden seguir
  combinando con `itemCode`, aunque en la práctica para una pantalla de "detalle de un artículo"
  normalmente alcanza con `itemCode` solo (y opcionalmente `warehouse`).

### 7.2 Response — mismo shape de siempre, ningún campo nuevo

```jsonc
// GET /api/v1/inventory?itemCode=PROD-001
{
  "success": true,
  "data": {
    "items": [
      {
        "itemCode": "PROD-001",
        "itemName": "Laptop HP 15 pulgadas",
        "category": "Electrónicos",
        "brand": "HP",
        "warehouse": "Principal - JBC",
        "actualQty": 12,
        "valuationRate": 450.00,
        "standardRate": 650.00,
        "investmentValue": 5400.00,
        "saleValue": 7800.00,
        "potentialProfit": 2400.00,
        "reservedQty": 3,
        "reservedStock": 2,
        "orderedQty": 10,
        "indentedQty": 0,
        "projectedQty": 17,
        "disponibleParaVender": 10,
        "ubicaciones": []
      }
      // ...una fila más por cada otro almacén con movimiento de este artículo...
    ],
    "summary": {
      "totalInvestment": 5400.00,
      "totalSaleValue": 7800.00,
      "totalPotentialProfit": 2400.00,
      "totalItems": 1,
      "totalUnits": 12
    }
  },
  "meta": { "total": 1, "limit": 20, "offset": 0, "hasMore": false }
}
```

### 7.3 Qué es cada campo — mapeo exacto a lo que pediste ("existencias / ordenado / en pedido / disponible")

| Lo que pediste | Campo de la respuesta | Qué es exactamente | ¿Bloquea una venta nueva? |
|---|---|---|---|
| **Existencias** | `actualQty` | Lo que físicamente hay ahora mismo en ese almacén, según el Kardex/Stock Ledger. | — |
| **Cantidad ordenada** (comprada, en camino) | `orderedQty` | Suma de líneas de **Órdenes de Compra confirmadas** para este artículo que todavía no se recibieron. Es "lo que ya compraste y está por llegar". | No — informativo |
| **Cantidad en pedido** (vendida, pendiente de entregar) | `reservedQty` | Suma de líneas de **Pedidos de venta confirmados** para este artículo que todavía no se facturaron/entregaron del todo. Es "lo que ya vendiste pero todavía no salió del almacén". **Puramente informativo** — no bloquea nada; sirve para que, al armar una factura o un pedido nuevo, quien vende vea que ya hay compromisos sobre ese stock, aunque el sistema igual lo deje vender. | **No** — a propósito. Es la señal exacta que pediste: "informativo al momento de crear una factura o pedido, más no bloqueante" |
| **Disponible** (lo que de verdad se puede vender ahora) | `disponibleParaVender` | `actualQty` menos `reservedStock` — es decir, las existencias reales menos lo que **sí** está reservado en firme (por un Apartado, o por un despacho a futuro con `despachoFuturoBloqueaVenta: true`, ver §5). Esto es lo único que **si** afecta si una venta nueva se puede completar. | **Sí** |
| *(extra, no pedido pero ya viene)* | `reservedStock` | Lo mismo que se resta en `disponibleParaVender` — cuánto está reservado EN FIRME ahora mismo (Stock Reservation Entry real, no solo un pedido pendiente). Útil si querés mostrar el desglose completo en vez de solo el resultado final. | Sí (ya restado en `disponibleParaVender`) |
| *(extra, no pedido pero ya viene)* | `projectedQty` | Proyección nativa de ERPNext: `actualQty + orderedQty − reservedQty − indentedQty` aproximadamente — "cómo va a quedar el stock si todo lo pendiente se cumple". Opcional mostrarlo. | — |
| *(extra, no pedido pero ya viene)* | `indentedQty` | Cantidad pedida en **Solicitudes de Material** (Material Request) de compra, todavía sin convertir en Orden de Compra — un paso previo y más incierto que `orderedQty` ("se pidió que se compre", no "ya se compró"). Opcional mostrarlo. | — |

**Importante — no confundas `reservedQty` con `reservedStock`, son conceptualmente distintos y
los dos existen a propósito:**
- `reservedQty` = compromiso **blando**, de un Pedido de venta confirmado. Es el que pediste como
  "en pedido, informativo, no bloqueante".
- `reservedStock` = compromiso **duro**, de una reserva real (Stock Reservation Entry). Es el que
  SÍ resta de `disponibleParaVender`, y es el que se activa/desactiva con
  `despachoFuturoBloqueaVenta` (§5) cuando el compromiso viene de un despacho a futuro.

### 7.4 Dónde usar esto en la UI

- **Pantalla de detalle de un artículo** (si ya existe, o si vas a construir una): llamá a
  `GET /inventory?itemCode=X` y mostrá una tarjeta/tabla con las 4 columnas de arriba, una fila
  por almacén.
- **Selector de artículo dentro del formulario de Factura/Pedido**: al elegir un artículo, podés
  pedir `GET /inventory?itemCode=X&warehouse=Y` (el almacén ya resuelto de la línea) y mostrar un
  tooltip/subtexto tipo *"Disponible: 10 · En pedido: 3 (informativo)"* junto al campo de
  cantidad — sin bloquear nada si la cantidad pedida supera lo "disponible" (el propio submit de
  la factura ya se encarga de validar eso de verdad si corresponde, ver §4.1).
- **No** hace falta cambiar la pantalla de listado general de Inventario — ese endpoint ya
  mostraba estas columnas desde antes; el único cambio es que ahora también se puede pedir
  filtrado a un solo artículo.

---

## 8. Errores — tabla resumen para manejar en el cliente HTTP

| HTTP | Endpoint | Mensaje | Cuándo |
|---|---|---|---|
| 400 | `POST /invoices` | `No se puede pedir despacho a futuro: el módulo de despacho no está habilitado para este tenant (ver POST /config/despacho/habilitar).` | `despachoFuturo: true` sin despacho habilitado — no debería pasar si gateaste bien (§1) |
| 400 | `POST /invoices` | `Este tenant no permite despacho a futuro por venta (ver PUT /config/despacho/futuro). Toda venta se despacha de inmediato: confirme la existencia física en el almacén.` | `despachoFuturo: true` con `despachoFuturoHabilitado: false` — no debería pasar si gateaste bien (§3.1) |
| 400 | `POST /invoices/:id/submit` | `Stock insuficiente: se necesitan N unidades de X en el almacén Y...` | Venta inmediata sin suficiente stock físico — mensaje sin cambios, solo cambia cuándo se dispara (§4.1) |
| 400 | `PUT /config/despacho/futuro` | `Indique al menos uno de: futuroHabilitado, futuroBloqueaVenta, confirmarStockAsignaSeriales.` | Se llamó al endpoint sin mandar ningún campo — no debería pasar si el botón "Guardar" se deshabilita hasta que haya un cambio real |
| 403 | cualquiera de §2/§3 | Contrato genérico `PERMISO_INSUFICIENTE` de siempre | Falta `config.despacho.configurar` (§2) o el permiso de siempre sobre facturas (§3) |

---

## 9. Qué NO hacer / decisiones ya tomadas

- **No construyas un selector de "despacho a futuro" en el Pedido (Sales Order) ni en la
  Cotización.** La conversión automática Pedido→Factura (Apartados) y Cotización→Factura sigue el
  comportamiento por defecto del tenant sin pedir una elección explícita — no hay campo que mandar
  ahí todavía.
- **No agregues un indicador de "seriales auto-asignados" en la UI** salvo que quieras pedir el
  detalle de la factura después de someterla (§4.2) — el submit no devuelve esa información
  directamente.
- **No dupliques la validación de "stock insuficiente" en el cliente.** Podés dar un aviso suave
  con `disponibleParaVender` (§7.4) mientras se arma la factura, pero la validación real y
  vinculante sigue siendo la del backend al someter — no bloquees el botón de someter vos mismo
  basándote en `disponibleParaVender` de una lectura previa, que puede haber cambiado.
- **No expongas `reservedStock`/`projectedQty` como si fueran lo mismo que `reservedQty`** — son
  conceptos distintos a propósito (§7.3), y mostrarlos mezclados confundiría al usuario sobre qué
  es bloqueante y qué no.
- **No muestres la sección de configuración de §2 a un tenant sin despacho habilitado.**

---

## 10. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado.
- [ ] `GET /config/facturacion` — leídos y cacheados los 4 flags nuevos junto con el resto de la
      configuración que ya leías.
- [ ] Sección "Despacho" de Configuración: 3 switches nuevos (§2.2), gateados por
      `config.despacho.configurar`, visibles solo si `despachoHabilitado: true`, y que llaman a
      `PUT /config/despacho/futuro` mandando solo los campos tocados.
- [ ] Formulario de Factura: selector "Despachar ahora / Despachar después" (§3.1), visible solo
      si `despachoHabilitado && despachoFuturoHabilitado`, mandando `despachoFuturo` en
      `POST`/`PUT /invoices`.
- [ ] Los 2 mensajes de error de §3.3 mapeados de forma legible (no deberían dispararse si el
      gating está bien, pero cubrí el caso igual).
- [ ] Revisado el flujo de asignación de serial/lote en el formulario de Factura para que, con
      `despachoConfirmarStockAsignaSeriales: true`, no sea obligatorio pasar por
      `POST /invoices/:id/asignar-serial-lote` antes de someter (§4.2) — pero que siga
      funcionando si el usuario igual quiere elegir a mano.
- [ ] (Opcional) Aviso informativo en pantallas de despacho pendiente cuando
      `despachoFuturoBloqueaVenta: false` (§5.2).
- [ ] Pantalla/tooltip de detalle de artículo usando `GET /inventory?itemCode=` (§7), con las 4
      columnas mapeadas exactamente como en §7.3 (ojo con no confundir `reservedQty` con
      `reservedStock`).
- [ ] Verificado que un tenant con `despachoHabilitado: false` no ve ningún cambio de UI en
      absoluto respecto a como estaba antes de este documento.
