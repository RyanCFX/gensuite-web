# TAREAS.md — Frontend ERP RD

Lista completa de tareas pendientes para implementar el frontend del ERP. Ordenadas por prioridad y dependencia.

**API base:** `https://gensapi.ryancfx.click/api/v1`  
**Docs interactivos:** `https://gensapi.ryancfx.click/api/docs`

---

## FASE 1 — Infraestructura Base (Hacer primero — todo depende de esto)

### T-01 · Cliente HTTP con Interceptores

**Archivo:** `src/api/client.ts`

```typescript
// Axios instance que agrega automáticamente:
// - Authorization: Bearer <token>
// - X-Tenant: <slug>
// - Content-Type: application/json
```

- [ ] Crear instancia Axios con `baseURL = VITE_API_BASE_URL`
- [ ] Interceptor de request: agregar `Authorization` y `X-Tenant` desde el store
- [ ] Interceptor de response: extraer `data.data` automáticamente (unwrap)
- [ ] Interceptor de error: si `401` → limpiar token y redirigir a `/login`
- [ ] Interceptor de error: transformar `{ success: false, error: {...} }` en `Error` con `code` y `message`
- [ ] Manejo de rate-limit (`429`): mostrar toast con "Demasiadas solicitudes, espera un momento"

---

### T-02 · Autenticación — Auth Store + Login

**Endpoint:** `POST /auth/login`  
**Body:** `{ email, password }` + header `X-Tenant: tenant1`

- [ ] `src/stores/auth.store.ts` — Zustand store con:
  - `token: string | null`
  - `user: { email, fullName, roles }  | null`
  - `tenantSlug: string`
  - `login(email, password) → Promise<void>`
  - `logout() → void`
  - `isAuthenticated: boolean`
  - Persistencia en `localStorage` (o `sessionStorage`)
- [ ] Página de login `src/features/auth/LoginPage.tsx`:
  - Form: email + password
  - El `tenantSlug` puede ser hardcoded en `.env` para MVP (`VITE_TENANT_SLUG=tenant1`)
  - Al login exitoso → guardar token → redirigir a `/dashboard`
  - Mostrar error si credenciales inválidas
- [ ] `ProtectedRoute` wrapper — redirige a `/login` si no hay token
- [ ] Auto-logout cuando el token expira (JWT `exp` = 8 horas)

---

### T-03 · Layout Principal

- [ ] `src/components/layout/AppLayout.tsx` — Sidebar + Header + `<Outlet />`
- [ ] **Sidebar** con navegación completa:
  1. Dashboard
  2. Clientes
  3. Catálogo (submenú: Categorías, Marcas, Artículos)
  4. Cotizaciones
  5. Facturación (submenú: Facturas, Notas de Crédito, Notas de Débito)
  6. Inventario (submenú: Stock, Historial, Conteos)
  7. Compras
  8. Gastos
  9. Proveedores
  10. Cuentas por Cobrar (submenú: Aging, Semáforo, Cobros)
  11. Usuarios
  12. Reportes (submenú: DGII, Financiero, Inventario)
  13. Configuración
- [ ] **Header** con: nombre de la empresa (desde `/config/empresa`), avatar/email del usuario, botón logout
- [ ] Indicador de carga global (barra de progreso en top)
- [ ] Sistema de notificaciones (Sonner/toast para éxitos y errores)

---

### T-04 · Componentes Compartidos

- [ ] `<DataTable>` — tabla con columnas, paginación server-side, sorting, loading skeleton
- [ ] `<Pagination>` — controles de página con `limit`, `offset`, `total`
- [ ] `<SearchInput>` — input debounced (300ms) para búsqueda textual
- [ ] `<StatusBadge status="draft|submitted|cancelled">` — badge con colores
- [ ] `<CurrencyDisplay amount={n}>` — formatea en RD$ con separadores
- [ ] `<DateDisplay date="iso">` — formatea en DD/MM/YYYY zona horaria Santo Domingo
- [ ] `<EmptyState>` — ilustración + mensaje para listas vacías
- [ ] `<ConfirmDialog>` — modal de confirmación para acciones destructivas
- [ ] `<FormError>` — muestra errores del BFF en los formularios
- [ ] `<LoadingSkeleton>` — placeholder para tablas y formularios
- [ ] `<DocumentActions>` — toolbar con botones según estado del documento:
  - Draft: Editar, Someter, Eliminar
  - Submitted: Cancelar, Descargar PDF
  - Cancelled: Enmendar
- [ ] `<SemaforoIndicator color="verde|amarillo|rojo">` — indicador visual de crédito

---

### T-05 · Validadores DGII

**Archivo:** `src/lib/validators/dgii.ts`

- [ ] `validateRNC(value: string): boolean` — 9 dígitos, módulo 11 DGII
- [ ] `validateCedula(value: string): boolean` — 11 dígitos, módulo 10 JCE
- [ ] `validateNCFFormat(value: string): boolean` — `[BE]\d{10}`
- [ ] Decoradores Zod para usar en React Hook Form:
  ```typescript
  z.string().refine(validateRNC, 'RNC inválido')
  z.string().refine(validateCedula, 'Cédula inválida')
  ```
- [ ] Formateador de RNC: `130-12345-6` (guiones estéticos, solo visual)
- [ ] Formateador de cédula: `001-0010000-1`

---

### T-06 · Constantes y Tipos

**Archivo:** `src/lib/constants.ts`

- [ ] Tipos de NCF: `{ value: 'B01', label: 'Crédito Fiscal' }[]`
- [ ] Tipos bienes 606: `{ value: '01 - Gastos de Personal', label: '01 - Gastos de Personal' }[]`
- [ ] Formas de pago 606: `{ value: '01 - Efectivo', label: '01 - Efectivo' }[]`
- [ ] Estados de documentos con colores
- [ ] Tipos de identificación: RNC, Cédula, Pasaporte, NIT
- [ ] Regímenes fiscales: Ordinario, Simplificado, RST
- [ ] Roles ERPNext más comunes: Accounts User, Sales User, etc.

**Archivo:** `src/types/api.types.ts`

- [ ] Interfaces TypeScript para todas las entidades (Customer, Invoice, Supplier, etc.) — ver sección 9 del FRONTEND_CONTEXT.md

---

## FASE 2 — Dashboard

### T-07 · Dashboard — Pantalla Principal

**Endpoint:** `GET /dashboard/summary?period=month`

- [ ] Selector de período: Hoy / 7 días / Este mes / Este año
- [ ] **Tarjetas KPI** (4 tarjetas principales):
  - 💰 Total Ventas del período
  - 🛒 Total Compras del período
  - ✅ Total Cobrado
  - ⚠️ Saldo Pendiente (CxC)
- [ ] **Gráfico de ventas** (área o línea) — etiquetas del eje X según período
- [ ] **Top 5 Artículos** — tabla con producto, cantidad, monto
- [ ] **Top 5 Clientes** — tabla con cliente, # facturas, monto
- [ ] **Actividad Reciente** — feed de últimas transacciones con tipo, descripción, monto y fecha

**Endpoints adicionales:**
- `GET /dashboard/top-products?period=month&limit=5`
- `GET /dashboard/top-customers?period=month&limit=5`
- `GET /dashboard/recent-activity?limit=10`

---

## FASE 3 — Módulos Principales

### T-08 · Clientes — CRUD Completo

**Base:** `/customers`

**Lista (`GET /customers`):**
- [ ] Tabla con columnas: Nombre, RNC/Cédula, Tipo, Tiene Crédito, Acciones
- [ ] Filtros: búsqueda por nombre/RNC, toggle "mostrar desactivados"
- [ ] Paginación server-side
- [ ] Botón "Nuevo Cliente"

**Formulario Crear/Editar (`POST /customers`, `PUT /customers/:id`):**
- [ ] Campos: Nombre, Tipo (Empresa/Individual), Tipo Identificación (Select)
- [ ] Campo RNC — visible si tipo = Empresa/RNC; validación DGII en tiempo real
- [ ] Campo Cédula — visible si tipo = Individual/Cédula; validación JCE en tiempo real
- [ ] Fecha de nacimiento (solo Individual)
- [ ] Toggle "Es Gobierno" — habilita NCF B15
- [ ] Toggle "Tiene Crédito" — muestra campos: Límite de Crédito, Días de Crédito
- [ ] Email para facturas
- [ ] Guardar y mostrar toast de éxito/error

**Detalle (`GET /customers/:id`):**
- [ ] Vista de perfil con todos los campos
- [ ] Indicador del semáforo de crédito (llama a `GET /cobros/semaforo/:customerId`)
- [ ] Historial de facturas del cliente (llama a `GET /invoices?customer=:id`)
- [ ] Botón Editar / Desactivar

---

### T-09 · Catálogo — Categorías, Marcas, Artículos

#### Categorías (`/catalog/categories`)
- [ ] Vista de árbol (llamar con `?tree=true`) con expansión/colapso
- [ ] Formulario crear/editar: nombre, categoría padre
- [ ] Botón eliminar con confirmación

#### Marcas (`/catalog/brands`)
- [ ] Tabla con filtro por categoría
- [ ] Formulario: nombre, descripción, categoría asociada

#### Artículos (`/catalog/items`)
- [ ] Tabla con filtros: categoría, marca, tipo (producto/servicio), estado
- [ ] Badge de stock: 🟢 En stock / 🟡 Stock bajo / 🔴 Sin stock
- [ ] Formulario crear/editar:
  - Código, nombre, tipo (producto/servicio)
  - Categoría (selector), Marca (selector)
  - Precio de venta, descripción
  - Si es producto: campo warehouse por defecto
- [ ] Toggle activo/inactivo (`POST /catalog/items/:id/toggle`)
- [ ] Detalle con stock actual por almacén

---

### T-10 · Cotizaciones

**Base:** `/quotations`

- [ ] Lista con filtros: cliente, estado, rango de fechas
- [ ] Formulario crear cotización:
  - Selector de cliente
  - Fecha y válida hasta (default: +15 días)
  - Tabla de ítems: agregar/eliminar filas (itemCode, descripción, qty, rate, UOM)
  - Total calculado localmente
  - Campo de notas
- [ ] Detalle con acciones según estado:
  - Draft → Someter (`POST /quotations/:id/submit`)
  - Draft → Eliminar
  - Submitted → Convertir en Factura (`POST /quotations/:id/convert?ncfType=B02`)
  - Dialog para seleccionar tipo NCF al convertir
- [ ] Vista previa del total (líneas + impuestos estimados)

---

### T-11 · Facturación

**Base:** `/invoices`, `/credit-notes`, `/debit-notes`

#### Facturas
- [ ] Lista con filtros: cliente, estado, estado de pago, tipo NCF, rango de fechas
- [ ] Filtro rápido: "Vencidas hoy", "Sin cobrar"
- [ ] Columnas: #, Cliente, Fecha, NCF, Total, Pendiente, Estado, Acciones
- [ ] Formulario crear factura:
  - Selector de cliente (con búsqueda)
  - Fecha, fecha de vencimiento
  - Selector de tipo NCF (B01/B02/B14/B15/B16)
  - Tabla de ítems igual que cotización
  - Notas
- [ ] Detalle:
  - Todos los campos + desglose de ITBIS
  - Draft → Botón "Someter Factura" (muestra advertencia de acción irreversible)
  - Submitted → Botón "Descargar PDF" (abre en nueva pestaña)
  - Submitted → Botón "Cancelar" (con confirmación)
  - Cancelled → Botón "Enmendar"
- [ ] Descarga PDF: `GET /invoices/:id/pdf`

#### Notas de Crédito (`/credit-notes`)
- [ ] Lista con columna "Factura Original"
- [ ] Formulario: factura original (selector de facturas submitted), fecha, ítems a devolver, motivo
- [ ] Los ítems se muestran en negativo (devolución)
- [ ] Acción Someter → asigna NCF B04

#### Notas de Débito (`/debit-notes`)
- [ ] Lista
- [ ] Formulario: cliente, fecha, ítems (cargo adicional)
- [ ] NCF B03 — se asigna al someter

---

### T-12 · Inventario

**Base:** `/inventory`

#### Stock Actual (`GET /inventory`)
- [ ] Tabla: Código, Nombre, Almacén, Stock, Costo Unit., Precio Venta, Inversión, Valor, Ganancia
- [ ] Filtros: almacén (selector), categoría, marca, estado de stock
- [ ] Ordenar por: Inversión, Valor, Ganancia potencial
- [ ] Tarjeta resumen arriba: Inversión Total, Valor Total, Ganancia Potencial (`GET /inventory/summary`)
- [ ] Selector de almacén (llama `GET /inventory/warehouses`)

#### Historial de Movimientos (`GET /inventory/history`)
- [ ] Tabla: Artículo, Almacén, Movimiento (+/-), Stock resultante, Tipo Doc, # Doc, Fecha
- [ ] Filtros: almacén, tipo voucher, rango de fechas
- [ ] Ver historial específico de un artículo: `GET /inventory/history/:itemCode`

#### Conteos Físicos (`/inventory/counts`)
- [ ] Lista de conteos con estado (Draft/Submitted)
- [ ] Botón "Nuevo Conteo":
  1. Seleccionar almacén → cargar plantilla (`GET /inventory/counts/template?warehouse=`)
  2. Tabla editable con stock actual vs contado — usuario ingresa `countedQty`
  3. Guardar como Draft (`POST /inventory/counts`)
  4. Confirmar conteo (muestra advertencia: ajusta inventario) → `POST /inventory/counts/:id/submit`

---

### T-13 · Compras

**Base:** `/compras`

- [ ] Lista con filtros: proveedor, estado, tipo comprobante, fechas
- [ ] Columnas: #, Proveedor, Fecha, NCF Proveedor, Total, Tipo 606, Estado
- [ ] Formulario crear compra:
  - Proveedor (selector con búsqueda)
  - Fecha, fecha de vencimiento
  - Tabla de ítems: código, cant., precio, almacén destino
  - **Sección 606** (con tooltip explicativo):
    - NCF del Proveedor (validar formato si no es exterior)
    - Tipo de bienes/servicios (Select 01-13)
    - Forma de pago 606 (Select 01-08)
    - Tipo de pago: Contado/Crédito
    - Retención ITBIS (opcional)
    - Retención ISR (opcional)
  - Checkbox "Actualizar precios de artículos"
- [ ] Detalle con acciones: Someter (valida 606), Cancelar, Enmendar
- [ ] Someter: mostrar modal de confirmación con lista de campos 606 a revisar
- [ ] Devolución (`POST /compras/:id/return`): modal para seleccionar ítems y cantidades

---

### T-14 · Gastos

**Base:** `/gastos`

- [ ] Tarjeta resumen del mes — deducibles vs no deducibles (`GET /gastos/resumen?month=2026-06`)
- [ ] Lista con filtros: proveedor, estado, tipo comprobante, categoría, es deducible, fechas
- [ ] Formulario crear gasto:
  - Igual que compras pero **sin campo almacén** en ítems
  - Tipo de comprobante adicional: B17 (Gastos Menores ≤ RD$50)
  - **Categoría del gasto**: Operativo / Administrativo / Ventas / Financiero
  - Checkbox "Es Deducible (ISR)"
  - Validación B17: si tipo = B17, total debe ser ≤ RD$50 (mostrar error en tiempo real)
- [ ] Gráfico de gastos por categoría del mes (donut chart)

---

### T-15 · Proveedores

**Base:** `/suppliers`

- [ ] Lista con balance pendiente, filtros: grupo, exterior, búsqueda
- [ ] Formulario crear/editar:
  - Nombre, tipo (Empresa/Individual)
  - RNC o Cédula según tipo (con validación)
  - Toggle "Proveedor del Exterior" — oculta campo NCF en compras/gastos
  - Tipo proveedor 606: Local / Exterior / Gubernamental
  - Datos bancarios: Banco, # Cuenta, Tipo Cuenta, ABA/SWIFT
  - Días de crédito, Email para pagos
- [ ] Detalle: datos del proveedor + historial de facturas (`GET /suppliers/:id/purchases`)
- [ ] Balance pendiente con este proveedor

---

### T-16 · Usuarios

**Base:** `/usuarios`, `/roles`

- [ ] Lista de usuarios con badge de estado (activo/inactivo), roles, último acceso
- [ ] Formulario crear usuario:
  - Email, nombre, apellido, teléfono
  - Selector de roles (carga `GET /roles` — lista los disponibles en ERPNext)
  - Idioma (es por defecto), zona horaria
  - Checkbox "Enviar email de bienvenida"
- [ ] Editar usuario: actualizar nombre/teléfono/roles
- [ ] Desactivar usuario: `DELETE /usuarios/:email` (con confirmación)
- [ ] Reactivar: `POST /usuarios/:email/enable`
- [ ] Reset password: `POST /usuarios/:email/reset-password` (muestra toast "Email enviado")

---

### T-17 · Cuentas por Cobrar

**Base:** `/cobros`

#### Facturas Pendientes (`GET /cobros/pendientes`)
- [ ] Tabla: Cliente, Factura, Fecha, Vence, Total, Pendiente, Días Vencida
- [ ] Filtros: cliente específico, toggle "Solo vencidas"
- [ ] Resaltar en rojo las vencidas
- [ ] Botón "Registrar Cobro" por fila

#### Aging de Cartera (`GET /cobros/aging`)
- [ ] Tabla con rangos (0-30, 31-60, 61-90, +90 días)
- [ ] Total pendiente por cliente
- [ ] Filtro por cliente

#### Semáforo de Crédito (`GET /cobros/semaforo/:customerId`)
- [ ] Indicador visual en pantalla de detalle de cliente
- [ ] Verde: dentro del límite
- [ ] Amarillo: > 80% del límite
- [ ] Rojo: > 100% del límite (bloqueado)
- [ ] Mostrar: balance actual, límite, % usado, balance vencido

#### Registrar Cobro (`POST /cobros`)
- [ ] Modal o página de cobro:
  - Cliente (selector)
  - Monto a cobrar
  - Cuenta destino (selector de cuentas bancarias/cajas de ERPNext — `GET /config/metodos-pago`)
  - Método de pago (Efectivo RD, Cheque, Tarjeta, etc.)
  - Referencia (# cheque, transferencia)
  - Fecha de referencia
  - Tabla de facturas pendientes: seleccionar cuánto asignar a cada factura
  - Total asignado vs monto cobrado (debe coincidir)
- [ ] Someter cobro (`POST /cobros/:id/submit`)

---

### T-18 · Reportes

**Base:** `/reportes`

- [ ] Layout de reportes: selector en sidebar, área de parámetros arriba, resultados abajo
- [ ] `<ReportViewer columns={[]} rows={[]} />` — componente genérico de tabla de reporte
- [ ] Exportar a CSV (client-side con `papaparse` o similar)

#### Reportes a implementar:
- [ ] **Ventas** (`GET /reportes/ventas`) — filtros: fechas, cliente, artículo
- [ ] **P&L** (`GET /reportes/ingresos-egresos`) — filtros: período, periodicidad
- [ ] **Balance General** (`GET /reportes/balance-general`) — filtros: fecha, periodicidad
- [ ] **Valoración de Stock** (`GET /reportes/inventario/valoracion`) — filtros: almacén, artículo, fecha
- [ ] **Movimientos de Stock** (`GET /reportes/inventario/movimientos`) — filtros: fechas, almacén
- [ ] **CxC Aging** (`GET /reportes/cxc/aging`) — tabla de antigüedad
- [ ] **Cuadre de Caja** (`GET /reportes/caja/cuadre`) — filtro: fecha
- [ ] **DGII 606** (`GET /reportes/dgii/606?year=&month=`) — botón "Descargar TXT" (si disponible)
- [ ] **DGII 607** (`GET /reportes/dgii/607?year=&month=`)
- [ ] **DGII 608** (`GET /reportes/dgii/608?year=&month=`)
- [ ] Mensaje claro cuando 606/607/608 devuelve 503 (dgii-compliance no instalado)

---

### T-19 · Configuración

**Base:** `/config`

#### Empresa (`GET/PUT /config/empresa`)
- [ ] Formulario con campos fiscales: RNC, Régimen Fiscal, Actividad Económica
- [ ] Datos del Representante Legal: nombre, cédula
- [ ] Contacto: teléfono, email, website, dirección
- [ ] URL del logo
- [ ] Guardar cambios

#### Configuración de Cobranza (`GET/PUT /config/cobros`)
- [ ] Sliders o inputs para: límite amarillo (%), límite rojo (%)
- [ ] Días de alerta pre-vencimiento
- [ ] Rangos de aging (días para cada rango)
- [ ] Toggle: recordatorios automáticos

#### Métodos de Pago (`GET/POST/PUT /config/metodos-pago`)
- [ ] Lista de métodos existentes (8 estándar 606 + custom)
- [ ] Formulario crear: nombre, tipo (Cash/Bank/General)
- [ ] Editar tipo de un método existente

#### Almacenes (`GET/POST/PUT/DELETE /config/almacenes`)
- [ ] Lista de almacenes con tipo
- [ ] Formulario crear: nombre, tipo, ciudad, almacén padre
- [ ] Desactivar almacén

#### Unidades de Medida (`GET/POST /config/uom`)
- [ ] Lista filtrable de UOMs (hay 200+)
- [ ] Crear UOM personalizada

#### Listas de Precio (`GET/POST /config/listas-precio`)
- [ ] Lista con moneda, venta/compra
- [ ] Crear lista: nombre, moneda, tipo

#### Grupos (`GET/POST /config/grupos-clientes`, `/config/grupos-proveedores`)
- [ ] Listas de grupos existentes
- [ ] Agregar nuevo grupo

#### Secuencias NCF (`GET /config/ncf`)
- [ ] Mostrar mensaje explicativo si devuelve 503 (dgii-compliance no instalado)
- [ ] Si está disponible: tabla con tipo, inicio, fin, siguiente, vencimiento

#### Perfil (`GET/PUT /config/perfil`)
- [ ] Formulario con nombre, apellido, teléfono, idioma

---

## FASE 4 — Flujos Transversales

### T-20 · Manejo de Estados de Documentos

Todos los módulos que tienen documentos (facturas, compras, gastos, cotizaciones, etc.) comparten el mismo ciclo:

- [ ] Implementar hook `useDocumentLifecycle({ doctype, id, status })`
- [ ] Mostrar botones correctos según estado:
  - `draft`: Editar, Someter, Eliminar
  - `submitted`: Ver PDF (si aplica), Cancelar
  - `cancelled`: Enmendar
- [ ] Confirmaciones con descripción del impacto:
  - Someter: "Esta acción asigna el NCF y registra asientos contables. No se puede deshacer directamente."
  - Cancelar: "Esta acción cancela el comprobante fiscal. Requiere una enmienda para corregir."
  - Eliminar: "Se eliminará el borrador. Esta acción no se puede deshacer."

---

### T-21 · Buscadores / Selectores Relacionados

Muchos formularios requieren buscar una entidad relacionada (cliente, artículo, proveedor):

- [ ] `<CustomerSelect>` — busca en `GET /customers?search=` con debounce
- [ ] `<ItemSelect>` — busca en `GET /catalog/items?search=`
- [ ] `<SupplierSelect>` — busca en `GET /suppliers?search=`
- [ ] `<WarehouseSelect>` — carga `GET /inventory/warehouses` (lista fija)
- [ ] `<MetodoPagoSelect>` — carga `GET /config/metodos-pago`
- [ ] `<NcfTypeSelect>` — Select estático con opciones B01/B02/etc.
- [ ] `<Tipo606Select>` — Select estático para tipo bienes/servicios 606
- [ ] `<FormaPago606Select>` — Select estático para formas de pago 606

---

### T-22 · Tabla de Ítems de Documentos (Reutilizable)

Usado en: Facturas, Cotizaciones, Compras, Gastos, Notas C/D, Conteos.

- [ ] Componente `<ItemsTable items={[]} onChange={} readonly={false} />`
- [ ] Agregar fila con selector de artículo
- [ ] Editar qty, rate, UOM por fila
- [ ] Calcular amount = qty × rate en tiempo real
- [ ] Eliminar fila
- [ ] Total, subtotal, ITBIS estimado (18%) al pie de la tabla
- [ ] Versión readonly para vistas de detalle

---

### T-23 · PDF de Facturas

- [ ] Botón "Ver PDF" en detalle de factura submitted → `GET /invoices/:id/pdf`
- [ ] Abrir en nueva pestaña: `window.open(url, '_blank')`
- [ ] O descargar: `<a href={url} download>Descargar PDF</a>`
- [ ] Manejar error si el print format "Factura RD" no está configurado

---

### T-24 · Indicador de Semáforo de Crédito

Usado en: detalle de cliente, creación de factura (al seleccionar cliente).

- [ ] Al seleccionar un cliente en un formulario de factura → auto-llamar `GET /cobros/semaforo/:id`
- [ ] Mostrar badge: 🟢 OK / 🟡 Cerca del límite / 🔴 Límite excedido
- [ ] Si rojo → advertencia: "Este cliente ha superado su límite de crédito (RD$ X de RD$ Y)"
- [ ] No bloquear la creación (es advertencia, no error)

---

## FASE 5 — Calidad y UX

### T-25 · Loading y Error States

- [ ] Skeleton loaders en todas las tablas (mientras carga)
- [ ] Error boundary para errores inesperados
- [ ] Estado vacío para listas sin datos (con CTA para crear)
- [ ] Mensajes de error en español (mapear códigos de error del BFF)
- [ ] Reintentar automáticamente si falla la conexión

### T-26 · Responsividad

- [ ] Sidebar colapsable en mobile
- [ ] Tablas con scroll horizontal en pantallas pequeñas
- [ ] Formularios de una columna en mobile, dos columnas en desktop
- [ ] Dashboard KPIs en grid adaptable

### T-27 · Accesibilidad

- [ ] Labels en todos los inputs
- [ ] Mensajes de error accesibles (aria-describedby)
- [ ] Tablas con scope en headers
- [ ] Foco visible en navegación por teclado

---

## Resumen de Dependencias entre Tareas

```
T-01 (cliente HTTP)
  └─ T-02 (auth)
      └─ T-03 (layout)
          ├─ T-04 (componentes compartidos)
          │   └─ T-05 (validadores DGII)
          ├─ T-07 (dashboard)
          ├─ T-08 (clientes) ←── T-21 (selectores)
          ├─ T-09 (catálogo) ←── T-22 (tabla ítems)
          ├─ T-10 (cotizaciones) ←── T-22 + T-21
          ├─ T-11 (facturación) ←── T-22 + T-21 + T-23 + T-24
          ├─ T-12 (inventario)
          ├─ T-13 (compras) ←── T-22
          ├─ T-14 (gastos) ←── T-22
          ├─ T-15 (proveedores)
          ├─ T-16 (usuarios)
          ├─ T-17 (cuentas por cobrar)
          ├─ T-18 (reportes)
          └─ T-19 (configuración)
```

---

## Notas Técnicas Importantes

### Paginación

```typescript
// El BFF usa offset (no número de página)
// Para ir a la página N con limit L:
const offset = (page - 1) * limit

// Calcular total de páginas:
const totalPages = Math.ceil(total / limit)
```

### Formato de Fechas

```typescript
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'

const formatDate = (isoDate: string) =>
  format(toZonedTime(parseISO(isoDate), 'America/Santo_Domingo'), 'dd/MM/yyyy', { locale: es })
```

### Formato de Moneda

```typescript
const formatDOP = (amount: number) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(amount)
// → "RD$1,500.00"
```

### Manejo de Errores del BFF

```typescript
// El BFF siempre devuelve { success: false, error: { code, message, statusCode } }
// Mapeo de códigos a mensajes de usuario:
const errorMessages: Record<string, string> = {
  UNAUTHORIZED: 'Sesión expirada. Por favor inicia sesión nuevamente.',
  TENANT_MISMATCH: 'Error de autenticación. Recarga la página.',
  NOT_FOUND: 'El recurso solicitado no existe.',
  CONFLICT: 'No se puede realizar esta operación. El documento puede estar en uso.',
  BAD_REQUEST: 'Datos inválidos. Revisa el formulario.',
  SERVICE_UNAVAILABLE: 'Esta función no está disponible. Contacta al administrador.',
}
```

### React Query — Configuración Base

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 minutos
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Invalidar queries después de mutations:
// Ej: después de crear cliente, invalidar lista
queryClient.invalidateQueries({ queryKey: ['customers'] })
```

### Refresh Token

- El JWT dura **8 horas** (`expires_in: 28800`).
- No hay endpoint de refresh token en el BFF.
- Al expirar → logout automático + redirigir a `/login`.
- Estrategia recomendada: decodificar el JWT (sin verificar firma) para obtener `exp`, y hacer logout proactivo 5 minutos antes.

---

## Estado Actual del Backend (Referencia Rápida)

| Módulo | API disponible | Paths |
|--------|---------------|-------|
| Auth | ✅ | POST /auth/login |
| Dashboard | ✅ | GET /dashboard/{summary,top-products,top-customers,recent-activity} |
| Clientes | ✅ | CRUD completo |
| Catálogo | ✅ | Categorías + Marcas + Artículos |
| Cotizaciones | ✅ | CRUD + submit + convert |
| Facturas | ✅ | CRUD + submit/cancel/amend/pdf |
| Notas C/D | ✅ | credit-notes + debit-notes |
| Inventario | ✅ | stock + historial + conteos |
| Compras | ✅ | CRUD + submit/cancel/amend/return |
| Gastos | ✅ | CRUD + submit/cancel/amend + resumen |
| Proveedores | ✅ | CRUD |
| Usuarios | ✅ | CRUD + roles |
| CxC | ✅ | pendientes + aging + semáforo + cobros |
| Reportes | ✅ | 10 reportes (DGII requiere dgii-compliance) |
| Configuración | ✅ | empresa + cobros + almacenes + UOM + etc. |
| **Total** | **88 endpoints** | `https://gensapi.ryancfx.click/api/docs-json` |

> DGII 606/607/608 devuelven **503** hasta que se instale `dgii-compliance` en ERPNext.  
> El frontend debe mostrar un mensaje amigable en ese caso.
