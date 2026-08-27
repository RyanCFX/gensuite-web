# Prompt para agente de frontend — Cuentas Bancarias: tipo de cuenta y plantilla de cheque

> Prompt autocontenido. Da contexto de negocio y qué construir en la UI del módulo de Cuentas
> Bancarias existente — **no** el shape exacto de cada endpoint, eso está en `openapi.json` (tag
> **"Cuentas Bancarias"**). API base `https://gensapi.ryancfx.click/api/v1`.

## Qué cambió

El endpoint `GET/POST/PUT /cuentas-bancarias` ya existía. Se le agregaron dos campos nuevos y un
endpoint de catálogo nuevo.

### 1. Campo `tipoCuenta` (string, opcional)

Clasifica la cuenta bancaria (ej. "Cuenta Corriente", "Cuenta de Ahorros", "Tarjeta de Crédito" —
**las opciones reales no están hardcodeadas, ver abajo**). Se agrega a:

- `POST /cuentas-bancarias` — body opcional `tipoCuenta`.
- `PUT /cuentas-bancarias/:id` — body opcional `tipoCuenta`.
- `GET /cuentas-bancarias` y `GET /cuentas-bancarias/:id` — aparece en la respuesta.
- `GET /cuentas-bancarias?tipoCuenta=X` — nuevo filtro de listado.

**Endpoint de catálogo nuevo — usar SIEMPRE este endpoint para poblar el `<select>`, nunca
hardcodear la lista de opciones en el frontend:**

```
GET /cuentas-bancarias/tipos
```

Responde `{ success: true, data: string[] }` con las opciones vigentes, leídas en vivo del
catálogo nativo de ERPNext (`Bank Account Type`). La razón de no hardcodear: un administrador
puede agregar/renombrar tipos desde ERPNext directamente y el frontend debe reflejarlo sin
necesitar un deploy.

### 2. Campo `chequePrintTemplate` (string, opcional)

Nombre de una plantilla de impresión de cheque (doctype nativo `Cheque Print Template` de
ERPNext) vinculada a esta cuenta bancaria. Se usa cuando la cuenta emite cheques físicos y se
quiere que el PDF de impresión use el formato nativo de ERPNext (coordenadas exactas sobre el
papel pre-impreso del banco) en vez del comprobante genérico del BFF.

- `POST/PUT /cuentas-bancarias` — body opcional `chequePrintTemplate` (string = nombre/id de la
  plantilla).
- Aparece en la respuesta de `GET`.
- **El CRUD completo de plantillas (crear/editar coordenadas) es un módulo aparte** — ver
  [41_tesoreria_impresion_cheques.md](41_tesoreria_impresion_cheques.md). Acá en el formulario de
  Cuenta Bancaria solo se necesita un selector para **elegir** una plantilla ya creada (o dejarlo
  vacío). Poblar ese selector con `GET /tesoreria/cheque-print-templates` (ver prompt 41).
- Este campo es opcional y puede quedar vacío indefinidamente — una cuenta bancaria sin plantilla
  simplemente usa el comprobante PDF genérico del BFF al imprimir (ver prompt 41 para el detalle
  completo de esa lógica de fallback).

## Cambios de UI sugeridos

- En el formulario de crear/editar Cuenta Bancaria, agregar:
  - Un `<select>` "Tipo de cuenta" poblado desde `GET /cuentas-bancarias/tipos`, opcional.
  - Un `<select>` "Plantilla de impresión de cheque" poblado desde
    `GET /tesoreria/cheque-print-templates`, opcional, mostrar solo si la cuenta tiene sentido que
    emita cheques (criterio de UX libre — puede mostrarse siempre y dejar que el usuario decida).
- En la lista/tabla de Cuentas Bancarias, agregar `tipoCuenta` como columna/badge opcional y un
  filtro por tipo de cuenta (dropdown poblado igual que el formulario).
- El campo `chequePrintTemplate` no necesita mostrarse en la tabla de listado — es un detalle de
  configuración, no un dato operativo del día a día.

## Nada más cambió en este módulo

El resto de Cuentas Bancarias (balance, `ultimoCheque`, `ultimoDeposito`, estado, moneda, etc.) no
tuvo cambios de contrato en esta sesión — si ya está implementado en el frontend, no tocar.
