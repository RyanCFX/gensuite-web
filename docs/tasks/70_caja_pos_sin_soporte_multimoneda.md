# Módulo de Caja (POS) no soporta multimoneda — falta decisión de diseño antes de implementar

> Este documento es un prompt autocontenido para el agente/equipo de backend. Describe un gap (no
> un bug puntual) encontrado al probar en vivo el flujo completo de ventas de
> `docs/tasks/64_multimoneda_completo.md`, documentado en `docs/tasks/67_prueba_flujo_completo_multimoneda.md`
> (bloqueante #3). A diferencia de los bugs 66/68 (algo calculaba mal), acá **no hay nada que
> arreglar todavía porque la Fase 4 del doc 64 nunca definió el contrato de este endpoint** —
> necesitamos que backend decida el diseño antes de que frontend implemente nada.

## Contexto: qué es el módulo de Caja y por qué quedó afuera

`docs/tasks/64_multimoneda_completo.md` Fase 4 cubre en detalle `POST /cobros` y `POST /pagos`
(Cuentas por Cobrar/Pagar) — moneda del documento, `conversionRate`, `receivedAmount`,
`bankConversionRate`, el "caso triangular", etc. Pero el proyecto tiene un **tercer** camino para
cobrar una factura, independiente de `/cobros`: el módulo de Caja (POS), usado quintener facturas
al contado en el momento de la venta:

- `GET /caja/pendientes` — lista facturas pendientes de cobro en caja.
- `POST /caja/:id/cobrar` — cobra una factura puntual, usado para saldar facturas al contado en
  el momento de la venta (`CobrarFacturaDto`: hoy solo
  `{ payments: PaymentLine[], vuelto?: VueltoLine[], tenderedCash?: number }`).

El doc 64 nunca menciona este endpoint. Como Fase 3 del mismo doc confirma que **no hay ninguna
restricción de moneda en el flujo POS** ("una venta al contado puede estar en cualquier moneda
habilitada"), en la práctica esto significa que hoy se puede generar una factura POS en USD/EUR
perfectamente — pero no hay ninguna forma correcta de cobrarla en Caja.

## Qué se confirmó al probar (ver doc 67 para el detalle completo)

Con el bug de `outstandingAmount` ya resuelto (doc 68), se generó una factura real en USD y se
revisó qué necesitaría el frontend para cobrarla en Caja:

- **`CobrarFacturaDto` no tiene ningún campo de moneda ni tasa de cambio** — a diferencia de
  `CreateCobroDto`/`CreatePagoDto` (que sí tienen `conversionRate`, `receivedAmount`,
  `bankConversionRate`, ver doc 64 §4.1).
- El frontend (`src/features/caja/CajaPage.tsx`) tampoco lee `invoice.currency` en ningún lado —
  usa `formatDOP()` a lo bruto para mostrar `grandTotal`/`outstandingAmount`, así que hoy
  etiquetaría como "RD$" un monto que en realidad está en USD/EUR. Esto es arreglable solo del
  lado de frontend (cambiar `formatDOP` por `formatMoney(monto, invoice.currency)`), pero **no
  tiene sentido arreglarlo sin saber primero qué campos va a esperar el backend** al cobrar — ver
  la pregunta abajo.

## La pregunta que necesitamos que backend responda antes de tocar el frontend

**¿`POST /caja/:id/cobrar` va a aceptar campos de conversión de moneda (tipo
`conversionRate`/`bankConversionRate`, igual que `/cobros`), o el diseño pretendido es que el
cobro en Caja siempre sea 1:1 en la misma moneda de la factura (sin conversión, ej. el cajero solo
puede recibir dólares en efectivo si la factura es en dólares, nunca pesos)?**

Ambos son diseños razonables, pero cambian todo lo que hay que construir:

1. **Si Caja debe soportar cobrar en una moneda distinta a la de la factura** (ej. factura en USD,
   cliente paga en efectivo DOP): hace falta agregar a `CobrarFacturaDto` el equivalente de
   `conversionRate`/`receivedAmount` de doc 64 §4.1, y el frontend necesita un selector de moneda
   por línea de pago (`PaymentLinesEditor` ya soporta múltiples métodos de pago — habría que ver
   si cada línea puede tener su propia moneda, o si es una tasa única a nivel del cobro completo).
2. **Si Caja solo permite cobrar en la misma moneda exacta de la factura** (sin conversión, más
   simple y probablemente más realista para un POS físico): no hace falta ningún campo nuevo en
   el DTO — el frontend solo necesita mostrar los montos con la moneda correcta
   (`formatMoney(monto, invoice.currency)` en vez de `formatDOP`) y quizás validar que
   `PaymentLinesEditor` no ofrezca métodos de pago en otra moneda para esa factura. Este es el
   camino más simple de implementar del lado de frontend.
3. Un tercer intermedio: permitir efectivo (`Cash`) siempre en DOP como "vuelto"/cambio, pero el
   monto principal cobrado debe coincidir con la moneda de la factura — esto es común en POS
   reales (el ticket dice "$50.00" pero el cliente paga con pesos y se calcula el cambio con la
   tasa del día). Si es este el caso, hace falta la tasa de cambio igual que en el punto 1, pero
   acotada solo al cálculo de vuelto.

## Qué necesitamos de backend

- Definir cuál de las 3 opciones (o una distinta) es la esperada para el negocio.
- Si implica campos nuevos en `CobrarFacturaDto`, especificar sus nombres/tipos exactos (mismo
  patrón de nomenclatura que ya usa el resto de la app — revisar doc 64 §0.5 antes de inventar
  nombres nuevos, para no repetir la inconsistencia ya documentada ahí).
- Confirmar si `GET /caja/pendientes` ya devuelve `currency` por factura (a simple vista sí, se
  vio en las pruebas — pero confirmarlo explícitamente como parte del contrato).
- Avisar cuando esté decidido/implementado para que frontend pueda actualizar `CajaPage.tsx`
  (cambiar `formatDOP` → `formatMoney` en las ~11 líneas ya identificadas en doc 67, y agregar
  los campos de conversión al formulario si aplica).

## Nota para quien lo resuelva

No es un bug — es una feature a medio definir. El frontend no debe adivinar el contrato; hasta que
no haya respuesta a la pregunta de arriba, cualquier cambio en `CajaPage.tsx` sería trabajo
desechable.
