# Prompt para agente de frontend — Tesorería: Transferencias Internas

> Prompt autocontenido. Contexto de negocio y UX — shapes exactos en `openapi.json`, tag
> **"Tesorería — Transferencias Internas"**. API base `https://gensapi.ryancfx.click/api/v1`.

## Qué es

Mover dinero entre dos cuentas bancarias **propias** de la empresa (ej. "traspasar RD$50,000 de la
cuenta Popular a la cuenta BHD"). A diferencia de Emisiones/Depósitos, este submódulo **no tiene
concepto de beneficiario/origen externo** — siempre son dos cuentas bancarias de la misma empresa,
así que **siempre se registra como Journal Entry** (nunca Payment Entry) del lado del backend. El
frontend no necesita ninguna lógica condicional de "con/sin party" acá — es la única diferencia
importante respecto a los otros dos submódulos.

## Campos del formulario

- `fecha` (requerido).
- `tipoDocumento` (opcional, código del catálogo — normalmente "TRI"). A diferencia de
  Emisiones/Depósitos, acá es opcional porque nunca hay ambigüedad de contrapartida — solo sirve
  para categorizar el listado, no cambia el comportamiento contable.
- `cuentaOrigen` (requerido) — cuenta bancaria de la que sale el dinero.
- `cuentaDestino` (requerido) — cuenta bancaria a la que llega. **Validar en el frontend que
  `cuentaOrigen` ≠ `cuentaDestino`** antes de enviar (dar feedback inmediato; confirmar si el
  backend también lo rechaza, pero no depender solo de eso).
- `descripcion` (opcional).
- `monto` (requerido, positivo) — "monto que sale de la cuenta origen".
- `referencias` (opcional) — mismo objeto que en Emisiones (`numeroCheque`, `numeroReferencia`,
  `comprobante`, `ncf`, `claseFiscal`, `rnc`) — en la práctica una transferencia interna rara vez
  necesita los campos fiscales, pero el campo existe por consistencia de contrato; no ocultar el
  formulario entero, solo no forzarlos como obligatorios salvo que el `tipoDocumento` elegido lo
  requiera (mismo criterio condicional que en Emisiones/Depósitos vía los flags `requiereNcf` etc.
  del catálogo).
- `deducciones[]` (opcional) — **comisiones interbancarias**: reducen lo que efectivamente llega a
  la cuenta destino respecto a lo que sale de la cuenta origen. Ejemplo de UX: mostrar en tiempo
  real "Sale de [cuentaOrigen]: $X — Comisión: $Y — Llega a [cuentaDestino]: $X-Y".
- `nota` (opcional).

**No hay `branch`/`department`** en este DTO (a diferencia de Emisiones/Depósitos) — no mostrar
esos campos en este formulario.

**No hay `liquidaciones` ni `distribucion`** — una transferencia interna nunca liquida facturas ni
necesita distribución en N cuentas (las dos cuentas bancarias YA son las dos puntas del asiento).

## Endpoints

```
GET    /tesoreria/transferencias-internas           listar (filtros: cuentaBancaria [solo
                                                     origen — el destino no se puede filtrar en
                                                     v1], fromDate, toDate, estado)
GET    /tesoreria/transferencias-internas/:id       detalle
POST   /tesoreria/transferencias-internas           crear borrador
PUT    /tesoreria/transferencias-internas/:id       editar cabecera de un borrador
                                                     (descripcion, nota, referencias)
POST   /tesoreria/transferencias-internas/:id/submit   someter — genera el asiento contable
POST   /tesoreria/transferencias-internas/:id/cancel   cancelar una transferencia sometida
```

Mismo ciclo de vida borrador→sometido→cancelado que Emisiones (ver
[37_tesoreria_emisiones.md](37_tesoreria_emisiones.md#ciclo-de-vida-del-documento)).

## Shape de respuesta

Mismo `TreasuryTransaction` normalizado que Emisiones/Depósitos (ver prompt 37) —
`documentoOrigen.doctype` siempre será `'Journal Entry'` acá, y `beneficiario`/`beneficiarioNombre`
siempre vendrán vacíos (no aplican a este submódulo). `lineas` traerá exactamente 2-3 filas: la
línea de banco origen (crédito), la línea de banco destino (débito), y opcionalmente la línea de
comisión si hubo `deducciones`.
