# Falta `currency` en `GET /caja/por-cobrar` — necesario para terminar el fix de Caja/POS

> Este documento es un prompt autocontenido para el agente/equipo de backend. Es continuación
> directa de `docs/tasks/70_caja_pos_sin_soporte_multimoneda.md` (ya resuelto e implementado en
> frontend para `GET /caja/pendientes` + `POST /caja/:id/cobrar`) — pide el mismo campo para un
> endpoint hermano que quedó afuera.

## Resumen

`GET /caja/pendientes` (usado por `CajaPage.tsx`) ya devuelve `currency` por factura, confirmado
en doc 70. Pero hay un **segundo** endpoint que alimenta un flujo de cobro POS equivalente —
`GET /caja/por-cobrar` (usado por `PorCobrarPage.tsx`, tipo `PendienteCobroItem`) — y **no**
devuelve `currency` en absoluto. Verificado en vivo contra el tenant `far`:

```
GET /caja/por-cobrar?limit=5
→ {
    "success": true,
    "data": [
      {
        "id": "ACC-SINV-2026-00040",
        "customer": "Cliente USD Fix Verify",
        "customerName": "Cliente USD Fix Verify",
        "grandTotal": 11.8,
        "roundedTotal": 11.8,
        "postingDate": "2026-09-14",
        "aseguradora": null,
        "montoACobrar": 11.8
        // sin "currency" en ningún lado
      },
      ...
    ]
  }
```

Esa factura (`ACC-SINV-2026-00040`) sí está en USD (confirmado por separado vía
`GET /invoices/ACC-SINV-2026-00040`) — el endpoint de por-cobrar simplemente no lo expone.

## Qué se necesita

Agregar `currency: string` a cada ítem de `GET /caja/por-cobrar`, con el mismo significado que ya
tiene en `GET /caja/pendientes` / `GET /invoices` (doc 64 §3.1): la moneda del documento, en la
que ya vienen `grandTotal`, `roundedTotal` y `montoACobrar` de este mismo endpoint.

Si aplica el mismo patrón de "cobertura ARS siempre en DOP" que ya existe en este endpoint
(campo `aseguradora.montoCobertura`, vertical farmacia), ese campo se mantiene sin cambios —
`currency` describe la moneda de la factura completa (`grandTotal`/`montoACobrar`), no la de la
cobertura de la aseguradora, que ya es un caso aparte documentado en doc 64 §4.3/§3.5 del doc de
farmacia.

## Por qué hace falta

`PorCobrarPage.tsx` es el otro flujo de "completar un cobro POS" (`POST
/caja/facturas/:id/completar-cobro`, mismo `CobrarFacturaDto`, misma regla de "sin conversión,
misma moneda" que ya se implementó para `CajaPage.tsx` en doc 70) — pero sin `currency` en la
respuesta de este endpoint, el frontend no puede:
- Mostrar los montos con el símbolo de moneda correcto (`formatMoney` en vez de `formatDOP`).
- Filtrar los métodos de pago ofrecidos al cajero a solo los que operan en la moneda de esa
  factura (la misma validación de `POS_PAYMENT_CURRENCY_MISMATCH` de doc 70 aplica aquí también,
  del lado del backend, ya que comparte el mismo mecanismo de cobro).

Sin el campo, cualquier intento de arreglar `PorCobrarPage.tsx` sería adivinar (asumir DOP
siempre), lo cual reproduciría exactamente el bug original que motivó el doc 70.

## Qué necesita el frontend una vez esté el campo

Aplicar en `src/features/caja/PorCobrarPage.tsx` el mismo tratamiento que ya se hizo en
`CajaPage.tsx` (doc 70): reemplazar los usos de `formatDOP` por `formatMoney(monto,
item.currency)`, y pasar `currency={selectedInvoice.currency}` al `PaymentLinesEditor` compartido
(que ya soporta ese prop — no necesita más cambios de su lado). El mismo tratamiento probablemente
aplica también a `src/features/invoicing/InvoiceDetail.tsx`, que usa el mismo componente para
completar un cobro POS directo desde el detalle de una factura — confirmar si esa pantalla ya
tiene acceso a `invoice.currency` (debería, viene de `GET /invoices/:id`) o si necesita algo
adicional del backend.

## Nota para quien lo resuelva

No es un bug — es el mismo campo que ya se agregó a `/caja/pendientes` en doc 70, simplemente
faltó agregarlo también en este endpoint hermano. Debería ser un cambio pequeño y simétrico al ya
hecho ahí.
