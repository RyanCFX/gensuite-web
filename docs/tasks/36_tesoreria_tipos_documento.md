# Prompt para agente de frontend — Tesorería: Tipos de Documento Bancario

> Prompt autocontenido. Contexto de negocio y qué construir — shapes exactos en `openapi.json`,
> tag **"Tesoreria - Tipos Documento"**. API base `https://gensapi.ryancfx.click/api/v1`.

## Qué es esto

Un catálogo configurable (`Bank Document Type`) de los tipos de documento que puede usar Tesorería
al registrar egresos/ingresos/traspasos: Cheque, Depósito, Transferencia, Transferencia interna,
Ajuste bancario, Nota de débito, Nota de crédito, Otro. Es análogo a un catálogo de "formas de
pago" pero específico de tesorería.

Este catálogo **se pre-siembra con 8 registros por defecto** al instalar la app en un tenant
(CHQ, TRF, DEP, TRI, CBA, AJB, CPR, LTC), pero el usuario puede crear más, editar los existentes,
o desactivarlos. **No asumir que la lista es fija** — siempre poblar selectores vía API.

## Endpoints

```
GET    /tesoreria/tipos-documento              lista (paginado, filtros: enabled, nature, transactionType, search)
GET    /tesoreria/tipos-documento/:id
POST   /tesoreria/tipos-documento
PUT    /tesoreria/tipos-documento/:id
DELETE /tesoreria/tipos-documento/:id
```

## Campos del recurso (camelCase, ver openapi.json para tipos exactos)

- `codigo` (string, único, autonormalizado a mayúsculas por el backend) — identificador corto,
  ej. "CHQ".
- `descripcion` (string) — ej. "Cheque".
- `naturaleza` (select): `Cheque | Depósito | Transferencia | Transferencia interna | Ajuste bancario | Nota de débito | Nota de crédito | Otro`.
- `tipoTransaccion` (select): `Débito | Crédito`.
  - **Regla de coherencia validada por el backend** (no la reimplementes en frontend como
    validación bloqueante, pero sí puedes usarla para UX predictiva/autocompletar): naturaleza
    "Cheque" implica tipoTransaccion "Crédito"; naturaleza "Depósito" implica "Débito". Si el
    usuario elige una combinación incoherente, el backend devuelve 400 con mensaje explicativo —
    mostrar ese mensaje tal cual.
- `cuentaContrapartidaDefault` (string, opcional) — nombre de una cuenta contable de ERPNext
  (Account) que se usará como sugerencia de contrapartida al registrar un documento de este tipo.
  **Deliberadamente viene vacío en los 8 tipos pre-sembrados** — es responsabilidad de cada tenant
  configurarla según su plan de cuentas real. Poblar el selector de cuentas con el endpoint de
  catálogo de cuentas que el frontend ya usa en otros módulos contables (Gastos/Compras) — no hay
  un endpoint nuevo para esto, es el mismo Chart of Accounts.
- `requiereBeneficiario` (boolean) — si true, al usar este tipo de documento en una Emisión, el
  campo beneficiario pasa a ser obligatorio en el formulario (ver prompt 37).
- `habilitado` (boolean) — si false, no debe aparecer como opción seleccionable en los selectores
  de Emisiones/Depósitos/Transferencias (pero sí debe seguir siendo visible/editable en este CRUD,
  y los documentos históricos que ya lo usan siguen mostrando su nombre normalmente).
- `requiereNcf` (boolean) — si true, exige NCF de terceros al usarlo (ver prompt 37/38 sobre
  campos fiscales).
- `prefijoNcf` (string, opcional) — solo relevante/validado si `requiereNcf` es true.
- `requiereClaseFiscal` (boolean).
- `requiereRnc` (boolean).
- `comentario` (string, opcional) — nota libre para el administrador.

## UX sugerida

- Pantalla de catálogo simple: tabla con código, descripción, naturaleza, tipo de transacción,
  habilitado (toggle inline si el patrón del proyecto lo permite), y acciones editar/eliminar.
- Formulario de crear/editar con los campos de arriba. Mostrar `prefijoNcf` solo si `requiereNcf`
  está marcado (mismo patrón condicional que probablemente ya existe para NCF en otros módulos
  fiscales del proyecto — revisar cómo se hizo en Facturación/Compras para mantener consistencia).
- **Eliminar (`DELETE`) debe manejar el 409/400 de "está siendo usado"**: el backend bloquea el
  borrado si el tipo de documento está referenciado por algún Payment Entry o Journal Entry
  existente. Mostrar el mensaje de error del backend; ofrecer "deshabilitar" (`habilitado: false`)
  como alternativa cuando el borrado falla por esta razón.
- Este catálogo es prerequisito de los formularios de Emisiones/Depósitos/Transferencias — no hace
  falta una UI vistosa, pero sí debe existir y funcionar antes de esos otros módulos.
