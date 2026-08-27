# Prompt para agente de frontend — Tesorería: Emisiones (egresos)

> Prompt autocontenido. Contexto de negocio y UX — shapes exactos en `openapi.json`, tag
> **"Tesorería — Emisiones"**. API base `https://gensapi.ryancfx.click/api/v1`.
> Requiere haber leído [36_tesoreria_tipos_documento.md](36_tesoreria_tipos_documento.md) primero
> (el catálogo de tipos de documento es un prerequisito de este formulario).

## Qué es

El módulo de "salidas de dinero" de tesorería: cheques emitidos, transferencias salientes, pagos a
proveedores, ajustes que reducen el saldo de una cuenta bancaria. Reemplaza la práctica anterior de
crear asientos de diario manuales para estos casos.

## El concepto clave: con beneficiario vs. sin beneficiario

Este es el punto más importante de todo el módulo y determina qué campos mostrar en el formulario.

- **Con beneficiario** (`beneficiario: { tipo: 'Customer'|'Supplier', id }`) — ej. "voy a pagarle a
  este proveedor". El backend crea un **Payment Entry**. Esto habilita:
  - `liquidaciones[]` — asignar el pago a facturas de compra específicas del proveedor (usar
    `GET /tesoreria/emisiones/pendientes/:supplierId` para listar las facturas pendientes de ese
    proveedor y dejar que el usuario marque cuánto asignar a cada una — igual que ya funciona el
    módulo de Pagos existente, mismo cálculo).
  - Lo que no se asigna a ninguna factura queda como **saldo a favor** del proveedor
    (`unallocated_amount` nativo de ERPNext) — no hace falta que `liquidaciones` sume exactamente
    el monto total.
  - `distribucion` **NO es válida** con beneficiario — si el usuario la manda, el backend responde
    400 sugiriendo usar `deducciones` en su lugar. El formulario no debe ofrecer "distribuir en N
    cuentas" cuando hay beneficiario seleccionado.

- **Sin beneficiario** (campo `beneficiario` ausente/vacío) — ej. "una comisión bancaria", "un
  ajuste". El backend crea un **Journal Entry**. Esto habilita:
  - `distribucion[]` — repartir el monto total en N cuentas contables libremente (cada línea:
    `cuenta`, `monto`, `descripcion?`). La suma de `distribucion` debe igualar `monto` exacto —
    validar esto en el frontend antes de enviar para dar feedback inmediato, aunque el backend
    también lo valida.
  - Si no se manda `distribucion` y el tipo de documento elegido tiene una
    `cuentaContrapartidaDefault` configurada (ver prompt 36), el backend la usa automáticamente —
    el formulario puede mostrar esa cuenta como sugerencia/placeholder de solo lectura si está
    disponible, pero sigue siendo necesario tener alguna de las dos.

**Regla de UX**: el formulario debe tener un toggle/checkbox claro "¿Tiene beneficiario?" (o
similar) que cambie qué sección se muestra: liquidaciones de facturas (con beneficiario) vs.
distribución en cuentas (sin beneficiario). No mostrar ambas secciones simultáneamente.

## Campos comunes a ambos caminos

- `fecha` (requerido, date).
- `tipoDocumento` (requerido, código del catálogo — prompt 36). Si el tipo elegido tiene
  `requiereBeneficiario: true`, el campo beneficiario pasa a ser obligatorio en el formulario
  (validar en frontend, el backend también lo valida).
- `cuentaBancaria` (requerido) — poblar desde `GET /cuentas-bancarias`.
- `monto` (requerido, positivo) — "monto total de la transacción, lo que sale del banco".
- `descripcion` (opcional).
- `beneficiarioNombre` (opcional) — nombre libre a imprimir en el cheque si difiere del nombre
  registrado del cliente/proveedor (útil para cheques a terceros, ej. "páguese a la orden de X"
  cuando el beneficiario real en el sistema es otro).
- `referencias` (objeto opcional):
  - `numeroCheque` (string) — mostrar este campo, con el botón/autocompletar de "sugerir
    siguiente" descrito abajo, cuando `tipoDocumento` tiene naturaleza "Cheque".
  - `numeroReferencia` (string) — para transferencias u otros tipos sin número de cheque.
  - `comprobante` (string).
  - `ncf`, `claseFiscal`, `rnc` — mostrar/requerir condicionalmente según los flags
    `requiereNcf`/`requiereClaseFiscal`/`requiereRnc` del tipo de documento seleccionado (prompt
    36). `rnc` se valida contra el dígito verificador DGII del lado del backend — si el frontend ya
    tiene un validador de RNC/cédula reutilizable de otros módulos (Clientes/Proveedores), usarlo
    acá también para dar feedback inmediato.
- `deducciones[]` (opcional, válido con o sin beneficiario) — comisiones/retenciones que reducen lo
  que efectivamente se liquida/contabiliza en la contrapartida principal. Cada línea:
  `cuenta` (requerido), `monto` (requerido, positivo), `descripcion` (opcional).
- `nota` (opcional).
- `branch`, `department` (opcionales) — dimensiones contables; usar los mismos selectores que ya
  existen en otros módulos (Gastos/Compras) para mantener consistencia.

## Sugerencia de número de cheque

```
GET /tesoreria/emisiones/siguiente-cheque?cuentaBancaria=<id>
→ { success: true, data: { ultimoCheque: string|null, siguienteSugerido: string|null } }
```

Llamar este endpoint cuando el usuario selecciona `cuentaBancaria` y el tipo de documento es de
naturaleza "Cheque", y usar `siguienteSugerido` como valor prellenado (editable) del campo
`referencias.numeroCheque`. **Es solo una sugerencia, no una reserva** — el backend valida
unicidad real al crear el documento; si el usuario cambia el número a uno ya usado, el `POST`
fallará con un mensaje claro que debe mostrarse tal cual.

## Ciclo de vida del documento

```
POST   /tesoreria/emisiones              crear borrador (docstatus=0, editable)
GET    /tesoreria/emisiones              listar (filtros: cuentaBancaria, tipoDocumento,
                                          beneficiario, fromDate, toDate, estado)
GET    /tesoreria/emisiones/:id          detalle
PUT    /tesoreria/emisiones/:id          editar SOLO cabecera de un borrador (ver abajo)
POST   /tesoreria/emisiones/:id/submit   someter → genera el asiento contable real
POST   /tesoreria/emisiones/:id/cancel   cancelar un documento sometido
GET    /tesoreria/emisiones/:id/imprimir PDF del comprobante (ver prompt 41)
```

- Un documento nace en **borrador** (`estado: 'draft'`) y no genera ningún efecto contable hasta
  que se llama `POST /:id/submit`.
- **`PUT /:id` solo permite editar campos de cabecera de un borrador**: `descripcion`, `nota`,
  `referencias`, `branch`, `department`. **No permite cambiar monto, beneficiario, deducciones,
  distribución o liquidaciones** — si el usuario necesita corregir esos campos, la única vía en v1
  es descartar el borrador (no hay endpoint de "delete" explícito documentado acá — verificar en
  openapi.json si existe un DELETE genérico; si no, guiar al usuario a simplemente no someterlo, o
  a cancelarlo si ya fue sometido) y crear uno nuevo. **El formulario de edición de un borrador
  debe mostrar SOLO los campos de cabecera editables, no reabrir todo el formulario de creación.**
- Un documento **sometido es inmutable** — para "corregirlo" el flujo es cancelar
  (`POST /:id/cancel`) y crear un documento nuevo. `cancel` puede fallar con 409 si hay documentos
  dependientes (ej. una factura reconciliada contra este pago) — mostrar el mensaje del backend tal
  cual, que ya indica qué verificar.
- `estado` en las respuestas es uno de `'draft' | 'submitted' | 'cancelled'` — usar para mostrar
  badges/colores y para habilitar/deshabilitar los botones de acción (editar solo en draft, cancelar
  solo en submitted, etc.).

## Shape de respuesta (detalle/listado)

Cada emisión, sin importar si por dentro es un Payment Entry o un Journal Entry, se normaliza al
mismo shape (`TreasuryTransaction`):

```ts
{
  id: string;
  documentoOrigen: { doctype: 'Payment Entry' | 'Journal Entry'; name: string }; // informativo
  fecha: string;
  cuentaBancaria: string | null;
  monto: number;
  estado: 'draft' | 'submitted' | 'cancelled';
  descripcion?: string;
  beneficiario?: { tipo: string; id: string; nombre?: string };
  beneficiarioNombre?: string;
  tipoDocumento?: string;
  referencias: { numeroCheque?, numeroReferencia?, comprobante?, ncf?, claseFiscal?, rnc? };
  lineas: Array<{ cuenta: string; debito: number; credito: number; esBanco: boolean; facturaId?: string; esAnticipo?: boolean; descripcion?: string }>;
  nota?: string;
  branch?: string;
  department?: string;
  creation?: string;
  modified?: string;
}
```

`lineas` es útil para una vista de detalle tipo "ver asiento contable" (mostrar cada línea con su
cuenta, débito/crédito) — no es necesaria para el formulario de creación, solo para el detalle de
un documento ya existente. `documentoOrigen.doctype` puede usarse para decidir si mostrar la
sección de "beneficiario/liquidaciones" o la de "distribución" al ver el detalle de un documento ya
creado (no editable, solo informativo).

## Facturas pendientes por proveedor (para liquidaciones)

```
GET /tesoreria/emisiones/pendientes/:supplierId
```

Mismo cálculo que `GET /pagos/pendientes` (módulo de Pagos ya existente) — si el frontend ya tiene
un componente de "seleccionar facturas a liquidar" hecho para Pagos, reutilizarlo acá tal cual,
apuntando a este endpoint cuando se está en el flujo de Tesorería en vez del de Pagos.
