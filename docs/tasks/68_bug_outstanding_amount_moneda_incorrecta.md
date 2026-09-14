# Bug de backend — `outstandingAmount`/`amountDue` de Facturas vienen en la moneda base, no en la del documento

> Este documento es un prompt autocontenido para el agente/equipo de backend. Describe un bug
> reproducible encontrado al probar en vivo el flujo completo de ventas (Cotización → Pedido →
> Factura → Cobro) de la Fase 3 de `docs/tasks/64_multimoneda_completo.md`, documentado en detalle
> en `docs/tasks/67_prueba_flujo_completo_multimoneda.md` (sección 4.2). Es distinto al bug ya
> resuelto de `docs/tasks/66_bug_moneda_cuenta_bancaria_cobros.md` (ese era de Cuentas Bancarias en
> `/cobros`; este es de Facturas).

## Resumen del bug

Para una factura en moneda extranjera, los campos `outstandingAmount` y `amountDue` **devuelven
el monto ya convertido a la moneda base (DOP)**, en vez del monto real en la moneda del documento.
Además, el campo `baseOutstandingAmount` — que según la spec (doc 64 §3.1) es el que debería
llevar ese valor convertido — **no existe en la respuesta**.

Esto contradice directamente la tabla de doc 64 §3.1:

| Campo | Debería estar en... |
|---|---|
| `grandTotal`, `roundedTotal`, `subtotal`, `taxAmount`, `outstandingAmount`, `amountDue`, montos de `items[]`/`paymentLines[]`/`advances[]`/`pendingCreditNotes[]` | Moneda del documento (`currency`) |
| `baseGrandTotal`, `baseOutstandingAmount` | Moneda base (DOP) — son la ÚNICA excepción |

`grandTotal` sí está correcto (en la moneda del documento). `outstandingAmount`/`amountDue` no lo
están — vienen con el mismo valor numérico que `baseGrandTotal`, como si el código que calcula
"pendiente por cobrar" estuviera usando el total ya convertido a base en vez del total en moneda
original.

## Pasos exactos para reproducir (tenant `far`)

1. Factura de ejemplo ya creada: `ACC-SINV-2026-00035`, `currency: "USD"`, `conversionRate:
   59.1974`, `grandTotal: 59` (1 línea de `SERV-COBERTURA-ARS-LOTE`, qty 2, rate 25 + ITBIS),
   sometida (`status: "submitted"`, `ncf: "B0200000002"`), sin ningún cobro aplicado todavía (o
   sea, `outstandingAmount` debería ser igual a `grandTotal` = 59).

2. `GET /invoices/ACC-SINV-2026-00035`:
   ```json
   {
     "grandTotal": 59,
     "roundedTotal": 59,
     "outstandingAmount": 3492.65,
     "amountDue": 3492.65,
     "baseGrandTotal": 3492.65,
     "currency": "USD"
     // "baseOutstandingAmount" no existe en el body
   }
   ```
   `3492.65 ≈ 59 × 59.1974` — es decir, `outstandingAmount` trae el `baseGrandTotal`, no el
   `grandTotal` (que es lo que debería valer, ya que nada se ha cobrado aún).

3. Mismo problema en el listado: `GET /invoices?limit=50` — la fila de esta factura trae
   `"grandTotal": 59` pero `"outstandingAmount": 3492.65`.

4. Mismo problema en `GET /caja/pendientes` — misma factura, mismos valores mezclados.

5. **Control (para confirmar que el bug es específico de moneda extranjera)**: una factura del
   mismo tenant en DOP (`ACC-SINV-2026-00004`, `currency: "DOP"`) no tiene el problema —
   `grandTotal: 1000`, `outstandingAmount: 300`, ambos coherentes entre sí y en DOP. El bug **solo
   se manifiesta cuando `currency !== monedaBase`**.

## Qué se necesita investigar

- Encontrar el código que calcula `outstandingAmount`/`amountDue` en el serializador/resolver de
  Invoice (posiblemente compartido entre `GET /invoices/:id`, `GET /invoices` y
  `GET /caja/pendientes` — si es una función común, el fix debería propagarse a los 3 endpoints a
  la vez).
- La hipótesis más probable: en algún punto el código toma `outstanding_amount` nativo de ERPNext
  (que en Sales Invoice normalmente ya está en la moneda del documento) y lo multiplica de nuevo
  por `conversion_rate` — duplicando la conversión que ERPNext ya hizo — o bien está leyendo por
  error el campo `base_outstanding_amount` nativo de ERPNext (que si existe ahí sería el correcto
  para `baseOutstandingAmount`, pero se estaría exponiendo con el nombre equivocado en el DTO de
  salida).
- Agregar el campo `baseOutstandingAmount` que falta (doc 64 §3.1 lo pide explícitamente), en vez
  de solo corregir `outstandingAmount`.
- Revisar si el mismo patrón de bug existe en otros documentos con lógica de saldo pendiente en
  moneda extranjera (Notas de Crédito/Débito, Pedidos con apartado/layaway) — no se probaron en
  esta sesión, pero comparten el mismo mecanismo de resolución de moneda descrito en doc 64 Fase 3.

## Impacto

Cualquier pantalla que muestre o valide contra `outstandingAmount`/`amountDue` de una factura en
moneda extranjera muestra/exige un monto equivocado (el equivalente en DOP en vez del monto real
en la moneda del documento) — confirmado que esto rompe como mínimo:
- El módulo de Caja/POS (`/caja/pendientes`, cobro directo de una factura).
- Cualquier listado de facturas que muestre "pendiente" junto al total.
- Probablemente Cobros (`/cobros`) y reportes de aging/cuentas por cobrar, aunque no se
  verificaron directamente en esta sesión — vale la pena que quien lo arregle revise esos también.

## Nota para quien lo resuelva

No es un problema del frontend. El frontend simplemente muestra/usa el campo `outstandingAmount`
tal como lo devuelve la API, confiando en que está en la moneda del documento (`currency`) como
dice la spec. El fix es enteramente del lado de cómo el backend calcula/serializa ese campo para
documentos en moneda extranjera.
