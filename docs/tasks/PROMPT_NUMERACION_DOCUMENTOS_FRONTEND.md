# Prompt para agente de frontend — Numeración de documentos (Naming Series de ERPNext)

> **Leé este bloque completo antes de escribir una sola línea de código.** Es largo a propósito:
> el objetivo es que no tengas que inferir, adivinar ni "completar con sentido común" ningún
> detalle de este módulo. Si en algún momento te encontrás pensando "me imagino que esto funciona
> así", pará y buscá la respuesta exacta en este documento o en el `openapi.json` del proyecto —
> casi siempre ya está contestado acá. El `openapi.json` tiene la forma EXACTA (tipos, nombres de
> campo, enums) de cada request/response citado acá — si algo en este documento y el
> `openapi.json` no coinciden, **gana el `openapi.json`** (puede haber cambiado después de
> escribir esto), pero el comportamiento y las reglas de negocio descritas acá siguen siendo la
> fuente de verdad. Si los paths `/api/v1/config/numeracion…` **no aparecen** en tu `openapi.json`,
> el backend todavía no fue desplegado/regenerado: **pará y avisá**, no inventes los contratos.

## 0. Qué es esto, en una frase

Una sección nueva de **Configuración** donde un administrador del tenant puede ver y cambiar **cómo
se numeran los documentos** del ERP (por ejemplo, que las facturas de venta se llamen
`FAC-2026-00001`, las cotizaciones `COT-2026-00001`, los pedidos `PED-2026-00001`, etc.): qué
plantillas de numeración existen para cada tipo de documento, cuál es la predeterminada, cuál es el
próximo número que va a salir y —con cuidado— reiniciar o saltar un contador.

Es la configuración nativa de ERPNext llamada **Naming Series** (series de nombrado). El backend (BFF)
la expone tal cual; **toda la lógica de nombrado vive en ERPNext**, el frontend solo la muestra y la
edita.

### 0.1 Qué NO es (para no confundirte)

- **No es el NCF / e-NCF.** El NCF (comprobante fiscal de la DGII: `B0100000001`, `E310000000001`)
  es un dato distinto, con su propia configuración (`/config/ncf`, secuencias e-CF). Cambiar la
  numeración de una factura de venta cambia su **nombre interno** (`FAC-2026-00001`), **no** su NCF.
  Dejalo claro en la UI con un texto de ayuda (ver §8.4).
- **No renombra documentos ya emitidos.** Un cambio solo afecta a los documentos que se creen
  **de ahí en adelante**. Los existentes conservan su nombre.
- **No numera por artículo.** Los números de serie de artículos (Serial No) **no** están en este
  módulo (ver §3.3).

## 1. Prerrequisitos — no construyas nada de esto desde cero acá

Este módulo se apoya en mecanismos que tu frontend ya debería tener. Reutilizalos, no los reinventes:

1. **Features de tenant** (`GET /me/features`): cada tipo de documento de este módulo es **un
   feature independiente**, apagado por defecto, que GenSuite Control enciende tenant por tenant.
   Exactamente el mismo patrón que `compras`, `gastos`, `tesoreria`, etc. (ver `docs/plans/PLAN_FEATURES_TENANT.md` §10 y tu implementación actual del menú por features).
2. **Permisos v2** (`GET /me/permissions`, `GET /acceso/catalogo`): cada tipo tiene **su propio
   permiso**. Ver `docs/frontend/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md` si todavía no lo
   implementaste.
3. El patrón de **pantallas de Configuración** que ya existe (empresa, cobros, NCF, etc.): mismo
   layout, mismo manejo de guardado/errores, mismos componentes de formulario. Esta pantalla debe
   sentirse una más de esa familia.
4. El **manejo global de errores HTTP** del frontend (toasts, banners, 403 por feature/permiso).

## 2. El modelo mental: dos puertas por tipo

Cada tipo de documento tiene **dos puertas independientes** y para que un usuario pueda tocarlo
tienen que estar **las dos** abiertas:

| Puerta | Pregunta | Dónde se ve | Quién la controla |
|---|---|---|---|
| **Feature** | ¿El tenant contrató/tiene activa la configuración de numeración de este tipo? | `GET /me/features` → clave `numeracion<Tipo>` (booleano) | GenSuite Control (por tenant) |
| **Permiso** | ¿Este usuario puede gestionarla? | `GET /me/permissions` → `acciones["config.numeracion.<ruta>"]` (booleano) | Admin del tenant (por usuario/rol, Permisos v2) |

Hay **22 tipos** → 22 features + 22 permisos. Un tenant puede tener, por ejemplo, solo "Facturas de
venta" y "Cotizaciones" activos; y dentro de eso, un usuario puede tener permiso solo sobre
"Cotizaciones".

**Regla de oro de la UI:** la fuente de verdad de *qué tipos mostrar a este usuario* es el endpoint
índice `GET /config/numeracion` (§4.1). Ese endpoint ya hace la intersección feature ∩ permiso. **No
recalcules esa intersección a mano** salvo para decidir si mostrar o no el ítem de menú (§7.1).

## 3. Los 22 tipos de documento

### 3.1 Tabla completa (copiala tal cual a una constante de referencia de UI)

`ruta` es el segmento de URL; `feature` es la clave en `GET /me/features`; `accion` es la clave en
`GET /me/permissions`. El backend también devuelve `feature` y `accion` en el índice, así que **no
hace falta que los hardcodees** — esta tabla es para que entiendas el universo. Orden = orden de
presentación recomendado (agrupado por área).

| Área | `slug` | `ruta` | Nombre en UI | DocType ERPNext | Ejemplo | `modo` | `feature` | `accion` |
|---|---|---|---|---|---|---|---|---|
| Ventas | `cliente` | `cliente` | Clientes | Customer | `CLI-00001` | `series` | `numeracionCliente` | `config.numeracion.cliente` |
| Ventas | `cotizacion` | `cotizacion` | Cotizaciones | Quotation | `COT-2026-00001` | `series` | `numeracionCotizacion` | `config.numeracion.cotizacion` |
| Ventas | `pedido` | `pedido` | Pedidos | Sales Order | `PED-2026-00001` | `series` | `numeracionPedido` | `config.numeracion.pedido` |
| Ventas | `despacho` | `despacho` | Despachos | Delivery Note | `DES-2026-00001` | `series` | `numeracionDespacho` | `config.numeracion.despacho` |
| Ventas | `facturaVenta` | `factura-venta` | Facturas de venta | Sales Invoice | `FAC-2026-00001` | `series` | `numeracionFacturaVenta` | `config.numeracion.factura-venta` |
| Ventas | `notaCreditoVenta` | `nota-credito-venta` | Notas de crédito de venta (devoluciones) | Sales Invoice | `NC-FAC-2026-00001` | `regla-devolucion` | `numeracionNotaCreditoVenta` | `config.numeracion.nota-credito-venta` |
| Compras | `proveedor` | `proveedor` | Proveedores | Supplier | `PROV-00001` | `series` | `numeracionProveedor` | `config.numeracion.proveedor` |
| Compras | `solicitudCompra` | `solicitud-compra` | Solicitudes de compra | Material Request | `SOL-COM-2026-00001` | `series` | `numeracionSolicitudCompra` | `config.numeracion.solicitud-compra` |
| Compras | `solicitudCotizacion` | `solicitud-cotizacion` | Solicitudes de cotización (RFQ) | Request for Quotation | `RFQ-2026-00001` | `series` | `numeracionSolicitudCotizacion` | `config.numeracion.solicitud-cotizacion` |
| Compras | `cotizacionProveedor` | `cotizacion-proveedor` | Cotizaciones de proveedor | Supplier Quotation | `COT-PROV-2026-00001` | `series` | `numeracionCotizacionProveedor` | `config.numeracion.cotizacion-proveedor` |
| Compras | `ordenCompra` | `orden-compra` | Órdenes de compra | Purchase Order | `OC-2026-00001` | `series` | `numeracionOrdenCompra` | `config.numeracion.orden-compra` |
| Compras | `recepcionCompra` | `recepcion-compra` | Recepciones de compra | Purchase Receipt | `REC-2026-00001` | `series` | `numeracionRecepcionCompra` | `config.numeracion.recepcion-compra` |
| Compras | `facturaCompra` | `factura-compra` | Facturas de compra y gastos | Purchase Invoice | `COMP-2026-00001` | `series` | `numeracionFacturaCompra` | `config.numeracion.factura-compra` |
| Inventario | `movimientoInventario` | `movimiento-inventario` | Movimientos de inventario | Stock Entry | `MOV-2026-00001` | `series` | `numeracionMovimientoInventario` | `config.numeracion.movimiento-inventario` |
| Inventario | `ajusteInventario` | `ajuste-inventario` | Ajustes de inventario | Stock Reconciliation | `AJU-2026-00001` | `series` | `numeracionAjusteInventario` | `config.numeracion.ajuste-inventario` |
| Inventario | `lote` | `lote` | Lotes | Batch | `LOT-2026-00001` | `lote` | `numeracionLote` | `config.numeracion.lote` |
| Contabilidad | `pago` | `pago` | Pagos y cobros | Payment Entry | `PAG-2026-00001` | `series` | `numeracionPago` | `config.numeracion.pago` |
| Contabilidad | `asientoDiario` | `asiento-diario` | Asientos de diario | Journal Entry | `DI-2026-00001` | `series` | `numeracionAsientoDiario` | `config.numeracion.asiento-diario` |
| Contabilidad | `solicitudPago` | `solicitud-pago` | Solicitudes de pago | Payment Request | `PR-2026-00001` | `series` | `numeracionSolicitudPago` | `config.numeracion.solicitud-pago` |
| RRHH | `empleado` | `empleado` | Empleados | Employee | `EMP-00001` | `series` | `numeracionEmpleado` | `config.numeracion.empleado` |
| RRHH | `reclamoGastos` | `reclamo-gastos` | Reclamos de gastos | Expense Claim | `GAST-2026-00001` | `series` | `numeracionReclamoGastos` | `config.numeracion.reclamo-gastos` |
| Activos | `activo` | `activo` | Activos fijos | Asset | `ACT-2026-00001` | `series` | `numeracionActivo` | `config.numeracion.activo` |

Los `ejemplo` son orientativos (el formato real lo define la plantilla configurada); usalos como
placeholder/ayuda visual, **no** como valor por defecto a enviar.

**Observaciones importantes sobre la tabla:**

- "Pagos y cobros" (`Payment Entry`) es **un solo** tipo: ERPNext usa el mismo DocType para cobros a
  clientes, pagos a proveedores y emisiones/depósitos de tesorería. No hay forma de numerarlos por
  separado.
- "Facturas de compra y gastos" (`Purchase Invoice`) también es **un solo** tipo: compras y gastos
  comparten DocType en ERPNext.
- "Facturas de venta" (`Sales Invoice`) y "Notas de crédito de venta" son DocTypes iguales pero se
  configuran por **separado** (modos distintos, ver §3.2).

### 3.2 Los tres `modo`s — cambian la pantalla de detalle

El campo `modo` de cada tipo decide qué controles muestra la pantalla de detalle:

| `modo` | Tipos | Qué se edita |
|---|---|---|
| `series` | 19 tipos (la mayoría) | Una **lista ordenada de plantillas** (series). La primera es la predeterminada. |
| `regla-devolucion` | `notaCreditoVenta` | **Una sola** plantilla (o ninguna = regla desactivada). |
| `lote` | `lote` | **Un interruptor + un prefijo** (no son series). |

Detalle de cada uno en §6.

### 3.3 Lo que NO está (y por qué)

- **Serial No (números de serie)**: ERPNext no tiene una serie a nivel de sitio para esto; se define
  **por artículo** (`Item.serial_no_series`). No hay endpoint ni feature. **No lo construyas**
  aunque lo veas en alguna lista de producto: está fuera de alcance de este módulo.
- **Artículos (Item)** y otros doctypes: fuera de alcance.

## 4. Contrato de la API

Todo bajo el prefijo `/api/v1`. Todas las rutas requieren `Authorization: Bearer <jwt>` y el header
`X-Tenant`, igual que el resto. **Verificá nombres exactos de campo contra `openapi.json`** (tag
"Numeración de documentos"); acá va la semántica.

Todas las respuestas exitosas usan el sobre `{ "success": true, "data": … }`.

### 4.1 Índice — `GET /api/v1/config/numeracion`

Devuelve los tipos que el tenant tiene activos **y** que el usuario actual puede gestionar. No
recibe parámetros.

```jsonc
{
  "success": true,
  "data": [
    {
      "slug": "facturaVenta",
      "doctype": "Sales Invoice",
      "area": "Ventas",
      "nombre": "Facturas de venta",
      "ejemplo": "FAC-2026-00001",
      "modo": "series",                       // "series" | "regla-devolucion" | "lote"
      "ruta": "/api/v1/config/numeracion/factura-venta",   // ⚠️ YA incluye /api/v1 (ver nota)
      "feature": "numeracionFacturaVenta",
      "accion": "config.numeracion.factura-venta"
    }
    // …
  ]
}
```

⚠️ **El campo `ruta` es un path absoluto que ya incluye `/api/v1`.** No lo concatenes a la base URL
del cliente HTTP si esa base ya trae `/api/v1` (te quedaría `/api/v1/api/v1/...`). Opciones: tomá
solo el último segmento (`factura-venta`) y armá `/config/numeracion/${segmento}` con tu cliente, o
usá el path tal cual con un cliente sin base. Elegí una y sé consistente.

- Si el usuario no tiene ningún tipo → `data: []` (no es un error). Mostrá el estado vacío (§7.3).
- **No es paginado** (máximo 22 filas), por eso no lleva `limit/offset`.
- Esta ruta **no** exige un permiso específico (no existe un permiso "global"); solo requiere estar
  autenticado. La seguridad está en que filtra por feature + permiso.

### 4.2 Estado de un tipo — `GET /api/v1/config/numeracion/<ruta>`

`<ruta>` = el segmento de la tabla §3.1 (ej. `factura-venta`).

```jsonc
{
  "success": true,
  "data": {
    // metadatos del tipo (los mismos que el índice)
    "slug": "facturaVenta", "doctype": "Sales Invoice", "area": "Ventas",
    "nombre": "Facturas de venta", "ejemplo": "FAC-2026-00001",
    "modo": "series", "ruta": "/api/v1/config/numeracion/factura-venta",
    "feature": "numeracionFacturaVenta", "accion": "config.numeracion.factura-venta",

    // estado actual
    "series": [
      {
        "plantilla": "FAC-.YYYY.-",        // tal como la guarda ERPNext
        "esPredeterminada": true,          // solo la PRIMERA de la lista
        "prefijo": "FAC-2026-",            // prefijo ya evaluado con la fecha actual (o null)
        "contador": 41,                    // ÚLTIMO número emitido con ese prefijo (0 si nunca se usó) (o null)
        "proximo": "FAC-2026-00042"        // lo que saldría ahora (o null)
      },
      { "plantilla": "FAC-B01-.#####", "esPredeterminada": false,
        "prefijo": "FAC-B01-", "contador": 0, "proximo": "FAC-B01-00001" }
    ],
    "reservadas": ["APER-SINV-.#####"],    // series del sistema: solo informativas
    "nombradoPor": "Naming Series",        // SOLO en cliente y proveedor (ver §6.4)
    "lote": { "usarSerie": true, "prefijo": "LOT-" }   // SOLO en modo "lote" (ver §6.3)
  }
}
```

Reglas de lectura:

- `series` **vacío** es válido: en `regla-devolucion` significa "regla desactivada/inexistente"; en
  `lote` siempre viene vacío (se usa `lote`).
- `prefijo`, `contador` y `proximo` pueden ser **`null`** cuando la plantilla usa campos del
  documento (ej. `{customer_group}`) y ERPNext no puede evaluarla sin un documento. En ese caso:
  mostrá la plantilla y un guion `—` en esas columnas, y **deshabilitá la edición de contador** para
  esa fila (§6.5).
- `contador` es el **último número ya emitido**, no el próximo. El próximo es `contador + 1` con
  ceros a la izquierda; ya viene calculado en `proximo`. Mostrá `proximo` como dato principal.
- `reservadas` son series que el sistema usa internamente (por ejemplo, para facturas de apertura:
  migración de saldos). **No se editan, no se reordenan, no se borran.** Mostralas, si querés, en un
  bloque informativo gris ("Series reservadas por el sistema") o ignoralas; nunca las metas en el
  editor ni las reenvíes en el PUT.
- `nombradoPor` y `lote` son **opcionales**: aparecen solo en los tipos a los que aplican.
- Esta llamada hace varias consultas a ERPNext (≈ 2 por serie + 1). Puede tardar uno o dos
  segundos: mostrá un skeleton, no un spinner bloqueante de pantalla completa. No hagas polling.

### 4.3 Guardar — `PUT /api/v1/config/numeracion/<ruta>`

Body (todos los campos opcionales, mandá **solo lo que cambió o aplica al modo**):

```jsonc
{
  "series": ["FAC-.YYYY.-", "FAC-B01-.#####"],   // lista COMPLETA y ORDENADA (reemplaza la actual)
  "nombradoPor": "Naming Series",                // solo cliente/proveedor
  "lote": { "usarSerie": true, "prefijo": "LOT-" } // solo modo lote
}
```

Respuesta: **el estado actualizado completo**, con la misma forma de §4.2. **Usala para refrescar
la pantalla** (no hace falta un GET adicional) y para invalidar/actualizar tu caché de ese tipo.

Reglas (las valida el backend; replicalas en el cliente para dar feedback inmediato, pero **el
servidor manda**):

- `series` es una lista **completa**: lo que mandes **reemplaza** la lista actual. Si quitás una
  plantilla del arreglo, esa serie deja de ofrecerse (los documentos ya emitidos con ella no se
  tocan). **No incluyas las `reservadas`**: el backend las conserva solo, siempre al final.
- La **primera** plantilla del arreglo es la **predeterminada** (la que ERPNext usa cuando el sistema
  crea un documento sin elegir serie — y el BFF **siempre** crea documentos sin elegir serie). Por
  eso el **orden importa**: reordenar = cambiar la predeterminada.
- Máximo **20** plantillas; cada una máximo **100** caracteres; sin duplicados; no vacías; solo
  caracteres `A-Z a-z 0-9 - _ . / # { }` y espacio (regex del servidor:
  `^[A-Za-z0-9\-_./#{} ]+$`).
- No se puede dejar la lista **vacía** en modo `series` (400 "Debe quedar al menos una serie").
- No se puede usar una plantilla igual a una `reservada` (400).
- `nombradoPor` solo aplica a cliente y proveedor (400 en cualquier otro tipo).
- `lote` solo aplica al tipo `lote`; y en `lote` **no se envía `series`** (400).
- Podés mandar `series` y `nombradoPor` juntos en la misma llamada (cliente/proveedor).

### 4.4 Fijar contador — `PUT /api/v1/config/numeracion/<ruta>/contador`

```jsonc
{ "plantilla": "FAC-.YYYY.-", "valor": 150 }
```

- `plantilla` debe ser **exactamente** una de las `series[].plantilla` actuales (si no → 400 "Esa
  plantilla no está en la configuración actual").
- `valor` = **último número emitido** (entero ≥ 0). El próximo documento será `valor + 1`. Ej.:
  `valor: 150` → el siguiente será `FAC-2026-00151`.
- Respuesta: el estado actualizado completo (§4.2).
- **No existe en modo `lote`** (400).
- 409 `CONTADOR_NO_EDITABLE` si la plantilla usa campos del documento (no se puede fijar). Deberías
  haber deshabilitado el control antes (cuando `prefijo === null`).
- ⚠️ **Operación peligrosa.** Bajar un contador por debajo de lo ya emitido hace que ERPNext intente
  reutilizar nombres existentes y **falle al crear documentos** (nombre duplicado). Subirlo
  "salta" números (hueco permanente en la secuencia). Ver los avisos obligatorios en §8.3.
- ERPNext exige el rol **System Manager** para esta operación. Si el usuario tiene el permiso del
  BFF pero no ese rol en ERPNext, vas a recibir un 403 de ERPNext → mostralo como error normal
  (§9).

### 4.5 Vista previa — `POST /api/v1/config/numeracion/<ruta>/preview`

```jsonc
{ "plantilla": "FAC-.YYYY.-" }
```

Respuesta: `{ "success": true, "data": ["FAC-2026-00001", "FAC-2026-00002", "FAC-2026-00003"] }`.

- Devuelve **3 nombres de ejemplo**, **siempre empezando en `00001`**: ERPNext genera la vista
  previa **sin consultar el contador real**. Sirve para ver "cómo se vería el formato", **no** para
  saber qué número sigue. Para el número real usá `series[].proximo`.
- `data: []` (arreglo vacío) = la plantilla es inválida o no se pudo evaluar → mostrá "Plantilla no
  válida" (sin tratarlo como error HTTP).
- **Es una consulta, no una escritura**: no cambia nada. Responde `200` (no `201`).
- No disponible en modo `lote` (400).
- Usala en el editor mientras el usuario escribe (con **debounce de ~400 ms** y cancelando la
  petición anterior).

### 4.6 `GET /me/features` y `GET /me/permissions`

- `GET /me/features` ahora trae **22 claves nuevas** `numeracion*` dentro de `features` (ver tabla
  §3.1). Actualizá tu tipo/interfaz de `FeaturesMap`. **Trátalas como `false` si faltan** (tenants o
  backends más viejos).
- `GET /me/permissions` ya trae las 22 acciones `config.numeracion.<ruta>` dentro de `acciones`.
  (Con Permisos v2 en modo `activo` salen del acceso efectivo del usuario; en modo `off` se derivan
  de ERPNext. Para el frontend es transparente: leé el booleano.)
- `GET /acceso/catalogo` (administración de permisos v2) ahora incluye una **pantalla** nueva
  `config.numeracion` ("Numeración de documentos", módulo Configuración) con **22 componentes**
  (uno por tipo, con el nombre del tipo como etiqueta). Si tu pantalla de administración de
  permisos renderiza el catálogo dinámicamente, **aparecen solos — no hardcodees nada**. No hay
  componentes de tipo `filtro` en esta pantalla (los endpoints no tienen query params).

## 5. Cómo se ve el flujo de punta a punta

1. El usuario entra a Configuración → **Numeración de documentos** (§7.1).
2. La pantalla llama a `GET /config/numeracion` y muestra los tipos agrupados por área.
3. El usuario abre un tipo → la pantalla llama a `GET /config/numeracion/<ruta>`.
4. Edita (plantillas / orden / prefijo de lote / "nombrado por") con vista previa en vivo.
5. Guarda → `PUT /config/numeracion/<ruta>` → la respuesta trae el estado nuevo → se actualiza la UI.
6. Opcional y con avisos: fija un contador → `PUT …/contador`.

## 6. Pantalla de detalle por `modo`

### 6.1 Modo `series` (19 tipos) — el editor de series

Mostrá una **lista ordenada** de filas, una por serie, con:

- Un **indicador de predeterminada** en la primera fila (badge "Predeterminada").
- **Plantilla** (texto monoespaciado) — editable.
- **Próximo número** (`proximo`) y **último emitido** (`contador`) — solo lectura.
- Acciones por fila: **subir / bajar** (o drag & drop), **"Establecer como predeterminada"**
  (= mover al primer lugar), **eliminar**.
- Botón **"Agregar serie"** (añade una fila vacía en edición).
- Debajo de cada plantilla en edición: la **vista previa** (§4.5) con los 3 nombres de ejemplo.

Comportamiento:

- Trabajá sobre una **copia local** (borrador). Nada se envía hasta que el usuario pulsa
  **Guardar**. Botón **Descartar cambios** vuelve al último estado del servidor.
- Detectá cambios (dirty state) y avisá si el usuario intenta salir con cambios sin guardar.
- Al Guardar, enviá `{ series: [...] }` con **la lista completa y ordenada** de plantillas (strings),
  **sin** las reservadas y **sin** campos extra (`proximo`, `contador`, etc.).
- Una serie **recién agregada** no tiene `proximo/contador` hasta guardar y recargar: mostrá `—`.
- No permitas guardar si hay plantillas vacías, repetidas, con caracteres inválidos, o la lista
  vacía (mismo set de reglas que §4.3) — mostrá el error junto al campo.
- Si el usuario **elimina** una serie que tenía contador > 0, pedí confirmación: "Los documentos
  ya emitidos con esta serie conservan su nombre. A partir de ahora no se podrá elegir esta serie".

#### Ayuda para escribir plantillas (obligatoria — la gente no conoce la sintaxis)

Debajo del editor, un bloque de ayuda colapsable "¿Cómo se escribe una plantilla?":

- Una plantilla son **partes separadas por punto**. El número consecutivo se escribe con `#`
  precedido de punto: `.#####` = 5 dígitos. Ej.: `FAC-.YYYY.-.#####` → `FAC-2026-00001`.
- Si la plantilla **no tiene `#`**, ERPNext agrega `.#####` solo: `FAC-.YYYY.-` → `FAC-2026-00001`.
- Variables de fecha disponibles (entre puntos): `.YYYY.` año de 4 dígitos, `.YY.` año de 2,
  `.MM.` mes, `.DD.` día, `.FY.` año fiscal. Ej.: `COT-.YY.-.MM.-.####` → `COT-26-10-0001`.
- Caracteres permitidos: letras, números, `-`, `_`, `.`, `/`, `#`, `{ }` y espacio.
- **Chips clicables** que inserten esos tokens (`.YYYY.`, `.YY.`, `.MM.`, `.DD.`, `.#####`) en la
  posición del cursor.
- Reglas que ERPNext aplica (y que el servidor te devolverá como error si se violan): debe haber al
  menos un punto; si hay `#`, tiene que ir precedido de punto (`.#`); **dos tipos de documento no
  pueden compartir la misma serie** (error "Series X ya se usa en Y" → mostralo tal cual).
- Plantillas con campos del documento entre llaves (ej. `{customer_group}`) son válidas en
  ERPNext, pero **no se pueden previsualizar ni fijar su contador desde acá**. Si un usuario las usa,
  mostrá `—` en vista previa/contador y avisá que "no se puede previsualizar".

### 6.2 Modo `regla-devolucion` — Notas de crédito de venta

Las notas de crédito de venta (devoluciones) en ERPNext **no tienen una serie propia**; el backend
las implementa con una **regla de numeración** que se aplica solo a las facturas de venta marcadas
como devolución. Para el usuario es transparente, pero la UI cambia:

- **Una sola plantilla** (no una lista). Sin botones de reordenar / "agregar serie".
- La plantilla **debe terminar en `.` + `#`s** (ej. `NC-FAC-.YYYY.-.#####`) — de lo contrario el
  servidor responde 400 ("La plantilla debe terminar en dígitos…"). Validá en el cliente.
- Estado "**sin configurar**" (`series: []`): mostrá "Sin regla activa — las devoluciones usan la
  numeración de las facturas de venta". Con un botón "Configurar".
- Para **desactivar** la regla: enviá `{ "series": [] }` (arreglo vacío). Confirmación previa: "Las
  notas de crédito volverán a numerarse con la serie de facturas de venta".
- El contador de esta regla es **propio** (independiente de la serie de facturas): `contador`/
  `proximo` ya vienen correctos.
- `esPredeterminada` siempre es `true` en la única fila; ignoralo visualmente (no pongas badge).

### 6.3 Modo `lote` — Lotes

Los lotes **no usan series**. Se configuran en los ajustes de inventario con dos valores. La
pantalla muestra un **formulario**, no un editor de lista:

- **Interruptor** "Numerar lotes automáticamente con una serie" ↔ `lote.usarSerie`.
- **Prefijo** (texto, máx. 40) ↔ `lote.prefijo`. Habilitado solo si el interruptor está encendido
  (pero podés dejarlo editable y simplemente avisar que no tiene efecto si está apagado).
- Guardar: `PUT` con `{ "lote": { "usarSerie": true, "prefijo": "LOT-" } }`. **No mandes `series`**.
- **Sin vista previa, sin contador** (esas rutas devuelven 400 para este tipo): no muestres esos
  controles.
- Texto de ayuda: "Si está apagado, el código del lote lo escribe el usuario manualmente".

### 6.4 `nombradoPor` — solo Clientes (`cliente`) y Proveedores (`proveedor`)

En ERPNext, los clientes y proveedores **solo usan la serie si "nombrado por" está en *Naming
Series***. Si está en otra opción, **las series configuradas se ignoran**. Por eso estos dos tipos
traen `nombradoPor` y se puede editar:

| Tipo | Valores válidos (mostralos solo estos) | Etiquetas sugeridas |
|---|---|---|
| Cliente | `Customer Name`, `Naming Series`, `Auto Name` | "Nombre del cliente", "Serie de numeración", "Automático (hash)" |
| Proveedor | `Supplier Name`, `Naming Series`, `Auto Name` | "Nombre del proveedor", "Serie de numeración", "Automático (hash)" |

(El backend acepta los 4 valores en un solo enum pero ERPNext valida por tipo: **ofrecé solo los 3
que corresponden**. Enviar `Supplier Name` a un cliente falla.)

- Mostrá este selector **arriba** del editor de series, con una **advertencia visible** cuando el
  valor no sea `Naming Series`: "Las series de abajo no se aplican mientras el nombrado sea por
  nombre/automático".
- Se guarda en el mismo `PUT` (puede ir junto con `series`).

### 6.5 Fijar contador (modos `series` y `regla-devolucion`)

Por cada serie, un botón secundario **"Fijar contador…"** (ícono discreto, no protagonista) que abre
un **diálogo**:

- Título: "Fijar contador de `<plantilla>`".
- Muestra: último número emitido (`contador`) y próximo (`proximo`).
- Campo numérico **"Último número emitido"** (entero ≥ 0), precargado con `contador`.
- Texto en vivo: "El próximo documento será `<prefijo><valor+1 con ceros>`" (calculalo con los
  dígitos de la plantilla — cantidad de `#` finales; 5 si no hay).
- **Aviso rojo si `valor < contador`**: "Estás bajando el contador. Si ya existen documentos con esos
  números, el sistema fallará al crear nuevos documentos (nombre duplicado)."
- **Aviso ámbar si `valor > contador + 1`**: "Se va a saltar de número: quedará un hueco
  permanente en la secuencia."
- Pedí **confirmación explícita** (checkbox "Entiendo el riesgo" o escribir `CONFIRMAR`) antes de
  habilitar el botón Aplicar.
- Deshabilitá el botón "Fijar contador…" cuando `prefijo === null` (plantilla con campos) con tooltip
  "No se puede fijar el contador de plantillas que usan campos del documento".
- Tras éxito, actualizá el estado con la respuesta y avisá con un toast.
- **Guardá antes de fijar**: si hay cambios sin guardar en el editor, pedí guardarlos o descartarlos
  primero (el contador opera sobre las plantillas **guardadas**; una plantilla recién agregada y sin
  guardar daría 400).

## 7. Navegación, menú y estados

### 7.1 Ítem de menú y ruta

- Un ítem **"Numeración de documentos"** dentro del grupo **Configuración**, con una ruta propia (usá
  la convención de rutas de tus otras pantallas de configuración, p. ej. `/configuracion/numeracion`
  y `/configuracion/numeracion/:ruta`).
- Mostralo **solo si** existe al menos un tipo accesible. Decisión práctica: mostrá el ítem si
  **algún** `features.numeracion*` es `true` **y** el usuario tiene **alguna** acción
  `config.numeracion.*` en `true`. (Aun así, el contenido real lo decide el índice.)
- Si el usuario entra por URL directa a `/…/numeracion/:ruta` de un tipo que **no** está en el índice,
  mostrá el estado "No disponible" estándar (§9) — **no** redirijas en silencio.

### 7.2 Pantalla índice

- Llamá a `GET /config/numeracion`. Mostrá los tipos **agrupados por `area`** (Ventas, Compras,
  Inventario, Contabilidad, RRHH, Activos), en ese orden.
- Cada tipo es una **tarjeta**: nombre, `doctype` (secundario, pequeño), `ejemplo` como formato de
  muestra, y un chip de `modo` solo cuando no sea `series` (p. ej. "Regla de devoluciones",
  "Prefijo de lote"). Click → detalle.
- **Búsqueda local** opcional por nombre (son ≤ 22, no hace falta endpoint).
- No muestres contadores ni "próximo" en el índice: eso requiere una llamada por tipo; se ve en el
  detalle.

### 7.3 Estados vacíos y de error

| Situación | Qué mostrar |
|---|---|
| Índice con `data: []` | "No tienes tipos de documento habilitados para configurar. Si lo necesitás, pedile a un administrador que active la numeración y te otorgue acceso." |
| Detalle → 409 `NUMERACION_NO_DISPONIBLE` | Estado informativo (no un toast de error rojo): "La numeración de *Reclamos de gastos* no está disponible en este sitio (requiere el módulo de RRHH instalado)." Aplica hoy a **Reclamos de gastos** (`reclamoGastos`) en tenants sin el módulo de RRHH. Mantené la tarjeta visible en el índice pero, al abrirla, mostrá este estado. |
| Detalle → 403 `FEATURE_NO_CONTRATADO` | El estado "módulo no incluido en el plan" que ya uses en otras pantallas. |
| Detalle → 403 por permiso | El estado "sin permiso" estándar. |

## 8. Textos, avisos y advertencias obligatorias

### 8.1 Aviso general (banner permanente en la pantalla de detalle)

> "Los cambios aplican **solo a documentos nuevos**. Los documentos ya emitidos conservan su número."

### 8.2 Aviso sobre la serie predeterminada

> "La **primera** serie de la lista es la que el sistema usa al crear documentos automáticamente.
> Cambiar el orden cambia cuál se usa."

### 8.3 Contadores

Los avisos de §6.5. No los omitas ni los suavices: es la acción con más riesgo del módulo.

### 8.4 Aclaración fiscal (solo en tipos de venta/compra con comprobante)

En `facturaVenta`, `notaCreditoVenta` y `facturaCompra`, agregá una nota informativa: "Esto cambia el
**número interno** del documento. El NCF/e-NCF fiscal se configura aparte (Configuración → Secuencias
NCF) y **no** se ve afectado."

### 8.5 Series reservadas

Si `reservadas.length > 0`, un texto gris: "El sistema mantiene además series reservadas
(`APER-SINV-.#####`) para facturas de apertura. No se pueden modificar."

## 9. Manejo de errores (cuadro completo)

Usá tu **manejo global de errores** actual (mismo formato de respuesta de error que el resto de la
API). Lo específico de este módulo:

| HTTP | `code` (cuando viene) | Cuándo | Qué hacer |
|---|---|---|---|
| 400 | — | Validación del body (plantilla inválida/repetida/vacía, `series` en `lote`, `nombradoPor` en tipo que no aplica, plantilla de regla sin `#`, plantilla ausente al fijar contador…) | Mostrar el `message` junto al campo o como toast. |
| 400 | — | Error de ERPNext al validar una serie (sintaxis inválida, **serie ya usada por otro tipo de documento**) | Mostrar el mensaje de ERPNext tal cual (viene en español/inglés según el sitio). No lo "traduzcas" ni lo ocultes. |
| 403 | `FEATURE_NO_CONTRATADO` | El tenant no tiene el feature de ese tipo | Estado "no incluido en el plan". |
| 403 | `PERMISO_INSUFICIENTE` (Permisos v2) o mensaje legado | El usuario no tiene `config.numeracion.<ruta>` | Estado "sin permiso". |
| 403 | — (viene de ERPNext) | El usuario no tiene permisos en ERPNext para esa operación (típico: fijar contador sin ser System Manager) | Toast: "No tienes permisos en el sistema para esta operación". |
| 409 | `NUMERACION_NO_DISPONIBLE` | El sitio no tiene el DocType/app (hoy: Reclamos de gastos sin RRHH) | Estado informativo (§7.3). |
| 409 | `CONTADOR_NO_EDITABLE` | Se intentó fijar el contador de una plantilla con campos del documento | Mensaje; ya deberías haber deshabilitado el control. |
| 4xx/5xx | — | Conflicto de edición concurrente (otro admin guardó a la vez; ERPNext responde "fue modificado después de abrirlo") | Ofrecer "Recargar" (re-GET) y reintentar. No pierdas el borrador local del usuario. |

Regla general: **ante un error en `PUT`, no descartes el borrador del usuario**; dejalo editable
para que corrija y reintente.

## 10. Reglas de oro de UX para esta pantalla

1. **Nada se aplica sin Guardar.** Excepto "Fijar contador", que es una acción inmediata con su
   propio diálogo de confirmación.
2. **Refrescá con la respuesta del PUT**, no con un GET aparte.
3. **El servidor manda.** Validá en el cliente para feedback rápido, pero si el servidor rechaza,
   mostrá su mensaje.
4. **No muestres nada que el usuario no pueda usar**: índice ya filtrado; sin botón "Fijar contador"
   en lote; sin selector `nombradoPor` fuera de cliente/proveedor; sin vista previa en lote.
5. **Cuidado con el idioma de los tokens**: las plantillas son técnicas (`.YYYY.`); la UI que las
   rodea va en español.
6. **Accesibilidad**: reordenar con drag & drop **debe** tener alternativa por teclado/botones
   (subir/bajar).
7. **Idempotencia**: guardar dos veces la misma lista es inocuo.

## 11. Qué NO hay que construir

- Edición, renombrado o eliminación de **documentos ya emitidos**.
- Numeración de **Serial No / por artículo**.
- Configuración del **NCF / e-NCF** (ya existe en su propia sección).
- Creación/edición de los features o permisos: eso lo hacen GenSuite Control y la administración de
  Permisos v2 existente.
- Historial/auditoría de cambios de numeración (no existe endpoint).
- Exportaciones o impresión.

## 12. Tipos TypeScript sugeridos (ajustá a tu convención; verificá contra `openapi.json`)

```ts
type NumeracionModo = 'series' | 'regla-devolucion' | 'lote';

interface NumeracionTipo {
  slug: string;
  doctype: string;
  area: 'Ventas' | 'Compras' | 'Inventario' | 'Contabilidad' | 'RRHH' | 'Activos';
  nombre: string;
  ejemplo: string;
  modo: NumeracionModo;
  ruta: string;      // ⚠️ incluye /api/v1 — ver §4.1
  feature: string;   // p. ej. 'numeracionFacturaVenta'
  accion: string;    // p. ej. 'config.numeracion.factura-venta'
}

interface SerieNumeracion {
  plantilla: string;
  esPredeterminada: boolean;
  proximo: string | null;
  prefijo: string | null;
  contador: number | null;
}

interface NumeracionEstado extends NumeracionTipo {
  series: SerieNumeracion[];
  reservadas: string[];
  nombradoPor?: 'Customer Name' | 'Supplier Name' | 'Naming Series' | 'Auto Name';
  lote?: { usarSerie: boolean; prefijo: string | null };
}

interface UpdateNumeracion {
  series?: string[];
  nombradoPor?: string;
  lote?: { usarSerie: boolean; prefijo?: string };
}

interface ContadorNumeracion { plantilla: string; valor: number }
```

## 13. Checklist de implementación

**Datos y gating**
- [ ] Tipos de `FeaturesMap` ampliados con las 22 claves `numeracion*` (ausente ⇒ `false`).
- [ ] Ítem de menú "Numeración de documentos" bajo Configuración, visible según §7.1.
- [ ] Rutas `/…/numeracion` (índice) y `/…/numeracion/:ruta` (detalle); acceso directo a un tipo no
      permitido muestra el estado estándar (no redirige en silencio).

**Índice**
- [ ] `GET /config/numeracion`, agrupado por área, tarjetas, estado vacío (§7.3), manejo correcto del
      campo `ruta` que ya incluye `/api/v1` (§4.1).

**Detalle — modo `series`**
- [ ] Lista ordenada con badge de predeterminada, reordenar (drag + botones), agregar, eliminar con
      confirmación, borrador local + Guardar/Descartar + aviso de cambios sin guardar.
- [ ] Validación cliente: no vacías, sin duplicados, regex, ≤ 100 caracteres, ≤ 20 series, lista no
      vacía.
- [ ] Vista previa en vivo (debounce ~400 ms, cancela la anterior; `[]` ⇒ "plantilla no válida").
- [ ] Ayuda de sintaxis + chips de tokens.
- [ ] El PUT envía solo strings, sin reservadas, lista completa y ordenada; refresca con la respuesta.
- [ ] Reservadas mostradas solo como información.

**Detalle — otros modos**
- [ ] `regla-devolucion`: plantilla única, validación de `.#####`, estado "sin configurar", desactivar
      con `series: []` + confirmación.
- [ ] `lote`: formulario interruptor + prefijo; sin vista previa ni contador.
- [ ] `cliente`/`proveedor`: selector `nombradoPor` con **3** opciones según el tipo + advertencia.

**Contador**
- [ ] Diálogo con avisos rojo/ámbar, confirmación explícita, deshabilitado si `prefijo === null`,
      exige guardar antes, refresca con la respuesta.

**Errores y textos**
- [ ] Tabla de errores §9 implementada (409 `NUMERACION_NO_DISPONIBLE` como estado informativo).
- [ ] Banners de §8 (solo documentos nuevos, predeterminada, aclaración fiscal en los tipos
      indicados, reservadas).
- [ ] No se pierde el borrador ante un error del PUT.

**Verificación contra el contrato**
- [ ] Nombres exactos de campos y paths verificados contra `openapi.json` antes de tipar los DTOs.
- [ ] Pantalla de administración de permisos: la nueva pantalla `config.numeracion` y sus 22
      componentes aparecen sola desde `GET /acceso/catalogo` (sin código específico).
