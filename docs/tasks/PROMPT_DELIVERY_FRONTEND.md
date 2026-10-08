# PROMPT — Frontend: Delivery con cobro contra entrega

> Para el agente de frontend. Contrato del BFF listo (implementado 2026-10-08). Diseño completo y
> razones: `docs/plans/PLAN_DELIVERY_COBRO_CONTRA_ENTREGA.md` (léelo si algo no queda claro).
> **`openapi.json` gana** si algún tipo de este documento difiere. Si un path de abajo no aparece en
> el openapi, **pará y avisá**: el BFF no está desplegado con este feature.

---

## 0. Qué es (y qué no es)

Una venta puede marcarse **con delivery**. Se factura y se cobra como siempre, pero lo que el
repartidor cobrará al entregar **no entra a la gaveta**: queda **por conciliar**. Después:

1. **Despacho** asigna la factura a un repartidor en un **viaje** y lo **despacha**.
2. **Despacho** confirma la entrega (entregado / no entregado).
3. **Caja** (o Facturación, si el tenant no usa POS) **concilia el cobro** cuando el repartidor
   vuelve con el dinero.
4. **El turno no se puede cerrar** mientras tenga cobros delivery por conciliar.

Una entrega fallida **se anula** (nota de crédito con devolución del dinero + devolución del
despacho). **No existe reprogramar** en esta versión.

No es: rastreo GPS, ruteo con mapas, app del repartidor ni cobro a crédito.

---

## 1. Las dos puertas (feature × permiso)

| Puerta | Dónde se lee | Qué decide |
|---|---|---|
| **Feature `delivery`** | `GET /me/features` → `features.delivery` (boolean) | Si el tenant contrató delivery. Requiere que `features.despacho` sea true (lo garantiza el BFF) |
| **Permiso** | `GET /me/permissions` → `acciones[<id>]` | Si el usuario puede hacer cada cosa |
| **Habilitación local** | `GET /me/configuracion-operativa` → `facturacion.deliveryHabilitado` | Si el admin del tenant ya activó delivery (`POST /config/delivery/habilitar`). Feature sin habilitar = no mostrar nada operativo |

Mostrá una pantalla o botón solo si feature **y** habilitación local **y** permiso. Trata como
`false` cualquier clave que falte.

### Acciones nuevas (ids exactos)

`delivery.pendientes.listar`, `delivery.viajes.listar|crear|editar|despachar|cancelar|imprimir`,
`delivery.entregas.confirmar`, `delivery.entregas.anular`,
`delivery.cobros.listar|conciliar|conciliar-con-diferencia`,
`delivery.repartidores.listar|crear|editar`, `delivery.vehiculos.listar|crear|editar`,
`config.delivery.habilitar|deshabilitar|configurar`.

También aparecen en `GET /acceso/catalogo` (pantallas `delivery.*` y `config.delivery`, módulo
`delivery`; las del cobro cuelgan del módulo `caja`). Lookups nuevos para formularios:
`lookup.repartidores` (Driver activos) y `lookup.vehiculos`.

### Modo drenaje (importante)

GenSuite Control puede apagar la feature en cualquier momento aunque queden pendientes. Con la
feature **apagada**, siguen funcionando **solo sobre lo que ya existe**: listar pendientes / viajes /
cobros, confirmar entregas, conciliar, anular y despachar un viaje ya asignado. Se cortan (403
`FEATURE_NO_CONTRATADO`): marcar delivery en una venta, crear o editar viajes, repartidores y
vehículos.

Qué hacer: si `features.delivery` es false pero el usuario tiene el permiso, llamá una vez
`GET /delivery/cobros?estado=por_conciliar&limit=1` y `GET /delivery/pendientes?limit=1`. Si
`meta.total > 0`, mostrá las secciones en **modo drenaje** con un aviso fijo: *"Delivery está
desactivado para tu empresa. Solo puedes terminar lo pendiente."* y sin botones de creación.

---

## 2. Facturación — marcar la venta como delivery

### 2.1 Formulario de factura (`POST /invoices`, `PATCH /invoices/:id`)

Campos nuevos en el body (todos opcionales):

| Campo | Tipo | Notas |
|---|---|---|
| `esDelivery` | boolean | Switch "Con delivery". Visible solo si la puerta §1 está abierta |
| `direccionEntrega` | string | Obligatoria **en la práctica** si `esDelivery` |
| `telefonoEntrega` | string | Para el repartidor |
| `referenciaEntrega` | string (≤500) | "Casa azul, portón negro…" |

**Dirección — de dónde sale (precargarla):**
1. Cliente ocasional → el campo que ya existe `clienteOcasionalDireccion`.
2. Cliente registrado → `GET /customers/:id` → `address`.
3. El usuario puede **cambiarla para esta venta** (`direccionEntrega`); eso **no** modifica la
   ficha del cliente.

Si `esDelivery` está encendido y no hay dirección, bloqueá el botón y mostrá el campo en rojo. El
BFF igual responde **400 `DELIVERY_DIRECCION_REQUERIDA`**.

Reglas que el BFF aplica (mostrá el mensaje que devuelve):
- `esDelivery` fuerza que la venta sea a despacho futuro. Si mandás `despachoFuturo: false` junto a
  `esDelivery: true` → 400 `DELIVERY_REQUIERE_DESPACHO_FUTURO`. **Ocultá o deshabilitá el toggle de
  despacho futuro** cuando delivery esté encendido.
- Solo en la moneda de la compañía (DOP): otra moneda → 400 `DELIVERY_MONEDA_NO_SOPORTADA`.
- `DELIVERY_NO_HABILITADO` (400) si el tenant no tiene delivery habilitado.
- Se valida existencia desde que creas/editas la factura: `STOCK_INSUFFICIENT_OR_RESERVED` (stock
  insuficiente o reservado para otro cliente; `details.faltantes[]`), `DELIVERY_ARTICULO_INACTIVO`,
  `DELIVERY_PERIODO_CERRADO`, y almacén fuera de la sucursal. Mostrá el detalle por artículo.
- Una venta delivery reserva el stock al emitirse. Si falla: 409 `DELIVERY_RESERVA_FALLIDA`.

### 2.2 Someter (`POST /invoices/:id/submit`)

`payments[]` ahora acepta **`contraEntrega?: boolean`** por línea (también en
`POST /caja/facturas/:id/completar-cobro`):

- En una venta delivery el default es **`true`** = "lo cobra el repartidor". Mostrá un check
  **"Se cobra al entregar"** por línea de pago, encendido por defecto.
- `contraEntrega: false` = ya se cobró en tienda con ese método.
- `contraEntrega: true` en una venta sin delivery → 400 `DELIVERY_CONTRA_ENTREGA_SIN_DELIVERY`.
- Cliente a crédito con una línea contra entrega → 400 `DELIVERY_CONTRA_ENTREGA_CLIENTE_CREDITO`
  (un cliente a crédito no cobra contra entrega: solo logística).
- La venta delivery debe cubrir el total: 400 `DELIVERY_PAGO_INCOMPLETO` si no.
- **Sin POS**: si el cliente es de contado y no mandas `payments`, se toma el 100% como contra
  entrega con el método por defecto.
- El vuelto se calcula **solo sobre las líneas de tienda**; el efectivo contra entrega no se entrega
  en caja, no pidas vuelto sobre él.

### 2.3 Respuesta: bloque `delivery`

`GET /invoices`, `GET /invoices/:id` y las respuestas de submit/completar-cobro traen:

```ts
delivery?: {
  esDelivery: boolean;
  direccion?: string; telefono?: string; referencia?: string;
  estado?: 'pendiente'|'asignado'|'en_ruta'|'entregado'|'no_entregado'|'retirado'|'cancelado';
  viaje?: string;                                  // id de la Delivery Trip
  cobro: {
    estado: 'no_aplica'|'por_conciliar'|'conciliado'|'revertido';
    montoPorConciliar: number;
    previsto: { modeOfPayment: string; amount: number }[];   // lo que se prevé cobrar
    conciliadoPor?: string; conciliadoEn?: string;
  };
}
```

Mostrá en la ficha de la factura una insignia de **entrega** y otra de **cobro**:
`por_conciliar` en ámbar, `conciliado` en verde, `revertido` en gris, `no_entregado` en rojo.

Filtros nuevos en `GET /invoices`: `esDelivery`, `estadoDelivery`, `estadoCobroDelivery` (usan los
valores de arriba; son filtros protegidos por permisos v2: respeta `filtrosPermitidos` del
catálogo).

### 2.4 Pedidos y cotizaciones

`POST/PUT /pedidos` y `/quotations` aceptan los mismos 4 campos y los pasan a la factura derivada;
sus respuestas traen `esDelivery` y la dirección.

---

## 3. Caja

### 3.1 Cola `GET /caja/por-cobrar`
Cada fila trae `esDelivery` y `direccionEntrega`. Mostrá una etiqueta "Delivery" y la dirección.

### 3.2 `POST /caja/facturas/:id/completar-cobro`
Body nuevo (todo opcional; si se omite, se usa lo que trae la factura):
`esDelivery`, `direccionEntrega`, `telefonoEntrega`, `referenciaEntrega`, `despachoFuturo`.

- **El cajero puede encender o apagar delivery.** El switch viene con el valor de la factura.
- Apagarlo convierte la venta en una normal: se libera la reserva y, si queda como venta inmediata,
  rigen las validaciones de stock y seriales (errores habituales).
- Encenderlo exige dirección.
- Respuesta: agrega `delivery: { estado, cobro }`.

### 3.3 Cobros delivery por conciliar (caja, o Facturación si no hay POS)

Pantalla **"Cobros delivery por conciliar"** (`delivery.cobros.listar`).

`GET /delivery/cobros` — query: `estado` (`por_conciliar` default | `conciliado` | `revertido` |
`no_aplica` | `todos`), `repartidor`, `viaje`, `turno`, `estadoEntrega`, `fechaDesde`, `fechaHasta`,
`q`, `limit` (≤100), `offset`. Respuesta `{ success, data: Fila[], meta:{ total, limit, offset, hasMore } }`.
`Fila` = fila de pendientes (§4.1) + `turno`, `repartidor:{id,nombre}|null`, `estadoViaje`.

`GET /delivery/cobros/resumen` →
`{ total:{cantidad,monto}, porTurno:[{turno,cantidad,monto}], porRepartidor:[{repartidor,nombre,cantidad,monto}], cuentaPuente:{cuenta,saldo,diferencia,cuadra}|null }`.
Úsalo para el encabezado ("RD$ 12,400 por conciliar con 3 repartidores"). Si `cuentaPuente.cuadra`
es false, mostrá una alerta para contabilidad.

**Conciliar** — `POST /delivery/cobros/conciliar` (`delivery.cobros.conciliar`):

```ts
{ conciliaciones: {
    invoiceId: string;
    recibido: { modeOfPayment?: string; amount: number; cardNumber?: string;
                authorizationCode?: string; bank?: string; checkNumber?: string; bankAccount?: string }[];
    diferencia?: { motivo: string };            // solo si falta dinero (ver abajo)
  }[] }   // 1..100
```

UI: por factura, precargá `recibido` con `cobro.previsto`. El cajero edita método y monto según lo
que el repartidor realmente trajo (puede cambiar de método). Botón **"Conciliar"** (uno o varios
seleccionados).

Respuesta (HTTP 200 aunque un ítem falle — revisá cada uno): `{ success: true, data: Resultado[] }`
con `Resultado = { invoiceId, ok, paymentEntryIds[], journalEntryId?, reutilizado?, estadoCobro, estadoEntrega, autoConfirmacion?:{omitida,motivo?,detalle?}, error?:{code,message,details} }`.

Reglas / errores por ítem:
- `recibido` suma **igual** al pendiente (±0.01). Si suma **más** → `DELIVERY_COBRO_MONTO_NO_CUADRA`.
- Si suma **menos**: solo se acepta con `diferencia.motivo` **y** el permiso
  `delivery.cobros.conciliar-con-diferencia` **y** si el tenant lo permite
  (`facturacion.deliveryPermiteDiferencias`). Si no: `DELIVERY_COBRO_DIFERENCIA_NO_PERMITIDA`
  (400 si no está permitido o falta el motivo, 403 si falta el permiso). Mostrá la opción "Conciliar
  con faltante" solo si cumple las tres condiciones.
- `DELIVERY_COBRO_NO_PENDIENTE` (409): otro cajero ya lo conciliaron — refrescá la lista.
- `DELIVERY_ENTREGA_NO_DESPACHADA` (409): la factura aún no salió en un viaje.
- `TURNO_NO_ABIERTO` (409): con POS, **abrí turno primero**; el dinero entra a la gaveta del cajero
  que concilia.
- Es idempotente: reintentar no duplica (`reutilizado: true`).

### 3.4 Turno y cierre

- `GET /pos/turnos/actual` → ahora incluye `cobrosDeliveryPorConciliar: { cantidad, monto, facturas[] }`
  y `puedeCerrar: boolean`.
- `GET /pos/turnos/:id/preview-cierre` → lo mismo, más
  `desgloseLiquidacionesDelivery: [{ modo, expectedNativo, liquidacionesDelivery, expected }]`.
  Cada fila de `paymentReconciliation` trae `esDeliveryTransito`.
- **La fila `esDeliveryTransito` no se cuenta**: no pidas conteo físico ni denominaciones, mostrala
  informativa ("Ventas delivery — contra entrega").
- El `expected` de cada método ya incluye lo conciliado en el turno: usalo tal cual para el arqueo.
- **`POST /pos/turnos/:id/cerrar` → 409 `TURNO_CON_COBROS_DELIVERY_POR_CONCILIAR`** con
  `details.facturas[]` (`invoiceId, customer, customerName, monto, estadoEntrega, viaje`). **Sin
  excepciones, ni para el administrador.** Si `puedeCerrar` es false, deshabilitá "Cerrar turno" y
  mostrá la lista con un enlace a cada cobro ("Conciliar" / "Anular").
- Corte de caja / PDF: `corteCaja.delivery = { ventasContraEntrega, liquidacionesRecibidas,
  liquidacionesEfectivo }`; cada fila de `ingresos` puede traer `liquidacionesDelivery` y
  `esDeliveryTransito`. El PDF ya lo imprime el BFF.
- En `GET /cobros` y los reportes de cuadre, la línea del modo puente aparece como **"Delivery por
  conciliar"** (`esDeliveryPorConciliar: true`).

---

## 4. Despacho — Pendientes y viajes

### 4.1 "Pendientes por delivery" — `GET /delivery/pendientes` (`delivery.pendientes.listar`)
Query: `branch`, `customer`, `estado` (`pendiente`|`no_entregado`), `fechaDesde`, `fechaHasta`, `q`,
`limit`, `offset`.
Fila: `{ invoiceId, ncf, customer, customerName, direccion, telefono, referencia, grandTotal, postingDate, branch, estadoEntrega, viaje, cobro:{estado,montoPorConciliar,previsto[],conciliadoPor?,conciliadoEn?}, origen:'factura'|'pedido', salesOrder?, fechaPrometida? }`.

Selección múltiple de filas → botón **"Asignar a repartidor"** (abre el formulario de viaje, §4.2).
Estas ventas **ya no aparecen** en `GET /despachos/pendientes`, y `POST /despachos/desde-factura/:id`
sobre una factura delivery responde 409 `DELIVERY_FACTURA_NO_DISPONIBLE` (`details.usar =
'/delivery/viajes'`): para delivery usá siempre los endpoints de viajes.

### 4.2 Viajes
| Método y ruta | Permiso | Uso |
|---|---|---|
| `GET /delivery/viajes` | `delivery.viajes.listar` | Lista. Filtros: `estado` (`borrador|programado|en_ruta|completado|cancelado`), `repartidor`, `fechaDesde`, `fechaHasta`, `branch` |
| `GET /delivery/viajes/:id` | ídem | Detalle con `paradas[]` |
| `POST /delivery/viajes` | `delivery.viajes.crear` (+ `delivery.viajes.despachar` si `despachar:true`) | Crear |
| `PUT /delivery/viajes/:id` | `delivery.viajes.editar` | Solo borrador |
| `DELETE /delivery/viajes/:id` | `delivery.viajes.cancelar` | Solo borrador |
| `POST /delivery/viajes/:id/despachar` | `delivery.viajes.despachar` | Despachar |
| `POST /delivery/viajes/:id/cancelar` | `delivery.viajes.cancelar` | Body `{ motivo (10..500) }`. Solo si no hay paradas visitadas |
| `GET /delivery/viajes/:id/pdf` | `delivery.viajes.imprimir` | Hoja de ruta (PDF) |

**Crear**:
```ts
POST /delivery/viajes
{ repartidor: string; vehiculo?: string; salida?: string /*ISO*/;
  facturas: { invoiceId: string; orden?: number }[];   // 1..100
  notas?: string;
  despachar?: boolean;                                  // asignar y despachar en un solo paso
  tracking?: { invoiceId: string; items: { itemCode: string; serials?: string[];
                batches?: { batchId: string; qty: number }[] }[] }[] }
```
- `vehiculo` opcional (hay un vehículo genérico por defecto).
- **Una factura solo admite UN despacho**: 409 `DELIVERY_FACTURA_YA_DESPACHADA`
  (`details` trae el despacho y el viaje existentes). Mostralo y ofrecé abrir ese viaje.
- `DELIVERY_REPARTIDOR_INACTIVO` (400): repartidor no activo.
- `despachar:true` y falla el despacho → el viaje **queda en borrador** y el error trae
  `details.viaje`; ofrecé reintentar con "Despachar".

**Detalle** (`paradas[]`): `{ orden, invoiceId, ncf, customer, customerName, direccion, telefono,
referencia, grandTotal, estadoEntrega, visitada, resultado:'pendiente'|'entregado'|'no_entregado',
motivo, confirmadoPor, confirmadoEn, cobro, despacho, despachoEstado, trackingPendiente:[{itemCode,qty,tipo:'serial'|'lote'}] }`.

**Seriales y lotes en el despacho.** Si una parada trae `trackingPendiente` no vacío, pedí los
seriales o lotes **antes** de despachar y mandalos en `tracking`. Si faltan: 409
`DELIVERY_TRACKING_PENDIENTE` (`details` por factura y artículo), sin despachar nada.

**Despachar** — respuestas:
- Normal → detalle del viaje.
- Ya despachado → detalle con `yaDespachado: true` (idempotente).
- `data.estado === 'dns_sometidos_trip_pendiente'` + `advertencia`: salió el stock pero el viaje no
  quedó sometido; mostrá la advertencia y botón "Reintentar despachar".
- 409 `STOCK_INSUFFICIENT_OR_RESERVED` (`details.faltantes[]`): sin stock físico.
- 409 `DELIVERY_DESPACHO_PARCIAL_REVERTIDO`: algo falló y se revirtió lo ya sometido; reintentar.

Editar/borrar un viaje sometido: 409 `DELIVERY_VIAJE_NO_EDITABLE`. Cancelar con entregas ya
confirmadas: 409 `DELIVERY_VIAJE_CON_ENTREGAS`.

### 4.3 Repartidores y vehículos
- `GET|POST /delivery/repartidores`, `PUT /delivery/repartidores/:id`:
  `{ id, nombre, telefono, licencia, empleado, usuario, transportista, estado:'activo'|'suspendido'|'retirado' }`.
  `transportista` = empresa o motoconcho externo (opcional). Filtros: `estado`, `q`.
  **Crear repartidores requiere un rol de administración en ERPNext**; si el usuario no puede, el BFF
  responde 403 con el mensaje correspondiente — mostralo.
- `GET|POST /delivery/vehiculos`, `PUT /delivery/vehiculos/:id`: `{ id=placa, placa, marca, modelo, color }`.
  Crear: `{ placa, marca, modelo, color? }`. Editar: `{ marca?, modelo?, color? }`.
- Para selects en formularios usá los lookups `lookup.repartidores` y `lookup.vehiculos`.

---

## 5. Despacho — Entregas

`POST /delivery/entregas/confirmar` (`delivery.entregas.confirmar`)
```ts
{ entregas: { invoiceId: string; resultado: 'entregado'|'no_entregado'; motivo?: string }[] }  // 1..100
```
`motivo` es **obligatorio** si `no_entregado`. HTTP 200 aunque un ítem falle: `{ success: true, data: Resultado[] }`, revisá cada uno
`{ invoiceId, ok, estado, resultado, yaConfirmada?, autoConciliacion?, error? }`.

**Automatismos configurables** (ver §7). Si el tenant activó "confirmar entrega concilia el cobro",
la respuesta trae `autoConciliacion: { omitida, motivo?, detalle?, paymentEntryIds? }`:
- `omitida: false` → el cobro quedó conciliado; informalo.
- `omitida: true` con motivo `SIN_PERMISO` / `COBRO_NO_PENDIENTE` / `ERROR` → la entrega **sí** se
  confirmó y el cobro **sigue pendiente** para caja. Mostrá un aviso suave.

**Anular una venta con entrega fallida o cancelada** —
`POST /delivery/facturas/:invoiceId/anular` (`delivery.entregas.anular`), body
`{ motivo: string (10..500), motivoAnulacion?: 1..5 }` (`motivoAnulacion` = código DGII de la nota de
crédito, default 1).
- Hace: devolución del despacho (la mercancía vuelve al inventario), nota de crédito total con
  reembolso contra el cobro pendiente, y libera la reserva.
- Respuesta: `{ invoiceId, notaCredito, devolucionDespacho, yaAnulada, delivery, advertencias? }`.
- Es **reintentable** (idempotente).
- Solo con cobro `por_conciliar`. Si ya está `conciliado` → 409 `DELIVERY_ANULACION_NO_PERMITIDA`:
  mandá al usuario al flujo normal de **Devoluciones** (`/devoluciones`).
- Hasta que se anule, el turno original sigue bloqueado: en la fila de "no entregado" mostrá el
  botón **Anular venta** bien visible.
- **No hay "reprogramar"**: una parada `no_entregado` no se reasigna.

---

## 6. Navegación sugerida

- **Despacho** → "Pendientes por delivery", "Viajes", "Repartidores", "Vehículos".
- **Caja** (o **Facturación** si el tenant no usa POS: `usaModuloPos` en la config pública) →
  "Cobros delivery por conciliar".
- **Cierre de turno**: aviso y bloqueo (§3.4).
- **Configuración → Facturación → Despacho → Delivery**: ajustes (§7).
- Cada ítem aparece solo si feature + habilitación + permiso (§1); en modo drenaje solo las
  secciones permitidas y sin botones de creación.

---

## 7. Configuración (administrador)

- `POST /config/delivery/habilitar` (`config.delivery.habilitar`): provisiona cuenta, método de pago
  puente y vehículo genérico. Requiere **despacho habilitado**: si no → 409
  `DELIVERY_REQUIERE_DESPACHO_HABILITADO` (mostrá un enlace a habilitar despacho). Idempotente.
- `POST /config/delivery/deshabilitar` (`config.delivery.deshabilitar`): 409 `DELIVERY_CON_PENDIENTES`
  con `details: { pendientesEntrega, viajesAbiertos, cobrosPorConciliar:{cantidad,monto} }` →
  mostrá los números y pedí terminar lo pendiente. (Este bloqueo es del admin del tenant; Control
  no bloquea.)
- **`PUT /config/delivery`** (`config.delivery.configurar`) — **"Ajustes avanzados de despacho"**:

  | Campo | Efecto |
  |---|---|
  | `confirmarEntregaConciliaCobro` | Al confirmar una entrega `entregado`, concilia automáticamente el cobro con lo previsto |
  | `conciliarCobroConfirmaEntrega` | Al conciliar el cobro de una factura `en_ruta`, confirma su entrega |
  | `permiteDiferencias` | Permite conciliar con faltante (exige `cuentaDiferencias`) |
  | `cuentaDiferencias` | Cuenta contable donde cae el faltante (selector de cuentas de movimiento) |
  | `vehiculoPorDefecto`, `ciudadPorDefecto` | Valores por defecto |

  Al menos un campo por request. `permiteDiferencias: true` requiere una `cuentaDiferencias`
  (enviada o ya guardada).
- `GET /config/facturacion` devuelve `deliveryHabilitado`, `deliveryModoPagoTransito`,
  `deliveryVehiculoPorDefecto`, `deliveryCiudadPorDefecto`, `deliveryConfirmarEntregaConciliaCobro`,
  `deliveryConciliarCobroConfirmaEntrega`, `deliveryPermiteDiferencias`, `deliveryCuentaDiferencias`.
- `GET /me/configuracion-operativa` (todos los usuarios) expone `deliveryHabilitado`, los dos
  automatismos y `deliveryPermiteDiferencias`.
- Con "ambos automatismos" encendidos no hay bucle: cada uno actúa solo si el otro lado sigue
  pendiente.

---

## 8. Tiempo real

Socket.IO `/realtime` (mismo handshake de siempre). Nuevo room `delivery:<tenantId>`: te unís
automáticamente si tenés `delivery.pendientes.listar` o `delivery.cobros.listar`. Payload mínimo
`{ tenantId, id, branch?, turno?, estado?, resultado?, timestamp }`; **refrescá por REST**.

| Evento | Cuándo | Refrescar |
|---|---|---|
| `delivery.pendiente.nuevo` | Una venta delivery quedó emitida | Pendientes por delivery |
| `delivery.viaje.actualizado` / `delivery.viaje.despachado` | Cambió un viaje | Viajes |
| `delivery.entrega.confirmada` | Se confirmó una entrega | Viajes, pendientes |
| `delivery.cobro.por_conciliar` | Un cobro quedó por conciliar | Cobros (también llega al room `pos`) |
| `delivery.cobro.conciliado` | Se concilió o revirtió un cobro | Cobros, turno actual (también al room `pos`) |

---

## 9. Códigos de error (resumen)

`DELIVERY_NO_HABILITADO`, `DELIVERY_DIRECCION_REQUERIDA`, `DELIVERY_REQUIERE_DESPACHO_FUTURO`,
`DELIVERY_MONEDA_NO_SOPORTADA`, `DELIVERY_CONTRA_ENTREGA_SIN_DELIVERY`,
`DELIVERY_CONTRA_ENTREGA_CLIENTE_CREDITO`, `DELIVERY_PAGO_INCOMPLETO`, `DELIVERY_RESERVA_FALLIDA`,
`DELIVERY_ARTICULO_INACTIVO`, `DELIVERY_PERIODO_CERRADO`, `STOCK_INSUFFICIENT_OR_RESERVED`,
`DELIVERY_FACTURA_NO_DISPONIBLE`, `DELIVERY_FACTURA_YA_DESPACHADA`, `DELIVERY_VIAJE_NO_EDITABLE`,
`DELIVERY_VIAJE_CON_ENTREGAS`, `DELIVERY_REPARTIDOR_REQUERIDO`, `DELIVERY_REPARTIDOR_INACTIVO`,
`DELIVERY_TRACKING_PENDIENTE`, `DELIVERY_DESPACHO_PARCIAL_REVERTIDO`, `DELIVERY_ENTREGA_NO_DESPACHADA`,
`DELIVERY_COBRO_NO_PENDIENTE`, `DELIVERY_COBRO_MONTO_NO_CUADRA`, `DELIVERY_COBRO_DIFERENCIA_NO_PERMITIDA`,
`DELIVERY_ANULACION_NO_PERMITIDA`, `DELIVERY_CON_PENDIENTES`, `DELIVERY_REQUIERE_DESPACHO_HABILITADO`,
`DESPACHO_CON_DELIVERY_ACTIVO`, `TURNO_CON_COBROS_DELIVERY_POR_CONCILIAR`, `TURNO_NO_ABIERTO`,
`FEATURE_NO_CONTRATADO`. Formato estándar `{ code, message, details? }`; mostrá `message` y usá
`code` para la lógica.

**Mensajes de ERPNext con código entre corchetes:** en algunos caminos el mensaje llega como
`"[DELIVERY_DIRECCION_REQUERIDA] …"`. Si lo ves, extraé el código del prefijo.

---

## 10. Checklist de aceptación

- [ ] Switch "Con delivery" en factura con dirección precargada (ocasional / ficha del cliente), editable y obligatoria; teléfono y referencia.
- [ ] Toggle de despacho futuro oculto con delivery encendido.
- [ ] Check "Se cobra al entregar" por línea de pago (default on); vuelto solo sobre líneas de tienda.
- [ ] Insignias de entrega y cobro en listado y ficha; filtros nuevos.
- [ ] Caja: etiqueta y dirección en la cola; switch delivery editable al cobrar.
- [ ] "Cobros delivery por conciliar": lista, resumen, conciliación por lote con edición de método, flujo de faltante condicionado a permiso + config.
- [ ] Cierre de turno: aviso, `puedeCerrar`, 409 con lista; fila de tránsito informativa; `expected` usado tal cual.
- [ ] "Pendientes por delivery" → crear viaje (con `despachar` opcional, `tracking` si hay `trackingPendiente`).
- [ ] Viajes: lista, detalle, editar/borrar/cancelar, despachar (todas las respuestas especiales), PDF.
- [ ] Confirmar entregas (con motivo) y manejo de `autoConciliacion`.
- [ ] Anular venta de entrega fallida; sin "reprogramar".
- [ ] Repartidores y vehículos (CRUD) con lookups.
- [ ] Ajustes avanzados (§7) y habilitar / deshabilitar.
- [ ] Modo drenaje (feature apagada con pendientes).
- [ ] Realtime con los 6 eventos.
- [ ] Un usuario sin el permiso o sin la feature no ve ni un botón de delivery.

