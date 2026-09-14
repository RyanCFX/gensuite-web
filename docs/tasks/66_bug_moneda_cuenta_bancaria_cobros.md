# Bug de backend — `/cobros` resuelve la moneda de una cuenta bancaria distinta a la real

> Este documento es un prompt autocontenido para el agente/equipo de backend. Describe un bug
> reproducible encontrado al probar en vivo la Fase 4 de
> `docs/tasks/64_multimoneda_completo.md` (multimoneda en Cobros/Pagos) contra el tenant `jbc`.

## Resumen del bug

Al crear un cobro (`POST /cobros`) contra una cuenta bancaria cuya moneda real es `USD`, el
backend rechaza la operación con `400 BANK_ACCOUNT_CURRENCY_MISMATCH` diciendo que la cuenta
**opera en DOP** — pero los endpoints de lectura de esa misma cuenta bancaria (`GET
/cuentas-bancarias` y `GET /cuentas-bancarias/:id`) devuelven consistentemente `currency: "USD"`.

Es decir: **la ruta de escritura de `/cobros` está resolviendo la moneda de la cuenta bancaria
desde una fuente distinta (y desactualizada/incorrecta) a la que usan los endpoints de lectura.**
Según `docs/tasks/64_multimoneda_completo.md` §5.6, la moneda real de una cuenta bancaria SIEMPRE
debe ser la de su cuenta contable (GL) vinculada — nunca un campo espejo separado — así que este
bug apunta a que `assertBankCurrencyCompatible` (o el código equivalente que valida moneda de
banco en Cobros/Pagos/Tesorería, doc 64 §4.3) está leyendo un campo distinto (posiblemente
`custom_moneda` u otro campo espejo del doctype `Bank Account` de ERPNext) en vez de resolver la
moneda real desde la cuenta contable vinculada, que es lo que sí hacen los endpoints de lectura.

## Pasos exactos para reproducir (tenant `jbc`)

1. Existe una cuenta contable (GL) `TEST BANCO USD (borrar) - JBC` con `currency: "USD"`
   (confirmado vía `GET /cuentas`).
2. Se creó una Cuenta Bancaria nueva vía `POST /cuentas-bancarias` con:
   ```json
   {
     "accountName": "Test USD (prueba multimoneda)",
     "bank": "Banco Popular",
     "account": "TEST BANCO USD (borrar) - JBC",
     "currency": "USD",
     "estado": "Activa",
     "chequeFormat": "Estándar",
     "chequesManuales": true
   }
   ```
   Resultado: `id = "Test USD (prueba multimoneda) - Banco Popular"`.
3. Se confirma la moneda real de esa cuenta con dos lecturas, ambas devuelven `USD`:
   - `GET /cuentas-bancarias?estado=Activa` → la fila de esta cuenta trae `"currency":"USD"`.
   - `GET /cuentas-bancarias/Test%20USD%20(prueba%20multimoneda)%20-%20Banco%20Popular` → body
     completo: `{"id":"...","accountName":"Test USD (prueba multimoneda)","bank":"Banco
     Popular","account":"TEST BANCO USD (borrar) - JBC","currency":"USD","estado":"Activa",...}`.
4. Adicionalmente, `GET /cuentas-bancarias/inconsistencias-moneda` devuelve `{"success":true,
   "data":[]}` — es decir, el propio backend confirma que **no hay ninguna inconsistencia
   conocida** entre el campo espejo y la cuenta contable real para esta cuenta.
5. Se crea un cliente con `defaultCurrency: "EUR"` (`Cliente Test E2E`).
6. Se intenta crear un cobro anticipado (sin factura referenciada) para ese cliente, pagando con
   la cuenta bancaria del paso 2, incluyendo `bankConversionRate` (requerido por el caso
   triangular EUR/USD/DOP, ver doc 64 §4.1):
   ```json
   POST /cobros
   {
     "customer": "Cliente Test E2E",
     "postingDate": "2026-09-13",
     "paidAmount": 100,
     "modeOfPayment": "Cheque",
     "bankAccount": "Test USD (prueba multimoneda) - Banco Popular",
     "bankConversionRate": 58
   }
   ```
7. **Resultado actual (bug)**: `400 Bad Request`
   ```json
   {
     "success": false,
     "error": {
       "code": "BANK_ACCOUNT_CURRENCY_MISMATCH",
       "message": "La cuenta bancaria \"Test USD (prueba multimoneda) - Banco Popular\" opera en DOP y el monto es en EUR. Habilite \"Permitir Pago en Moneda Distinta a la Cuenta Bancaria\" en Configuración > Facturación > Multimoneda, o seleccione una cuenta en EUR.",
       "statusCode": 400
     }
   }
   ```
   El mensaje afirma que la cuenta "opera en DOP", lo cual **contradice directamente** lo que el
   mismo backend devuelve en el paso 3 (`currency: "USD"`).

## Qué se necesita investigar

- Encontrar el código que arma el mensaje/valida `BANK_ACCOUNT_CURRENCY_MISMATCH` dentro del flujo
  de `POST /cobros` (posiblemente compartido con `POST /pagos` y `POST /tesoreria/emisiones` /
  `depositos`, según doc 64 §4.3 y §5.0 — si el bug está en una función compartida
  `assertBankCurrencyCompatible`, probablemente afecta a los 4 endpoints por igual, no solo a
  Cobros).
- Confirmar si esa función resuelve la moneda del banco leyendo:
  - (a) el campo `currency`/`custom_moneda` guardado directamente en el doctype `Bank Account` de
    ERPNext en el momento en que se creó (que podría haber quedado en blanco o en `DOP` por
    default si el create no lo seteó correctamente pese a que el BFF sí lo persistió bien para
    lectura), o
  - (b) la cuenta contable vinculada (`account`) resuelta de nuevo en tiempo de escritura, con
    algún bug de caché/orden de campos.
- Si la causa es (a): revisar el código de `createCuentaBancaria`/`updateCuentaBancaria` — quizás
  el campo que persiste la moneda real en ERPNext (mencionado en el doc como fuente de verdad
  para lectura) es distinto al campo que lee `assertBankCurrencyCompatible`, y por eso
  `inconsistencias-moneda` no lo detecta (compara los campos incorrectos entre sí, o compara
  contra la cuenta contable en vez de contra el campo que realmente usa la validación de cobros).
- Reproducir exactamente los pasos de arriba contra el tenant `jbc` (o recrear el escenario en
  cualquier tenant: cuenta contable en USD + cuenta bancaria vinculada a ella + intento de cobro)
  y comparar qué valor de moneda ve cada código path con logging/debugger.

## Impacto

Cualquier tenant que cree una cuenta bancaria en moneda distinta a la base y luego intente
cobrar/pagar/hacer una emisión de tesorería contra ella va a recibir un `400
BANK_ACCOUNT_CURRENCY_MISMATCH` falso, aun cuando la configuración es correcta y el frontend ya
valida y envía todo correctamente (confirmado: el payload de la request en el paso 6 es correcto
y completo). Esto bloquea por completo el uso de cuentas bancarias no-DOP en estos 3 flujos.

## Nota para quien lo resuelva

No es un problema del frontend — el frontend (`gensuite-web`) ya:
1. Deriva y bloquea la moneda de la cuenta bancaria desde su cuenta contable al crearla/editarla
   (no permite mandar una moneda inventada).
2. Detecta el caso de monedas distintas (documento/banco/base) y exige la tasa de conversión al
   banco antes de dejar enviar el formulario.

El payload que llega a `/cobros` es correcto; el bug está enteramente del lado de cómo ese
endpoint resuelve la moneda de la cuenta bancaria al validar.
