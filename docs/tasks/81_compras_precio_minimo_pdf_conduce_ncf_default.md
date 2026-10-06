# Prompt para el agente de frontend — Precio mínimo con PIN, auto-recepción de compras, PDF de recepción, conduce obligatorio, NCF default en clientes/proveedores, y bloqueo de PDF de e-CF no aceptado

Copia y pega este prompt completo al agente de frontend.

---

## Antes de empezar

Este cambio agrupa **6 features independientes** del backend, entregadas juntas en la misma sesión
de trabajo. Cada una tiene su propia sección abajo, con su propio checklist parcial al final de la
sección — no hace falta implementarlas en el mismo PR ni en el mismo orden, pero sí leer **todo**
este documento antes de tocar código, porque dos de las features (Precio Mínimo y Bloqueo de PDF
e-CF) reutilizan mecanismos de UI que probablemente ya existen (el diálogo de PIN, el badge de
estado de e-CF) y es fácil duplicar lógica por error si no se lee la sección completa primero.

**Abre `openapi.json` y localiza cada endpoint/campo mencionado abajo antes de implementar** —
confirma ahí los tipos exactos, nullability, y ejemplos. Lo que sigue en este documento es la
explicación funcional completa (qué significa cada cosa, cuándo se dispara, cómo debe verse en la
UI) — la fuente de verdad para tipos/schemas es siempre `openapi.json`, no este texto.

---

## 1. Precio mínimo manual con PIN (servicios y productos, config separada)

### Qué se pidió

Hoy, al crear o editar una factura/cotización, el operador ya puede escribir cualquier precio
(`rate`) en una línea — no es un campo nuevo. Lo que faltaba era una forma de que el sistema exija
un PIN administrativo cuando ese precio manual queda **por debajo del mínimo**, tanto para
servicios como para productos, con un interruptor independiente para cada tipo de ítem. Para
productos, además del piso nuevo, sigue existiendo (sin cambios) el piso de costo que ya conocías.

### El "precio mínimo" es el price list "Precio C" que ya existe

**No hay un campo de precio mínimo nuevo por artículo.** El catálogo ya maneja 3 niveles de precio
por artículo — Precio A (máximo), Precio B (promedio), Precio C (mínimo) — y el backend ahora
compara el precio neto de la línea contra el **Precio C** del artículo, sin importar el tier real
del cliente que está comprando. Si el artículo no tiene un Precio C registrado en absoluto, no hay
nada que comparar y nunca se bloquea por este motivo (igual que ya pasa con el piso de costo cuando
`valuation_rate` es 0).

### Dos toggles nuevos en `Facturacion Config`

`GET /config/facturacion` ahora incluye:

```json
{
  "pedirPinPrecioMinimoServicios": false,
  "pedirPinPrecioMinimoProductos": false
}
```

Ambos son booleanos, **default `false`** — ningún tenant existente cambia de comportamiento hasta
que alguien los active explícitamente. `PUT /config/facturacion` los acepta igual que el resto de
los toggles de esta pantalla (solo se envía el que el usuario tocó).

- `pedirPinPrecioMinimoServicios`: aplica a líneas donde el artículo es un **servicio**
  (`Item.custom_item_type === 'Servicio'` — el mismo campo que ya distingue servicio/producto en
  el catálogo).
- `pedirPinPrecioMinimoProductos`: aplica a líneas donde el artículo es un **producto**. Se suma
  (no reemplaza) al piso de costo, que sigue aplicando siempre a productos sin importar este
  campo — un producto puede quedar bloqueado por costo, por precio mínimo, o por ambos a la vez;
  el mensaje de error indica cuál.

**Dónde ponerlo en la UI**: en Configuración → Facturación, junto a los demás toggles de esta
pantalla (ej. cerca de "Requiere Ubicación para Vender" o donde ya viva el bloque de reglas de
venta). Sugerido, dos switches independientes:

> **Pedir PIN si el precio de un SERVICIO está bajo el mínimo**
> Si está activo, editar manualmente el precio de un servicio por debajo de su "Precio C" al crear
> o editar una factura/cotización exige autorización con PIN.

> **Pedir PIN si el precio de un PRODUCTO está bajo el mínimo**
> Igual que el anterior, para productos. Se suma al piso de costo existente — un producto puede
> requerir PIN por costo, por precio mínimo, o por ambos motivos.

### Cómo se dispara y cómo se autoriza — REUSA el mecanismo de PIN que ya existe

**No hay una acción de PIN nueva ni un flujo de autorización nuevo.** Esto reutiliza EXACTAMENTE
el mismo mecanismo que ya usas para el piso de costo (`pinOverride` en `CreateInvoiceDto`/
`CreateQuotationDto`, acción `override_costo_minimo`). Si tu frontend ya tiene un diálogo de "Este
precio está por debajo del costo, ingrese PIN para autorizar" en el flujo de facturación/
cotización, **es el mismo diálogo** — no hay que construir nada nuevo, solo asegurarte de que se
dispare también para este caso.

- `POST /invoices` / `PUT /invoices/:id` y `POST /quotations` / `PUT /quotations/:id` — sin
  cambios de firma. El campo `pinOverride?: { pin, usuario?, codigoTarjeta? }` ya existe en el
  body.
- Si una línea queda por debajo del mínimo y el toggle correspondiente está activo, el request
  falla con 400 y un mensaje como:

  ```
  El precio neto de PROD-001 (50) está por debajo del precio mínimo (100) — requiere
  autorización con PIN.
  ```

  (Compara con el mensaje ya existente del piso de costo: *"El precio neto de PROD-001 (50) no
  puede ser menor al costo de compra (85)."* — mismo formato, motivo distinto.)

- Reenviar el MISMO request agregando `pinOverride` con un PIN válido de un usuario autorizado
  (roles System Manager / Sales Manager / Sales Master Manager, igual que hoy) resuelve el
  bloqueo — el PIN autoriza el documento completo, no línea por línea, así que un solo PIN cubre
  todas las líneas que lo necesiten en ese mismo request (esto ya es así para el piso de costo,
  no cambia).

**Punto crítico si tu frontend detecta el motivo del bloqueo inspeccionando el TEXTO del mensaje**
(por ejemplo, buscando la substring "costo de compra" para decidir si mostrar el diálogo de PIN):
tienes que **agregar también la detección de "precio mínimo"** en ese mismo lugar, o generalizar la
detección a "cualquier 400 de `/invoices` o `/quotations` que mencione autorización con PIN" —
si solo buscás la palabra "costo", el bloqueo por precio mínimo no va a disparar el diálogo y el
usuario va a ver un error crudo sin poder autorizar desde la UI.

### Checklist — Precio mínimo

1. `GET /config/facturacion` expone `pedirPinPrecioMinimoServicios`/`pedirPinPrecioMinimoProductos`
   y la pantalla de Configuración → Facturación tiene los 2 switches nuevos.
2. Con el switch de servicios activo: editar el precio de una línea de servicio por debajo de su
   Precio C, sin PIN → 400. Reenviando con `pinOverride` válido → éxito.
3. Con el switch de productos activo: mismo caso para un producto, verificando que el piso de
   costo (ya existente) siga funcionando igual de forma independiente.
4. Con ambos switches apagados (default): ningún precio bajo Precio C bloquea nada — comportamiento
   idéntico al de antes de este cambio.
5. El diálogo de PIN existente se dispara tanto para "por debajo del costo" como para "por debajo
   del precio mínimo" — mismo componente, ambos mensajes reconocidos.
6. Un artículo sin Precio C registrado nunca bloquea por este motivo, sin importar los switches.

---

## 2. Auto-recepción de mercancía al facturar una Orden de Compra (sin cambios de API — solo UX)

### Qué cambió

Hasta ahora, facturar una Orden de Compra (`POST /compras/ordenes/:id/facturar`, que crea una
Purchase Invoice en Draft con `update_stock=0` — nunca toca inventario por diseño) dejaba la
recepción de mercancía como **dos pasos manuales aparte**: `POST /compras/ordenes/:id/recibir`
(crea la Recepción en Draft) y luego `POST /compras/purchase-receipt/:id/submit` (la somete, recién
ahí entra al inventario).

**Ahora, al someter esa factura** (`POST /compras/:id/submit` sobre la factura que vino de la
orden), el backend **crea y somete automáticamente** la Recepción de Mercancía correspondiente en
el mismo paso — recibe el remanente completo pendiente de la orden, con la misma cascada de
almacén de siempre (ítem → proveedor → sucursal). Es best-effort: si por algún motivo la
auto-recepción falla (ej. Vega caído, algo raro en la orden), **la factura queda sometida
igual** — el fallo solo se loguea del lado del servidor, no rompe el submit. En ese caso, la
Recepción sigue disponible para crearse a mano con los mismos 2 endpoints de siempre, sin cambios.

**No hay ningún endpoint nuevo ni campo nuevo para esto** — es puro cambio de comportamiento del
lado del servidor. Esto **solo aplica al flujo "Orden de Compra → Factura"** — el flujo de Compra
directa (1 paso, `update_stock=1`, sin pasar por Orden de Compra) ya recibía mercancía al someterse
desde siempre y no cambió.

### Qué hacer en el frontend

- Si tu UI muestra un paso/botón explícito de "Recibir mercancía" o "Confirmar recepción" como
  parte del flujo de facturar una Orden de Compra, **ya no hace falta que el usuario lo haga a
  mano** en el caso normal — considera:
  - Quitar ese paso del wizard/flujo cuando se factura una orden completa, o
  - Dejarlo visible pero como una acción de respaldo ("por si la recepción automática falló") —
    es seguro dejarlo: si la orden ya está 100% recibida, `POST /compras/ordenes/:id/recibir`
    devuelve un 400 claro ("La orden ya está 100% recibida") en vez de duplicar nada.
- Si tu UI muestra el estado de una Orden de Compra (ej. "Pendiente de recibir" / "Recibida
  parcial" / "Recibida"), ese estado (`per_received` de la orden) ahora se actualiza solo al
  facturar, sin que el usuario tenga que hacer nada más — asegurate de refrescar esa info después
  de someter la factura si la pantalla de la orden queda abierta.

### Checklist — Auto-recepción

1. Facturar una Orden de Compra completa y someter esa factura → la orden queda con
   `per_received = 100` sin haber llamado manualmente a `/recibir` ni a `/purchase-receipt/:id/submit`.
2. El flujo de Compra directa (sin Orden de Compra) sigue exactamente igual — no se tocó.
3. Decidir y ajustar si el paso manual de "recibir" se oculta o se deja como respaldo en el flujo
   de facturación de órdenes.

---

## 3. PDF de Recepción de Mercancía (endpoint nuevo) — y recordatorio de los que YA existen

### El pedido original

Se pidió poder ver/descargar PDF de: solicitudes de compra, órdenes de compra, devoluciones, y
recepción de mercancía — igual que ya existe para facturas y pedidos.

**Al investigar, 3 de los 4 YA estaban implementados en el backend** (puede que tu frontend
todavía no tenga los botones para estos — si es así, agregalos, no hace falta ningún cambio de
backend):

| Documento | Endpoint | ¿Ya existía? |
|---|---|---|
| Solicitud de Compra | `GET /compras/solicitudes/:id/pdf` | Sí, ya existía |
| Orden de Compra | `GET /compras/ordenes/:id/pdf` | Sí, ya existía |
| Devolución de Compra | `GET /compras/:id/pdf` (mismo endpoint que la factura de compra — una devolución es la misma Purchase Invoice con `is_return=1`) | Sí, ya existía |
| **Recepción de Mercancía** | **`GET /compras/purchase-receipt/:id/pdf`** | **Nuevo — este es el que faltaba** |

### El endpoint nuevo

`GET /compras/purchase-receipt/:id/pdf` — devuelve un PDF (`Content-Type: application/pdf`),
mismo patrón de headers que el resto (`Content-Disposition: inline; filename="recepcion-{id}.pdf"`).
**Sin parámetros de query** — a diferencia de las facturas de venta, este documento no tiene
variante POS (no es un ticket térmico) ni toggle de moneda: siempre es una sola página completa.

Permiso requerido: `compras.recepcion.imprimir` (nuevo — debería aparecer ya en
`GET /me/permissions` para los roles que ya tienen acceso a Compras; si tu UI arma los botones de
"Descargar PDF" condicionados a un permiso específico, es este).

El PDF muestra: proveedor, número de documento, fecha de recepción, órdenes de compra relacionadas
(si viene de una), tabla de artículos con almacén de destino, y — de forma prominente en el
encabezado — el **número de conduce** (`supplierDeliveryNote`), ver sección 4.

### Checklist — PDF de recepción

1. Agregar el botón/acción "Descargar PDF" en el detalle de una Recepción de Mercancía, apuntando
   a `GET /compras/purchase-receipt/:id/pdf`.
2. Si no estaban, agregar también los botones de PDF de Solicitud de Compra y Orden de Compra
   (ya existen en el backend hace tiempo).
3. El PDF muestra el conduce cuando la recepción lo tiene.

---

## 4. Conduce obligatorio en Recepción de Mercancía SIN Orden de Compra

### Qué se pidió

Cuando la mercancía llega físicamente **sin** una Orden de Compra detrás (un caso "standalone" —
compra corriente que llega antes de facturarse, sin flujo largo de compras), el único rastro de
que algo realmente llegó es lo que el proveedor entrega en mano: el **conduce**. Se pidió que ese
número sea obligatorio en ese caso específico.

### Cómo se implementó — reusa un campo que ya existía

**No hay un campo nuevo.** `supplierDeliveryNote` (el "Número de Conduce/Remisión del Proveedor")
ya existía en `POST /compras/purchase-receipt` como opcional — lo único que cambió es que ahora es
**condicionalmente obligatorio**:

- **Si NINGUNA línea del body trae `ordenCompra`** (es decir, es una recepción verdaderamente
  standalone, sin Orden de Compra detrás) **y `supplierDeliveryNote` viene vacío/ausente** → 400:

  ```
  El número de conduce (supplierDeliveryNote) es obligatorio para una recepción de
  mercancía sin orden de compra.
  ```

- **Si al menos una línea trae `ordenCompra`** (viene de una Orden de Compra) → `supplierDeliveryNote`
  sigue siendo completamente opcional, sin cambios.
- El flujo de "recibir desde una orden" (`POST /compras/ordenes/:id/recibir`) **no cambió en
  absoluto** — esas recepciones siempre tienen `ordenCompra` en cada línea (lo pone el propio
  backend), así que nunca les aplica esta obligatoriedad.

### Qué hacer en el frontend

- En el formulario de "Nueva Recepción de Mercancía" (el que crea vía `POST /compras/purchase-receipt`
  directo, NO el que nace desde una Orden de Compra), agregar validación de frontend: si el usuario
  no está recibiendo contra ninguna orden (no seleccionó `ordenCompra` en ninguna línea), el campo
  "Número de Conduce" pasa a ser requerido en el formulario mismo — no dejes que el usuario llegue
  al submit para enterarse por el 400.
- El campo ya debería existir en tu formulario (era opcional) — solo cambia su obligatoriedad
  condicional, no hace falta agregar un input nuevo.

### Checklist — Conduce obligatorio

1. Crear una recepción standalone (sin ninguna línea con `ordenCompra`) sin `supplierDeliveryNote`
   → el formulario bloquea antes de enviar, o el backend devuelve 400 con el mensaje de arriba.
2. La misma recepción con `supplierDeliveryNote` → se crea normalmente.
3. Recibir desde una Orden de Compra sin `supplierDeliveryNote` → sigue funcionando igual, sin
   pedir el conduce.

---

## 5. "Tipo de Comprobante por Defecto" en Clientes y Proveedores (campo informativo, no restrictivo)

### Qué se pidió

Poder guardar, tanto en un Cliente como en un Proveedor, un tipo de comprobante (NCF) por defecto
— **puramente como ayuda para prellenar el formulario** al crear una venta/compra nueva para esa
contraparte. No es una validación ni una restricción: el campo real de la factura/compra
(`ncfType`/`tipoComprobante`) sigue siendo obligatorio y libre de elegir cualquier valor sin
importar lo que diga este default.

### Campo nuevo: `ncfTypeDefault`

Tipo: string, uno de los códigos NCF físicos: `B01`, `B02`, `B03`, `B04`, `B11`, `B12`, `B13`,
`B14`, `B15`, `B16`, `B17` (mismo catálogo que ya usás en el selector de `ncfType`/`tipoComprobante`
de facturas/compras — probablemente ya tienes las etiquetas en español de cada código en algún lado
de tu app, ej. B01 = "Crédito Fiscal", B02 = "Consumo", B11 = "Compras", etc.; reusalas acá).

| Endpoint | Uso |
|---|---|
| `POST /customers` | Crear cliente con default explícito (opcional) |
| `PUT /customers/:id` | Editar cliente — cambiar o quitar el default |
| `GET /customers/:id` (y listado) | Devuelve el default actual del cliente, si tiene uno |
| `POST /proveedores` | Crear proveedor con default explícito (opcional) |
| `PUT /proveedores/:id` | Editar proveedor — cambiar o quitar el default |
| `GET /proveedores/:id` (y listado) | Devuelve el default actual del proveedor, si tiene uno |

Ausente/no enviado en una edición: no toca el default actual (igual que el resto de los campos
opcionales de estos DTOs, ej. `formaPagoDefault`). La respuesta trae `ncfTypeDefault` como
`string | null`.

### Dónde ponerlo en la UI

En el formulario de Cliente, cerca de "Forma de Pago por Defecto" (misma sección "Valores por
Defecto de Venta"). En el formulario de Proveedor, cerca de "Tipo de Pago por Defecto" (misma
sección "Valores por Defecto de Compra"). Un simple selector con las mismas opciones/etiquetas que
ya usás en el campo `ncfType`/`tipoComprobante` de facturas/compras.

**El uso real de este default es 100% responsabilidad del frontend**: al abrir el formulario de
"Nueva Factura"/"Nueva Cotización" para un cliente que tiene `ncfTypeDefault` seteado, prellenar el
selector de tipo de comprobante con ese valor (el usuario lo puede cambiar libremente antes de
enviar). Mismo criterio para "Nueva Compra"/"Nuevo Gasto" con el `ncfTypeDefault` del proveedor. El
backend **no** aplica ningún fallback automático — si el frontend no lo lee y no lo prellena, el
campo simplemente no tiene efecto.

### Checklist — NCF default

1. Formulario de Cliente/Proveedor tiene el selector "Tipo de Comprobante por Defecto" y lo guarda
   vía `ncfTypeDefault`.
2. `GET /customers/:id`/`GET /proveedores/:id` muestran el valor guardado al reabrir el formulario.
3. Al crear una factura/cotización para un cliente con default seteado, el selector de tipo de
   comprobante arranca prellenado con ese valor (editable).
4. Mismo comportamiento para compras/gastos con el default del proveedor.
5. Guardar `ncfTypeDefault` en un cliente/proveedor NO cambia ni valida nada al facturar — es
   puramente informativo, confirmalo probando con un valor distinto al que finalmente se elige al
   facturar (debe aceptarse igual, sin ningún error ni advertencia del backend).

---

## 6. Bloqueo de PDF de factura con e-CF no aceptado por la DGII

### Qué se pidió

Si se intenta obtener el PDF de una factura de venta cuyo e-CF **todavía no está aceptado por la
DGII**, el backend debe devolver un error claro en vez de generar el PDF igual.

### Cómo se implementó

`GET /invoices/:id/pdf` (con cualquier combinación de `formato`/`moneda` que ya uses) ahora
valida el estado del e-CF **antes** de generar el PDF:

- Si la factura **no tiene e-CF** (NCF físico B0x, tenant sin facturación electrónica, o cualquier
  documento donde `GET /invoices/:id` devuelve `ecf: null`) → **sin cambios**, el PDF se genera
  siempre igual.
- Si la factura **tiene e-CF** (`ecf` no es `null`) y su estado (`ecf.status`) es distinto de
  `ACCEPTED` o `CONDITIONAL` → 400:

  ```json
  {
    "success": false,
    "error": {
      "code": "ECF_NOT_ACCEPTED",
      "message": "El e-CF de esta factura todavía no está aceptado por la DGII (estado actual: Pendiente de firma). No se puede generar el PDF hasta que la DGII lo acepte.",
      "statusCode": 400
    }
  }
  ```

  El texto entre paréntesis usa las mismas etiquetas en español que ya usás para el estado del
  e-CF en otras pantallas (Pendiente de firma, Firmado, Diferido (contingencia), En proceso en la
  DGII, Rechazado, No encontrado en la DGII, Anulado, Falló la emisión) — si tu componente de
  "estado del e-CF" ya tiene ese mapeo, es el mismo vocabulario, no hace falta agregar nada nuevo
  ahí.
  `CONDITIONAL` ("Aceptado condicional") **SÍ permite generar el PDF** — sigue siendo un
  comprobante fiscalmente válido ante la DGII, solo con observaciones.
- El backend ya refresca el estado del e-CF contra Vega antes de este chequeo si estaba en
  `PENDING` (esto ya pasaba antes de este cambio, para que el PDF nunca muestre un estado
  desactualizado) — no hace falta que el frontend refresque el estado por separado antes de pedir
  el PDF.

### Qué hacer en el frontend

- Capturar el `code: 'ECF_NOT_ACCEPTED'` (o el mensaje) al llamar `GET /invoices/:id/pdf` y
  mostrar un mensaje claro en vez de un error genérico — por ejemplo, un toast/modal: *"Esta
  factura todavía no puede imprimirse: el e-CF sigue [estado] en la DGII."*
- **Mejor UX, evita el viaje redondo**: si `GET /invoices/:id` ya te trae `ecf.status`, usalo para
  **deshabilitar o avisar en el botón "Ver/Descargar PDF" ANTES** de que el usuario lo toque,
  cuando `ecf !== null && ecf.status !== 'ACCEPTED' && ecf.status !== 'CONDITIONAL'` — con un
  tooltip tipo *"Disponible cuando la DGII acepte el e-CF"*. Esto es una mejora sugerida, no
  obligatoria — el backend igual protege el endpoint aunque el botón no se deshabilite.

### Checklist — Bloqueo de PDF e-CF

1. Factura con e-CF en `PENDING`/`REJECTED`/cualquier estado no terminal-aceptado →
   `GET /invoices/:id/pdf` devuelve 400 `ECF_NOT_ACCEPTED`, mensaje mostrado de forma clara en la
   UI (no como error crudo).
2. Factura con e-CF `ACCEPTED` → PDF se genera normal.
3. Factura con e-CF `CONDITIONAL` → PDF se genera normal (no se bloquea).
4. Factura sin e-CF (NCF físico) → PDF se genera normal, sin ningún chequeo nuevo.
5. (Opcional pero recomendado) el botón de PDF refleja el estado antes de hacer el request.

---

## Resumen de endpoints tocados/nuevos (para referencia rápida)

| Método | Endpoint | Qué cambió |
|---|---|---|
| GET/PUT | `/config/facturacion` | +`pedirPinPrecioMinimoServicios`, +`pedirPinPrecioMinimoProductos` |
| POST/PUT | `/invoices`, `/invoices/:id` | Nuevo motivo de bloqueo (precio mínimo), mismo `pinOverride` |
| POST/PUT | `/quotations`, `/quotations/:id` | Ídem |
| GET | `/invoices/:id/pdf` | Nuevo 400 `ECF_NOT_ACCEPTED` si el e-CF no está aceptado |
| POST | `/compras/:id/submit` | Auto-recepción silenciosa si la factura viene de una Orden de Compra |
| GET | `/compras/purchase-receipt/:id/pdf` | **Endpoint nuevo** |
| POST | `/compras/purchase-receipt` | `supplierDeliveryNote` obligatorio si es standalone (sin `ordenCompra`) |
| POST/PUT | `/customers`, `/customers/:id` | +`ncfTypeDefault` |
| POST/PUT | `/proveedores`, `/proveedores/:id` | +`ncfTypeDefault` |

Confirma todos los tipos exactos, nullability y ejemplos de request/response contra `openapi.json`
antes de implementar cada uno.
