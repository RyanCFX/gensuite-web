# Prompt para agente de frontend — Tesorería: módulo de Cheques (historial, anulación, impresión)

> Prompt autocontenido. Contexto de negocio y UX — shapes exactos en `openapi.json`, tag
> **"Tesorería — Cheques"**. API base `https://gensapi.ryancfx.click/api/v1`.
>
> Requiere haber leído primero:
> - [45_cuentas_bancarias_numeracion_cheques.md](45_cuentas_bancarias_numeracion_cheques.md) — el
>   concepto de numeración manual/automática por cuenta bancaria.
> - [37_tesoreria_emisiones.md](37_tesoreria_emisiones.md) — cómo se crea un cheque desde
>   Tesorería (sigue funcionando igual; este prompt agrega el módulo de **historial** sobre esos
>   cheques, no cambia cómo se crean).

## Qué es y por qué existe

Hasta ahora, un cheque emitido era solo un campo (`referencias.numeroCheque`) dentro de una
Emisión o un Pago — no había ningún lugar para ver **todos** los cheques emitidos de una cuenta
bancaria, saber si ya se imprimieron, o anular uno sin afectar el resto del documento. Este módulo
nuevo es exactamente eso: un registro de primera clase de cada número de cheque emitido, con su
propio ciclo de vida.

**Solo cubre cheques emitidos por el negocio a un tercero (CxP)** — nunca cheques recibidos de un
cliente (eso es Cobros/CxC, un flujo completamente distinto). Un cheque de este módulo siempre
viene de uno de estos dos orígenes:
- `POST /tesoreria/emisiones` (con `tipoDocumento` de naturaleza Cheque) — ver prompt 37.
- `POST /pagos` con `esCheque: true` — ver [47_pagos_cheques.md](47_pagos_cheques.md).

## Estados de un cheque

```
Reservado → Emitido → Cobrado
                ↓
             Anulado
```

- **Reservado**: el número ya está tomado (el documento que lo usa sigue en Draft/borrador).
- **Emitido**: el documento (Payment Entry o Journal Entry) ya fue sometido — el cheque salió de
  verdad.
- **Cobrado**: el banco ya compensó el cheque (se sincroniza automáticamente si en ERPNext se
  registra la fecha de compensación vía Conciliación Bancaria — el frontend no necesita hacer nada
  para que esto pase, solo mostrarlo).
- **Anulado**: el cheque se anuló explícitamente (ver más abajo). **Un cheque anulado nunca
  desaparece del historial ni libera su número** — el número queda quemado para siempre, no se
  puede reutilizar ni en esa ni en ninguna otra numeración (aplica solo dentro de la misma cuenta
  bancaria; otra cuenta puede tener ese mismo número libre, ver 45).

## Endpoints

```
GET    /tesoreria/cheques                       Historial (paginado)
GET    /tesoreria/cheques/siguiente?cuentaBancaria=X   Siguiente número (mismo que en emisiones)
GET    /tesoreria/cheques/:id                   Detalle + documento + facturas donde se usó
POST   /tesoreria/cheques/:id/anular            Anula el cheque
GET    /tesoreria/cheques/:id/imprimir          PDF del cheque
```

### Listado — filtros disponibles

`cuentaBancaria`, `estado` (`Reservado|Emitido|Anulado|Cobrado`), `chequeNo` (búsqueda parcial),
`fromDate`/`toDate` (rango de fecha del cheque), `beneficiario` (id del proveedor/tercero),
`impreso` (booleano). Todos opcionales, combinables, paginación estándar (`limit`/`offset`).

### UX sugerida para el listado

Una tabla con columnas: número de cheque, cuenta bancaria, estado (badge de color por estado),
beneficiario, monto, fecha, si se imprimió (ícono/badge), y un link al documento origen
(`documentoOrigen.doctype` + `documentoOrigen.name` — puede abrir el detalle de la Emisión o del
Pago según corresponda, si esas pantallas existen). Filtros arriba de la tabla para cada campo
listado.

### Detalle (`GET /:id`)

Además de los datos del cheque, trae `facturas: [{ invoiceId, allocatedAmount }]` — las facturas de
compra a las que se aplicó este pago (vacío si el cheque viene de un Journal Entry sin
beneficiario, ej. una comisión bancaria). Usa esto para el requisito de "desde un cheque llegar al
documento donde se utilizó" — cada `invoiceId` es navegable al detalle de esa factura de compra si
el módulo correspondiente existe.

### Anular (`POST /:id/anular`)

Body opcional: `{ "motivo": "texto libre" }`.

- Si el documento asociado (Payment Entry/Journal Entry) ya está sometido, el backend lo cancela
  automáticamente — esto revierte los asientos contables y, si el cheque liquidaba una factura de
  compra, **esa factura vuelve a quedar pendiente de pago** (comportamiento nativo de ERPNext, no
  hay nada que el frontend deba hacer aparte). Avisa esto al usuario antes de confirmar la
  anulación — es una acción con efecto contable real, no un simple cambio de estado.
- Puede fallar con 409 si el documento tiene dependientes que impiden cancelarlo (ej. un
  Journal Entry ya reconciliado contra algo más) — mostrar el mensaje del backend tal cual, indica
  qué revisar.
- Después de anular, el cheque sigue apareciendo en el historial (estado `Anulado`) y sigue ligado
  a la(s) factura(s) que tenía — no lo ocultes ni lo borres de ninguna vista.
- Deshabilita/oculta el botón "Anular" si el cheque ya está en estado `Anulado`.

### Imprimir (`GET /:id/imprimir`)

Igual mecanismo que ya describe [41_tesoreria_impresion_cheques.md](41_tesoreria_impresion_cheques.md)
(plantilla nativa si la cuenta bancaria la tiene configurada, si no un comprobante genérico) —
aplica **la misma salvedad de esa impresión nativa documentada ahí** (puede fallar por un problema
de infraestructura de ERPNext no relacionado con el frontend; maneja el error igual que se describe
en ese prompt). Cada impresión exitosa incrementa un contador interno (`vecesImpreso` en la
respuesta del detalle) — útil para mostrar "impreso 2 veces" en la UI si se quiere alertar de una
reimpresión.

### Siguiente número (`GET /siguiente?cuentaBancaria=X`)

Mismo endpoint conceptual que `GET /tesoreria/emisiones/siguiente-cheque` (ver prompt 37) —
expuesto también acá para que sea descubrible desde la pantalla de Cheques. Devuelve:

```json
{ "chequesManuales": true, "ultimoCheque": "00006", "siguienteSugerido": "00007" }
```

- Si `chequesManuales` es `true`: `siguienteSugerido` es solo una sugerencia editable — el usuario
  puede escribir cualquier otro número en el formulario de creación (de la Emisión o del Pago).
- Si `chequesManuales` es `false`: `siguienteSugerido` es el número que efectivamente se va a
  asignar — no muestres un campo editable para el número de cheque en ese caso, muéstralo de solo
  lectura (ver prompt 47 para el caso de Pagos).

## Dónde ubicar esta pantalla

Como una sección nueva dentro de Tesorería (junto a Emisiones, Depósitos, Transferencias — ver
[34_indice_tesoreria_y_cambios_sesion.md](34_indice_tesoreria_y_cambios_sesion.md)), con nombre
"Cheques" o "Historial de Cheques". No reemplaza ninguna pantalla existente.
