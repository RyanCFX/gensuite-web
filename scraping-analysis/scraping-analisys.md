# Análisis de Scraping — GenSuite (localhost:5173)

Fecha: 2026-07-16
Entorno: dev (Vite), sesión autenticada como Ryan Castro Felix (rcastrofelix06@gmail.com)
Método: navegación manual por navegador headless recorriendo las rutas principales de la SPA, revisando consola, contenido renderizado y datos mostrados.

## Rutas recorridas

/dashboard, /clientes, /cotizaciones, /pedidos, /facturas, /notas-credito, /notas-debito,
/devoluciones, /inventario/articulos, /compras, /gastos, /proveedores, /cobros/lista,
/cobros/aging, /cobros/semaforo, /cuentas, /reportes/606, /config/empresa, ruta inexistente (404).

No se detectaron errores de red (4xx/5xx) ni errores fatales de JavaScript que rompieran el render en ninguna página.

---

## 0. Actualización 2026-07-17 — Pruebas de creación de registros (formularios)

Se probó crear registros reales completando formularios en: Clientes, Proveedores, Artículos, y Cotizaciones. Se encontró un **bug crítico y transversal** que afecta al componente de selección reutilizado en toda la aplicación.

### 0.1 BUG CRÍTICO: el componente "search-select" (combobox de búsqueda) falla de forma sistemática

**Afecta a:** el selector de Cliente/Proveedor/Artículo en Cotizaciones, Pedidos, Facturas, Compras, y los selectores de Categoría/Marca/UDM en Artículos — es decir, prácticamente **cualquier campo relacional en cualquier formulario de creación**. Es un único componente compartido (`class="search-select-input"`), por lo que el defecto se repite en todos sus usos.

Comportamientos observados, reproducidos varias veces:

1. **No siempre abre con click.** En más de una ocasión, hacer click en el campo (ej. "Cliente" en Nueva Cotización, "Categoría"/"Marca"/"UDM" en Nuevo Artículo) no lo enfoca ni abre el listado — ni un click real del usuario ni un `.click()` programático via JavaScript logran darle foco. Solo funciona forzando el foco directamente por código (`element.focus()`), algo que un usuario real no puede hacer.
2. **Seleccionar una opción de la lista no funciona.** Al escribir "Juan" en el buscador de Cliente, aparece "Juan Perez" en la lista; al hacer click sobre esa opción, el campo se vacía en vez de quedar seleccionado. Tampoco funciona seleccionar con teclado (flecha abajo + Enter).
3. **No se puede borrar ni corregir el texto escrito.** Backspace, Delete, seleccionar todo y sobreescribir (Cmd+A + escribir), y el botón "×" de limpiar, **no tienen efecto** una vez que el campo tiene contenido o entró en estado de error — el texto nuevo se concatena al anterior en vez de reemplazarlo (ej. escribir "Juan" dos veces da como resultado "JuanJuan"; un RNC inválido "1-30-12345-6" queda congelado sin poder editarse). La única forma de recuperar el campo es recargar la página completa.
4. **Consecuencia práctica:** un usuario que comete un error de tipeo en un RNC, o que hace click una vez y el combobox no abre, queda con el campo bloqueado sin ninguna vía de recuperación visible en la UI (sin mensaje de error explicando qué hacer, sin botón que funcione). La única salida es recargar la página y perder todo lo demás que había completado en el formulario.

**Impacto:** esto bloquea, de forma intermitente pero frecuente, la creación de Cotizaciones, Pedidos, Facturas, Compras y Artículos con categoría — es decir, la mayoría de los flujos de negocio principales del sistema. Es el hallazgo de mayor severidad de toda la revisión.

### 0.2 Validación de RNC sin retroalimentación clara + campo sin asterisco de obligatorio
**Dónde:** `/clientes/nuevo`, `/proveedores/nuevo`
- El campo "RNC" no muestra asterisco (*) de obligatorio, pero al guardar un cliente tipo "Empresa" sin RNC, el sistema rechaza con el mensaje "Las empresas deben tener RNC" — la obligatoriedad condicional no se refleja visualmente en el formulario.
- Al escribir un RNC con dígito verificador inválido (ej. `130123456`), el campo lo reformatea con guiones y muestra "RNC inválido (dígito verificador)", pero como se describe en 0.1, luego el campo queda imposible de corregir sin recargar la página.

### 0.3 No hay validación de unicidad de RNC en Proveedores
**Dónde:** `/proveedores/nuevo`
Se creó exitosamente un proveedor nuevo ("Proveedor Prueba Scraping") usando el mismo RNC (`102173622`) que ya tenía registrado el proveedor existente "Suplidor del Sur SRL". El sistema no advierte ni bloquea el duplicado.

### 0.4 Bug de layout responsivo en "Nuevo Artículo" a ancho ~812px
**Dónde:** `/inventario/articulos/nuevo`
A un ancho de viewport de ~812px (tablet o laptop pequeño), la columna izquierda "Información General" del formulario se comprime a un ancho de apenas ~15px en vez de colapsar a una sola columna. Esto hace que las etiquetas se corten ("Informació"/"General" en dos líneas) y que el texto escrito en los inputs se renderice verticalmente, letra por letra, siendo completamente ilegible. A 1440px de ancho el formulario se ve y funciona correctamente.

### 0.5 Sin retroalimentación al fallar una validación de campo requerido
**Dónde:** `/inventario/articulos/nuevo`
Al intentar guardar un artículo sin completar "Categoría" (marcada en rojo como requerida), el botón "Crear Artículo" no hace nada visible: no se muestra ningún toast ni mensaje de error, el formulario simplemente permanece igual. Un usuario podría no entender por qué no se guardó el registro.

### 0.6 Registros creados exitosamente en esta sesión (parte 1)
Pese a los problemas anteriores, se lograron crear con éxito (evitando los campos con el bug del search-select):
- Cliente: "Cliente Prueba Scraping" (RNC 101036622)
- Proveedor: "Proveedor Prueba Scraping" (RNC 102173622, duplicado de otro proveedor existente)

No fue posible completar la creación de un Artículo (bloqueado por Categoría/search-select) ni de una Cotización (bloqueado por el selector de Cliente) de forma consistente por el bug 0.1.

---

## 0.7 Continuación — flujo completo de ventas y compras (segunda sesión, mismo día)

Usando como workaround forzar el foco del campo por código antes de escribir (`element.focus()` vía consola), se logró avanzar y probar el flujo completo **Cotización → Pedido → Factura**, además de Compras y Gastos.

### 0.7.1 El botón "Someter" de Cotización salta el estado intermedio
Se creó la cotización SAL-QTN-2026-00032 (Juan Perez, artículo "Bumper Honda Civic 9th", total RD$20,204.07) en estado `draft`. Al presionar **"Someter"**, el estado saltó directamente a **`ordered`** ("Cotización ordenada"), sin pasar por el estado `open`/"Sometido" (que representa una cotización enviada al cliente, pendiente de decisión, y que sí existe como opción de filtro en el listado). Esto sugiere que el botón "Someter" está conectado a la transición equivocada del flujo de estados.

### 0.7.2 "Tipo NCF" queda vacío aunque ya se asignó el NCF
Se creó el Pedido SAL-ORD-2026-00025 (estado "Borrador", correctamente traducido esta vez) y se facturó exitosamente generando la Factura ACC-SINV-2026-00058. Al "Someter" la factura, el sistema asignó automáticamente el NCF `B0200000047` — pero el campo **"TIPO NCF" se queda en "—" (vacío)**, pese a que el prefijo "B02" ya indica el tipo (Consumidor Final). Es un campo de solo-lectura que no se actualiza tras la asignación automática del NCF.

### 0.7.3 Inconsistencia de traducción confirmada entre módulos hermanos
En la misma sesión de pruebas: el detalle de Pedido mostró el badge "Borrador" (traducido) mientras que el detalle de Cotización y de Factura mostraron "draft"/"submitted" (sin traducir) para conceptos equivalentes — confirma que la traducción de estados es inconsistente incluso entre pantallas de detalle con el mismo diseño.

### 0.7.4 Checkboxes de selección de variantes no responden al click
**Dónde:** modal "Variantes — [artículo]" que aparece al agregar a un documento (Compra probada) un artículo tipo plantilla con variantes (ej. "Bolsa Tela" con variantes Black/Blue/Green/Red/White).
Al hacer click en el checkbox de una variante, este permanece sin marcar y el contador del botón de confirmación se queda en "Agregar (0) variante(s)" — es imposible seleccionar ninguna variante desde la UI con un click normal. Esto bloquea por completo la compra o venta de cualquier artículo con variantes.

### 0.7.5 Columna "Descripción" muestra el código en vez de una descripción real
**Dónde:** `/compras/nueva` (y posiblemente otros documentos con línea de artículos).
Al agregar "Caja de 12 pastillas" (código `PAS-0001`) a una compra, la columna "Descripción" de la línea quedó con el texto `PAS-0001` (el código) en lugar de una descripción del artículo.

### 0.7.6 Registros creados exitosamente (parte 2)
- Cotización SAL-QTN-2026-00032 → sometida (saltó a `ordered`, ver 0.7.1)
- Pedido SAL-ORD-2026-00025 (Juan Perez, "Caja de 12 pastillas", RD$200.00) → facturado
- Factura ACC-SINV-2026-00058 (RD$200.00) → sometida, NCF B0200000047 asignado
- Compra ACC-PINV-2026-00033 (Suplidor del Sur SRL, "Caja de 12 pastillas", RD$199.99) — quedó en `draft`, sin someter

### 0.7.7 BUG CRÍTICO: cierre de sesión inesperado al guardar un Gasto
**Dónde:** `/gastos/nuevo`
Se completó el formulario de Nuevo Gasto (Proveedor "Proveedor Prueba Scraping", artículo "Bumper Honda Civic 9th", precio RD$100.00, "Es deducible fiscalmente" marcado) y al presionar **"Guardar Borrador", la aplicación expulsó la sesión y redirigió a la pantalla de login** en vez de guardar el gasto o mostrar un error. No se pudo confirmar si el gasto se guardó parcialmente en el backend antes de la desconexión. Este es un comportamiento grave: un usuario puede perder su sesión activa (y potencialmente el trabajo no guardado en otras pestañas del sistema multipestañas) sin ninguna advertencia previa, al ejecutar una acción aparentemente rutinaria.

---

## 1. Errores de consola (React)

### 1.1 Keys duplicadas en listados de clientes (CRÍTICO)
**Dónde:** `/cobros/aging` (Aging CxC), `/cobros/semaforo` (Semáforo), y persiste en navegaciones posteriores (`/cuentas`, `/reportes/606`).
**Error:** `Encountered two children with the same key. Non-unique keys may cause children to be duplicated and/or omitted.` — se repite decenas de veces con los valores `Juan Perez`, `Test`, `Aldereca`, `Ryan Castro Felix`.
**Causa probable:** el `key` de las filas se está armando con el **nombre del cliente** en vez de un ID único de factura/documento. Como varios clientes tienen múltiples facturas pendientes, la key se repite.
**Riesgo:** React puede omitir o duplicar filas silenciosamente; en una pantalla de cobranza (Aging/Semáforo) esto puede ocultar saldos reales de un cliente.
**Acción sugerida:** usar el ID de factura/documento (o un compuesto `clienteId-facturaId`) como key.

---

## 2. Bugs funcionales / de datos

### 2.1 Aging CxC no calcula los rangos de antigüedad
**Dónde:** `/cobros/aging`
**Hallazgo:** en **las 31 filas** mostradas, las columnas `Corriente`, `0–30 días`, `31–60 días`, `61–90 días` y `+90 días` muestran `RD$0.00` sin excepción. Solo la columna `Total` tiene valores reales.
**Impacto:** el reporte de antigüedad de cuentas por cobrar —una de las herramientas clave de cobranza— es inutilizable tal como está: no permite distinguir facturas corrientes de vencidas por rango.

### 2.2 Semáforo de crédito: % de uso incorrecto cuando el límite es RD$0.00
**Dónde:** `/cobros/semaforo`
**Hallazgo:** cliente "Juan Perez" — Balance actual `RD$51,584.00`, Límite de crédito `RD$0.00`, pero "Uso del crédito" muestra `0.0%` (estado sí marcado correctamente como "Crítico").
**Problema:** matemáticamente, con límite 0 y balance > 0 el porcentaje de uso no puede ser 0% — es una división por cero mal manejada (debería mostrarse como "N/A", "Sin límite" o 100%+, no 0.0%).

### 2.3 Balance de proveedores siempre en RD$0.00
**Dónde:** `/proveedores`
**Hallazgo:** los 8 proveedores listados muestran `Balance: RD$0.00`, incluyendo "Suplidor del Sur SRL", que en `/compras` tiene facturas de compra por millones de pesos (ej. RD$5,800,000.00, RD$2,900,000.00, etc.) en estado `submitted`.
**Impacto:** el balance por pagar a proveedores no se está calculando/mostrando, lo que impide ver cuánto se les debe realmente.

### 2.4 Resumen de Gastos no coincide con el detalle
**Dónde:** `/gastos`
**Hallazgo:** las tarjetas "GASTOS DEDUCIBLES" y "GASTOS NO DEDUCIBLES" muestran `RD$0.00` ambas, pero la tabla debajo lista un gasto con `Deducible: Sí` y `TOTAL: RD$1,099.78`.
**Causa probable:** el resumen parece excluir gastos en estado `draft` (borrador), mientras la tabla sí los incluye — comportamiento inconsistente entre el resumen y el detalle.

### 2.5 Facturas con estado "Pendiente" pero saldo pendiente en RD$0.00
**Dónde:** `/facturas`
**Ejemplos:** ACC-SINV-2026-00056, 00054, 00046, 00030, 00008 — todas con `ESTADO = Pendiente` pero columna `Pendiente` (saldo) en `RD$0.00`.
**Problema:** si el saldo pendiente es 0, el estado debería ser "Pagado" (o el estado es correcto y el saldo mostrado está mal calculado). Es una contradicción entre dos columnas del mismo listado.

### 2.6 Reporte DGII 606 sin RNC del proveedor
**Dónde:** `/reportes/606`
**Hallazgo:** la columna "RNC / Cédula Proveedor" aparece **vacía en las 10 filas** visibles del período.
**Impacto:** es un reporte de cumplimiento fiscal (DGII); el RNC del proveedor es un campo obligatorio para la validez del reporte 606. Si el export a TXT también omite este dato, el archivo generado sería inválido ante la DGII.

### 2.7 "Devoluciones" duplica exactamente el contenido de "Notas de Crédito"
**Dónde:** `/devoluciones` vs `/notas-credito`
**Hallazgo:** ambos listados muestran las mismas 14 filas, con los mismos números de documento, montos y estados (Agotada/Parcialmente usada/Disponible/Borrador).
**Duda de producto:** si son conceptualmente lo mismo, tener dos entradas de menú separadas para la misma data es redundante y confuso para el usuario; si deberían ser distintos (p. ej. devolución física de mercancía vs. nota de crédito contable), falta diferenciación real entre ambos módulos.

### 2.8 Notas de Crédito: monto reembolsado no se muestra de forma consistente
**Dónde:** `/notas-credito`
**Hallazgo:** filas con estado "Parcialmente usada" a veces muestran `Reembolsada: RD$X` (ej. ACC-SINV-2026-00052, 00050) y otras veces no muestran ese dato (ej. 00040, 00036, 00025), aunque el estado es el mismo.

---

## 3. Inconsistencias de idioma / i18n (patrón recurrente en todo el sistema)

La UI está en español, pero los **valores de estado** que vienen del backend se muestran tal cual, en inglés, sin traducir. Además, en varios módulos las opciones del filtro (en español) **no contemplan** todos los valores reales de estado, por lo que ciertos registros no se pueden filtrar correctamente.

| Módulo | Estados vistos en la tabla (sin traducir) | Opciones del filtro (español) |
|---|---|---|
| Cotizaciones | `draft`, `ordered`, `open`, `expired` | Borrador, Sometido, Ordenado, Perdido, Cancelado |
| Pedidos | `to deliver`, `to deliver and bill`, `completed` (además de "Borrador" sí traducido) | Borrador, En Proceso, Cancelado |
| Facturas | `return` | Todos, Borrador, Sometido, Cancelado |
| Compras | `submitted`, `draft` | Todos, Borrador, Sometido, Anulado |
| Gastos | `draft` | Todos, Borrador, Sometido, Anulado |
| Cobros | `submitted`, `draft`, método de pago `Cash` | Todos los estados, Borrador, Sometido, Cancelado |

**Impacto:** además de la inconsistencia visual (mezcla ES/EN), los filtros de estado no cubren `open`, `expired`, `return`, `to deliver`, `to deliver and bill`, `completed` — es decir, el usuario no puede filtrar por varios de los estados que sí existen en los datos.

También se observó "Raíz"/tipo de cuenta en `/cuentas` con valores en inglés (`Tax`, `Payable`, `Equity`, `Bank`, `Chargeable`, `Cost of Goods Sold`, `Fixed Asset`, `Capital Work in Progress`, `Temporary`, `Customer Advances`) mezclados con nombres de cuenta en español — mismo patrón de datos semilla en inglés sin traducir en la capa de presentación.

---

## 4. Problemas de UI / navegación

### 4.1 Pestañas del sistema multipestañas muestran la ruta cruda
**Dónde:** barra superior de tabs (sistema "multipestañas" de la app).
**Hallazgo:** al entrar a `/inventario/articulos`, la pestaña abierta se etiqueta literalmente `/inventario/articulos` en vez de un título legible como "Artículos". Esa pestaña con el path crudo permanece visible en la barra incluso después de navegar a otras secciones (Compras, Gastos, Proveedores, etc.), acumulándose junto a las demás pestañas correctamente tituladas (Dashboard, Clientes, Cotizaciones, Pedidos, Facturas...).
**Impacto:** cosmético pero visible constantemente en la navegación; también sugiere que hay al menos una ruta cuyo componente no está registrando un título de pestaña.

### 4.2 Acumulación de pestañas sin cierre automático
Se observó que cada sección visitada abre una pestaña nueva en la barra superior (Dashboard, Clientes, Cotizaciones, Pedidos, Facturas, Notas de Crédito, Notas de Débito, Devoluciones, /inventario/articulos, Compras, Gastos, Proveedores, Cobros, Aging CxC, Semáforo, Plan de Cuentas, Reporte 606, Empresa...) sin límite aparente. En una sesión de uso real esto puede saturar la barra de navegación rápidamente.

---

## 5. Observaciones menores

- **Facturas de tipo "return" con montos negativos** conviven en la misma tabla que facturas normales — es un diseño válido, pero al no traducirse el estado (`return`) y no tener color/ícono diferenciado claro en el texto plano, es fácil de pasar por alto.
- **NCF mostrado como solo el prefijo** (`B02`, `B04`) en facturas en borrador, vs. el número completo (`B0200000046`) en facturas ya emitidas — parece intencional (aún no se asigna secuencia), pero conviene confirmarlo.
- **Config → Empresa**: el warehouse "Almacén de Tránsito" indica *"No hay ningún almacén de tipo 'Tránsito' todavía"*, y el selector de almacén por defecto lista la opción **"Las mercancías en tránsito"** con un artículo ("Las") que no encaja con el resto de opciones (nombres propios sin artículo) — inconsistencia menor de redacción.
- **Categorías/marcas de artículos** mezclan datos de prueba en español e inglés (`Consumable`, `Raw Material`, `Services`, `Sub Assemblies` vs. `otra otra prueba`, `hija`, `testing`) — dato de entorno de pruebas, no necesariamente un bug de código, pero contamina la demo.

---

## Resumen priorizado

| Prioridad | Hallazgo |
|---|---|
| **Crítica** | El componente compartido de "search-select" (selector de Cliente/Proveedor/Artículo/Categoría/Marca/UDM) falla al abrir, al seleccionar opciones y al corregir texto — bloquea la creación de Cotizaciones, Pedidos, Facturas, Compras y Artículos con categoría |
| Alta | Aging CxC no calcula ningún rango de antigüedad (todo en RD$0.00) |
| Alta | Reporte DGII 606 sin RNC del proveedor (riesgo de cumplimiento) |
| Alta | Keys duplicadas en React (Aging/Semáforo) — riesgo de filas ocultas/duplicadas |
| Alta | Campos de texto (RNC, search-select) quedan congelados sin poder editarse/borrarse tras un error, sin salida salvo recargar la página |
| Media | Balance de proveedores siempre RD$0.00 pese a compras millonarias registradas |
| Media | Estados de documentos sin traducir y filtros que no cubren todos los estados reales (Cotizaciones, Pedidos, Facturas, Compras, Gastos, Cobros) |
| Media | Facturas "Pendiente" con saldo RD$0.00 (contradicción de datos) |
| Media | % de uso de crédito mal calculado cuando el límite es RD$0.00 |
| Media | Bug de layout responsivo en "Nuevo Artículo" a ~812px de ancho (columna ilegible) |
| Media | Sin validación de unicidad de RNC en Proveedores |
| Media | Sin retroalimentación visible cuando falla la validación de un campo requerido (ej. Categoría en Artículos) |
| Baja | "Devoluciones" duplica el listado de "Notas de Crédito" sin diferenciación aparente |
| Baja | Resumen de Gastos no coincide con el detalle (excluye borradores) |
| Baja | Pestaña con ruta cruda `/inventario/articulos` en vez de título legible |
| Baja | Monto "Reembolsada" no se muestra en todas las notas de crédito parcialmente usadas |
| Baja | Campo RNC no muestra asterisco de obligatorio pese a ser requerido para clientes tipo Empresa |
