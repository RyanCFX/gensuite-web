# Prompt para el agente de frontend — Almacén de venta por sucursal, confirmar stock de despacho, y UOMs de compra/venta permitidas

Copia y pega este prompt completo al agente de frontend. Cubre **3 features de backend ya
implementadas y verificadas** (tests + `tsc` en verde) que hoy no tienen ninguna superficie de UI.

---

## Antes de empezar

El proyecto de frontend tiene un `openapi.json` con la documentación actualizada del API —
**ábrelo primero** y confirma ahí los schemas exactos (tipos, nullability, nombres de propiedad)
de cada endpoint mencionado en este documento. Lo que sigue es la descripción funcional completa
del comportamiento y el razonamiento detrás de cada decisión, no un reemplazo del schema — si
algo en `openapi.json` difiere de lo aquí descrito en un detalle menor de tipos, `openapi.json`
manda.

Este prompt cubre **tres features independientes entre sí** (se pueden implementar en cualquier
orden, o en paralelo):

1. **Almacén de venta por sucursal** (§1) — restringe de qué almacén puede salir una venta.
2. **Confirmar stock de un despacho pendiente** (§2) — depende conceptualmente de la #1 (es el
   mecanismo para resolver el problema que la #1 crea), pero es una pantalla/flujo aparte.
3. **UOMs de compra/venta permitidas** (§3) — completamente independiente, vive en Catálogo.

---

## 1. Almacén de venta por sucursal (opcional)

### 1.1 El problema que resuelve

Hoy una Sucursal puede tener varios almacenes (ej. un almacén de venta en el mostrador y un
depósito trasero), y una venta podía salir de **cualquiera** de ellos con tal de que perteneciera
a la sucursal. Eso significaba que si tenías 20 unidades de un producto pero solo 5 en el almacén
de venta y 15 en el depósito trasero, el sistema te dejaba vender las 20 igual — el software no
distinguía "está en el edificio" de "está físicamente disponible para entregar ahora mismo en el
mostrador".

Ahora se puede designar, **opcionalmente**, un almacén como "el" almacén de venta de una
sucursal. Con eso configurado: **toda venta de esa sucursal debe salir de ese almacén, sin
excepción**. Si en ese almacén no hay suficiente, hay que transferir stock hacia ahí primero
(desde cualquier otro almacén de la compañía) — no se puede vender desde otro almacén de la
misma sucursal como atajo.

**Es opcional por sucursal** — una sucursal sin almacén de venta configurado sigue funcionando
exactamente como hoy (cualquier almacén de la sucursal sirve, sin restricción nueva). No es un
cambio retroactivo de comportamiento; es un candado que el tenant activa si lo quiere.

### 1.2 Dónde se configura

El módulo de Sucursales (`GET/POST/PUT/DELETE /api/v1/sucursales`) gana un campo nuevo:

```
almacenVenta?: string | null
```

- En `POST /sucursales` y `PUT /sucursales/:id`: opcional. Debe ser el nombre exacto (`name`/id)
  de un `Warehouse` que **pertenezca a esa misma sucursal** — si no pertenece, el backend
  responde 400 con un mensaje claro ("el almacén de venta debe pertenecer a esta sucursal").
  Mandar cadena vacía `""` en el `PUT` lo quita (vuelve al comportamiento sin restricción).
- En las respuestas (`GET /sucursales`, `GET /sucursales/:id`, y el objeto devuelto por
  `POST`/`PUT`): el campo `almacenVenta` viene siempre presente, `null` si no está configurado.

### 1.3 Qué construir en la UI

**Pantalla de Sucursales** (donde hoy se crea/edita el nombre de la sucursal):

- Agregar un selector opcional "Almacén de venta" al formulario de crear/editar sucursal — debe
  listar **solo los almacenes que ya pertenecen a esa sucursal** (el backend valida esto, pero
  filtrar de entrada en el selector evita que el usuario elija algo que va a rechazarse). Si la
  sucursal todavía no tiene ningún almacén asociado, el selector debería estar vacío/deshabilitado
  con una nota tipo "asigne almacenes a esta sucursal primero".
- En el listado de sucursales, mostrar si tiene almacén de venta configurado (badge/columna) — es
  información operativa relevante para quien administra sucursales.
- Un botón/acción para "quitar" el almacén de venta (mandar `almacenVenta: ""` en el PUT).

### 1.4 Qué cambia en TODOS los flujos de venta

Esta restricción aplica automáticamente, del lado del backend, en **Facturas directas, Pedidos,
Cotizaciones, Caja/POS (que reutiliza el flujo de Facturas), y despacho mostrador (venta directa
sin pedido previo)**. El frontend no tiene que replicar la lógica de decidir el almacén — el
backend ya resuelve/valida esto solo — pero **sí tiene que manejar bien el error nuevo** que
puede surgir en cualquiera de esos formularios:

```json
{
  "statusCode": 400,
  "message": "Esta sucursal solo puede vender desde \"Almacén Venta - ACME\" — no se puede vender desde \"Depósito Trasero - ACME\". Transfiera el stock faltante hacia el almacén de venta antes de vender.",
  "code": "SALE_WAREHOUSE_MISMATCH"
}
```

**Dónde puede aparecer este error:**

- `POST/PUT /invoicing/invoices` (Facturas — incluye el flujo de Caja/POS, que internamente crea
  una Sales Invoice con `is_pos: true`).
- `POST/PUT /pedidos`.
- `POST/PUT /invoicing/quotations`.
- `POST /despachos` (despacho mostrador, venta directa sin pedido).

**Qué hacer en la UI cuando aparece este `code`:** en vez de mostrar el `message` crudo como un
error genérico, es mucho más útil mostrarlo como una alerta accionable — idealmente extrayendo el
nombre del almacén de venta del mensaje (o, si el frontend ya conoce la sucursal seleccionada,
consultando `GET /sucursales/:id` para leer `almacenVenta` directamente en vez de parsear texto) y
ofreciendo un atajo a la pantalla de Transferencias (`POST /transferencias`) o al flujo de
"confirmar stock" (§2, si aplica al contexto) para que el operador pueda resolverlo sin salir del
flujo de venta.

**Importante — esto también afecta el selector de almacén en el formulario de venta en sí:**
si el frontend ya tiene un selector de "almacén" por línea de producto en Facturas/Pedidos/
Cotizaciones/despacho mostrador, y la sucursal activa tiene un almacén de venta configurado, ese
selector debería — idealmente — **mostrar solo ese almacén** (o mostrarlo pre-seleccionado y
deshabilitado), en vez de dejar que el usuario elija cualquier almacén de la sucursal y luego
recibir el 400. Esto requiere que el frontend consulte `GET /sucursales/:id` (o el listado) para
saber si la sucursal activa tiene `almacenVenta` configurado, y ajustar el selector en
consecuencia. Si no se hace este ajuste preventivo, el sistema sigue siendo correcto (el backend
igual rechaza), pero la experiencia es peor (el usuario elige, envía, y recién ahí se entera).

---

## 2. Confirmar stock de un despacho pendiente → transferencia automática

### 2.1 El escenario

Con despacho habilitado, cuando una venta no puede entregarse de inmediato por falta de stock
(exactamente el caso que crea la restricción de §1: el almacén de venta no tiene suficiente), el
despacho (`Delivery Note`) queda en estado **Borrador** — existe como documento, pero no se puede
someter todavía porque ERPNext rechazaría la salida de inventario que no existe físicamente ahí.

Antes de esta feature, no había ningún camino en la UI para resolver ese "atascamiento" más que
irse manualmente al módulo de Transferencias, calcular cuánto falta, hacer la transferencia, y
volver al despacho a someterlo. Ahora hay un endpoint dedicado que hace ese cálculo y esa
transferencia automáticamente.

### 2.2 El endpoint

```
POST /api/v1/despachos/:id/confirmar-stock
```

**Solo aplica a un despacho en estado Borrador** (nunca sometido). Si el despacho ya fue sometido
o cancelado, responde 400 ("Solo se puede confirmar stock de un despacho en Borrador...").

**Request:**

```json
{
  "items": [
    { "itemCode": "PROD-003", "sourceWarehouse": "Depósito Central - ACME" }
  ]
}
```

- `items[]`: por cada ítem del despacho al que le falta stock en su almacén destino, indica de
  qué almacén (`sourceWarehouse`) debe salir el faltante. **`sourceWarehouse` puede ser
  cualquier almacén de la compañía** — a propósito no está restringido a la misma sucursal del
  despacho (permite traer stock de un depósito central que no pertenece a ninguna sucursal). No
  hace falta indicar la cantidad — el backend calcula exactamente cuánto falta.
- Si envías un `itemCode` que no existe en el despacho, o que tiene más de una línea en almacenes
  distintos dentro del mismo despacho (caso raro), el backend responde 400 con un mensaje claro.

**Response (éxito):**

```json
{
  "success": true,
  "data": {
    "stockEntryId": "MAT-STE-2026-00099",
    "items": [
      {
        "itemCode": "PROD-003",
        "warehouse": "Almacén Venta - ACME",
        "faltante": 6,
        "transferido": true,
        "sourceWarehouse": "Depósito Central - ACME"
      }
    ],
    "message": "Transferencia confirmada (MAT-STE-2026-00099). El despacho ya puede someterse."
  }
}
```

- `faltante`: cuánto realmente hacía falta (calculado por el backend — `actual_qty - reserved_stock`
  en el almacén destino de esa línea, contra la cantidad pendiente del despacho).
- `transferido: false` para una línea donde el backend detectó que YA había suficiente stock (no
  hizo falta transferir nada para esa línea específica) — no es un error, es informativo.
- `stockEntryId` es `null` si **ninguna** línea necesitaba transferencia (todo ya estaba
  disponible).
- **Este endpoint NO somete el despacho** — solo resuelve el faltante de stock. El siguiente paso
  sigue siendo el botón/acción existente de "Someter despacho" (`POST /despachos/:id/submit`),
  como un paso separado y explícito.

**Response (error) — origen sin stock suficiente:**

```json
{
  "statusCode": 400,
  "code": "STOCK_INSUFFICIENT_OR_RESERVED",
  "message": "Stock insuficiente o reservado para otro cliente: \"PROD-003\" en el almacén \"Depósito Central - ACME\" — disponible 2, solicitado 6. ...",
  "details": {
    "itemCode": "PROD-003",
    "warehouse": "Depósito Central - ACME",
    "actualQty": 2,
    "reservedStock": 0,
    "disponible": 2,
    "solicitado": 6,
    "faltante": 4
  }
}
```

Este es el mismo `code`/shape de error ya documentado en
[`docs/frontend-tasks/73_alertas_disponibilidad_stock_reservado.md`](./73_alertas_disponibilidad_stock_reservado.md)
— si ya implementaste el manejo de ese `code` ahí, reutilízalo acá tal cual (mismo `details`
estructurado, mismo criterio de mostrar el mensaje con los números, no el texto crudo).

### 2.3 Qué construir en la UI

- En la pantalla/detalle de un despacho en estado **Borrador** que no se puede someter (o, más
  proactivamente, en la lista de "despachos pendientes" si existe una), agregar una acción
  **"Confirmar stock"** que abra un formulario simple: por cada línea del despacho, mostrar el
  ítem, la cantidad pendiente, y un selector de almacén origen (`sourceWarehouse`) — idealmente
  con el stock disponible de cada almacén candidato visible ahí mismo (reutilizando
  `GET /catalog/items/:id/stock`, ya documentado en el prompt #73, que trae `disponible` por
  almacén) para que el operador elija un origen que realmente tenga suficiente, sin tener que
  adivinar y recibir el error de arriba.
- Solo hace falta pedirle al operador el `sourceWarehouse` para las líneas que **realmente
  tienen faltante** — si el frontend ya sabe (por ejemplo, por el propio detalle del despacho, o
  por `GET /catalog/items/:id/stock`) que una línea ya tiene suficiente stock en su almacén
  destino, no hace falta mostrarla en este formulario en absoluto — mandarla igual no rompe nada
  (el backend la marca `transferido: false` y sigue), pero es ruido innecesario para el operador.
- Tras confirmar, mostrar el resultado (`stockEntryId`, qué se transfirió y cuánto) y, si todas
  las líneas quedaron resueltas, ofrecer directamente el botón de "Someter despacho" a
  continuación — es el flujo natural que sigue.

### 2.4 Complemento: eliminar un despacho en Borrador

Relacionado pero independiente de "confirmar stock": ahora existe `DELETE /despachos/:id`, que
antes no existía — solo aplica a despachos en Borrador (nunca sometidos). Si tu UI tiene un botón
de "cancelar" en un despacho que todavía es Borrador, debería usar este `DELETE`, no
`POST /despachos/:id/cancel` (ese es solo para despachos ya sometidos — un despacho en Borrador
nunca puede "cancelarse" en el sentido de ERPNext, solo eliminarse). Si tu UI hoy oculta o
deshabilita cualquier acción de cancelar/eliminar para despachos en Borrador (porque antes no
existía el endpoint), este es el momento de habilitarla.

---

## 3. UOMs de compra/venta permitidas (opcional, por ítem)

### 3.1 El problema que resuelve

Hasta ahora, un ítem podía comprarse o venderse en **cualquier** unidad de medida (UOM) que
tuviera una conversión configurada contra su UOM de stock — sin ningún control. Ahora, un ítem
puede restringir **opcionalmente**, y de forma **independiente para compra y para venta**, en
cuáles UOMs específicas se permite operar. Son **listas** (pueden ser varias UOMs por dirección,
no un solo valor) — por ejemplo: "este artículo se compra en Caja o en Docena, pero se vende
solo en Unidad o en Caja".

**Es opcional** — un ítem sin ninguna lista configurada (en cualquiera de las dos direcciones)
sigue funcionando exactamente como hoy: cualquier UOM con conversión válida contra la UOM de
stock sirve, sin restricción.

### 3.2 Dónde se configura — Catálogo de Ítems

`POST/PUT /api/v1/catalog/items` gana dos campos nuevos, ambos opcionales, ambos arrays de
strings (nombres de UOM):

```json
{
  "purchaseUoms": ["Caja", "Docena"],
  "saleUoms": ["Unidad", "Caja"]
}
```

- **Cada UOM de ambas listas debe tener conversión real configurada contra la UOM de stock del
  ítem** (`stockUom`). El backend lo valida al guardar — si alguna UOM de la lista no tiene esa
  conversión, la respuesta es 400:

  ```json
  {
    "statusCode": 400,
    "message": "Las siguientes UOM no tienen conversión configurada contra la UOM de stock (\"Unidad\"): Docena. Configure la conversión en Unidades de Medida antes de restringir la compra/venta a ellas."
  }
  ```

  Este error no tiene un `code` estructurado — es un 400 de validación normal, muéstralo tal
  cual (ya trae el o los nombres de UOM problemáticos en el texto).

- Aplica **solo a artículos de tipo Producto** (no a Servicios) — para un Servicio, estos campos
  no tienen efecto (un servicio no maneja UOM de stock del mismo modo).
- Las respuestas de `GET /catalog/items` y `GET /catalog/items/:id` ahora incluyen ambos campos
  (`purchaseUoms`, `saleUoms`), siempre como array (vacío si no hay restricción configurada,
  nunca `null`/`undefined`).
- **Nota**: el campo `salesUom` (singular) que pudiera existir en respuestas viejas del API ya no
  se usa — fue reemplazado por `saleUoms` (plural, lista). Si el frontend tenía algo leyendo
  `salesUom`, hay que migrarlo a `saleUoms`.

### 3.3 Qué construir en el formulario de Ítem (Catálogo)

- Dos selectores multi-opción (multi-select) opcionales en el formulario de crear/editar
  artículo: "UOMs de compra permitidas" y "UOMs de venta permitidas". Cada uno debería, idealmente,
  ofrecer como opciones solo las UOMs que YA tienen conversión configurada contra la UOM de stock
  del artículo (si el frontend tiene acceso a esa información — por ejemplo a través del campo
  `uoms` ya existente en la respuesta del ítem, que lista las conversiones configuradas) — así se
  evita de entrada el error 400 de "no tiene conversión". Si no es fácil filtrar de antemano, no
  pasa nada: el backend igual valida y devuelve el error claro.
- Dejar bien claro en la UI (tooltip/texto de ayuda) que son **listas independientes** — la UOM de
  compra no tiene por qué coincidir con la de venta, y que dejarlas vacías significa "sin
  restricción, como siempre".

### 3.4 Qué cambia al armar una línea de compra/venta

Este es el cambio más importante para el operador del día a día: al armar una línea de **Compra**
(`POST /compras`), **Pedido** (`POST/PUT /pedidos`), **Factura** (`POST/PUT /invoicing/invoices`)
o **Cotización** (`POST/PUT /invoicing/quotations`), si el ítem tiene una lista configurada para
esa dirección (compra o venta) y la UOM que se está usando en la línea NO está en esa lista, el
backend rechaza con:

```json
{
  "statusCode": 400,
  "code": "UOM_NOT_ALLOWED",
  "message": "El artículo \"PROD-003\" no se puede vender en \"Docena\" — solo en: Unidad, Caja.",
  "details": {
    "itemCode": "PROD-003",
    "uom": "Docena",
    "direction": "sale",
    "permitidas": ["Unidad", "Caja"]
  }
}
```

`direction` es `"purchase"` o `"sale"` según el contexto del documento.

**Qué hacer en la UI:** al seleccionar un artículo en cualquiera de esos 4 formularios (o al
elegir/cambiar la UOM de una línea ya agregada), si el artículo trae `purchaseUoms`/`saleUoms`
no vacío (según corresponda al tipo de documento — compra vs. venta), el selector de UOM de esa
línea debería **limitarse a esa lista** en vez de mostrar todas las UOM disponibles del sistema —
mismo principio preventivo que en §1.4: evitar que el operador elija algo que el backend va a
rechazar, en vez de solo reaccionar al error después. Si el artículo no tiene restricción
configurada para esa dirección, el selector de UOM sigue mostrando todas las opciones válidas,
como hoy.

Si de todas formas llega el error `UOM_NOT_ALLOWED` (por ejemplo, en un flujo donde no se
prefiltró el selector), usa `details.permitidas` para armar un mensaje claro señalando
exactamente qué UOMs sí son válidas para ese artículo, en vez de mostrar el texto crudo.

---

## 4. Checklist de verificación

1. **Sucursales**: formulario de crear/editar muestra el selector "Almacén de venta" (filtrado a
   los almacenes de esa sucursal), listado muestra si está configurado, se puede quitar.
2. **Facturas/Pedidos/Cotizaciones/Caja/despacho mostrador**: probar una venta desde un almacén
   distinto al de venta configurado — confirmar que se rechaza con un mensaje claro (no el JSON
   crudo), idealmente detectado ANTES del submit si se implementó el prefiltro del selector.
3. **Despachos**: un despacho que queda en Borrador por falta de stock ahora tiene la acción
   "Confirmar stock" visible, con selector de almacén origen por línea, y tras confirmarlo se
   puede someter normalmente.
4. **Despachos**: un despacho en Borrador se puede eliminar (`DELETE`), no solo "cancelar".
5. **Catálogo de Ítems**: formulario de crear/editar tiene los dos multi-select de UOM permitidas,
   independientes entre sí, ambos opcionales.
6. **Compras/Pedidos/Facturas/Cotizaciones**: seleccionar una UOM no permitida para un artículo
   con restricción configurada se rechaza con mensaje claro — idealmente el selector de UOM ya
   viene prefiltrado y ni siquiera permite elegirla.
7. Confirmado que `salesUom` (singular, viejo) ya no se usa en ningún lado del frontend — se migró
   a `saleUoms` (plural).
8. Todo contrastado contra `openapi.json` actualizado para confirmar tipos exactos de cada campo
   nuevo mencionado en este documento.
