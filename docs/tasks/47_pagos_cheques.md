# Prompt para agente de frontend — Pagos (CxP): registrar y pagar/imprimir con cheque

> Prompt autocontenido. Contexto de negocio y UX — shapes exactos en `openapi.json`, tag
> **"Cuentas por Pagar"**. API base `https://gensapi.ryancfx.click/api/v1`.
>
> Requiere haber leído [45_cuentas_bancarias_numeracion_cheques.md](45_cuentas_bancarias_numeracion_cheques.md)
> y [46_tesoreria_modulo_cheques.md](46_tesoreria_modulo_cheques.md) primero — este prompt conecta
> el módulo existente de Pagos con esos dos.

## Qué cambió

El módulo de Pagos (`/pagos`) ya existía y ya tenía un campo `referenceNo` de texto libre (número
de cheque, transferencia, lo que sea). Ahora se puede marcar explícitamente un pago como cheque
para que participe de la numeración por cuenta bancaria (manual o automática, ver prompt 45) y
quede en el historial de Cheques (prompt 46) — antes un pago con cheque no dejaba ningún rastro
fuera de ese campo de texto libre.

## Campo nuevo: `esCheque` (booleano, opcional, default `false`)

En `POST /pagos`:

- **`esCheque: false`** (o ausente) — comportamiento idéntico al de siempre. `referenceNo` sigue
  siendo texto libre sin validar (transferencia, depósito, lo que el usuario quiera anotar).
- **`esCheque: true`** — activa la numeración por cuenta bancaria:
  - Requiere `bankAccount` en el mismo request (400 si falta — un cheque necesita saber de qué
    cuenta/talonario sale).
  - Si la cuenta está en modo **manual**: `referenceNo` es el número de cheque, **requerido**.
  - Si la cuenta está en modo **automático**: **no envíes `referenceNo`** — el backend lo asigna
    solo (400 si se envía). La respuesta trae el número asignado en `referenceNo`.
  - El pago queda registrado en `GET /tesoreria/cheques` automáticamente.

### UX sugerida en el formulario de Crear Pago

1. Agrega un checkbox/toggle "Pagar con cheque" (`esCheque`).
2. Al activarlo:
   - Muestra (u obliga a elegir, si no estaba ya) el selector de `bankAccount`.
   - Llama `GET /tesoreria/cheques/siguiente?cuentaBancaria=X` (mismo endpoint del prompt 46) en
     cuanto se elige la cuenta bancaria, para saber el modo:
     - Manual → muestra el campo "Número de cheque" prellenado con `siguienteSugerido`, editable,
       mapeado a `referenceNo`.
     - Automático → **oculta u ocupa de solo-lectura** el campo de número de cheque (muestra
       `siguienteSugerido` como texto informativo "Se asignará el nº {X} al guardar"), y **no
       envíes `referenceNo`** en el `POST`.
3. Al desactivar "Pagar con cheque", vuelve al comportamiento anterior (campo `referenceNo` libre,
   sin `bankAccount` obligatorio salvo que el método de pago ya lo requiriera por otra razón — ver
   comportamiento existente de `bankAccount` en este mismo DTO).

## Imprimir el cheque de un pago

```
GET /pagos/:id/imprimir → PDF
```

Nuevo endpoint, mismo mecanismo de impresión que describe el prompt 46 (plantilla nativa si la
cuenta bancaria la tiene configurada, si no comprobante genérico) — con la misma salvedad de
posible fallo de infraestructura documentada en
[41_tesoreria_impresion_cheques.md](41_tesoreria_impresion_cheques.md). Solo tiene sentido
mostrarlo/habilitarlo si el pago se creó con `esCheque: true` y ya está `submitted` — igual
criterio que ya usan Emisiones (no se imprime un borrador ni un pago cancelado).

## Cancelar un pago con cheque

`POST /pagos/:id/cancel` sigue funcionando igual del lado del formulario (mismo botón, misma
confirmación) — pero ahora, si el pago era un cheque, la cancelación también lo marca `Anulado` en
`GET /tesoreria/cheques` automáticamente. No hace falta que el frontend llame dos endpoints ni haga
nada extra — es un efecto secundario del lado del backend. Si quieres que el usuario vea
explícitamente ese enlace, puedes navegar al detalle del cheque en Tesorería > Cheques después de
cancelar un pago que tenía `esCheque: true`, pero no es obligatorio para esta entrega.

## Nada más cambió en Pagos

El resto del módulo (facturas pendientes, aging, saldo a favor, aplicar saldo a favor, liquidación
de múltiples facturas) no tuvo cambios de contrato en esta sesión — si ya está implementado, no
tocar.
