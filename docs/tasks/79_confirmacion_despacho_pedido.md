# Prompt para el agente de frontend — Confirmación de despacho antes de facturar un Pedido

Copia y pega este prompt completo al agente de frontend. Cubre una feature grande y con varias
piezas — léelo completo antes de empezar, no lo trates como una lista de checkboxes independientes.

Antes de implementar, abre `openapi.json` y confirma ahí los tipos exactos de cada campo/endpoint
mencionado — lo que sigue es la explicación funcional completa del comportamiento.

---

## 1. Contexto — el problema que esto resuelve

Hasta ahora, someter un Pedido (`POST /pedidos/:id/submit`) factura de inmediato, confiando en que
el sistema "sabe" que hay stock. Un tenant puede ahora exigir que, **antes de eso**, alguien de
despacho **confirme manualmente** la existencia física de los artículos — aunque el sistema ya
calcule que hay stock suficiente, es un chequeo humano deliberado, no automático. Si un artículo no
está en el almacén de venta pero sí en otro, la confirmación resuelve el faltante con una
**transferencia automática** (mismo mecanismo que ya existe en `POST /despachos/:id/confirmar-
stock`, documentado en
[`docs/frontend-tasks/75_almacen_venta_confirmar_stock_uoms_permitidas.md`](./75_almacen_venta_confirmar_stock_uoms_permitidas.md)
§2 — si ya implementaste esa pantalla, la UI de este flujo puede reutilizar buena parte de esos
componentes).

**Es opcional por tenant** (`PUT /config/facturacion` → `pedidoRequiereConfirmacionDespacho`). Con
el flag apagado (default), el flujo de Pedidos no cambia en absoluto.

**Aplica SOLO a un pedido inmediato** — nunca a un apartado (layaway) ni a un pedido marcado como
**despacho a futuro**. Ambos ya difieren la entrega por su cuenta.

---

## 2. Campo nuevo — elegir "despacho a futuro" al crear un Pedido

Hasta ahora esto NO se podía elegir en Pedidos (solo en Facturas directas). Ahora sí:

```
POST /pedidos
Body: { ..., "despachoFuturo": true }
```

- Requiere que el tenant tenga el módulo de despacho Y "despacho a futuro" habilitados
  (`GET /config/facturacion` → `despachoHabilitado`/`despachoFuturoHabilitado`) — si no, 400.
- Si tu UI ya tiene un toggle "Despacho a futuro" en el formulario de Factura, agrega el MISMO
  toggle al formulario de Pedido, con el mismo criterio de habilitación/deshabilitación.
- **Un pedido marcado como despacho a futuro queda automáticamente fuera de todo lo que sigue en
  este documento** (nunca pide confirmación) — no hace falta ninguna lógica extra de tu lado para
  eso, el backend ya lo excluye solo.
- La respuesta de Pedido (`GET/POST/PUT /pedidos/...`) ahora incluye `despachoFuturo: boolean` y
  `despachoConfirmado: boolean` reflejando lo guardado.

---

## 3. El flujo completo, paso a paso

Con el flag de tenant activo y un pedido inmediato (no apartado, no despacho a futuro):

1. **Se crea el pedido en Borrador** — `POST /pedidos`, igual que siempre.
2. **Se envía a confirmación de despacho** — no hay un endpoint separado para "enviar a despacho"
   como tal; el pedido en Borrador simplemente aparece disponible para confirmar (ver §5, cómo
   listarlos). No hace falta ninguna acción explícita de "enviar" — el pedido YA está pendiente de
   confirmación en cuanto se crea, si el tenant tiene el flag activo.
3. **Despacho confirma** — `POST /pedidos/:id/confirmar-despacho` (ver §4). Si algún artículo
   requiere serial/lote en este momento, se asigna acá.
4. **El pedido puede someterse** — `POST /pedidos/:id/submit`, el mismo endpoint de siempre. Sin
   confirmar, este endpoint ahora puede devolver 400 (ver §4.4).
5. **Se factura** — al someter, se crea la Sales Invoice en Draft, igual que siempre; se somete
   esa factura por separado para asignar NCF (sin cambios respecto a hoy).
6. **Se cobra** — sin cambios.
7. **Se despacha** — el despacho real (Delivery Note) se sigue creando y sometiendo después,
   exactamente como funciona hoy (`POST /despachos/desde-factura/:id`) — nada de esto cambió.

---

## 4. `POST /pedidos/:id/confirmar-despacho`

### 4.1 Cuándo mostrar la acción

Solo tiene sentido ofrecerla cuando:
- El tenant tiene `pedidoRequiereConfirmacionDespacho` activo.
- El pedido está en Borrador (`docstatus`/`status` aún no sometido — ver `estadoFlujo` en §6).
- El pedido NO es apartado (`isLayaway: false`) NI despacho a futuro (`despachoFuturo: false`).
- El pedido todavía no está confirmado (`despachoConfirmado: false`).

### 4.2 Request

```json
{
  "items": [
    { "itemCode": "PROD-003", "sourceWarehouse": "Depósito Central - ACME" },
    { "itemCode": "PROD-007" },
    { "itemCode": "PROD-010", "serials": ["SN-00123"] }
  ]
}
```

- `itemCode`: obligatorio.
- `sourceWarehouse`: **opcional** — solo hace falta para un artículo que realmente tiene faltante
  en su almacén de venta. Si el artículo ya tiene suficiente stock ahí, se puede omitir (o mandarlo
  igual, no rompe nada — el backend lo ignora si no hacía falta).
- `serials`/`batches`: solo para artículos cuyo `Item.custom_asignar_serial_en_despacho` esté
  activo (ver `GET /catalog/items/:id` — este campo ya viene en la respuesta del artículo). Mismo
  shape que ya usás en `POST /despachos/:id/asignar-tracking` (`batches: [{batchId, qty}]`).

**Solo enviá en el body los artículos que realmente necesitan algo** — un artículo con stock
suficiente y sin requisito de serial no necesita aparecer en absoluto (el backend, si no aparece,
simplemente no lo toca — pero atención: **la confirmación completa exige que TODOS los artículos
del pedido que sí necesitan algo estén en el body**, no hace falta re-enviar los que no necesitan
nada).

### 4.3 Response (éxito)

```json
{
  "success": true,
  "data": {
    "pedidoId": "SO-2026-00042",
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
    "message": "Transferencia confirmada (MAT-STE-2026-00099). El pedido ya puede someterse."
  }
}
```

Mismo shape que ya conocés de `POST /despachos/:id/confirmar-stock` — `stockEntryId: null` si
ninguna línea necesitaba transferencia, `transferido: false` para una línea que ya tenía
suficiente (informativo, no error). **Esta llamada NO somete el pedido** — el siguiente paso sigue
siendo `POST /pedidos/:id/submit`, un botón/acción separada.

### 4.4 Errores

- 400 con `code: "STOCK_INSUFFICIENT_OR_RESERVED"` si el `sourceWarehouse` indicado no tiene
  realmente el faltante disponible — mismo `details` estructurado que ya conocés (§75.2.2 del
  prompt de Despachos), reutilizá el mismo manejo.
- 400 texto plano si un artículo con `custom_asignar_serial_en_despacho` no trae `serials`/
  `batches` en el body.
- 400 si el tenant no tiene el flag activo, si el pedido no está en Borrador, si es apartado, o si
  es despacho a futuro — mensajes claros, mostralos tal cual.

### 4.5 Qué construir en la UI

Pantalla/modal de "Confirmar despacho" sobre el detalle de un pedido pendiente:
- Lista de líneas del pedido con faltante real — para cada una, un selector de almacén origen
  (`sourceWarehouse`), idealmente mostrando disponible por almacén (reusar
  `GET /catalog/items/:id/stock`, igual que en Despachos).
- Para líneas cuyo artículo tiene `custom_asignar_serial_en_despacho` activo: un selector de
  serial(es)/lote(s) — mismo componente que ya uses para `POST /despachos/:id/asignar-tracking`,
  si existe.
- Tras confirmar con éxito, mostrar el resultado (qué se transfirió) y ofrecer directamente el
  botón "Someter pedido" a continuación.

---

## 5. Listar pedidos pendientes de confirmar

No hay un endpoint separado — usá el listado normal de Pedidos (`GET /pedidos`) filtrando por
`estadoFlujo: "pendiente_confirmacion_despacho"` del lado del cliente (o, si `GET /pedidos` ya
soporta un filtro por status/estado en tu integración actual, confirmá en `openapi.json` si hay un
query param directo — si no lo hay, traé los pedidos en Borrador y filtrá por `estadoFlujo` en el
cliente). Es información que ya viene en cada pedido de la lista, no hace falta un endpoint aparte.

---

## 6. `estadoFlujo` — en qué paso está el pedido

Todo pedido (`GET/POST/PUT /pedidos/...`) ahora trae:

```json
{
  "status": "to deliver and bill",
  "estadoFlujo": "facturando",
  "despachoFuturo": false,
  "despachoConfirmado": true
}
```

`status` (ya existía) es el status nativo de ERPNext, en minúsculas, tal cual. `estadoFlujo` es
nuevo y pensado específicamente para que la UI muestre "en qué está" el pedido con una sola
etiqueta, sin tener que combinar varios campos. Valores posibles:

| Valor | Significado |
|---|---|
| `borrador` | Recién creado, o ya confirmado y listo para someter (si el tenant no requiere confirmación, o el pedido es a futuro/apartado, siempre es este valor mientras esté en Borrador) |
| `pendiente_confirmacion_despacho` | Requiere `POST /pedidos/:id/confirmar-despacho` antes de poder someterse |
| `apartado_reservado` | Apartado ya sometido (stock reservado), pendiente de que el cliente regrese a retirar |
| `facturando` | Sometido, factura recién creada en Draft, todavía sin someter esa factura |
| `facturado` | La factura ya fue sometida (NCF asignado), pendiente de despacho físico |
| `despachado` | Ciclo completo — factura y despacho sometidos |
| `cerrado` | Pedido cerrado manualmente en ERPNext |
| `sometido` | Fallback genérico si el status nativo no mapea a ninguno de los anteriores |
| `cancelado` | Pedido cancelado |

**No distingue "cobrado" como estado propio** — un pedido `facturado` puede estar cobrado o no;
si necesitás esa distinción, consultá el estado de pago de la factura vinculada por separado
(`GET /invoicing/invoices/:id` → `outstandingAmount`).

**Qué construir en la UI**: un badge/etiqueta de estado en la lista y el detalle de Pedidos, usando
`estadoFlujo` como fuente única de verdad — con una traducción a texto amigable en español (ej.
"Pendiente de confirmar despacho", "Facturando", "Despachado") y, idealmente, un color/ícono
distinto por valor para que el operador vea de un vistazo en qué punto del flujo está cada pedido
en la lista.

---

## 7. El "conduce" — documento del pedido sin (o con) precios

El PDF del Pedido (`GET /pedidos/:id/pdf`, ya existente — Print Format "Pedido RD") ahora respeta
un flag de configuración del tenant:

```
GET /config/facturacion → pedidoConduceIncluyePrecios: boolean (default true)
PUT /config/facturacion → { "pedidoConduceIncluyePrecios": false }
```

- `true` (default): el PDF incluye columnas de precio/ITBIS/total y la sección de totales, igual
  que siempre.
- `false`: el mismo PDF omite esas columnas y la sección de totales — queda como un "conduce":
  descripción, cantidad, nota, nada de montos.

**No hay un endpoint nuevo para imprimir** — sigue siendo el mismo `GET /pedidos/:id/pdf` de
siempre; el contenido cambia solo, según la configuración del tenant, sin que el frontend tenga
que pasar ningún parámetro extra.

**Qué construir en la UI**: un toggle "Conduce incluye precios" en Configuración → Facturación,
junto a los demás ajustes de Pedidos/Despacho. El botón de "Imprimir pedido" que ya tengas hoy no
necesita ningún cambio — sigue llamando al mismo endpoint.

---

## 8. `entregados` en el detalle de artículo

`GET /catalog/items/:id` (detalle, no el listado) gana un campo nuevo:

```json
{
  "currentStock": 20,
  "enPedido": 8,
  "reservado": 6,
  "entregado": 14,
  "disponible": 14
}
```

`entregado`: unidades de este artículo ya vendidas Y despachadas físicamente (Delivery Notes
sometidos) — un número puramente histórico/informativo, no afecta ningún cálculo de disponibilidad
existente (`disponible` sigue siendo `currentStock - reservado`, sin tocar). Si tu pantalla de
detalle de artículo ya muestra la sección de disponibilidad documentada en
[`docs/frontend-tasks/76_detalle_item_disponibilidad_stock.md`](./76_detalle_item_disponibilidad_stock.md),
agregá esta cifra ahí como un dato más ("Entregado histórico: 14 unidades") — no reemplaza a
ninguno de los campos que ya mostrás, es un dato adicional. Igual que los otros 3 campos de esa
sección, solo viene en el detalle, nunca en el listado, y viene ausente (`undefined`) para un
artículo de tipo Servicio.

---

## 9. Campo de artículo — "asignar serial/lote al vender o despachar"

`POST/PUT /catalog/items/:id` gana un campo nuevo, booleano, opcional:

```json
{ "custom_asignar_serial_en_despacho": true }
```

Confirmá en `openapi.json` el nombre exacto expuesto (puede venir camelCase del lado del BFF,
distinto al nombre del custom field de ERPNext). Solo tiene sentido para un artículo con
`custom_tracking_type` distinto de `none` (serial o lote) — si tu formulario de artículo ya
muestra/oculta campos de tracking condicionalmente según ese valor, agregá este checkbox en el
mismo bloque, con un texto de ayuda tipo: "Si está activo, el serial/lote de este artículo se pide
al confirmar despacho (venta), no en la compra."

---

## 10. Checklist de verificación

1. Formulario de Pedido tiene el toggle "Despacho a futuro" (igual que Facturas), habilitado solo
   si el tenant lo permite.
2. Configuración → Facturación tiene los 2 toggles nuevos: "Pedido requiere confirmación de
   despacho" y "Conduce incluye precios".
3. Con el requisito activo, un pedido inmediato en Borrador muestra la acción "Confirmar
   despacho"; un apartado o uno marcado a futuro NUNCA la muestra.
4. Confirmar despacho con faltante + almacén origen crea la transferencia y permite someter
   después; sin faltante, no pide nada y permite someter directo.
5. Intentar someter sin confirmar (con el requisito activo) se rechaza con un mensaje claro, no el
   JSON crudo.
6. Un artículo con `custom_asignar_serial_en_despacho` exige serial/lote al confirmar despacho —
   y esos mismos seriales aparecen ya asignados en la factura resultante, sin pedirse de nuevo.
7. La lista/detalle de Pedidos muestra `estadoFlujo` traducido a un badge legible, para los 9
   valores posibles.
8. El PDF del pedido (conduce) respeta el toggle de precios — probar ambos casos.
9. Detalle de artículo muestra `entregado` cuando corresponde, ausente para Servicios.
10. Todo contrastado contra `openapi.json` actualizado para los tipos exactos.
