# Prueba end-to-end de Multimoneda — Cotización → Pedido → Factura → Cobro en Caja

> Registro de una prueba manual completa del flujo de ventas en moneda extranjera (USD), hecha en
> vivo contra el tenant `far` (farmacia.ryancfx.click), el **2026-09-13/14**. El objetivo era
> recorrer TODO el circuito de ventas — desde activar multimoneda hasta cobrar en Caja (POS) — y
> documentar cualquier bloqueante. Esta tarea complementa (no reemplaza) a
> `docs/tasks/64_multimoneda_completo.md` (spec) y `docs/tasks/66_bug_moneda_cuenta_bancaria_cobros.md`
> (bug de Cobros, ya resuelto).
>
> **Resultado en una frase**: la cadena Cotización → Pedido → Factura funciona correctamente en
> moneda extranjera (moneda, tasa de cambio y `baseGrandTotal` se resuelven/heredan bien en cada
> paso), pero **el cobro de esa factura en el módulo de Caja (POS) está roto para monedas
> distintas a la base** — tanto por un bug de backend como por un gap de frontend — y además se
> encontraron dos bloqueantes de UI que impidieron probar tramos del flujo por pantalla (hubo que
> usar llamadas directas a la API para poder continuar).

---

## 0. Estado inicial verificado

Antes de tocar nada se confirmó que el tenant `far` **ya tenía multimoneda activa** (no hubo que
"activarla" desde cero):

```
GET /config/facturacion → monedaBase: "DOP", monedasHabilitadas: ["DOP","EUR","USD"], multimonedaHabilitada: true
GET /monedas → DOP (esBase, habilitada), USD (habilitada), EUR (habilitada)
GET /monedas/tasas/vigente?from=USD&to=DOP → tasa: 59.1974, origen: "currency_exchange"
```

Con el usuario se confirmó explícitamente seguir en este tenant tal cual (ver hilo de la
conversación) en vez de deshabilitar monedas o cambiar de tenant.

**No hizo falta agregar ninguna cuenta contable/bancaria nueva** para este flujo — el pago que se
intentó probar era en Caja (efectivo/POS), no contra una cuenta bancaria como en
`docs/tasks/66_bug_moneda_cuenta_bancaria_cobros.md`.

---

## 1. Cotización en USD

**Intento por UI**: se abrió `/cotizaciones/nueva`, se completó Cliente ("Paciente Credito Test"),
Moneda (USD, dejando la tasa vacía para que se resuelva sola), Sucursal ("Test") y un artículo
("Ibuprofeno 400mg (tableta)").

🔴 **Bloqueante de UI encontrado**: el botón **"Guardar Borrador" no dispara el submit del
formulario**. Se intentó repetidamente (clic directo, clic por referencia de accesibilidad, con la
ventana en distintos anchos, quitando el foco de otros campos, presionando Escape antes por si un
popover invisible estaba capturando los clics) — en todos los casos, cero peticiones de red salen
hacia `POST /quotations`, sin ningún toast de error ni mensaje de validación visible. No se pudo
determinar la causa raíz exacta en el tiempo de esta prueba (candidatos: un campo requerido oculto
en la segunda fila vacía de artículos que el formulario agrega automáticamente, o un handler de
submit que no se está enganchando). **Se recomienda que un agente de frontend audite
`src/features/quotations/QuotationForm.tsx` específicamente el flujo de `handleSubmit`/validación
antes de esta tarea considerarse cerrada** — sin poder guardar una cotización desde la pantalla,
la feature es inutilizable para un usuario real sin importar que el backend funcione bien.

**Verificación por API directa** (para no bloquear el resto de la prueba):

```
POST /quotations { customer, date, currency: "USD", branch: "Test", items: [...] }
→ 201, id: SAL-QTN-2026-00001, currency: "USD", conversionRate: 59.1974 (auto-resuelta, sin mandarla)
POST /quotations/SAL-QTN-2026-00001/submit → 201, status: "ordered"
```

✅ Moneda y tasa se resuelven correctamente contra `/monedas/tasas/vigente` tal como describe el
doc 64 §3.0, sin mandar `conversionRate` explícito.

---

## 2. Cotización → Pedido

El botón "Crear Pedido" de `QuotationDetail.tsx` navega a `/pedidos/nuevo?quotation=:id`, que
precarga el formulario con `currency`/`conversionRate`/`items` de la cotización (código en
`PedidoForm.tsx:179-209`) y los manda tal cual en el `POST /pedidos` (no se re-resuelven contra el
cliente actual, tal como exige doc 64 §3.2).

Se creó una segunda cotización (`SAL-QTN-2026-00002`, la primera ya se había convertido
directamente a factura en el paso 3 más abajo) y se generó el pedido por API replicando exactamente
lo que manda el formulario:

```
POST /pedidos { customer, transactionDate, branch, quotation: "SAL-QTN-2026-00002", currency: "USD", items: [...] }
→ 201, id: SAL-ORD-2026-00004, currency: "USD", conversionRate: 59.1974
```

✅ La moneda y la tasa se heredaron correctamente de la cotización, sin re-resolverse.

---

## 3. Pedido → Factura

**Hallazgo de comportamiento (no es un bug, pero no es obvio)**: en esta app, "someter" un Pedido
normal (no apartado) **genera y deja en Draft la factura en el mismo paso** — no hay un botón
separado de "convertir a factura", el botón se llama "Facturar" y llama a
`POST /pedidos/:id/submit`, que además de someter el pedido devuelve `facturaId` (ver
`PedidoDetail.tsx:73-74`, `pedidos.ts:submitPedido`). Ídem para `POST /quotations/:id/convert`,
que salta directo de Cotización a Factura sin pasar por Pedido si se usa ese botón en vez de
"Crear Pedido".

```
POST /pedidos/SAL-ORD-2026-00004/submit
→ 201, facturaId: "ACC-SINV-2026-00035", message: "Factura ACC-SINV-2026-00035 creada en Draft..."

GET /invoices/ACC-SINV-2026-00035 → currency: "USD", conversionRate: 59.1974,
    baseGrandTotal: 3492.65 (= 50 × 59.1974 aprox., correcto)
```

✅ Moneda, tasa y `baseGrandTotal` correctos al generar la factura desde el pedido.

🟡 **Bloqueante operativo (no de multimoneda)**: al intentar someter esa factura, salió
`400 "Stock insuficiente: se necesitan 2 unidades de MED-IBUPROFENO-400... disponible: 0"`. Es
válido — el tenant de prueba no tenía inventario cargado para ese artículo. Se resolvió editando
la factura (`PATCH /invoices/:id`) para cambiar la línea al servicio `SERV-COBERTURA-ARS-LOTE`
(sin control de stock), lo cual confirmó además que **`PATCH` sin mandar `currency` conserva la
moneda/tasa ya congelada** (USD/59.1974 se mantuvieron intactos tras el cambio de ítem), tal como
exige doc 64 §3.1.

```
POST /invoices/ACC-SINV-2026-00035/submit
→ 201, status: "submitted", ncf: "B0200000002", currency: "USD", conversionRate: 59.1974
```

✅ Factura sometida correctamente en USD con NCF asignado.

---

## 4. Cobrar la factura en Caja (POS) — 🔴 BLOQUEADO

Este es el hallazgo más importante de la prueba.

### 4.1 Bloqueante operativo previo: turno de caja vencido

Al entrar a `/caja/pendientes` apareció "Turno vencido — Tu turno de caja ha excedido el tiempo
máximo permitido. Debes cerrarlo y abrir uno nuevo." Cerrar el turno exige un arqueo de efectivo
(desglose de billetes/monedas por denominación) para conciliar el método "Efectivo RD" — no se
completó ese arqueo porque hacerlo con valores inventados habría ensuciado un registro contable
real del tenant sin necesidad (no es parte de lo que se estaba probando). **Se dejó el turno
abierto/vencido tal cual estaba, sin modificar nada.** Cualquiera que retome esta prueba necesita
resolver esto primero (cerrar el turno con el arqueo real o que un admin lo fuerce) para poder
llegar a la pantalla de cobro.

### 4.2 Bug de backend confirmado: `outstandingAmount` viene en la moneda base, no en la del documento

Se verificó contra 3 endpoints distintos que sirven la misma factura (`ACC-SINV-2026-00035`,
`currency: "USD"`, `grandTotal: 59`):

| Endpoint | `grandTotal` | `outstandingAmount` | `amountDue` | `baseGrandTotal` | `baseOutstandingAmount` |
|---|---|---|---|---|---|
| `GET /invoices/:id` | 59 (USD) | **3492.65** | **3492.65** | 3492.65 | **ausente** |
| `GET /invoices` (listado) | 59 (USD) | **3492.65** | — | — | — |
| `GET /caja/pendientes` | 59 (USD) | **3492.65** | — | — | — |

Esto **contradice directamente** la tabla de doc 64 §3.1: `outstandingAmount` y `amountDue`
deberían estar en la moneda del documento (USD, ≈59 con algo pendiente si hubiera pagos
parciales) — en cambio traen el valor ya convertido a DOP (3492.65 ≈ 59 × 59.1974), que es
exactamente lo que se supone que debería ir en el campo `baseOutstandingAmount`, campo que
**ni siquiera existe** en la respuesta (el doc dice que debería estar presente cuando la moneda
difiere de la base).

**Confirmado que el bug es específico a moneda extranjera**: se revisó una factura en DOP del
mismo tenant (`ACC-SINV-2026-00004`) y ahí `grandTotal`/`outstandingAmount` son consistentes entre
sí (1000/300, ambos DOP) — el bug no aparece cuando `currency === monedaBase`.

**Impacto**: cualquier pantalla que muestre o valide contra `outstandingAmount`/`amountDue` de una
factura en moneda extranjera (Caja, Cobros, reportes de aging, etc.) va a mostrar un monto ~59
veces más grande de lo real (el equivalente en DOP en vez del monto real en USD), y cualquier
intento de pago que valide "el monto pagado debe ser ≤ outstandingAmount" va a comparar contra un
número completamente equivocado.

### 4.3 Bug de frontend confirmado: `CajaPage.tsx` ignora la moneda del documento

Aparte del bug de backend de arriba, el frontend de Caja tiene su propio problema independiente:
`src/features/caja/CajaPage.tsx` **usa `formatDOP()` en cada lugar donde muestra un monto de
factura** (líneas 348, 351, 401, 403, 439, 450 — confirmado por búsqueda literal en el archivo) —
nunca lee `invoice.currency` ni usa `formatMoney(monto, currency)` como sí hace, por ejemplo,
`PagoPage.tsx` para las facturas de Cobros. Tampoco aparece ninguna mención a `currency` en todo
el archivo.

Esto significa que, incluso si el bug de backend de 4.2 se arregla, la pantalla de Caja va a
etiquetar como "RD$" un monto que en realidad está en USD/EUR — el cajero vería, por ejemplo,
"RD$59.00" en vez de "$59.00", sin ningún indicio de que la factura no es en pesos. El módulo de
Caja (`CobrarFacturaDto`/`cobrarFactura`, ver `src/shared/api/caja.ts`) tampoco tiene ningún campo
de moneda/tasa de cambio — a diferencia de Cobros (`/cobros`) y Pagos (`/pagos`), que sí los
tienen (doc 64 §4.1). Es decir: **el módulo de Caja/POS no fue adaptado para multimoneda en
absoluto**, ni en frontend ni aparentemente en el contrato de su DTO — un gap que
`docs/tasks/64_multimoneda_completo.md` tampoco cubre (el documento solo habla de `/cobros` y
`/pagos`, nunca de `/caja/pendientes` + `POST /caja/:id/cobrar`).

**No se pudo completar el cobro real** por el bloqueante operativo de 4.1 (turno vencido) — pero
dado lo confirmado en 4.2 y 4.3, aunque se hubiera podido abrir la pantalla, el monto mostrado y
validado habría sido incorrecto de todos modos.

---

## Resumen de bloqueantes (para trackear)

| # | Bloqueante | Tipo | Severidad | Estado |
|---|---|---|---|---|
| 1 | `QuotationForm.tsx` — "Guardar Borrador" no envía el formulario (sin red, sin error visible) | Frontend | 🔴 Alto — impide crear cotizaciones desde la UI | Sin investigar a fondo, requiere sesión de debugging dedicada |
| 2 | `GET /invoices*` y `/caja/pendientes` devuelven `outstandingAmount`/`amountDue` en moneda base en vez de moneda del documento; falta `baseOutstandingAmount` | Backend | 🔴 Alto — corrompe cualquier pantalla de cobro/saldo para facturas en moneda extranjera | Reportar a backend |
| 3 | `CajaPage.tsx` no soporta multimoneda (hardcodea `formatDOP`, no lee `currency`); `CobrarFacturaDto` no tiene campos de moneda/tasa | Frontend + posible gap de API | 🟡 Medio — bloquea cobrar en Caja facturas no-DOP | Requiere definir el contrato primero (¿debe `/caja/:id/cobrar` aceptar `conversionRate` como `/cobros`?) antes de tocar el frontend |
| 4 | Turno de caja vencido, requiere arqueo de efectivo real para cerrar | Operativo | 🟢 Bajo — no relacionado a multimoneda, solo bloqueó la prueba puntual | Se dejó sin tocar a propósito |

## Lo que sí quedó verificado y funcionando correctamente

- Config de multimoneda (`monedasHabilitadas`, `multimonedaHabilitada`) ya activa en el tenant.
- Resolución automática de tasa de cambio contra `/monedas/tasas/vigente` al crear una Cotización sin mandar `conversionRate`.
- Herencia estricta de `currency`/`conversionRate` de Cotización → Pedido (sin re-resolver).
- Herencia estricta de Pedido → Factura vía "Facturar" (`submitPedido`).
- `PATCH /invoices/:id` sin mandar `currency` congela la moneda/tasa existente, incluso al cambiar los ítems.
- `baseGrandTotal` calculado correctamente en la factura.
