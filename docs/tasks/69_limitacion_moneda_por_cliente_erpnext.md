# Limitación real — un cliente con historial/saldo en DOP no puede facturarse en USD/EUR

> Este documento es un prompt autocontenido para el agente/equipo de backend. Describe una
> restricción encontrada al probar en vivo la Fase 2/3 de `docs/tasks/64_multimoneda_completo.md`
> (clientes con `defaultCurrency` + facturación en moneda extranjera), justo después de validar el
> fix de `docs/tasks/68_bug_outstanding_amount_moneda_incorrecta.md`. A diferencia de los bugs 66 y
> 68 (donde el backend calculaba algo mal), **esto podría no ser un bug de código sino una
> restricción nativa de ERPNext que el diseño de la Fase 2 del doc 64 no contempló** — se necesita
> investigación, no un fix directo.

## Resumen

Un cliente que ya tiene facturas en DOP (la moneda base) con saldo pendiente **no puede ser
facturado en una moneda extranjera** — el intento falla al someter la factura con un error nativo
de ERPNext:

```
"Customer <nombre> tiene asientos contables en la moneda DOP de la empresa <compañía>.
Seleccione una cuenta por cobrar o por pagar con la moneda DOP."
```

Esto contradice la expectativa implícita de doc 64 Fase 2: que basta con habilitar la moneda
(`PATCH /monedas/:code`) y setear `Customer.defaultCurrency` para que ese cliente pueda facturarse
en la nueva moneda sin más — en la práctica, **cualquier cliente con historial previo en DOP**
(que en un negocio real es la enorme mayoría de la cartera de clientes) choca con esto la primera
vez que se le intenta facturar en otra moneda.

## Pasos exactos para reproducir (tenant `far`)

Cliente `Paciente Credito Test`, con facturas DOP existentes y saldo pendiente:
- `ACC-SINV-2026-00004` — DOP, `outstandingAmount: 300` (sin cobrar)
- `ACC-SINV-2026-00017` — DOP, `outstandingAmount: 200` (sin cobrar)
- (además varias en DOP ya saldadas en `0`)

Este cliente tiene `defaultCurrency: null` / `cuentaCxcDefault: null` en el momento de la prueba
(es decir, el problema **no depende** de haber seteado `defaultCurrency` ni de que
`cuentaCxcDefault` esté autopoblado — se probó explícitamente sin ninguno de los dos, mandando
`currency` directo en el body de la factura, para descartar esa variable):

```
POST /invoices
{
  "customer": "Paciente Credito Test",
  "postingDate": "2026-09-14",
  "branch": "Test",
  "currency": "USD",
  "ncfType": "B02",
  "items": [{ "itemCode": "SERV-COBERTURA-ARS-LOTE", "qty": 1, "rate": 5 }]
}
→ 201 (se crea el draft sin problema, id ACC-SINV-2026-00042)

POST /invoices/ACC-SINV-2026-00042/submit
→ 400 Bad Request
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Advertencia: La factura no tiene NCF asignado. Verifique la configuración de dgii-compliance.. Customer Paciente Credito Test tiene asientos contables en la moneda DOP de la empresa Farmacia. Seleccione una cuenta por cobrar o por pagar con la moneda DOP.",
    "statusCode": 400
  }
}
```

**Control (confirma que es específico de clientes con historial)**: un cliente creado desde cero
en la sesión de prueba (`Cliente USD Fix Verify`, sin ninguna factura previa) pudo facturarse en
USD sin ningún problema, con `outstandingAmount`/`baseOutstandingAmount` correctos de punta a
punta.

## Lo que NO se pudo confirmar en esta sesión — variable pendiente de aislar

**No se probó si esto se resuelve saldando a cero el balance en DOP del cliente**, es decir: si
`Paciente Credito Test` pagara por completo sus RD$300 y RD$200 pendientes (dejando
`outstandingAmount: 0` en ambas facturas DOP), ¿podría entonces facturarse en USD? No se forzó
esa prueba porque implicaba modificar saldos reales de un cliente existente sin que se pidiera
explícitamente. **Esta es la pregunta más importante a responder**, porque cambia radicalmente el
impacto:
- Si el bloqueo es solo mientras el cliente tenga saldo *abierto* en DOP → es una restricción
  razonable y muy acotada (se resuelve solo cuando el cliente se pone al día).
- Si el bloqueo es permanente una vez que *existió* cualquier movimiento en DOP, sin importar si
  ya está saldado → es un problema estructural serio: casi ningún cliente real podría empezar a
  usar multimoneda nunca, salvo clientes 100% nuevos.

## Qué se necesita investigar

1. **Confirmar el mecanismo exacto de ERPNext** detrás de este mensaje (`get_party_account` /
   `set_party_account_currency` o equivalente en la versión de ERPNext que usa este proyecto) —
   ¿la restricción mira solo GL Entries con `is_cancelled=0` y saldo abierto, o cualquier GL Entry
   histórica del party sin importar si ya se conciliaron/saldaron?
2. Si es la segunda (permanente), investigar si ERPNext ofrece alguna vía soportada para que un
   mismo cliente opere en más de una moneda a lo largo del tiempo (ej.: ¿la tabla hija "Accounts"
   del doctype Customer permite registrar una cuenta por (compañía, moneda) y que ERPNext elija la
   correcta según la moneda de cada transacción, en vez de exigir una sola cuenta/moneda fija por
   cliente?). Si existe, el gap sería que el código de este proyecto no está usando ese mecanismo
   correctamente al crear/asignar `cuentaCxcDefault`.
3. Si NO existe una vía soportada por ERPNext y la restricción es inherente a la plataforma,
   **esto necesita subirse como una decisión de producto**, no solo un fix de código — el doc 64
   debería actualizarse para documentar esta limitación explícitamente (ej.: "un cliente solo
   puede facturarse en una moneda distinta a la base si nunca tuvo movimientos en la moneda base",
   o la regla que se determine), y el frontend necesitaría mostrar una advertencia clara en el
   formulario de cliente/factura en vez de dejar que el usuario se entere con un error críptico de
   ERPNext al someter.
4. Aunque no es el foco de este documento: el mensaje de error mezcla dos problemas en un mismo
   string (`"...no tiene NCF asignado... Customer ... tiene asientos contables en la moneda
   DOP..."`) — parecen ser dos validaciones distintas concatenadas en un solo mensaje de error.
   Vale la pena separarlas para que cada una se pueda manejar/mostrar independientemente en el
   frontend (hoy el frontend no tiene ningún manejo específico para ninguna de las dos).

## Impacto si se confirma que es permanente

Sería el hallazgo más importante de toda la ronda de pruebas de multimoneda: la Fase 2 de doc 64
(clientes con `defaultCurrency`) sería inutilizable en la práctica para la base de clientes
existente de cualquier tenant que ya operaba antes de esta feature — solo funcionaría para
clientes creados después de habilitar multimoneda. Esto necesita decidirse y comunicarse antes de
anunciar la feature como lista.

## Nota para quien lo investigue

No se modificó nada del cliente `Paciente Credito Test` de forma permanente (se revirtió cualquier
cambio de prueba). La factura `ACC-SINV-2026-00042` quedó en estado `draft` (el submit falló, así
que nunca se sometió) — no tiene NCF ni impacto contable, se puede ignorar o limpiar sin problema.
