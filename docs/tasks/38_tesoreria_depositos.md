# Prompt para agente de frontend — Tesorería: Depósitos (ingresos)

> Prompt autocontenido. Contexto de negocio y UX — shapes exactos en `openapi.json`, tag
> **"Tesorería — Depósitos"**. API base `https://gensapi.ryancfx.click/api/v1`.
> Requiere haber leído [37_tesoreria_emisiones.md](37_tesoreria_emisiones.md) primero — Depósitos
> es el espejo de Emisiones (mismo patrón con/sin party, mismos tipos de línea), este documento
> solo cubre las diferencias.

## Qué es

El módulo de "entradas de dinero" de tesorería: depósitos bancarios, cobros de clientes registrados
directamente en tesorería, liquidaciones de procesadoras de tarjeta (Cardnet/Azul), reembolsos de
proveedores.

## Diferencias respecto a Emisiones

1. El campo con party se llama **`origen`** (no `beneficiario`), con el mismo shape
   `{ tipo: 'Customer'|'Supplier', id }`. Hay un campo hermano `origenNombre` (no
   `beneficiarioNombre`) para el nombre libre.
2. `tipoDocumento` debe ser un código del catálogo cuyo `tipoTransaccion` sea **"Débito"** (ej.
   "DEP") — el backend no valida esto estrictamente en la request pero es la convención; usar el
   catálogo de tipos de documento filtrado o al menos ordenado de forma que los de tipo Débito
   aparezcan primero/agrupados al elegir en este formulario.
3. `origen.tipo` puede ser **Customer O Supplier** (no solo Customer) — un depósito puede venir de
   un cliente (cobro) o de un proveedor (ej. una devolución/reembolso que el proveedor deposita). El
   selector de "origen" debe permitir elegir el tipo de tercero primero (Cliente/Proveedor) y luego
   buscar en el catálogo correspondiente, igual que ya hace el selector de beneficiario en
   Emisiones.
4. `liquidaciones[]` — cuando `origen.tipo` es Customer, liquida contra Sales Invoice (ventas
   pendientes de cobro); cuando es Supplier, liquida contra Purchase Invoice (caso de devolución).
   Usar `GET /tesoreria/emisiones/pendientes/:supplierId` (compartido con Emisiones) para el caso
   Supplier; para el caso Customer, usar el mismo endpoint de pendientes que ya usa el módulo de
   Cobros existente (`GET /cobros/pendientes/:customerId` o equivalente — verificar el nombre
   exacto en el módulo de Cobros ya implementado en el frontend).
5. **La semántica de `deducciones` es distinta y depende de si hay `origen` — esto es importante
   para la UX, léelo con cuidado**:
   - **Con origen** (Payment Entry): el monto **bruto completo siempre entra al banco**. Las
     deducciones (comisiones, retenciones) NO reducen lo que se acredita al banco — solo reducen el
     saldo disponible para asignar a facturas (`unallocated_amount`). Es decir, funcionan como un
     descuento aplicado al cliente/proveedor, no como una retención bancaria real.
   - **Sin origen** (Journal Entry): las deducciones sí reducen literalmente lo que se debita al
     banco. Este es el único camino que modela correctamente una liquidación de tarjeta real
     (Cardnet/Azul entregan el neto — la comisión nunca toca la cuenta bancaria).
   - **Implicación de UX concreta**: si el usuario está registrando una liquidación de tarjeta con
     comisión, el formulario debe guiarlo a **dejar el campo origen vacío** (o explicarle que si
     selecciona un cliente/proveedor, la comisión no se restará del monto que se ve reflejado en el
     banco). Un texto de ayuda junto al campo `deducciones` cambiando según haya o no origen
     seleccionado es la forma más clara de comunicar esto — algo como:
     - Sin origen: "Estas deducciones se restan del monto que efectivamente entra al banco."
     - Con origen: "Estas deducciones reducen el saldo disponible para aplicar a facturas, no el
       monto que entra al banco (que siempre es el monto bruto)."
6. `distribucion[]` — mismo criterio que Emisiones: solo válida **sin origen**, la suma debe
   igualar `monto`.
7. Descripción del campo `monto`: "monto BRUTO/nominal de la transacción — igual al total que se
   acredita a la contrapartida (cliente, proveedor, o cuenta puente)". Si hay `deducciones` y no
   hay `origen`, lo que realmente entra al banco es `monto` menos la suma de las deducciones —
   considerar mostrar ese "monto neto calculado" como texto de ayuda en tiempo real bajo el campo
   `deducciones` cuando aplica.

## Endpoints (mismo patrón que Emisiones, sin "siguiente-cheque" ni "imprimir" — un depósito no
   usa numeración de talonario ni tiene comprobante de cheque)

```
GET    /tesoreria/depositos                    listar (filtros: cuentaBancaria, tipoDocumento,
                                                origen, fromDate, toDate, estado)
GET    /tesoreria/depositos/pendientes/:partyId facturas liquidables de ese cliente/proveedor
                                                (mismo cálculo que en Emisiones, pero acá el
                                                path param se llama partyId porque puede ser
                                                Customer o Supplier)
GET    /tesoreria/depositos/:id                detalle
POST   /tesoreria/depositos                    crear borrador
PUT    /tesoreria/depositos/:id                editar solo cabecera de un borrador (mismos
                                                campos editables que Emisiones: descripcion,
                                                nota, referencias, branch, department)
POST   /tesoreria/depositos/:id/submit         someter — genera el asiento contable
POST   /tesoreria/depositos/:id/cancel         cancelar un depósito sometido
```

Mismo ciclo de vida borrador→sometido→cancelado que Emisiones (ver
[37_tesoreria_emisiones.md](37_tesoreria_emisiones.md#ciclo-de-vida-del-documento)): un depósito
nace en `draft`, no afecta el saldo hasta `submit`, y un documento sometido es inmutable (cancelar +
crear nuevo para corregir).

## Shape de respuesta

Idéntico al de Emisiones (`TreasuryTransaction`) — ver
[37_tesoreria_emisiones.md](37_tesoreria_emisiones.md#shape-de-respuesta-detallelistado), con
`beneficiario`/`beneficiarioNombre` poblados a partir de `origen`/`origenNombre` al crear (el campo
de respuesta sigue llamándose `beneficiario` internamente porque es el mismo formato normalizado
que usan ambos submódulos — no confundir con el nombre del campo de request, que sí es `origen`).
