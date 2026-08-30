# Prompt para agente de frontend — Conectar el editor de plantillas de impresión (POS + etiquetas)

> Este documento es un prompt autocontenido para un agente de IA de frontend. Contiene todo el
> contexto necesario sobre lo que se construyó en el BFF — no requiere leer código del BFF ni el
> documento de diseño interno (`docs/plans/PLAN_PLANTILLAS_IMPRESION_JSON.md`, que vive en el
> repo del backend). API base `https://gensapi.ryancfx.click/api/v1` (o
> `http://localhost:4000/api/v1` en desarrollo).
>
> **Para los tipos TypeScript exactos** (nombres de campo, opcionalidad, enums) usa el
> `openapi.json` que ya tienes en el proyecto de frontend, buscando las rutas bajo `/plantillas`.
> Este documento explica el **flujo, las decisiones y los gaps** — cosas que un spec OpenAPI no
> transmite por sí solo. Si tu `openapi.json` no tiene todavía `/plantillas/render-data` o
> `/plantillas/logo`, está desactualizado: regenéralo desde `GET /api/docs-json` del BFF
> desplegado antes de continuar. No adivines el contrato de esos dos endpoints en particular.

---

## 0. Contexto — qué es esto y qué NO es

- El editor de plantillas de impresión **ya existe en el frontend** (el árbol de componentes
  documentado como `src/features/invoice-template-editor/` en el diseño original), y hoy es
  **100% funcional pero desconectado**: dibuja su vista previa contra datos de muestra
  (mock/sample), no contra ningún endpoint real.
- El BFF ahora expone el backend completo para ese editor: persistencia real de plantillas
  (guardar/listar/marcar default/eliminar), un catálogo de campos dinámico por tenant, subida de
  logo, y el endpoint que resuelve una factura o un artículo real contra ese catálogo para
  producir los datos que hay que imprimir.
- **El motor de render (dibujar el ticket/etiqueta a partir del JSON de la plantilla) sigue
  siendo 100% responsabilidad del frontend.** Eso no cambia y no hay que reescribirlo — es
  exactamente el mismo componente que hoy ya dibuja la vista previa con datos de muestra. Lo
  único que cambia es **de dónde salen la plantilla y los datos**: antes mock, ahora la API real
  descrita en este documento.
- El backend **nunca genera HTML ni PDF** para estos dos tipos de plantilla. No hay endpoint que
  devuelva una imagen o un PDF del ticket/etiqueta — todo lo que el backend entrega es JSON
  (`{template, values}` o `{template, labels}`), y el frontend decide cómo convertir eso en algo
  imprimible (diálogo de impresión del navegador, agente de impresión local, etc. — fuera del
  alcance del backend).
- Además, se decidió **migrar la impresión del ticket de Caja/POS al cerrar una venta** al flujo
  nuevo — ver §7. El endpoint viejo (`GET /invoices/:id/pdf?formato=pos`, PDF generado en el
  servidor con Puppeteer) **sigue existiendo y sigue funcionando** para todo lo demás (email,
  archivo, reimpresión desde el historial) — no se rompe ni se elimina.

### Los dos tipos de plantilla — catálogos y flujos totalmente independientes

| `type` (valor exacto de la API) | Qué es | Se resuelve contra |
|---|---|---|
| `Pos Invoice` | Ticket de una venta (factura de contado/POS) | una `Sales Invoice` puntual |
| `Label 5x2` | Etiqueta de producto 5x2cm (anaquel / recepción de mercancía) | uno o más `Item` |

⚠️ **El valor de `type` en la URL trae un espacio literal** (`"Pos Invoice"`, `"Label 5x2"`, no
`"pos_invoice"`/`"label_5x2"` como en el documento de diseño original, que usaba snake_case como
notación informal). Al armar la query string hay que URL-encodearlo: `type=Pos%20Invoice` /
`type=Label%205x2` (o `Pos+Invoice`/`Label+5x2` si tu cliente HTTP encodea espacios como `+`).
Nunca lo envíes en snake_case — el backend lo rechaza con 400 (no reconoce el valor).

### Auth / convenciones generales (recordatorio — igual que el resto de la API)

- Header `Authorization: Bearer <jwt>` en todos los endpoints.
- Header `X-Tenant: <slug del tenant>` en todos los endpoints (obligatorio).
- Todas las respuestas exitosas vienen envueltas en `{ "success": true, "data": ... }`; las
  paginadas además traen `"meta": { total, limit, offset, hasMore }`.
- Los errores siguen el formato universal ya conocido (`statusCode`, `message`) — ver `FRONTEND_CONTEXT.md`
  si necesitas el detalle completo del shape de error; este documento solo lista los mensajes
  específicos de este módulo en §12.

---

## 1. CRUD de plantillas — `Plantilla Impresion RD`

Prefijo: `/plantillas`. Ninguno de estos 7 endpoints necesita conocer el contenido interno del
JSON de la plantilla — el backend lo trata como un blob opaco (ver §10).

### 1.1 Crear — `POST /plantillas` (201)

```json
// Request
{
  "plantillaType": "Pos Invoice",
  "plantillaName": "Ticket POS estándar",
  "isDefault": true,
  "catalogVersion": 1,
  "documentJson": { "page": { "...": "..." }, "pages": [ { "elements": [ "..." ] } ] }
}
```

- `plantillaType`: obligatorio, `"Pos Invoice"` | `"Label 5x2"`.
- `plantillaName`: obligatorio, string no vacío — nombre visible en el editor (no es el id).
- `isDefault`: opcional, default `false`. Si `true`, esta pasa a ser la default de su
  `(company, plantillaType)` — el backend desmarca automáticamente cualquier otra default
  previa del mismo tipo (no hay que hacer un `PUT` aparte a la plantilla anterior).
- `catalogVersion`: opcional, default `1`. Ver §4.4 — sirve para no romper plantillas viejas si
  el catálogo de campos crece más adelante. El frontend solo necesita enviar el valor que le
  devolvió `campos-disponibles` en el momento de guardar (o `1` si nunca lo consultó).
- `documentJson`: obligatorio, objeto. El `TemplateDocument` completo tal cual lo produce el
  editor.
- `company` **no se envía** — el backend lo resuelve automáticamente (la única/primera `Company`
  del tenant).

```json
// Response 201
{
  "success": true,
  "data": {
    "id": "a1b2c3d4e5",
    "plantillaType": "Pos Invoice",
    "plantillaName": "Ticket POS estándar",
    "company": "Mi Empresa SRL",
    "isDefault": true,
    "catalogVersion": 1,
    "documentJson": { "page": { "...": "..." }, "pages": [ "..." ] }
  }
}
```

### 1.2 Listar — `GET /plantillas?type=&limit=&offset=` (200)

```
GET /plantillas?type=Pos%20Invoice&limit=20&offset=0
```

- `type`: opcional. Si se omite, lista plantillas de **ambos** tipos mezcladas — en la práctica,
  la pantalla del editor siempre debería pasarlo.
- `limit`: opcional, default `20`, máximo `100`.
- `offset`: opcional, default `0`.
- ⚠️ El DTO de este endpoint hereda (por convención compartida con el resto de la API) los
  campos `search` y `orderBy` de la paginación genérica, **pero este endpoint en particular los
  ignora silenciosamente** — el orden siempre es `modified desc` (más reciente primero) y no hay
  búsqueda por texto server-side. No construyas un input de búsqueda esperando que filtre nada.

```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4e5",
      "plantillaType": "Pos Invoice",
      "plantillaName": "Ticket POS estándar",
      "company": "Mi Empresa SRL",
      "isDefault": true,
      "catalogVersion": 1,
      "documentJson": { "...": "..." }
    }
  ],
  "meta": { "total": 3, "limit": 20, "offset": 0, "hasMore": false }
}
```

### 1.3 Detalle — `GET /plantillas/:id` (200)

Mismo shape que un elemento de la lista. `404 "Plantilla de impresión no encontrada"` si el id
no existe (o no pertenece a este tenant).

### 1.4 Default del tipo — `GET /plantillas/default?type=` (200)

```
GET /plantillas/default?type=Pos%20Invoice
```

Mismo shape que el detalle. **`404 "No hay plantilla default configurada para \"Pos Invoice\""`
si el tenant todavía no tiene ninguna plantilla marcada como default de ese tipo** — esto va a
pasar en cualquier tenant nuevo, o en cualquier tenant existente el día que se despliegue este
módulo (nadie ha usado el editor todavía). El frontend **debe** manejar ese 404 mostrando el
editor con la plantilla "sugerida" que el propio editor ya sabe construir (los helpers
`buildDefaultPosInvoice()`/`buildDefaultLabel()` u homólogos que ya existen en el editor mock) —
nunca tratarlo como un error fatal de pantalla.

### 1.5 Actualizar — `PUT /plantillas/:id` (200)

Mismo body que crear, pero **todos los campos opcionales** — pensado para autoguardado parcial
(enviar solo lo que cambió). `404` si no existe.

### 1.6 Marcar como default — `POST /plantillas/:id/predeterminada` (201, sin body)

Devuelve la plantilla actualizada con `isDefault: true`. Igual que en creación, el backend
desmarca sola cualquier otra default previa del mismo `(company, plantillaType)` — no hace falta
ningún otro request. `404` si el id no existe.

### 1.7 Eliminar — `DELETE /plantillas/:id` (200)

```json
{ "success": true, "data": { "message": "Plantilla de impresión eliminada" } }
```

⚠️ **Gap conocido, importante para la UX:** a diferencia de lo que proponía el diseño original
(que exigía dejar siempre al menos una default, con `409 TEMPLATE_IS_DEFAULT` si se intentaba
borrar la única), **la implementación actual permite borrar cualquier plantilla sin ninguna
protección**, incluida la default, y **no promueve automáticamente otra a default**. Si se borra
la única/última plantilla default de un tipo, ese tipo queda sin default hasta que el usuario
marque otra manualmente — `GET /plantillas/default` empezará a devolver 404 (y, por lo tanto,
`GET /plantillas/render-data` sin `templateId` también, ver §5). **El frontend debe advertir
explícitamente antes de borrar una plantilla marcada `isDefault: true`** (ej. "Esta es la
plantilla default de Pos Invoice — si la eliminas, Caja/POS no podrá imprimir con el editor
hasta que marques otra como default").

---

## 2. Catálogo de campos disponibles — `GET /plantillas/campos-disponibles?type=` (200)

```
GET /plantillas/campos-disponibles?type=Pos%20Invoice
```

- **Llamar siempre este endpoint al abrir el editor para un tipo — nunca hardcodear la lista de
  bindings en el frontend.** El catálogo es dinámico por tenant: una key solo aparece si el
  campo real que la respalda existe en el site de ese tenant (ver §4.4 — un tenant con una
  instalación vieja de `localizacion_rd` puede no tener todavía algún custom field nuevo).
- Response:

```json
{
  "success": true,
  "data": [
    { "key": "empresa.nombre", "label": "Nombre de la empresa", "array": false },
    { "key": "items.tabla", "label": "Artículos", "array": true }
  ]
}
```

- `array: true` significa que el valor correspondiente en `render-data` es un **arreglo de
  objetos** (una tabla), no un escalar — el elemento del editor que lo consuma debe ser de tipo
  tabla, nunca `text`/`formula` de una sola línea.
- No está paginado (siempre trae el catálogo completo del tipo pedido) ni acepta ningún otro
  parámetro.

### 2.1 Catálogo completo de `Pos Invoice`

Todas las keys que existen en el código del catálogo — algunas pueden faltar en la respuesta
real de un tenant si el custom field que las respalda no existe todavía en ese site (columna
"Puede faltar").

| Key | Descripción | Tipo | Puede faltar |
|---|---|---|---|
| `empresa.nombre` | Nombre de la empresa | string | No |
| `empresa.rnc` | RNC de la empresa | string | No |
| `empresa.regimenFiscal` | Régimen fiscal DGII (Ordinario/Simplificado/RST) | string | Sí |
| `empresa.actividadEconomica` | Actividad económica registrada | string | Sí |
| `empresa.representanteLegal` | Nombre del representante legal | string | Sí |
| `empresa.logoUrl` | URL del logo de la empresa (configurado en Configuración → Empresa, **distinto** del logo subido específicamente para una plantilla vía §6) | string (URL) | Sí |
| `cliente.nombre` | Nombre del cliente (o del "cliente ocasional" si la venta no tiene cliente registrado) | string | No |
| `cliente.rnc` | RNC o cédula del cliente | string | Sí |
| `cliente.direccion` | Dirección del cliente | string | Sí |
| `factura.numero` | Id del documento (`Sales Invoice.name`, ej. `SINV-00042`) | string | No |
| `factura.ncf` | Número de Comprobante Fiscal | string | Sí |
| `factura.ncfTipo` | Tipo de NCF (B01/B02/B14/B15/B16) | string | Sí |
| `factura.fecha` | Fecha de la venta | string (fecha `YYYY-MM-DD`) | No |
| `factura.subtotal` | Subtotal antes de impuestos | number | No |
| `factura.impuestos` | Total de impuestos | number | No |
| `factura.total` | Total de la factura | number | No |
| `ecf.voucherId` | Número de comprobante e-CF (solo si la factura se emitió electrónicamente) | string | Sí |
| `ecf.estado` | Estado ante la DGII del e-CF | string | Sí |
| `ecf.codigoSeguridad` | Código de seguridad del e-CF | string | Sí |
| `ecf.qrBase64` | **Imagen PNG del QR, YA codificada en base64** (ver nota abajo) | string (base64, sin prefijo `data:`) | Sí |
| `pagos.montoPagado` | Monto pagado por el cliente | number | No |
| `pagos.vuelto` | Vuelto entregado | number | No |
| `pagos.tabla` | Detalle de líneas de pago (array) | array | No |
| `items.tabla` | Líneas de artículos vendidos (array) | array | No |

**`ecf.qrBase64` ya es la imagen renderizada, no una URL cruda.** No existe ningún binding que
entregue la URL del QR sin procesar — el backend la rasteriza server-side. Úsalo directo:
`<img src="data:image/png;base64,{{ valores['ecf.qrBase64'] }}">`.

**Forma exacta de `pagos.tabla`** (cada elemento del array):
```json
{
  "modoPago": "Efectivo RD",
  "monto": 1500.00,
  "numeroTarjeta": null,
  "codigoAutorizacion": null,
  "banco": null,
  "numeroCheque": null
}
```
Los últimos 4 campos son `null` cuando no aplican al modo de pago usado (ej. todos `null` en un
pago en efectivo; `numeroTarjeta`/`codigoAutorizacion` poblados en tarjeta; `banco`/`numeroCheque`
en cheque).

**Forma exacta de `items.tabla`** (cada elemento del array):
```json
{
  "codigo": "PROD-001",
  "descripcion": "Laptop HP 15",
  "cantidad": 2,
  "precio": 45000,
  "descuentoPct": 10,
  "monto": 81000,
  "uom": "Nos"
}
```

### 2.2 Catálogo completo de `Label 5x2`

Deliberadamente separado y mucho más chico que el de `Pos Invoice` — se resuelve contra un
`Item`, no contra una venta.

| Key | Descripción | Tipo | Puede faltar |
|---|---|---|---|
| `producto.codigo` | Código del artículo (`Item.name`) | string | No |
| `producto.nombre` | Nombre del artículo | string | No |
| `producto.precio` | **Precio de lista** (ver nota abajo) | number | No |
| `producto.unidad` | Unidad de medida (UOM) | string | No |
| `producto.codigoBarras` | Primer código de barras del artículo | string | No (cae al código de artículo si no tiene barcode) |

⚠️ **`producto.precio` es el precio de LISTA (`standard_rate`)**, no el precio con
margen A/B/C ni con descuentos/reglas de pricing que usa el POS al venderle a un cliente
concreto. Una etiqueta física no tiene cliente ni contexto de venta — es el mismo criterio que
cualquier etiqueta de anaquel. Si el negocio pide más adelante que la etiqueta refleje otro
precio, es un cambio de backend que hay que pedir explícitamente, no algo que el frontend pueda
resolver por su cuenta combinando este endpoint con el motor de precios de ventas.

### 2.3 Lo que NO está en ningún catálogo hoy (gaps conocidos — leer antes de diseñar el ticket)

- **`empresa.telefono` y `empresa.direccion` no existen todavía como binding.** El Print Format
  Jinja que usa hoy el ticket POS viejo (`Factura RD POS`) sí muestra el teléfono
  (`Company.phone_no`) y la dirección de la empresa — pero el catálogo nuevo de `render-data`
  todavía no los expone. Si el diseño del ticket que conectes necesita mostrarlos, hace falta
  pedir que se agreguen en el BFF antes de poder maquetarlos — no existen en ningún endpoint de
  `/plantillas` por ahora.
- **Retenciones ITBIS/ISR no aparecen para `Pos Invoice`** — `Sales Invoice` no tiene esos
  campos en este sistema (solo existen en compras/gastos). No es un bug ni un tenant mal
  configurado, es correcto que nunca aparezcan.
- **Categoría, marca e impuesto del artículo no están en el catálogo de `Label 5x2`.**
- **No hay binding de "vendedor"** en `Pos Invoice` (sí existía en el diseño original, se
  descartó en la implementación real).

---

## 3. `render-data` — el corazón de la integración

Endpoint único que reemplaza cualquier idea de "el backend renderiza" — siempre devuelve JSON
`{template, ...datos}`, nunca HTML/PDF/imagen.

### 3.1 Para `Pos Invoice` (una factura)

```
GET /plantillas/render-data?type=Pos%20Invoice&sourceId=SINV-00042
GET /plantillas/render-data?type=Pos%20Invoice&sourceId=SINV-00042&templateId=a1b2c3d4e5
```

- `sourceId`: **obligatorio** para este tipo — el `name` (id) de la `Sales Invoice` a imprimir.
  `400 "sourceId es obligatorio para type=Pos Invoice."` si falta.
- `templateId`: opcional. Si se omite, usa la plantilla `isDefault` del tenant para este tipo —
  mismo comportamiento (y mismo 404 si no hay ninguna) que `GET /plantillas/default`.
- `404 "Factura (Sales Invoice) no encontrada"` si `sourceId` no corresponde a ninguna factura
  real del tenant.

```json
{
  "success": true,
  "data": {
    "template": {
      "id": "a1b2c3d4e5",
      "document": { "page": { "...": "..." }, "pages": [ "..." ] }
    },
    "values": {
      "empresa.nombre": "Mi Empresa SRL",
      "empresa.rnc": "130123456",
      "cliente.nombre": "Juan Pérez",
      "factura.numero": "SINV-00042",
      "factura.ncf": "B0100000123",
      "factura.total": 81000,
      "items.tabla": [ "...ver forma exacta en §2.1..." ],
      "pagos.tabla": [ "...ver forma exacta en §2.1..." ]
    }
  }
}
```

- `template.document` es exactamente el `documentJson` guardado de esa plantilla (ver §10).
- **Una key ausente en `values` significa lo mismo que una key presente con valor `null`** — el
  binding no existe en este tenant o el dato real vino vacío. El motor de render debe tratar
  ambos casos igual (mostrar vacío, nunca lanzar un error por acceso a una propiedad
  inexistente).
- `values` solo contiene las keys del catálogo de §2.1 que **existen en este tenant** — no asumas
  que siempre van a estar todas.

### 3.2 Para `Label 5x2` (uno o varios artículos, en lote)

```
GET /plantillas/render-data?type=Label%205x2&sourceIds=ITEM-1,ITEM-1,ITEM-2
GET /plantillas/render-data?type=Label%205x2&sourceIds=ITEM-1&templateId=b2c3d4e5f6
```

- `sourceIds`: **obligatorio** para este tipo — códigos de `Item` **separados por coma**.
  **Acepta repetidos a propósito**: para pedir 2 copias de `ITEM-1` y 1 de `ITEM-2` en una sola
  llamada, se envía `ITEM-1,ITEM-1,ITEM-2`. `400 "sourceIds es obligatorio para type=Label 5x2
  (códigos de artículo separados por coma)."` si falta o viene vacío.
- `templateId`: mismo comportamiento que arriba.
- ⚠️ **`404 "Artículo \"<código>\" no encontrado"` si CUALQUIER código del lote no existe —
  toda la llamada falla, no hay respuesta parcial.** Si el flujo de UI permite seleccionar
  artículos de una lista ya validada (ej. el catálogo de artículos, donde los códigos siempre
  existen), esto no debería pasar nunca en la práctica — pero si el código viene de un input
  libre o un escáner de código de barras, hay que validar/filtrar antes de llamar este endpoint.

**El shape de la respuesta es DISTINTO al de `Pos Invoice`** — usa `labels` (plural), no
`values`:

```json
{
  "success": true,
  "data": {
    "template": {
      "id": "b2c3d4e5f6",
      "document": { "page": { "...": "..." }, "pages": [ "..." ] }
    },
    "labels": [
      { "sourceId": "ITEM-1", "values": { "producto.codigo": "ITEM-1", "producto.nombre": "Tornillo 1/2\"", "producto.precio": 15, "producto.unidad": "Nos", "producto.codigoBarras": "7501234567890" } },
      { "sourceId": "ITEM-1", "values": { "...": "mismos values que la fila anterior" } },
      { "sourceId": "ITEM-2", "values": { "...": "..." } }
    ]
  }
}
```

- **El orden de `labels` respeta exactamente el orden (con repeticiones) de `sourceIds`
  enviado** — el frontend puede mapear cada entrada 1:1 a una página/etiqueta impresa sin lógica
  adicional de expansión por cantidad. Si pediste `ITEM-1,ITEM-1,ITEM-2`, el resultado trae 3
  entradas en ese orden exacto.
- Un mismo `sourceId` repetido trae exactamente los mismos `values` en cada aparición — el
  backend consulta ERPNext una sola vez por código único, no una vez por copia.

---

## 4. Subir logo — `POST /plantillas/logo` (multipart/form-data)

Endpoint distinto a todos los demás: es el único de la API que no recibe JSON.

```
POST /plantillas/logo
POST /plantillas/logo?termico=true
Content-Type: multipart/form-data
Campo del archivo: "file"   ← el nombre del campo debe ser exactamente "file"
```

- `?termico=true` (opcional): además de guardar el archivo tal cual, genera una **segunda**
  versión convertida a 1-bit blanco/negro (dithering Floyd-Steinberg) pensada para impresoras
  térmicas, que no soportan escala de grises real. **Usa este flag cuando la plantilla activa es
  para impresora térmica (el caso típico de `Pos Invoice`)**; sin el flag, guarda la imagen tal
  cual (color/escala de grises) — el caso típico de `Label 5x2` o un ticket impreso en impresora
  normal.
- Límite: 5MB, un solo archivo por request.
- `400 "Se espera multipart/form-data con el archivo en el campo \"file\"."` si el request no es
  multipart.
- `400 "No se recibió ningún archivo."` si es multipart pero no trae el campo `file`.

```json
// Response
{ "success": true, "data": { "fileUrl": "https://.../files/logo_abc123.png", "fileName": "logo_abc123.png" } }
```

El elemento `logo` del `documentJson` debe guardar `fileUrl` como su `src` — **nunca** el archivo
en base64 embebido en el JSON de la plantilla.

---

## 5. Migrar la impresión de Caja/POS al flujo nuevo

### 5.1 Cómo funciona HOY (antes de este cambio)

Al cerrar una venta / imprimir el ticket en Caja, se llama:

```
GET /invoices/:id/pdf?formato=pos
GET /invoices/:id/pdf                 ← sin el param, usa Facturacion Config.formatoImpresionDefault
```

Esto devuelve un PDF (`Content-Type: application/pdf`) generado en el servidor con Puppeteer
sobre el Print Format Jinja fijo `Factura RD POS`. Este endpoint **no se toca, no se rompe, no se
elimina** — sigue siendo el camino correcto para reimpresión desde el historial de facturas,
envío por correo, archivo fiscal, o cualquier flujo sin un navegador con sesión de usuario viva
(ej. un job en background). El cambio de este documento es **exclusivamente sobre la pantalla de
Caja/POS al momento de imprimir el ticket al cerrar una venta.**

### 5.2 Flujo NUEVO a implementar en Caja/POS

1. Al terminar de cobrar/someter la `Sales Invoice` (el mismo momento en que hoy se dispara la
   impresión del PDF viejo), llamar en su lugar:
   ```
   GET /plantillas/render-data?type=Pos%20Invoice&sourceId=<id de la Sales Invoice recién sometida>
   ```
2. Pasar `data.template.document` y `data.values` de la respuesta al **mismo motor de render que
   ya usa el editor** para su vista previa (el mismo componente que hoy dibuja contra datos de
   muestra) — ahora con datos reales.
3. El resultado (lo que ese motor produzca — HTML, canvas, lo que sea) se imprime desde el
   navegador: diálogo de impresión nativo, agente de impresión local, o lo que la pantalla de
   Caja ya use hoy para cualquier flujo de impresión que no sea "descargar un PDF" — esa decisión
   es 100% de frontend, el backend no participa en cómo se dispara la impresión física.
4. **Fallback obligatorio:** si `GET /plantillas/render-data` devuelve `404` (el tenant nunca
   configuró una plantilla `Pos Invoice` default — va a pasar en cualquier instalación existente
   el día que se despliegue este cambio, y en cualquier tenant nuevo hasta que alguien abra el
   editor), Caja debe caer automáticamente al flujo viejo (`GET /invoices/:id/pdf?formato=pos`)
   para no dejar de poder imprimir. No se puede asumir que el editor ya está configurado.

### 5.3 Qué implica la ausencia de histórico (leer antes de implementar reimpresión)

No existe ningún snapshot de "la plantilla que estaba vigente cuando se hizo esta venta" — fue
una decisión explícita de producto, no una limitación temporal. `render-data` **siempre** usa la
plantilla `Pos Invoice` default **vigente en el momento de la llamada** (o la que indique
`templateId`, si se pasa explícito). Si Caja/POS permite reimprimir una venta de hace 6 meses vía
este flujo nuevo, el ticket va a salir con el diseño de HOY, no con el que estaba activo cuando se
hizo la venta original — esto es intencional. Si en algún punto el negocio pide lo contrario, es
un cambio de alcance que hay que negociar con el backend, no algo resoluble solo en frontend.

---

## 6. Nuevo módulo: impresión de etiquetas de producto (`Label 5x2`)

Este flujo **no existía en ningún punto de la app** antes de este trabajo — no hay pantalla ni
botón que lo dispare todavía. Hay que crear el punto de entrada.

**Sugerido:** un botón "Imprimir etiqueta(s)" en Inventario/Catálogo de artículos, y/o en la
pantalla de recepción de mercancía (Compras) — donde tiene más sentido de negocio imprimir N
etiquetas por artículo recién recibido.

**Flujo sugerido:**
1. El usuario selecciona uno o más artículos y, para cada uno, cuántas copias de etiqueta quiere.
2. El frontend construye la lista `sourceIds` repitiendo cada código de artículo tantas veces
   como copias se pidieron (ej. 2 copias de `ITEM-1` + 1 de `ITEM-2` → `"ITEM-1,ITEM-1,ITEM-2"`).
3. Llamar `GET /plantillas/render-data?type=Label%205x2&sourceIds=...` (§3.2).
4. Iterar el array `labels` de la respuesta — cada entrada es una etiqueta/página a imprimir, en
   el mismo orden que se pidió.

Antes de construir esta pantalla, revisar §2.2 y §2.3 — el catálogo de `Label 5x2` es
deliberadamente mínimo (5 campos) y el precio mostrado es el de lista, no uno con descuento.

---

## 7. Forma del `documentJson` / `template.document`

El backend **nunca interpreta el contenido de este JSON** — lo guarda con `JSON.stringify` y lo
devuelve con `JSON.parse` tal cual, sin validar su forma interna más allá de que sea JSON válido
(si por algún motivo lo guardado no parsea, el backend devuelve `{}` en vez de romper). La forma
exacta (`page`, `pages[].elements[]`, los tipos de elemento `text`/`table`/`logo`/`qr`/`barcode`/
`formula`/`conditional`, cómo se evalúan condicionales y fórmulas, etc.) es **responsabilidad
exclusiva del editor de frontend** — el backend no la conoce, no la valida, y este documento no
la redefine. Si hay dudas sobre esa forma, la fuente de verdad es el propio código del editor ya
existente en el frontend, no el backend.

Lo único que hay que recordar de la relación entre el editor y este documento:

- El evaluador de `formula`/`conditional`/`table` del editor debe pasar de consumir datos de
  muestra a consumir el objeto `values` (o `labels[].values`) de `render-data` — mismo namespace
  de keys con puntos (`empresa.nombre`, `items.tabla`, etc.) que ya usa el editor sobre sus mocks,
  ahora resuelto contra datos reales.
- El elemento `formula` **nunca debe recalcular montos fiscales** — solo presentación (concatenar
  texto, formatear números/fechas). Todos los valores que entrega `render-data` ya vienen
  calculados por ERPNext; el frontend no debe inferir un total ni un impuesto combinando otros
  campos crudos.

---

## 8. Catálogo completo de errores de este módulo

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `sourceId es obligatorio para type=Pos Invoice.` | `render-data` con `type=Pos Invoice` sin `sourceId` |
| 400 | `sourceIds es obligatorio para type=Label 5x2 (códigos de artículo separados por coma).` | `render-data` con `type=Label 5x2` sin `sourceIds` (o vacío) |
| 404 | `Factura (Sales Invoice) no encontrada` | `render-data` con `sourceId` que no existe |
| 404 | `Artículo "<código>" no encontrado` | `render-data` con algún código de `sourceIds` que no existe |
| 404 | `Plantilla de impresión no encontrada` | `GET/PUT/DELETE /plantillas/:id` o `POST /plantillas/:id/predeterminada` con id inexistente, o `templateId` inválido en `render-data` |
| 404 | `No hay plantilla default configurada para "<type>"` | `GET /plantillas/default` o `render-data` sin `templateId`, cuando no hay ninguna default de ese tipo |
| 404 | `No hay empresa configurada en este tenant` | Caso raro — tenant sin `Company` en ERPNext (no debería ocurrir en producción) |
| 400 | `Se espera multipart/form-data con el archivo en el campo "file".` | `POST /plantillas/logo` sin `Content-Type: multipart/form-data` |
| 400 | `No se recibió ningún archivo.` | `POST /plantillas/logo` multipart sin el campo `file` |
| 400 | (mensaje libre, traducido de ERPNext) | `POST/PUT /plantillas` si el guardado es rechazado por alguna validación del lado ERPNext — no debería pasar desde un frontend que envía `documentJson` como objeto válido |

---

## Checklist de implementación

- [ ] Al abrir el editor para un tipo, llamar `GET /plantillas/campos-disponibles?type=` y usar
      esa lista como catálogo de bindings disponibles — no hardcodear la lista de §2.1/§2.2.
- [ ] Reemplazar el CRUD mock del editor (guardar/listar/cargar/marcar-default/eliminar
      plantilla) por los 7 endpoints de §1.
- [ ] Manejar el 404 de `GET /plantillas/default` (y de `render-data` sin `templateId`) cayendo
      a la plantilla sugerida que el propio editor ya sabe construir — nunca tratarlo como error
      fatal.
- [ ] Agregar advertencia al borrar una plantilla `isDefault: true` (§1.7 — no hay protección ni
      promoción automática del lado backend).
- [ ] Conectar el elemento `logo` del editor a `POST /plantillas/logo` (§4), usando `?termico=true`
      cuando la plantilla activa sea para impresora térmica.
- [ ] Reemplazar los evaluadores de `formula`/`conditional`/`table` (hoy sobre datos de muestra)
      por consumo real de `values`/`labels[].values` de `render-data` (§3).
- [ ] Migrar la impresión de Caja/POS al cerrar una venta: usar `render-data` (§5.2) con fallback
      obligatorio a `GET /invoices/:id/pdf?formato=pos` en caso de 404 (§5.2 punto 4).
- [ ] Confirmar que ningún otro punto de la app que llame `GET /invoices/:id/pdf` fue tocado
      (reimpresión desde historial, email, archivo) — ese endpoint sigue igual.
- [ ] Crear el punto de entrada nuevo de impresión de etiquetas (`Label 5x2`) — no existe hoy en
      ningún lugar de la app (§6).
- [ ] Al construir `sourceIds` para etiquetas, repetir códigos según cantidad de copias pedidas
      (§3.2) — no llamar el endpoint una vez por copia.
- [ ] Revisar §2.3 (gaps conocidos) antes de maquetar el diseño del ticket POS default — si el
      diseño necesita teléfono/dirección de empresa, coordinar con el BFF antes de continuar.

### Pruebas manuales

- [ ] Crear una plantilla `Pos Invoice`, marcarla default, y confirmar que `GET
      /plantillas/default?type=Pos%20Invoice` la devuelve.
- [ ] Llamar `render-data` de esa plantilla contra una factura POS real ya sometida y confirmar
      que `values` trae NCF, cliente, líneas, pagos y (si la factura es e-CF) el QR ya en base64.
- [ ] Borrar esa plantilla siendo la única default de su tipo → confirmar que `GET
      /plantillas/default` pasa a devolver 404, y que Caja/POS cae correctamente al PDF viejo.
- [ ] Subir un logo con `?termico=true` y confirmar visualmente que la imagen devuelta es 1-bit
      (blanco/negro puro, sin escala de grises).
- [ ] Pedir `render-data` de `Label 5x2` con `sourceIds=A,A,B` (dos artículos válidos, uno
      repetido) y confirmar que `labels` trae 3 entradas en ese orden exacto, con las dos
      entradas de `A` idénticas.
- [ ] Pedir `render-data` de `Label 5x2` con un código inexistente mezclado con códigos válidos y
      confirmar que la llamada completa falla con 404 (no hay respuesta parcial).
- [ ] Confirmar que `GET /invoices/:id/pdf?formato=pos` (el flujo viejo) sigue funcionando sin
      cambios para reimpresión fuera de Caja.
