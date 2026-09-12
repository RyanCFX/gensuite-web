# Farmacia ARS v2 — guía completa de implementación para el frontend

> **Para quien recibe este documento.** El backend del vertical Farmacia ARS se reconstruyó por
> completo (v2). Las pantallas propias de la v1 —**Preaprobaciones**, **Despachos** y **Cola de
> Cobro de la cajera**— desaparecen; la cobertura de la aseguradora pasa a vivir **dentro de la
> factura de venta normal**, y el cobro, la impresión, los lotes y las devoluciones usan las
> pantallas de siempre, que aprenden a mostrar la cobertura.
>
> **En el repo del frontend hay un `openapi.json` actualizado con la documentación completa del
> API** (generado desde el backend: `GET /api/docs-json`). Ahí está el shape exacto y tipado de
> cada request/response, incluidos todos los campos nuevos. **Regenerá los tipos/cliente desde
> ese archivo antes de empezar** y usalo como fuente de verdad campo por campo. Este documento
> no lo reemplaza: explica el flujo de negocio, el orden de las llamadas, qué pantalla toca qué
> endpoint, qué mostrar en cada estado y cómo manejar cada error. Cuando este documento y el
> `openapi.json` difieran en un nombre de campo, gana el `openapi.json`.
>
> Documentos relacionados: `FARMACIA_ARS_FRONTEND.md` (contrato de referencia del vertical),
> `PROMPT_ASEGURADORAS_FRONTEND.md` (módulo `/aseguradoras`, sin cambios),
> `PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos, `acciones`).

---

## 0. Resumen ejecutivo

| | v1 (lo que tiene el frontend hoy) | v2 (lo que hay que construir) |
|---|---|---|
| Captura de la aprobación de la ARS | Pantalla "Preaprobaciones" (documento aparte) | Panel **Aseguradora** dentro del formulario de factura |
| Entrega al paciente | Pantalla "Despachos" | No existe — es la factura |
| Cobro al paciente | "Cola de Cobro" propia (SSE) + `POST /farmacia/despachos/:id/cobrar` | **Caja normal** (`/caja/por-cobrar` + `completar-cobro`) o el propio `submit` si el tenant no usa POS |
| Facturación a la ARS | Lotes vinculando despachos | Lotes vinculando **facturas** (con sugerencia de elegibles) |
| Devoluciones | Sin soporte | Formulario de devoluciones normal + NC a la ARS automática |
| Impresión | Endpoints propios de despacho/lote | `GET /invoices/:id/pdf` + plantillas JSON con bindings `seguro.*` |

Todo lo que sigue asume que ya tenés el módulo Aseguradoras (`/aseguradoras`) y el contrato de
permisos (`acciones`, `vertical`) funcionando.

---

## 1. Gating por vertical (sin cambios de mecanismo, cambia el alcance)

`GET /api/v1/me/permissions` → `data.vertical` es `"general"` o `"farmacia"`. Pedilo una vez al
iniciar sesión, junto con `data.acciones`.

**Mostrar solo si `vertical === "farmacia"`:**

- El panel **Aseguradora** en el formulario de factura y las columnas ARS en la tabla de líneas.
- El badge de **estado ARS** y los filtros `aseguradora` / `estadoArs` / `sinLote` en el listado
  de facturas.
- Las columnas "Cubre ARS" / "A cobrar" en la cola de Caja.
- Los campos `motivoAnulacionArs` / `motivoAnulacionDetalle` en el formulario de devolución y el
  botón "Emitir NC a la aseguradora".
- Menú **Farmacia ARS** → *Lotes de Facturación* y *Reportes*. (Aseguradoras ya lo tenés.)
- Configuración → sección **Farmacia ARS** (botón Habilitar/Reparar).
- En el editor de plantillas, los bindings `seguro.*` (el catálogo ya no los devuelve en un
  tenant general, pero si cacheás el catálogo, invalidalo por tenant).

El servidor es la barrera real: en un tenant `general`, `/farmacia/*` responde **403**
(`PERMISO_INSUFICIENTE` o `VERTICAL_NO_PERMITIDO` según el guard que actúe primero), mandar
`aseguradora` en `POST /invoices` responde **400** con `"Este tenant no tiene habilitado el
módulo de farmacia…"`, y `campos-disponibles` simplemente no incluye `seguro.*`. Si ves alguno de
esos errores en producción es un bug de gating del frontend.

**No gatear por vertical** (son horizontales y ya existen): vencimiento de lotes/FEFO, roles
autorizados por categoría ("controlados"), regenerar e-CF rechazado, UOM por empaque.

---

## 2. Qué eliminar

### 2.1 Rutas del frontend, stores, componentes

| Pantalla v1 | Qué hacer |
|---|---|
| Preaprobaciones ARS (lista, detalle, crear/editar, distribuir, confirmar) | Eliminar por completo |
| Despachos ARS (lista, crear desde preaprobación, imprimir) | Eliminar por completo |
| Cola de Cobro de la cajera (SSE a `/farmacia/despachos/cola`, botón "Cobrar") | Eliminar por completo — la cajera usa la pantalla de Caja de siempre |
| Reporte "Relación Despacho / Lote / NCF" | Reemplazar por "Facturas con cobertura ARS" (§7) |
| En Lotes: "Agregar despacho" / "Quitar despacho" | Reemplazar por "Agregar facturas" (bloque) / "Quitar factura" (§6) |
| Menú Farmacia ARS | Dejar solo *Lotes de Facturación* y *Reportes* (+ *Aseguradoras* donde ya esté) |

### 2.2 Endpoints que ya no existen (responden **404**)

```
GET/POST      /farmacia/preaprobaciones
GET/PUT       /farmacia/preaprobaciones/:id
POST          /farmacia/preaprobaciones/:id/recalcular
POST          /farmacia/preaprobaciones/:id/confirmar
GET/POST      /farmacia/despachos
GET           /farmacia/despachos/:id
GET           /farmacia/despachos/cola            (SSE)
POST          /farmacia/despachos/:id/cobrar
GET           /farmacia/despachos/:id/pdf
POST          /farmacia/lotes/:id/despachos
DELETE        /farmacia/lotes/:id/despachos/:despachoId
GET           /farmacia/reportes/despachos-ncf
```

### 2.3 Acciones que ya no vienen en `acciones` (no las uses para gatear nada)

`farmacia.preaprobaciones.listar|crear|editar|recalcular|confirmar`,
`farmacia.despachos.listar|crear|cola|cobrar|imprimir`, `farmacia.lotes.vincular-despacho`,
`farmacia.reportes.despachos-ncf.listar`.

### 2.4 Acciones nuevas / renombradas

| Acción | Gatea |
|---|---|
| `ventas.factura.recalcular-cobertura` | Botón "Recalcular" del panel Aseguradora |
| `farmacia.lotes.facturas-elegibles` | Pestaña/diálogo "Facturas elegibles" en Lotes |
| `farmacia.lotes.vincular-facturas` | "Agregar facturas" / "Quitar factura" (reemplaza `vincular-despacho`) |
| `farmacia.reportes.facturas-ars.listar` | Reporte "Facturas con cobertura ARS" (reemplaza `despachos-ncf`) |

El resto de las acciones de lotes (`listar`, `crear`, `recalcular`, `marcar-en-revision`,
`facturar`, `imprimir`), `farmacia.reportes.lotes.listar` y `config.farmacia.habilitar` no
cambian. La factura con aseguradora usa los permisos normales de `ventas.factura.*` y `caja.*`;
las devoluciones, `ventas.devolucion.crear`.

---

## 3. Pantalla de factura — panel "Aseguradora"

### 3.1 Dónde vive y cuándo se ve

En el formulario de **crear/editar factura** (borrador). Solo con `vertical === "farmacia"`. Es un
panel colapsable "Aseguradora (ARS)" con un toggle "Esta venta tiene cobertura de seguro". Si el
toggle está apagado, **no envíes el campo `aseguradora`** (o enviá `aseguradora: null` en `PUT`
para quitar una cobertura que ya estaba en el borrador).

### 3.2 Campos del panel → `aseguradora` en el body de `POST /invoices` y `PUT /invoices/:id`

| Campo UI | Propiedad | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Aseguradora | `aseguradora` | string (id de Customer) | **Sí** | Picker que consume **`GET /aseguradoras`** (nunca `/customers`). El servidor rechaza un Customer que no sea aseguradora. |
| Nro. de autorización | `numeroAutorizacion` | string ≤ 140 | **Sí** | Tal cual lo da la plataforma de la ARS |
| Tipo de cobertura | `tipoCobertura` | `"monto"` \| `"porciento"` | **Sí** | Radio/segmented |
| Valor de cobertura | `valorCobertura` | number > 0 | **Sí** | RD$ si `monto`; 0 < x ≤ 100 si `porciento` |
| Carnet de afiliado | `carnetAfiliado` | string ≤ 140 | No | |
| Cédula del paciente | `cedula` | string (11 dígitos) | No | Se valida con el algoritmo JCE en el servidor (400 si es inválida). Validá también en el cliente. |
| Nro. de seguro social | `numeroSeguroSocial` | string ≤ 40 | No | |
| Teléfono del paciente | `telefonoPaciente` | string ≤ 40 | No | |
| Nombre del doctor | `nombreDoctor` | string ≤ 140 | No | |
| Fecha de aprobación | `fechaAprobacion` | `YYYY-MM-DD` | No | |
| Fecha de indicación de la receta | `fechaIndicacionReceta` | `YYYY-MM-DD` | No | |
| Aprobado por | `aprobadoPor` | string ≤ 140 | No | Nombre de quien aprobó en la ARS |

El `customer` de la factura sigue siendo el **paciente** (o cliente ocasional). La aseguradora
nunca va en `customer`; si coinciden, 400.

### 3.3 Columnas nuevas en la tabla de líneas → propiedades de cada elemento de `items[]`

| Columna UI | Propiedad | Tipo | Editable | Notas |
|---|---|---|---|---|
| % teórico ARS | `porcientoTeoricoArs` | number 0–100 | Sí (opcional) | Peso para el reparto automático. Vacío en todas = reparto en partes iguales. |
| Cobertura ARS (línea) | `montoAprobadoArs` | number ≥ 0 | Sí | Cuánto de esta línea cubre la ARS. |
| 🔒 Bloqueada | `lineaBloqueadaArs` | boolean | Sí | Ajuste manual protegido: "Recalcular" no la toca. |
| Paciente (línea) | `montoPacienteArs` | number | **No** (solo respuesta) | `amount − montoAprobadoArs` |
| % real | `porcientoRealArs` | number | **No** (solo respuesta) | |

**Regla del reparto automático:** si en el `POST`/`PUT` **ninguna** línea trae `montoAprobadoArs`
(ni `lineaBloqueadaArs`), el servidor reparte la cobertura solo al guardar. Si alguna línea lo
trae, se respeta tal cual lo que mandaste. Por eso el flujo recomendado es: el usuario llena el
panel y guarda **sin** tocar las columnas por línea → vuelve todo repartido; si quiere ajustar
una línea, la edita, marca el candado, guarda, y pulsa **Recalcular** para que el resto se
redistribuya.

### 3.4 Ejemplo completo de `POST /invoices`

```json
{
  "customer": "Consumidor Final",
  "postingDate": "2026-09-12",
  "ncfType": "B02",
  "items": [
    { "itemCode": "MED-IBUPROFENO-400", "qty": 10, "rate": 25, "warehouse": "Farmacia Principal - FAR" }
  ],
  "aseguradora": {
    "aseguradora": "Humano",
    "numeroAutorizacion": "AUT-IBU-1",
    "tipoCobertura": "porciento",
    "valorCobertura": 80,
    "carnetAfiliado": "C-123",
    "cedula": "00113918205",
    "nombreDoctor": "Dra. Gómez",
    "fechaAprobacion": "2026-09-11",
    "fechaIndicacionReceta": "2026-09-10"
  }
}
```

### 3.5 La respuesta (crear, editar, `GET /invoices/:id`)

Respuesta real (recortada a lo relevante):

```json
{
  "id": "ACC-SINV-2026-00021",
  "status": "submitted",
  "paymentStatus": "paid",
  "customer": "Consumidor Final",
  "grandTotal": 250, "roundedTotal": 250, "outstandingAmount": 0, "amountDue": 0,
  "isPos": true,
  "paymentLines": [
    { "modeOfPayment": "Cobertura ARS", "amount": 200 },
    { "modeOfPayment": "Efectivo RD",   "amount": 50 }
  ],
  "items": [
    {
      "itemCode": "MED-IBUPROFENO-400", "description": "Ibuprofeno 400mg (tableta)",
      "qty": 10, "rate": 25, "amount": 250, "uom": "Unidad",
      "porcientoTeoricoArs": 0, "montoAprobadoArs": 200, "lineaBloqueadaArs": false,
      "montoPacienteArs": 50, "porcientoRealArs": 80
    }
  ],
  "aseguradora": {
    "aseguradora": "Humano",
    "numeroAutorizacion": "AUT-IBU-1",
    "tipoCobertura": "porciento",
    "valorCobertura": 80,
    "montoCobertura": 200,
    "montoDistribuido": 200,
    "diferencia": 0,
    "montoPaciente": 50,
    "estadoArs": "Pendiente",
    "lote": null,
    "montoCoberturaDevuelta": 0,
    "montoCoberturaNeta": 200,
    "carnetAfiliado": "C-123", "cedula": "00113918205", "nombreDoctor": "Dra. Gómez",
    "fechaAprobacion": "2026-09-11", "fechaIndicacionReceta": "2026-09-10"
  }
}
```

- `aseguradora` es **`null`** en una factura sin cobertura; las líneas no traen los campos
  `*Ars` en ese caso.
- Campos **calculados por el servidor** (mostrar, nunca recalcular en el cliente):
  `montoCobertura` (la cobertura en RD$ — si `tipoCobertura = "porciento"` es
  `subtotal × valor / 100`), `montoDistribuido` (Σ `montoAprobadoArs`), `diferencia`
  (`montoCobertura − montoDistribuido`), `montoPaciente` (`grandTotal − montoCobertura`),
  `montoCoberturaDevuelta`, `montoCoberturaNeta`, y por línea `montoPacienteArs` /
  `porcientoRealArs`.
- Pie del panel sugerido: **Cobertura ARS** `montoCobertura` · **Distribuido**
  `montoDistribuido` · **Diferencia** `diferencia` (en rojo si ≠ 0, con el botón Recalcular al
  lado) · **A cargo del paciente** `montoPaciente`.
- `paymentLines` incluye la fila `"Cobertura ARS"` **solo después de sometida** (la agrega el
  servidor). En un borrador no está.

### 3.6 Botón "Recalcular" — `POST /invoices/:id/recalcular-cobertura`

- Sin body. Solo borradores con aseguradora (si no, 400).
- Reparte `montoCobertura − Σ líneas bloqueadas` entre las líneas **no** bloqueadas,
  proporcional a `porcientoTeoricoArs` (o en partes iguales), topando cada línea en su `amount`
  (nunca deja un `montoPacienteArs` negativo). Devuelve la factura completa (mismo shape que
  `GET`).
- Acción `ventas.factura.recalcular-cobertura`.
- Si la cobertura no cabe en las líneas (todas topadas), `diferencia` queda > 0 y someter falla:
  mostrale al usuario que baje `valorCobertura`.

### 3.7 Validaciones que devuelve el servidor (todas **400** con `error.message`)

| Mensaje (extracto) | Causa | UX |
|---|---|---|
| "Este tenant no tiene habilitado el módulo de farmacia" | Bloque enviado en un tenant general | Bug de gating |
| "no está registrado como aseguradora" / "no es una aseguradora" | `aseguradora` no es un Customer marcado como ARS | El picker debe usar `/aseguradoras` |
| "La aseguradora no puede ser el cliente de la factura" | `customer === aseguradora` | Validar en cliente |
| "El número de autorización de la ARS es obligatorio" | Falta `numeroAutorizacion` | Campo requerido |
| "El valor de cobertura de la ARS debe ser mayor que 0" / "no puede superar 100" | `valorCobertura` inválido | Validar en cliente |
| "no está configurado como exento de ITBIS (Ley 253-12)" — nombra el artículo | Un artículo con impuesto de venta | Es un problema de **catálogo**: mostrar el artículo y sugerir corregir su plantilla de impuesto |
| "Una factura con cobertura ARS no puede llevar impuestos" | Plantilla de impuesto del documento | Quitar `taxesTemplate` |
| "La cobertura ARS (X) no puede superar el total de la factura (Y)" | `valorCobertura` mayor al subtotal | Mostrar Y |
| "Línea N: la cobertura ARS (X) supera el importe de la línea (Y)" | `montoAprobadoArs` > `amount` | Validar en cliente |
| "Cédula inválida" | `cedula` con dígito verificador incorrecto | Validar en cliente |
| "No se puede someter: la diferencia entre la cobertura ARS (X) y lo distribuido por línea (Y) es Z, debe ser 0" | Al someter con `diferencia ≠ 0` | Ofrecer Recalcular antes de someter |

### 3.8 Estado ARS — badge y comportamiento del detalle

`aseguradora.estadoArs`:

| Valor | Cuándo | Qué permite la UI |
|---|---|---|
| `null` | Borrador | Editar, recalcular, someter, cancelar borrador |
| `"Pendiente"` | Sometida (y cobrada al paciente); la ARS aún no facturada | Ver; devolución; el lote la puede tomar |
| `"En Lote"` | Vinculada a un lote abierto (`aseguradora.lote` = id) | Ver; devolución (el lote recalcula); quitar del lote desde la pantalla de Lotes |
| `"Facturado"` | Incluida en una consolidada emitida | **Solo lectura del bloque ARS.** Ocultar "Cancelar" (el servidor responde 409/400). La única salida es una devolución (§5). |
| `"Anulada"` | Devolución total antes de facturar a la ARS | Solo lectura; mostrar `motivoAnulacion` y `motivoAnulacionDetalle` |

Filtros nuevos de `GET /invoices`: `aseguradora=<id>`, `estadoArs=Pendiente|En Lote|Facturado|Anulada`,
`sinLote=true` (con aseguradora y sin lote). Los elementos del listado traen un `aseguradora`
reducido (`aseguradora`, `numeroAutorizacion`, `montoCobertura`, `montoPaciente`, `estadoArs`,
`lote`) o `null`.

---

## 4. Someter y cobrar

### 4.1 Lo único que cambia para el frontend

**El cajero nunca envía la parte de la ARS.** El servidor antepone la fila de pago
`"Cobertura ARS"` por `montoCobertura` a los `payments` que mandes, tanto en `submit` como en
Caja. Si la envías vos, se duplica y el servidor la rechaza ("debe llevar exactamente una fila
de pago Cobertura ARS…"). En `payments` va **solo lo que entrega el paciente**, y su suma se valida
contra `montoPaciente` (`montoACobrar` en Caja), no contra el total.

### 4.2 Los tres caminos (los decide el servidor; el frontend solo lee la respuesta)

| Situación del tenant/paciente | `POST /invoices/:id/submit` | Después |
|---|---|---|
| Módulo POS **habilitado** y paciente **sin** crédito fiscal (el caso normal de mostrador) | Body `{}` → responde `{ invoiceId, status: "pendiente_cobro", message }` | La factura aparece en `GET /caja/por-cobrar`. La cajera cobra con `POST /caja/facturas/:id/completar-cobro` |
| Módulo POS **deshabilitado** | Body `{ payments: [{ modeOfPayment, amount }], vuelto?, tenderedCash? }` con lo del paciente → factura sometida y cobrada en un paso | Nada más |
| Paciente **con** crédito fiscal (`hasCredit`) | Body `{}` → factura sometida a crédito por el total; el servidor registra la parte ARS como Payment Entry automáticamente; `outstandingAmount = montoPaciente` | El paciente paga después por Cobros / `POST /caja/facturas/:id/cobrar` |

En los tres, al quedar sometida `estadoArs` pasa a `"Pendiente"`.

### 4.3 Pantalla de Caja — `GET /caja/por-cobrar`

Cada fila trae ahora:

```json
{
  "id": "ACC-SINV-2026-00021",
  "customer": "Consumidor Final", "customerName": "Consumidor Final",
  "grandTotal": 250, "roundedTotal": 250, "postingDate": "2026-09-12",
  "aseguradora": {
    "aseguradora": "Humano", "numeroAutorizacion": "AUT-IBU-1",
    "montoCobertura": 200, "montoPaciente": 50, "estadoArs": null, "lote": null
  },
  "montoACobrar": 50
}
```

- `aseguradora` es `null` en una venta sin cobertura; `montoACobrar` = `roundedTotal −
  montoCobertura` (igual a `roundedTotal` sin cobertura). **Usá `montoACobrar` como el importe a
  cobrar y para validar los métodos de pago**; mostrá "Total 250 · Cubre ARS 200 · **A cobrar
  50**".
- `POST /caja/facturas/:id/completar-cobro` con `{ payments: [{ modeOfPayment: "Efectivo RD",
  amount: 50 }], condicionFiscal?, vuelto?, tenderedCash? }` → responde como siempre (`ncf`,
  `ncfType`, `outstandingAmount`, `fullyPaid`, `vuelto`…).
- Si la suma de `payments` supera `montoACobrar`: 400 "La suma de los métodos de pago (X)
  excede el total…". Si es menor y hay turno abierto: pago parcial POS (queda pendiente lo que
  falte, como hoy).
- `flujoCobro = "directo"` (un solo método de pago): sigue funcionando — la fila de cobertura la
  agrega el sistema y **no cuenta** para ese límite.
- Descartar (`DELETE /caja/facturas/:id`) sigue igual.

### 4.4 Errores de cobro que conviene mostrar bien

| Mensaje (extracto) | Código | UX |
|---|---|---|
| "El turno de caja abierto quedó de un día anterior…" | 400 | Pedir cerrar y abrir turno |
| "Sin secuencia asignada: No hay rango de NCF para tipo 32…" | 409 | Falta el rango e-NCF B02/E32 en Configuración → e-CF |
| "Stock insuficiente: se necesitan N unidades de … a la fecha de la factura" | 400 | Mostrar el artículo; el inventario debe ingresarse con fecha/hora anterior a la factura |
| "TrackID ausente" u otro mensaje de Vega | 400/502 | Reintentar: el e-CF reservado se reutiliza, no se quema otro |

---

## 5. Devoluciones — `POST /devoluciones`

### 5.1 Mismo formulario, dos campos nuevos

Los campos de siempre (`invoiceId`, `items?`, `resolution`, `refundModeOfPayment?`, `reason`,
`modificationCode?`) no cambian. Cuando la factura original tiene `aseguradora` (leelo del
`GET /invoices/:id` antes de abrir el formulario), agregá:

| Campo UI | Propiedad | Valores | Cuándo es obligatorio |
|---|---|---|---|
| Motivo de anulación ARS | `motivoAnulacionArs` | `"Rechazo de la ARS"`, `"Medicamento incorrecto"`, `"Error de digitación"`, `"Paciente desistió"`, `"Producto defectuoso/vencido"`, `"Otro"` | Cuando la devolución deja la cobertura en cero (es **total**, o parcial que devuelve toda la cobertura restante) **y** `estadoArs ≠ "Facturado"`. El servidor responde 400 "indique motivoAnulacionArs" si falta — y no deja rastro (borra el borrador). Recomendación: pedirlo siempre que `estadoArs ∈ {Pendiente, En Lote}` y la devolución sea total. |
| Detalle del motivo | `motivoAnulacionDetalle` | texto 5–500 | Si el motivo es `"Otro"` |

`resolution` y `refundModeOfPayment` aplican **solo a la parte del paciente**. La parte de la ARS
se revierte sola.

### 5.2 Qué hace el servidor según el estado ARS

| `estadoArs` original | Tipo | Documentos que emite | Efecto en la factura original |
|---|---|---|---|
| `Pendiente` / `En Lote` | Parcial | NC al paciente (B04/E34) con la parte ARS como fila de pago negativa | `montoCoberturaDevuelta` sube, `montoCoberturaNeta` baja; si estaba en un lote, el lote recalcula solo |
| `Pendiente` / `En Lote` | Total | NC al paciente | `estadoArs = "Anulada"` con el motivo; sale del lote |
| `Facturado` | Parcial o total | NC al paciente **+ NC a la aseguradora** (contra la consolidada del lote, con su propio NCF/e-NCF, `customer` = la ARS) | La factura sigue `Facturado`; la NC ARS se **aplica automáticamente** a la consolidada si aún tiene saldo; si la ARS ya la pagó, la NC queda como **saldo a favor de la ARS** (se usa con `POST /credit-notes/:id/aplicar-a-factura` contra otra consolidada, o `refund`) |

En crédito (paciente con crédito fiscal), la reversa ARS es un Payment Entry contra la NC y la
parte del paciente se aplica al pendiente de la original (comportamiento de siempre de
`credit_note_only`) o se reembolsa (`refund`, solo si la original ya no tiene saldo).

### 5.3 Respuesta

```json
{
  "creditNoteId": "ACC-SINV-2026-00031",
  "ncf": "E340000000012",
  "resolution": "refund",
  "grandTotal": 100,
  "appliedToOriginalInvoice": false, "appliedAmount": 0, "remainingAvailable": 0,
  "paymentEntryId": "ACC-PAY-2026-00012",
  "aseguradora": {
    "parteArs": 60,
    "partePaciente": 40,
    "aprobacionAnulada": false,
    "estadoArsOriginal": "Facturado",
    "creditNoteAseguradoraId": "ACC-SINV-2026-00032",
    "ncfAseguradora": "E340000000013"
  },
  "message": "Devolución procesada: …"
}
```

- `aseguradora` solo viene cuando la factura tenía cobertura. `creditNoteAseguradoraId` /
  `ncfAseguradora` solo cuando se emitió la NC a la ARS (`estadoArsOriginal = "Facturado"`).
- Mostrá en el resultado: la NC del paciente, la parte del paciente (y cómo se resolvió), y si
  aplica, la NC a la aseguradora con su NCF.

### 5.4 Fallo a mitad de camino y reintento

Si la NC del paciente se emitió pero falló el paso de la ARS, la respuesta es **500** con
`error.message` que empieza con "La devolución se procesó y la nota de crédito X (NCF …) quedó
creada y sometida, pero falló el paso de la aseguradora: … Reintente con POST
/devoluciones/X/emitir-nc-aseguradora". Ese endpoint (body opcional `{ modificationCode }`,
acción `ventas.devolucion.crear`) es **idempotente**: emite la NC a la ARS si no existe o
devuelve la existente: `{ creditNoteId, creditNoteAseguradoraId, ncfAseguradora }`.

UI: `GET /devoluciones/:id` (y `GET /credit-notes/:id`) devuelve un bloque `aseguradora` (o
`null` si la nota no tiene cobertura):

```json
"aseguradora": {
  "aseguradora": "Humano",
  "numeroAutorizacion": "AUT-PAGADA-2",
  "parteArsDevuelta": 60,
  "estadoArsAlDevolver": "Facturado",
  "ncAseguradoraId": "ACC-SINV-2026-00032",
  "facturaPacienteRef": null
}
```

- En la **NC del paciente**: `estadoArsAlDevolver` es el estado ARS que tenía la factura
  original **cuando se devolvió** (no el actual — la factura puede haberse facturado a la ARS
  después por lo que quedaba), y `ncAseguradoraId` es la NC a la ARS emitida (o `null`).
- En la **NC a la aseguradora**: `facturaPacienteRef` es la factura del paciente que la originó.
- `GET /devoluciones/:id` trae además `originalInvoice.estadoArs` (estado **actual**), solo
  informativo.

Mostrar el botón **"Emitir NC a la aseguradora"** únicamente cuando
`aseguradora.estadoArsAlDevolver === "Facturado"` **y** `aseguradora.ncAseguradoraId === null`.
El servidor responde 400 si se intenta en otro caso ("se hizo cuando la aprobación ARS estaba
…").

### 5.5 Reglas que conviene reflejar en la UI

- Devolver una venta hecha con turno POS exige un **turno abierto** (error nativo "No open POS
  Opening Entry…"). Mostrar "abrí un turno para devolver ventas de mostrador".
- Una devolución total tras una parcial devuelve solo lo que queda (el servidor lo calcula).
- No se puede devolver la consolidada del lote directamente: siempre desde la factura del
  paciente.
- `refund` sigue bloqueado mientras la factura original tenga saldo pendiente (regla existente).

---

## 6. Lotes de Facturación ARS — `/farmacia/lotes`

### 6.1 Concepto

Un lote agrupa la **cobertura neta** de facturas de una ARS, ya sometidas y ya cobradas al
paciente, en un período, y la factura a la ARS en una **consolidada** (B01/E31) con **una línea
por factura de paciente**. Al facturar, el lote, la consolidada y el bloque ARS de cada factura
quedan inmutables. La consolidada es una cuenta por cobrar normal a la ARS (aparece en
`GET /cobros/pendientes?customer=<ARS>` y se cobra con el flujo de Cobros).

### 6.2 Estados del lote

`Abierto` → `En Revisión` (opcional) → `Facturado` (final, inmutable). Nunca vuelve atrás.

### 6.3 Endpoints y flujo de pantalla

| Paso | Endpoint | Body / query | Respuesta | Notas de UI |
|---|---|---|---|---|
| Listar | `GET /farmacia/lotes?estado&aseguradora&limit&offset` | — | `[{ id, aseguradora, periodoInicio, periodoFin, estado, responsable?, cantidadFacturas, montoTotalLote, facturaConsolidada?, ncfAsignado?, facturasSnapshot }]` | Columnas: lote, ARS, período, estado, facturas, monto, NCF |
| Crear | `POST /farmacia/lotes` | `{ aseguradora, periodoInicio, periodoFin, responsable? }` | Lote `Abierto` | Picker de ARS = `/aseguradoras` |
| **Elegibles** | `GET /farmacia/lotes/facturas-elegibles?aseguradora=&periodoInicio=&periodoFin=` | query | `data: [{ id, customer, customerName, postingDate, ncf, grandTotal, outstandingAmount, numeroAutorizacion, carnetAfiliado?, montoCobertura, montoCoberturaNeta, estadoArs }]`, `meta: { total, montoTotal }` | Tabla con checkbox, "Seleccionar todas", y el total seleccionado. Criterio del servidor: sometida, `Pendiente`, sin lote, `montoCoberturaNeta > 0`, y **ya cobrada** (contado saldado, o crédito con la cobertura registrada). Es exactamente lo que acepta el paso siguiente. |
| **Vincular** | `POST /farmacia/lotes/:id/facturas` | `{ facturaIds: string[] }` (1–100) | Lote actualizado + `vinculadas: string[]`, `rechazadas: [{ factura, motivo }]` | **No abortes por las rechazadas**: mostrá una lista "N vinculadas, M rechazadas" con el motivo de cada una ("no existe", "no está sometida", "pertenece a otra aseguradora", "ya pertenece al lote X", "su estado ARS es …", "no tiene cobertura neta pendiente", "su cobertura ARS todavía no está cobrada/posteada") |
| Quitar | `DELETE /farmacia/lotes/:id/facturas/:facturaId` | — | Lote actualizado | Solo antes de facturar; la factura vuelve a `Pendiente` |
| Detalle | `GET /farmacia/lotes/:id` | — | Lote + `facturas: [...]` (lista viva, mismo shape que elegibles) + `facturasSnapshot: [{ factura, ncf, paciente, numeroAutorizacion, carnetAfiliado, montoCobertura }]` (congelado al facturar) | Mientras está abierto usá `facturas`; una vez `Facturado`, `facturasSnapshot` es el anexo oficial |
| Recalcular | `POST /farmacia/lotes/:id/recalcular` | — | Lote | Normalmente no hace falta (vincular/quitar/devolver ya recalculan); dejalo como acción secundaria |
| En revisión | `PUT /farmacia/lotes/:id/en-revision` | — | Lote | Opcional |
| **Facturar** | `POST /farmacia/lotes/:id/facturar` | — | Lote `Facturado` + `facturasMarcadas` | **Irreversible. Confirmación explícita** ("Se emitirá la factura B01/E31 a Humano por RD$ X con N facturas. No se puede deshacer."). Antes de emitir, el servidor recalcula solo. |
| PDF | `GET /farmacia/lotes/:id/pdf` | — | `application/pdf` | Consolidada con anexo por factura. Solo A4. Solo `Facturado` (400 si no) |

### 6.4 Respuesta real de `GET /farmacia/lotes/:id` (facturado)

```json
{
  "id": "LOTE-ARS-2026-04",
  "aseguradora": "Humano",
  "periodoInicio": "2026-09-01", "periodoFin": "2026-09-30",
  "estado": "Facturado",
  "cantidadFacturas": 1, "montoTotalLote": 600,
  "facturaConsolidada": "ACC-SINV-2026-00018", "ncfAsignado": "E310000000004",
  "facturasSnapshot": [
    { "factura": "ACC-SINV-2026-00017", "ncf": "E320000000009", "paciente": "Paciente Credito Test",
      "numeroAutorizacion": "AUT-CRED-3", "montoCobertura": 600 }
  ],
  "facturas": [
    { "id": "ACC-SINV-2026-00017", "customer": "Paciente Credito Test", "customerName": "Paciente Credito Test",
      "postingDate": "2026-09-12", "ncf": "E320000000009", "grandTotal": 1000, "outstandingAmount": 200,
      "numeroAutorizacion": "AUT-CRED-3", "montoCobertura": 600, "montoCoberturaNeta": 300, "estadoArs": "Facturado" }
  ]
}
```

Fijate que `montoCoberturaNeta` de la lista viva puede bajar **después** de facturar (hubo una
devolución posterior con NC a la ARS); `facturasSnapshot.montoCobertura` es lo que se facturó.

### 6.5 Errores

| Mensaje (extracto) | Código | UX |
|---|---|---|
| "El lote X ya está Facturado" / "es inmutable" | 400 | Ocultar acciones de edición en `Facturado` |
| "El lote X no tiene facturas vinculadas — no hay nada que facturar" | 400 | Deshabilitar "Facturar" con 0 facturas |
| "El vertical Farmacia ARS no está completamente habilitado… Ejecute POST /config/farmacia/habilitar" | 400 | Enviar al admin a Configuración → Farmacia |
| "no tiene crédito fiscal establecido" (la ARS) | 400 | Editar la aseguradora en `/aseguradoras` (`hasCredit: true`) |
| "Sin secuencia asignada: No hay rango de NCF para tipo 31" | 409 | Falta el rango B01/E31 |
| "ya tiene una facturación en curso" | 400 | Otro usuario está facturando el mismo lote; reintentar en unos segundos |
| Reintentar `facturar` tras un error de red | — | Es seguro: nunca emite dos consolidadas; si ya se creó, la retoma y cierra el lote |

### 6.6 Cobrar a la ARS

Nada nuevo: `GET /cobros/pendientes?customer=<id de la ARS>` lista las consolidadas pendientes
y se cobran con `POST /caja/facturas/:id/cobrar` (o el flujo de Cobros que ya tengas). Recordá que
cobrar por cheque/transferencia exige `referenceNo`/`referenceDate` (regla existente). Las NC a
la ARS no aplicadas (ARS que ya había pagado) aparecen como saldo a favor del Customer ARS en
`/credit-notes`.

---

## 7. Reportes — `/farmacia/reportes`

Ambos devuelven `{ columns: [{ fieldname, label, fieldtype? }], rows: [...], totalRows }` (mismo
contrato que `/reportes/*`): renderizá la tabla desde `columns`.

| Reporte | Endpoint | Filtros | Columnas |
|---|---|---|---|
| Listado de lotes | `GET /farmacia/reportes/lotes` | `aseguradora`, `estado`, `desde`, `hasta` (período del lote), `limit`, `offset` | `codigoLote, aseguradora, periodoInicio, periodoFin, cantidadFacturas, montoTotalLote, ncfAsignado, estado` |
| Facturas con cobertura ARS | `GET /farmacia/reportes/facturas-ars` | `aseguradora`, `estadoArs`, `desde`, `hasta` (fecha de la factura), `limit`, `offset` | `factura, fecha, ncf, paciente, aseguradora, numeroAutorizacion, montoCobertura, montoCoberturaDevuelta, montoCoberturaNeta, estadoArs, motivoAnulacion, codigoLote, ncfConsolidado, fechaFacturacion` |

El segundo reemplaza al "Despacho/Lote/NCF" de la v1 y sirve para: ver qué coberturas siguen
`Pendiente` (sin facturar a la ARS), qué lote/NCF consolidado tomó cada factura, y qué se devolvió.

---

## 8. Impresión y plantillas

### 8.1 PDF de la factura — `GET /invoices/:id/pdf?formato=a4|carta|a6|pos`

Sin cambios de contrato. Con `aseguradora`, los formatos de página completa usan el Print Format
"Factura Farmacia RD", que incluye el bloque "Pago con seguro" (ARS, cobertura, carnet, NSS,
autorización, doctor, fechas, a cargo del paciente). `formato=pos` usa la **plantilla JSON
default** del tenant (ver 8.2).

### 8.2 Editor de plantillas (`/plantillas`, tipo `Pos Invoice`)

`GET /plantillas/campos-disponibles?type=Pos Invoice` incluye en tenants farmacia:

| key | Contenido |
|---|---|
| `seguro.aseguradora` | Nombre de la ARS |
| `seguro.coberturaMonto` | Cobertura en RD$ |
| `seguro.montoPaciente` | A cargo del paciente |
| `seguro.numeroSeguroSocial` | NSS |
| `seguro.carnetAfiliado` | Carnet |
| `seguro.numeroAutorizacion` | Nro. autorización |
| `seguro.nombreDoctor` | Doctor |
| `seguro.fechaAprobacion` | Fecha de aprobación (`YYYY-MM-DD`) |
| `seguro.fechaIndicacionReceta` | Fecha de indicación de receta |

Y cada fila de `items.tabla` en `render-data` trae dos claves más: `coberturaArs` y
`montoPaciente` (para columnas "ARS" / "Paciente" en la tabla de artículos). **Todos son `null`
en una factura sin aseguradora** — el render debe tolerar `null` y ocultar el bloque.

Al habilitar el vertical, el backend siembra una plantilla **"Factura Farmacia"** (default del
tenant si no había una) con ese bloque; el usuario puede editarla como cualquier otra.

---

## 9. Configuración → Farmacia ARS

`POST /config/farmacia/habilitar` (sin body, acción `config.farmacia.habilitar`, idempotente).
Crea en ERPNext lo que el vertical necesita (cuenta puente, modo de pago "Cobertura ARS", grupo
de clientes "ARS", perfiles, ítem de reclasificación, plantilla "Factura Farmacia"). Respuesta:
`{ cuentaCxcArsProvisional, modoPagoCoberturaArs, customerGroupArs, itemCoberturaLote,
rolDispensadorControlados, plantillaFactura }`. Botón "Habilitar / Reparar configuración".

Checklist que la pantalla de onboarding debería mostrar (el backend no tiene un `GET` de
estado — es una lista de tareas para el admin):

1. Vertical fijado por el operador (`vertical === "farmacia"`).
2. "Habilitar" ejecutado.
3. ARS dadas de alta en `/aseguradoras` (nacen con crédito fiscal).
4. Medicamentos con plantilla de impuesto **exenta** y creados como **producto** por el
   catálogo del sistema (nunca a mano en ERPNext: no aparecerían en los selectores).
5. Rangos e-NCF/NCF para **B02/E32** (paciente), **B01/E31** (consolidada) y **B04/E34** (notas
   de crédito) en Configuración → e-CF.
6. Usuarios con sus perfiles normales (Ventas, Cajero POS, Contabilidad).

---

## 10. Orden de implementación sugerido y checklist

1. [ ] Regenerar tipos/cliente desde el `openapi.json` nuevo.
2. [ ] Eliminar Preaprobaciones, Despachos, Cola de Cobro (rutas, stores, menú, acciones §2).
3. [ ] Factura: panel Aseguradora + columnas por línea + pie con totales + botón Recalcular
       (§3). Validaciones en cliente: obligatorios, `valorCobertura` según tipo, cédula.
4. [ ] Factura: badge de estado ARS, bloqueo de edición/cancelación en `Facturado`, filtros del
       listado (§3.8).
5. [ ] Caja: `montoACobrar` + desglose; validar pagos contra `montoACobrar` (§4.3).
6. [ ] Lotes: crear → elegibles con selección múltiple → vincular en bloque (mostrar
       rechazadas) → quitar → facturar con confirmación → PDF; detalle con `facturas` /
       `facturasSnapshot` (§6).
7. [ ] Devoluciones: campos de motivo, resultado con NC a la ARS, botón "Emitir NC a la
       aseguradora" (§5).
8. [ ] Reportes: `lotes` y `facturas-ars` desde `columns` (§7).
9. [ ] Editor de plantillas: bindings `seguro.*`, columnas `coberturaArs`/`montoPaciente`, tolerar
       `null` (§8).
10. [ ] Configuración → Farmacia ARS con el checklist (§9).
11. [ ] QA en un tenant `general`: nada de lo anterior es visible y ninguna llamada incluye
        `aseguradora`.

## 11. Lo que el frontend NO debe hacer

- **No** calcular `montoCobertura`, `diferencia`, `montoPaciente`, `montoCoberturaNeta` ni los
  valores por línea — son del servidor. Mostralos.
- **No** enviar la fila "Cobertura ARS" en `payments` (ni en `submit` ni en Caja).
- **No** validar el cobro en Caja contra `roundedTotal` — contra `montoACobrar`.
- **No** ofrecer editar/cancelar el bloque ARS de una factura `Facturado`.
- **No** dejar "Facturar lote" sin confirmación explícita.
- **No** reintentar un `POST /devoluciones` que devolvió 500 con "Reintente con…": usá el
  endpoint de reintento, no vuelvas a crear la devolución (duplicarías la NC del paciente).
- **No** asumir que `vertical` cambia en caliente.
- **No** ofrecer `formato=pos` para el PDF de la consolidada.
