# Cambios que requieren modificación del API/backend — GenSuite

Este documento nace de `scraping-analysis/scraping-analisys.md`. Contiene **únicamente** los hallazgos cuya causa raíz está en el backend (`gensapi.ryancfx.click`) — cálculos, agregaciones, validaciones o transiciones de estado que el frontend no puede corregir por sí solo porque simplemente muestra lo que la API devuelve.

Quedan **fuera** de este documento (por ser arreglos exclusivamente de frontend, sin tocar el API): el bug del componente `search-select` (0.1), la falta de asterisco de obligatorio en RNC (0.2), el bug de layout responsivo en Nuevo Artículo (0.4), la falta de feedback al fallar una validación (0.5), la inconsistencia de traducción de estados en las tablas y filtros (sección 3, 0.7.3), los checkboxes de variantes que no responden (0.7.4), la pestaña con ruta cruda (4.1) y la acumulación de pestañas (4.2).

Cada sección de abajo es un prompt autocontenido, dividido en fases, listo para dársele a un agente con acceso al repo del backend (y a este repo de frontend para la Fase de ajuste de UI). Ejecutar cada cambio en un agente/sesión separado — son independientes entre sí.

---

## 1. Validación de unicidad de RNC en Proveedores

**Hallazgo:** `scraping-analisys.md` §0.3 — se creó un proveedor nuevo con el mismo RNC que uno ya existente sin ninguna advertencia ni bloqueo.

**Prompt:**
```
Contexto: en GenSuite (ERP DGII), al crear un proveedor (POST /suppliers o equivalente) el backend
no valida que el RNC no esté ya registrado en otro proveedor. Se debe agregar esa validación.

Fase 1 — Backend:
1. Localiza el endpoint de creación de proveedor (POST /suppliers) y edición (PUT /suppliers/:id).
2. Antes de guardar, verifica si ya existe otro proveedor (excluyendo el propio id en edición) con el
   mismo RNC (normalizado, sin guiones/espacios).
3. Si existe, responde 409 Conflict con un mensaje claro, ej:
   { "success": false, "error": { "code": "CONFLICT", "message": "Ya existe un proveedor con el RNC
   102-17362-2: \"Suplidor del Sur SRL\". Verifica si es el mismo proveedor antes de continuar.",
   "statusCode": 409 } }
4. Aplica la misma validación en Clientes si no existe ya (revisa si /customers ya la tiene — el
   análisis no reportó el bug ahí, así que probablemente ya esté cubierta; confírmalo).

Fase 2 — Frontend (gensuite-web):
1. En SupplierForm.tsx (creación/edición de proveedor), captura el nuevo 409 en el onError de la
   mutation y muestra el mensaje del backend tal cual (no un genérico).
2. Si el formulario tiene un campo de error inline para RNC, muéstralo ahí también, no solo en el toast.

Fase 3 — Verificación:
1. Backend: test de integración — crear proveedor con RNC existente → 409; crear con RNC nuevo → 201;
   editar el mismo proveedor sin cambiar su propio RNC → no debe dispararse el conflicto consigo mismo.
2. Frontend: en /proveedores/nuevo, intentar guardar con un RNC ya usado por otro proveedor y confirmar
   que se ve el mensaje de error, no un guardado silencioso ni un error genérico.
```

---

## 2. El botón "Someter" de Cotización salta el estado `open` y va directo a `ordered`

**Hallazgo:** `scraping-analisys.md` §0.7.1 — se esperaba que "Someter" lleve la cotización a `open`
("Sometido", pendiente de decisión del cliente), pero el estado resultante fue `ordered`
("Cotización ordenada"), sin pasar por el intermedio. El filtro de listado sí contempla `open` como
opción válida, lo que confirma que ese estado existe y se salta indebidamente.

**Prompt:**
```
Contexto: en el flujo de venta, una Cotización (Quotation) debe pasar por los estados
draft → open (sometida, esperando decisión del cliente) → ordered (el cliente la aceptó y se generó
un Pedido) / lost / expired / cancelled. Actualmente, el endpoint de "someter" (POST /quotations/:id/submit
o equivalente) está transicionando la cotización directo a `ordered` en vez de a `open`.

Fase 1 — Backend:
1. Localiza el endpoint de submit de cotizaciones y revisa a qué status/docstatus la deja en ERPNext
   tras someterla. Confirma si está llamando alguna acción adicional (ej. "Ordered") en el mismo
   request en vez de solo hacer el submit estándar (docstatus 0→1, que en Quotation de ERPNext
   normalmente resulta en status "Open").
2. Corrige el endpoint para que, tras someter, el resultado sea `open` (Sometido) — sin generar ni
   marcar el pedido como ordenado automáticamente. El paso a `ordered` debe ocurrir únicamente cuando
   se crea un Pedido de Venta a partir de esa cotización (flujo "Crear Pedido"), no al someter.
3. Si hay lógica que decide automáticamente pasar a "ordered" cuando ya existe un pedido vinculado,
   revisa que no se esté ejecutando prematuramente en el submit.

Fase 2 — Frontend (gensuite-web):
1. No debería requerir cambios de código si QuotationDetail.tsx ya maneja bien el estado `open`
   (revisa STATUS_BADGE/STATUS_LABEL en QuotationDetail.tsx y QuotationsPage.tsx — deben incluir 'open'
   con label "Sometido"; si falta, agrégalo).
2. Confirma que las acciones disponibles en QuotationDetail.tsx para status='open' sean correctas
   (debe poder pasar a Pedido, marcarse como Perdida, o cancelarse — no debería mostrarse ya como
   'ordered' hasta que exista el pedido real).

Fase 3 — Verificación:
1. Crear una cotización en Draft, presionar "Someter" y confirmar que el estado resultante es
   "Sometido" (open), no "Ordenado".
2. Desde ahí, usar el flujo "Crear Pedido" y confirmar que SOLO en ese momento el estado pasa a
   "Ordenado" (ordered).
```

---

## 3. El campo "Tipo NCF" de la factura queda vacío tras la asignación automática del NCF

**Hallazgo:** `scraping-analisys.md` §0.7.2 — al someter una factura, el backend asigna correctamente
el NCF completo (ej. `B0200000047`), pero el campo `ncfType` de la factura queda vacío/no se persiste,
aunque el prefijo del NCF ya lo determina (`B02` = Consumidor Final).

**Prompt:**
```
Contexto: Invoice (factura de venta) tiene un campo `ncfType` (ej. 'B01', 'B02', 'B14'...) que el
frontend usa para mostrar la etiqueta legible del tipo de comprobante fiscal. En facturas ya sometidas
con NCF asignado, GET /invoices/:id devuelve `ncfType` vacío/null pese a que el `ncf` completo ya
tiene el prefijo correcto.

Fase 1 — Backend:
1. Localiza el flujo de asignación automática de NCF al someter una factura (POST /invoices/:id/submit).
2. Confirma si `ncfType` se está seteando en el documento en ese momento. Si el tipo de NCF se decide
   en otro punto (ej. al crear la factura, antes de tener el NCF real), verifica que ese valor se
   preserve y se siga devolviendo en el GET tras el submit — probablemente el mapeo de respuesta
   (DTO) del backend está usando un campo que queda null post-submit en vez de recalcularlo desde
   el NCF asignado o desde el campo real que ERPNext usa internamente.
3. Como fallback robusto, si `ncf` ya existe pero `ncfType` viene vacío, deriva `ncfType` a partir
   del prefijo del NCF (los primeros 3 caracteres, ej. 'B02') al construir la respuesta de GET
   /invoices/:id y GET /invoices (lista), para no depender de que el campo se haya guardado bien
   en cada punto del flujo histórico.

Fase 2 — Frontend (gensuite-web):
1. No requiere cambios si el backend ya garantiza que `ncfType` viene poblado — InvoiceDetail.tsx
   ya usa `NCF_TYPES.find(t => t.value === invoice.ncfType)` para mostrar la etiqueta.
2. Si se prefiere no depender 100% del backend, se puede agregar un fallback en el frontend
   (derivar ncfType de `invoice.ncf?.slice(0,3)` cuando `ncfType` sea null pero `ncf` exista) — pero
   la fuente de verdad debe seguir siendo el backend.

Fase 3 — Verificación:
1. Someter una factura en Draft con NCF pendiente y confirmar que, tras la asignación, GET /invoices/:id
   devuelve tanto `ncf` como `ncfType` poblados.
2. Revisar en la UI (Detalle de Factura) que "Tipo NCF" muestre la etiqueta correcta (ej. "B02 — 
   Consumidor Final") inmediatamente después de someter, sin necesitar recargar.
```

---

## 4. Cierre de sesión inesperado al guardar un Gasto

**Hallazgo:** `scraping-analisys.md` §0.7.7 — al presionar "Guardar Borrador" en Nuevo Gasto, la
aplicación expulsó la sesión activa y redirigió al login, en vez de guardar el gasto o mostrar un
error. No se confirmó si el gasto quedó guardado parcialmente.

**Prompt:**
```
Contexto: el cliente (gensuite-web) trata cualquier respuesta 401 de la API como sesión expirada:
limpia el token y redirige a /login inmediatamente (ver src/shared/api/client.ts, interceptor de
respuesta). Si el endpoint de creación de gastos devolvió un 401 en un momento donde la sesión NO
debería haber expirado, hay que investigar por qué el backend respondió 401 ahí.

Fase 1 — Backend (investigación):
1. Reproduce el flujo: crear un Gasto (Expense) con proveedor, artículo, precio, marcado como
   deducible fiscalmente, y guardarlo como borrador (probablemente POST /gastos o /compras-gastos con
   algún parámetro de tipo borrador).
2. Revisa logs del servidor en el momento del fallo: ¿el endpoint devolvió realmente 401 (token
   inválido/expirado), o devolvió un 500 que en algún punto del stack (proxy, middleware de errores,
   manejo de excepciones de ERPNext) se está traduciendo incorrectamente a 401?
3. Casos probables a descartar:
   a. Un error no controlado (ej. validación de ERPNext, campo faltante, permiso de rol) que el
      middleware de manejo de errores está mapeando genéricamente a 401 en vez de a 400/403/500.
   b. Expiración real y coincidente del JWT/sesión justo en ese request — en ese caso, no es un bug
      de datos pero sí una mala experiencia si el timeout de sesión es muy corto; confirma la
      duración configurada del token.
   c. Un middleware de autenticación que se re-ejecuta de forma distinta para este endpoint específico
      (ej. permisos de rol distintos para "gastos" vs otros módulos) y falla la verificación por un
      bug de configuración, no por token inválido.
4. Corrige la causa raíz: el objetivo es que un error de validación/negocio en la creación del gasto
   devuelva su código real (400/403/422/500 con mensaje claro), y que un 401 solo ocurra cuando el
   token realmente es inválido o expiró.
5. Confirma si el gasto quedó guardado parcialmente en la base de datos pese al error — si es así,
   agrega manejo transaccional para que no queden gastos huérfanos a medio crear.

Fase 2 — Frontend (gensuite-web):
1. Sin cambios necesarios si el backend deja de devolver 401 incorrectamente.
2. Como mejora defensiva, en GastoForm.tsx podrías capturar el error antes del logout automático del
   interceptor global SOLO si decides distinguir "sesión expirada real" de "error del servidor" — pero
   esto requeriría que el backend deje de sobrecargar el código 401; no lo implementes como parche
   sin antes confirmar la causa real en el backend.

Fase 3 — Verificación:
1. Repetir el flujo exacto de creación de Gasto (mismos datos: proveedor, artículo, precio,
   deducible=true, guardar como borrador) y confirmar que se guarda correctamente sin cerrar sesión.
2. Forzar un caso de error de validación real (ej. omitir un campo requerido) y confirmar que se
   recibe un error claro (400/422) sin desloguear al usuario.
```

---

## 5. Aging CxC no calcula ningún rango de antigüedad (todo en RD$0.00)

**Hallazgo:** `scraping-analisys.md` §2.1 — en las 31 filas de `/cobros/aging`, las columnas
`Corriente`, `0–30`, `31–60`, `61–90` y `+90 días` están todas en RD$0.00; solo `Total` tiene valores
reales.

**Prompt:**
```
Contexto: GET /cobros/aging debe devolver, por cliente, el saldo total pendiente distribuido en
buckets de antigüedad según la fecha de vencimiento de cada factura (current, 0-30, 31-60, 61-90, 90+).
Actualmente el backend devuelve el total correcto pero todos los buckets en 0.

Fase 1 — Backend:
1. Localiza el endpoint/reporte de Aging (probablemente basado en el "Accounts Receivable" de ERPNext
   o una query propia sobre Sales Invoice con outstanding_amount > 0).
2. Revisa el cálculo de antigüedad: para cada factura pendiente, calcular
   `dias_vencidos = hoy - due_date` y asignar el `outstanding_amount` de esa factura al bucket
   correspondiente (current si due_date >= hoy; 0-30 si 0 <= dias_vencidos <= 30; etc.), sumando por
   cliente.
3. Causas típicas de este bug: comparar fechas como strings en vez de objetos Date/timestamp; usar
   una zona horaria distinta a la de posting/due_date guardada; iterar sobre las facturas pero no
   sumar al bucket (bug de asignación == 0 en vez de +=); o estar calculando la antigüedad contra
   `posting_date` en vez de `due_date`.
4. Corrige el cálculo y confirma que la suma de los 5 buckets sea igual al `totalOutstanding` de
   cada fila (invariante que se puede validar en un test).

Fase 2 — Frontend (gensuite-web):
1. No requiere cambios — AgingPage.tsx ya renderiza `entry.current`, `entry.range1`...`entry.range4`
   directamente de la respuesta.

Fase 3 — Verificación:
1. Con datos de prueba con facturas en distintos rangos de vencimiento (una corriente, una vencida
   hace 10 días, una hace 45, una hace 75, una hace 120), confirmar que cada una cae en el bucket
   correcto y que la suma de los buckets por cliente coincide con el total mostrado.
```

---

## 6. Semáforo de crédito: % de uso incorrecto cuando el límite es RD$0.00

**Hallazgo:** `scraping-analisys.md` §2.2 — cliente con balance RD$51,584.00 y límite de crédito
RD$0.00 muestra "Uso del crédito" = 0.0% (aunque el estado sí se marca correctamente como "Crítico").

**Prompt:**
```
Contexto: GET /cobros/semaforo devuelve, entre otros campos, `pctUsado` (SemaforoEntry.pctUsado).
Cuando `creditLimit` es 0 y `balance` > 0, el cálculo (balance / creditLimit * 100) es una división
por cero que el backend está devolviendo/manejando como 0 en vez de un valor que refleje que el
cliente está sobregirado sin límite.

Fase 1 — Backend:
1. Localiza el cálculo de `pctUsado` en el endpoint de semáforo.
2. Corrige el caso borde: si `creditLimit === 0`:
   - Si `balance === 0` también, `pctUsado` puede quedar en 0 (o null) — no hay problema, no hay uso.
   - Si `balance > 0` con `creditLimit === 0`, el cliente no tiene límite pero sí tiene deuda: no
     se puede expresar como "% del límite" de forma matemáticamente válida. Decide con el equipo de
     producto la representación correcta — opciones razonables: devolver `pctUsado: null` (y que el
     frontend muestre "Sin límite definido"), o `pctUsado: 100` con una bandera adicional
     `sinLimiteDefinido: true`. Lo que NO debe pasar es devolver 0.0% para un caso que ya es "Crítico".
3. Asegúrate de que el campo `semaforo` (verde/amarillo/rojo) siga siendo consistente con el nuevo
   valor — en este caso ya estaba correctamente en "rojo"/Crítico, solo el porcentaje mostrado es
   el que está mal.

Fase 2 — Frontend (gensuite-web):
1. En SemaforoPage.tsx / SemaforoIndicator (CustomerDetail.tsx), si el backend decide devolver
   `pctUsado: null` para este caso, actualiza el render para mostrar "Sin límite definido" en vez de
   "0.0%" cuando `pctUsado` sea null y `creditLimit === 0`.
2. Si el backend decide devolver 100 o un valor numérico, no se necesita cambio adicional más allá
   de mostrar el número tal cual.

Fase 3 — Verificación:
1. Con un cliente con `creditLimit = 0` y `balance > 0`, confirmar que el % mostrado ya no es 0.0%
   y refleja claramente que está sobregirado/sin límite.
2. Confirmar que un cliente con `creditLimit = 0` y `balance = 0` no rompe la pantalla (no debe
   mostrar división por cero ni NaN).
```

---

## 7. Balance de proveedores siempre en RD$0.00

**Hallazgo:** `scraping-analisys.md` §2.3 — los 8 proveedores listados muestran `Balance: RD$0.00`,
incluyendo uno con compras por millones de pesos en estado `submitted` en `/compras`.

**Prompt:**
```
Contexto: GET /suppliers (lista) devuelve un campo `balance` por proveedor (Supplier.balance en
SuppliersPage.tsx), que debería reflejar el total pendiente de pago (facturas de compra sometidas
menos pagos ya hechos). Actualmente siempre devuelve 0 sin importar las compras registradas.

Fase 1 — Backend:
1. Localiza dónde se calcula/popula `balance` en la respuesta de GET /suppliers.
2. Es muy probable que el campo esté hardcodeado a 0, no implementado, o esté consultando la entidad
   equivocada (ej. Payment Entry en vez de Purchase Invoice, o filtrando por un campo de status que
   no coincide con 'submitted').
3. Implementa/corrige el cálculo: suma de `outstanding_amount` de todas las Purchase Invoice
   sometidas (docstatus=1, no canceladas) de ese proveedor.
4. Si existe un endpoint de detalle (GET /suppliers/:id) que también expone un balance o listado de
   facturas pendientes, verifica que use la misma lógica y sea consistente con la del listado.

Fase 2 — Frontend (gensuite-web):
1. No requiere cambios — SuppliersPage.tsx ya lee `supplier.balance` directamente.

Fase 3 — Verificación:
1. Con "Suplidor del Sur SRL" (que tiene compras sometidas por RD$5,800,000.00 y RD$2,900,000.00),
   confirmar que GET /suppliers muestre un balance > 0 coherente con la suma de esas facturas
   pendientes de pago.
2. Registrar un pago parcial a ese proveedor y confirmar que el balance se reduce en consecuencia.
```

---

## 8. Resumen de Gastos no coincide con el detalle (excluye borradores)

**Hallazgo:** `scraping-analisys.md` §2.4 — las tarjetas de resumen "Gastos Deducibles"/"Gastos No
Deducibles" muestran RD$0.00 pese a que la tabla debajo lista un gasto en Draft con
`Deducible: Sí`, `RD$1,099.78`.

**Prompt:**
```
Contexto: GastosPage.tsx consume dos fuentes distintas: getGastoResumen(month) para las tarjetas de
resumen, y listGastos(...) para la tabla. Ambas deberían ser consistentes respecto a qué estados de
documento incluyen.

Fase 1 — Backend (decisión + implementación):
1. Confirma con el equipo de producto la regla de negocio correcta: ¿los gastos en Draft deben
   contarse en el resumen de "Deducibles"/"No deducibles" del mes, o el resumen debe reflejar solo
   gastos ya Sometidos (confirmados, no borradores editables)?
2. Si la respuesta es "sí deben contarse los Draft" (razonable si el mes se está construyendo en
   tiempo real): corrige el endpoint de resumen (GET /gastos/resumen o equivalente) para incluir
   también documentos en Draft, igual que el listado.
3. Si la respuesta es "NO deben contarse los Draft" (el resumen es solo de gastos confirmados):
   deja el resumen como está, pero hazlo explícito en la UI (ver Fase 2) para que no parezca un bug.

Fase 2 — Frontend (gensuite-web):
1. Si Fase 1 decide incluir Draft en el resumen: no se requiere cambio de frontend, solo confirmar
   que los números ahora coincidan.
2. Si Fase 1 decide que el resumen es intencionalmente solo de gastos Sometidos: agrega una aclaración
   visual en GastosPage.tsx cerca de las tarjetas de resumen (ej. "Solo incluye gastos sometidos,
   no borradores") para que la diferencia con la tabla no se perciba como una inconsistencia.

Fase 3 — Verificación:
1. Con un gasto en Draft deducible de RD$1,099.78 y ninguno más ese mes, confirmar que la tarjeta
   "Gastos Deducibles" refleja la regla decidida en Fase 1 (o bien RD$1,099.78, o bien RD$0.00 con
   la aclaración visual correspondiente — pero nunca una contradicción sin explicación).
```

---

## 9. Facturas con estado "Pendiente" pero saldo pendiente en RD$0.00

**Hallazgo:** `scraping-analisys.md` §2.5 — varias facturas (ACC-SINV-2026-00056, 00054, 00046,
00030, 00008) muestran `paymentStatus = unpaid` ("Pendiente") con `outstandingAmount = 0`.

**Prompt:**
```
Contexto: Invoice tiene dos campos independientes: `paymentStatus` ('unpaid'|'partly_paid'|'paid') y
`outstandingAmount`. Deberían estar siempre sincronizados: si outstandingAmount === 0, paymentStatus
debería ser 'paid'; si es > 0, debería ser 'unpaid' o 'partly_paid' según corresponda.

Fase 1 — Backend (investigación + fix):
1. Reproduce el caso con una de las facturas reportadas (ej. ACC-SINV-2026-00030, que ya se usó en
   varios cambios anteriores de este proyecto para probar aplicación de notas de crédito/saldo a
   favor — es un buen candidato para depurar directamente en sus datos).
2. Verifica si `paymentStatus` se calcula/persiste en un momento distinto a `outstandingAmount`
   (ej. paymentStatus se guarda en el documento al momento del submit y nunca se recalcula cuando
   luego se aplica un pago, nota de crédito o saldo a favor que deja el outstanding en 0).
3. Corrige para que `paymentStatus` se derive SIEMPRE de `outstandingAmount` al momento de construir
   la respuesta (GET /invoices, GET /invoices/:id) en vez de depender de un campo persistido que
   puede quedar desincronizado: paid si outstandingAmount <= 0.01, partly_paid si
   0 < outstandingAmount < grandTotal, unpaid si outstandingAmount === grandTotal.
4. Si el paymentStatus persistido se usa en otros procesos internos (reconciliación, reportes),
   confirma que no se rompe nada al empezar a derivarlo dinámicamente — si es necesario, además de
   derivarlo en la respuesta, agrega una migración/job que recalcule y corrija los documentos
   existentes con datos inconsistentes.

Fase 2 — Frontend (gensuite-web):
1. No requiere cambios — InvoicesPage.tsx e InvoiceDetail.tsx ya muestran `paymentStatus` y
   `outstandingAmount` tal cual vienen del backend.

Fase 3 — Verificación:
1. Confirmar que las 5 facturas reportadas ahora muestran `paymentStatus = 'paid'` (Pagado) en vez
   de "Pendiente", dado que su outstandingAmount es 0.
2. Aplicar una nota de crédito parcial a una factura con saldo pendiente y confirmar que
   paymentStatus pasa a 'partly_paid' correctamente, y a 'paid' cuando el saldo llega a 0.
```

---

## 10. Reporte DGII 606 sin RNC del proveedor

**Hallazgo:** `scraping-analisys.md` §2.6 — la columna "RNC / Cédula Proveedor" aparece vacía en las
10 filas del período consultado en `/reportes/606`.

**Prompt:**
```
Contexto: el reporte 606 (compras y gastos) es un reporte de cumplimiento fiscal DGII; el RNC/Cédula
del proveedor es un campo obligatorio del formato oficial. GET /reportes/606 (o el endpoint que
alimenta ReportesPage.tsx → DgiiReport) está devolviendo esa columna vacía para todas las filas.

Fase 1 — Backend:
1. Localiza la query que arma las filas del reporte 606.
2. Es muy probable que falte un JOIN/lookup hacia el proveedor (Supplier.tax_id / rnc) — revisa si
   la query solo trae el nombre del proveedor pero no su RNC, o si el campo se llama distinto al que
   se está mapeando en el DTO de respuesta.
3. Corrige la query/mapeo para incluir el RNC (o Cédula, si el proveedor es persona física) de cada
   proveedor en cada fila.
4. Si el reporte también se exporta a un archivo TXT/plano para subir a la DGII, confirma que el
   export use el mismo dato corregido — si el bug está solo en la vista HTML pero el TXT ya
   incluía el RNC correctamente (poco probable pero posible), acláralo; si el TXT también lo omite,
   es el problema más urgente de corregir porque invalidaría el archivo ante la DGII.

Fase 2 — Frontend (gensuite-web):
1. No requiere cambios — ReportesPage.tsx renderiza las columnas dinámicamente según lo que devuelve
   el backend (`{ rows, columns }`).

Fase 3 — Verificación:
1. Generar el reporte 606 del mismo período y confirmar que la columna RNC/Cédula Proveedor viene
   poblada para las 10 filas.
2. Si existe exportación a archivo, descargarla y confirmar que el RNC también aparece ahí en el
   formato esperado por la DGII.
```

---

## 11. "Devoluciones" duplica exactamente el contenido de "Notas de Crédito"

**Hallazgo:** `scraping-analisys.md` §2.7 — `/devoluciones` y `/notas-credito` muestran las mismas
14 filas, mismos documentos, montos y estados.

**Prompt:**
```
Contexto: en este repo de frontend ya existen dos pantallas separadas — CreditNotesPage.tsx
(/notas-credito, consume GET /credit-notes) y DevolucionesPage.tsx (/devoluciones, consume
GET /devoluciones) — construidas asumiendo que el backend expone dos conjuntos de datos
conceptualmente distintos: TODAS las notas de crédito (incluyendo las creadas manualmente sin
factura original) vs. específicamente las notas de crédito originadas por una devolución real
(POST /devoluciones, con `originalInvoice`/`returnAgainst` asociado). El hallazgo del scraping indica
que hoy ambos endpoints devuelven exactamente el mismo dataset — es decir, o el backend no está
filtrando devoluciones vs. notas manuales, o (si conceptualmente son lo mismo) la duplicación de
pantallas es innecesaria.

Fase 1 — Backend (decisión de producto + implementación):
1. Confirma con el equipo de producto: ¿debe existir alguna nota de crédito que NO sea una
   devolución (ej. un ajuste manual sin devolución de mercancía física)? Si la respuesta es "no,
   todas las notas de crédito en este sistema se originan de una devolución", entonces los dos
   endpoints son legítimamente iguales y el problema es de producto/UX (ver Fase 2, opción B).
2. Si la respuesta es "sí, deben poder existir notas de crédito manuales sin devolución física
   asociada": corrige GET /devoluciones para que filtre y devuelva SOLO las notas de crédito que
   tengan un origen de devolución real (ej. un flag `source: 'return'` o la presencia de
   `return_against` con el flujo completo de devolución, no solo cualquier nota con un
   `originalInvoice`/`returnAgainst` seteado a mano en el modal de "Nueva Nota de Crédito" de
   CreditNotesPage.tsx — revisa cómo se crean ambas y si comparten el mismo campo sin distinción).
3. GET /devoluciones/:id ya está documentado (en este repo, DevolucionDetail.tsx) para rechazar con
   400 una nota de crédito manual sin return_against — confirma que esa validación siga
   funcionando una vez apliques el filtro en la lista.

Fase 2 — Frontend (gensuite-web) — dos caminos según lo decidido en Fase 1:
   A. Si el backend corrige el filtro (son conceptos distintos): no se requiere cambio de frontend,
      solo confirmar que /devoluciones ahora muestra un subconjunto más chico que /notas-credito.
   B. Si se confirma que son lo mismo por diseño: elimina una de las dos pantallas/rutas duplicadas
      (recomendado: mantener /devoluciones ya que tiene el detalle enriquecido con la factura
      original y el estado de uso, y quitar la entrada de menú de /notas-credito, o viceversa según
      decida producto) para no confundir al usuario con dos menús que llevan al mismo lugar.

Fase 3 — Verificación:
1. Si se aplicó el filtro (opción A): crear una nota de crédito manual sin devolución real desde
   /notas-credito y confirmar que NO aparece en /devoluciones, y que una devolución real sí aparece
   en ambos (o solo en devoluciones, según se decida el alcance final de /notas-credito).
2. Si se aplicó la fusión (opción B): confirmar que la navegación y el menú ya no muestran dos
   entradas redundantes.
```

---

## 12. Notas de Crédito: monto "Reembolsada" no se muestra de forma consistente

**Hallazgo:** `scraping-analisys.md` §2.8 — notas con el mismo estado "Parcialmente usada" a veces
muestran `Reembolsada: RD$X` y otras veces no muestran ese dato.

**Prompt:**
```
Contexto: CreditNotesPage.tsx (y DevolucionDetail.tsx) muestran `Reembolsada: {monto}` solo cuando
`note.refunded === true`, usando `note.refundedAmount`. Ambos campos vienen de GET /credit-notes /
GET /devoluciones. Si notas con el mismo `status` (ej. 'partially_used') tienen a veces `refunded`
en true y a veces en false/undefined sin relación aparente con si realmente se reembolsó algo, hay
una inconsistencia en cómo el backend está seteando esos dos campos.

Fase 1 — Backend:
1. Localiza dónde se calculan `refunded` y `refundedAmount` para una nota de crédito.
2. Confirma la regla esperada: `refunded` debería ser true si y solo si `refundedAmount > 0` (se
   reembolsó algo en efectivo/transferencia vía POST /credit-notes/:id/refund), independientemente
   de si además se aplicó una parte a una factura (`appliedAmount`). Es decir, `refunded` y el
   "estado de uso" (available/partially_used/fully_used) son dimensiones independientes: una nota
   puede estar 'partially_used' porque se aplicó una parte a una factura, sin que eso implique nada
   sobre si además se reembolsó otra parte en efectivo.
3. Revisa los casos reportados como inconsistentes (ACC-SINV-2026-00052/00050 sí muestran
   Reembolsada, 00040/00036/00025 no) contra el histórico real de reembolsos de cada una — confirma
   si a las que NO muestran el dato genuinamente nunca se les hizo un POST /credit-notes/:id/refund
   (en cuyo caso el frontend está bien y no hay bug), o si sí se reembolsaron pero el campo no se
   actualizó/persistió correctamente en esos casos puntuales (bug real de datos).
4. Si es un bug de datos, corrige el cálculo/persistencia para que `refunded`/`refundedAmount` sea
   siempre reflejo fiel del historial real de reembolsos de esa nota.

Fase 2 — Frontend (gensuite-web):
1. No requiere cambios de lógica si el backend garantiza consistencia — el render actual
   (`{note.refunded && <span>Reembolsada: {formatDOP(note.refundedAmount)}</span>}`) ya es correcto
   siempre que los campos de origen sean confiables.

Fase 3 — Verificación:
1. Tomar una nota de las reportadas como "sin el dato" (ej. ACC-SINV-2026-00040) y confirmar en el
   histórico contable si realmente tuvo o no un reembolso en efectivo — el resultado debe coincidir
   con lo que ahora muestra la UI.
2. Reembolsar parcialmente una nota de crédito de prueba y confirmar que `Reembolsada: RD$X` aparece
   inmediatamente y de forma consistente en /notas-credito y en el detalle de /devoluciones.
```

---

## 13. Keys duplicadas en Aging CxC / Semáforo (posible causa en agregación del backend)

**Hallazgo:** `scraping-analisys.md` §1.1 — React reporta keys duplicadas (`Juan Perez`, `Test`,
`Aldereca`, `Ryan Castro Felix`) en `/cobros/aging` y `/cobros/semaforo`, usando `entry.customer`
como key en ambas pantallas.

**Prompt:**
```
Contexto: AgingPage.tsx y SemaforoPage.tsx usan `key={entry.customer}` (el ID de cliente, no el
nombre) al iterar `entries`. Si `entry.customer` es realmente el ID único del cliente en ERPNext,
una key duplicada solo puede significar que GET /cobros/aging o GET /cobros/semaforo está
devolviendo MÁS DE UNA fila para el mismo cliente en vez de una sola fila agregada — un bug de
agregación en el backend, no un problema del key elegido en el frontend.

Fase 1 — Backend (investigación + fix):
1. Reproduce la consulta para uno de los clientes reportados (ej. "Juan Perez") en GET /cobros/aging
   y GET /cobros/semaforo, y cuenta cuántas filas devuelve el backend para ese mismo `customer` (id).
2. Si devuelve más de una fila para el mismo cliente: revisa el GROUP BY / agregación de la query —
   probablemente está agrupando por algún campo adicional que varía entre facturas del mismo cliente
   (ej. por factura individual, por sucursal, por moneda) en vez de agrupar únicamente por cliente,
   o hay un JOIN que multiplica filas (ej. join con líneas de factura sin agregar después).
3. Corrige la query para que cada cliente aparezca en una sola fila, con los montos ya sumados
   (current/range1-4/totalOutstanding para aging; balance/creditLimit para semáforo).
4. Si por diseño se espera que un mismo cliente aparezca más de una vez (ej. una fila por sucursal),
   entonces el campo `customer` no es la key correcta y el backend debe exponer un identificador
   verdaderamente único por fila (ej. `customer` + `branch`, o un id compuesto) para que el frontend
   lo use como key sin colisiones — en ese caso, avisa al frontend cuál es el nuevo campo/formato.

Fase 2 — Frontend (gensuite-web):
1. Si el backend corrige la agregación (una fila por cliente): no se requiere cambio, `entry.customer`
   ya es único.
2. Si el backend expone un id compuesto nuevo (ej. `rowId` o `customer` + `branch`): actualiza
   AgingEntry/SemaforoEntry en shared/api/types.ts para incluir ese campo, y cambia
   `key={entry.customer}` por `key={entry.rowId}` (o el compuesto correspondiente) en
   AgingPage.tsx y SemaforoPage.tsx.

Fase 3 — Verificación:
1. Confirmar en la consola del navegador que ya no aparece el warning "Encountered two children with
   the same key" al cargar /cobros/aging y /cobros/semaforo.
2. Confirmar visualmente que cada cliente aparece exactamente una vez en ambas pantallas, con montos
   agregados correctos (comparar contra la suma manual de sus facturas pendientes).
```
