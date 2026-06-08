# FRONTEND_CONTEXT.md — ERP RD (Backend-for-Frontend)

> **Documento completo de contexto para construir el frontend del ERP localizado para República Dominicana.**
>
> **API Base URL:** `https://gensapi.ryancfx.click/api/v1`
> **OpenAPI JSON:** `https://gensapi.ryancfx.click/api/docs-json`
> **Scalar Docs UI:** `https://gensapi.ryancfx.click/api/docs`
> **Health check:** `https://gensapi.ryancfx.click/health`

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Autenticación y Seguridad](#3-autenticación-y-seguridad)
4. [Formato Universal de Respuesta](#4-formato-universal-de-respuesta)
5. [Formato Universal de Error](#5-formato-universal-de-error)
6. [Paginación](#6-paginación)
7. [Multitenancy (X-Tenant)](#7-multitenancy-x-tenant)
8. [Mapa de Endpoints por Módulo](#8-mapa-de-endpoints-por-módulo)
9. [Modelos de Datos (Entidades)](#9-modelos-de-datos-entidades)
10. [Reglas de Negocio Especiales](#10-reglas-de-negocio-especiales)
11. [Validaciones DGII (RNC/Cédula)](#11-validaciones-dgii-rnccédula)
12. [Estados de Documentos](#12-estados-de-documentos)
13. [Ciclo de Vida de Documentos Fiscales](#13-ciclo-de-vida-de-documentos-fiscales)
14. [Códigos de Error](#14-códigos-de-error)
15. [Convenciones de Navegación y UI](#15-convenciones-de-navegación-y-ui)
16. [Módulos Futuros / No Implementados](#16-módulos-futuros--no-implementados)

---

## 1. Visión General

**ERP RD** es un Backend-for-Frontend (BFF) que orquesta operaciones entre un frontend propietario y **ERPNext v16** (motor contable, inventario, facturación). El sistema está localizado para **República Dominicana** — maneja NCF (Números de Comprobante Fiscal), ITBIS, retenciones, reportes DGII 606/607/608, y validaciones de RNC/Cédula.

### Arquitectura

```
[Frontend App] ←→ [BFF (NestJS + Fastify)] ←→ [ERPNext v16 Frappe]
                        ↕
              [Control-Plane DB (PostgreSQL)]
              (solo tenants, planes, suscripciones)
```

- **El Frontend** se comunica exclusivamente con el BFF. Nunca habla directo con ERPNext.
- **El BFF** traduce requests REST a la API de Frappe, maneja multitenancy, validaciones fiscales RD, y formatea respuestas.
- **ERPNext** es el sistema de registro único — toda la data de negocio (clientes, productos, facturas,库存) vive ahí.
- **Control-Plane DB** solo guarda configuración de tenants (slugs, URLs de site ERPNext, planes, suscripciones).

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend Runtime | **Node.js 20 LTS** |
| Framework | **NestJS 11** con **Fastify** (NO Express) |
| ORM (Control Plane) | **Drizzle ORM** + **PostgreSQL 16** |
| HTTP Client (ERPNext) | **Axios** con interceptores |
| Auth | **JWT** (jsonwebtoken) firmado con pass-through de credenciales ERPNext |
| API Docs | **@nestjs/swagger** + **Scalar UI** |
| Validación | **class-validator** + **class-transformer** |
| HTTP | **Fastify** (no Express) |
| Contenedores | **Docker** + **Docker Compose** |

### Puerto
- BFF corre en **puerto 4000**
- Frontend en desarrollo: `http://localhost:5173` (esperado)

---

## 3. Autenticación y Seguridad

### 3.1 Login Flow

```
POST /api/v1/auth/login
```

**Request Body:**
```json
{
  "email": "Administrator",
  "password": "123456",
  "tenant": "tenant1"
}
```

- `email` y `password` son credenciales de **ERPNext** (el BFF hace pass-through).
- `tenant` es opcional. Si se omite, el BFF intenta autenticar contra **todos los tenants activos** y devuelve el primero que funciona.
- El BFF obtiene un API Key + API Secret del usuario en ERPNext y los mete dentro del JWT.

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 28800,
    "tenant": {
      "slug": "tenant1",
      "siteUrl": "http://premium_soft.dev:8000",
      "id": "60f5fc35-7548-42eb-9b33-92dce559721c"
    },
    "user": {
      "email": "Administrator",
      "full_name": "Administrator",
      "roles": ["Administrator", "Sales User", "Accounts User", ...]
    }
  }
}
```

- `expires_in` = 28800 segundos = **8 horas**.
- El JWT contiene el API Key (`ak`) y API Secret (`ask`) que el BFF necesita para hablar con ERPNext en cada request.

### 3.2 JWT Payload (decodeado)

```json
{
  "sub": "Administrator",
  "tenant": "tenant1",
  "ak": "d40905b71c555b1",
  "ask": "2b43e2608e2ec47",
  "iat": 1780851430,
  "exp": 1780880230
}
```

### 3.3 Headers Requeridos en Cada Request

Toda request autenticada (99% de los endpoints) requiere **dos headers**:

| Header | Valor | Obligatorio |
|--------|-------|-------------|
| `Authorization` | `Bearer <access_token>` | ✅ |
| `X-Tenant` | `tenant1` (el slug del tenant) | ✅ |

**Ejemplo con fetch:**
```javascript
const res = await fetch('https://gensapi.ryancfx.click/api/v1/customers', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Tenant': 'tenant1',
    'Content-Type': 'application/json',
  }
})
```

### 3.4 Endpoints Públicos (sin auth)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Health check — no requiere ningún header |
| `/api/docs` | GET | Scalar UI docs |
| `/api/docs-json` | GET | OpenAPI JSON raw |
| `/api/v1/auth/login` | POST | Login — no requiere auth pero sí datos de login |

> **Atención:** el resto de endpoints requieren `Authorization: Bearer` + `X-Tenant`.

---

## 4. Formato Universal de Respuesta

### 4.1 Respuesta Exitosa (Single Entity)

```json
{
  "success": true,
  "data": { ... }
}
```

### 4.2 Respuesta Exitosa (Lista Paginada)

```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "total": 42,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `total` | number | Total de registros (no filtrados por page) |
| `limit` | number | Items por página (default 20, max 100) |
| `offset` | number | Desde dónde empezar (0 = primera página) |
| `hasMore` | boolean | Si hay más páginas después de esta |

### 4.3 Respuesta con Meta Adicional

Algunos endpoints devuelven metadata extra:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "summary": {
      "totalInvestment": 1500000,
      "totalValue": 2200000,
      "potentialProfit": 700000
    }
  }
}
```

---

## 5. Formato Universal de Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Descripción del error en español",
    "statusCode": 400
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `code` | string | Código máquina para identificar el error |
| `message` | string | Mensaje legible en español |
| `statusCode` | number | Código HTTP |

**Casos especiales:**
- `ValidationPipe` errors (campos inválidos en body/query) devuelven `statusCode: 400`, `code: "BAD_REQUEST"`, y `message` es el primer error de validación.
- Errores de ERPNext se traducen automáticamente (ej: 401 → UNAUTHORIZED, 404 → NOT_FOUND, 409 → CONFLICT).

---

## 6. Paginación

Todos los endpoints de lista aceptan estos **query params comunes** (via `PaginationDto`):

| Parámetro | Tipo | Default | Máximo | Descripción |
|-----------|------|---------|--------|-------------|
| `limit` | integer | 20 | 100 | Items por página |
| `offset` | integer | 0 | — | Desde dónde empezar (offset=0 es página 1) |
| `search` | string | — | — | Búsqueda textual (lo que matchee el backend) |
| `orderBy` | string | — | — | Campo por el que ordenar (ej: `creation desc`) |

**Cada** módulo puede agregar sus propios query params de filtro (ver sección de endpoints).

---

## 7. Multitenancy (X-Tenant)

El sistema soporta **múltiples tenants**. Cada tenant es una empresa independiente con su propio site de ERPNext.

- **Header `X-Tenant`**: identifica qué tenant está haciendo la request.
- El valor es el **slug** del tenant (ej: `tenant1`, `empresa-demo`).
- El BFF resuelve el slug → encuentra la URL del site ERPNext → envía todas las requests a ese site.
- El JWT se emite **para un tenant específico** (ver `payload.tenant`).
- Si el tenant del JWT no coincide con el `X-Tenant` header, el BFF responde con `403 TENANT_MISMATCH`.

**Estado actual:** hay **un tenant** configurado: `tenant1` → site ERPNext en `premium_soft.dev`.

---

## 8. Mapa de Endpoints por Módulo

### 8.1 Auth

**Base:** `/api/v1/auth`

| Método | Ruta | Body / Query | Descripción |
|--------|------|-------------|-------------|
| POST | `/auth/login` | `{ email, password, tenant? }` | Login contra ERPNext, devuelve JWT |

---

### 8.2 Clientes (Customers)

**Base:** `/api/v1/customers`
**Swagger Tag:** `Customers`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/customers` | `ListCustomerQueryDto` | — | Lista paginada de clientes |
| GET | `/customers/:id` | — | — | Detalle de cliente por ID |
| POST | `/customers` | — | `CreateCustomerDto` | Crear cliente |
| PUT | `/customers/:id` | — | `UpdateCustomerDto` | Actualizar cliente |
| DELETE | `/customers/:id` | — | — | Desactivar cliente (disabled=1) |

**Query params adicionales** (además de paginación):
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `disabled` | boolean | `true` para incluir desactivados |

---

### 8.3 Facturación (Invoices)

**Base:** `/api/v1/invoices`
**Swagger Tag:** `Invoices`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/invoices` | `ListInvoiceQueryDto` | — | Lista paginada de facturas |
| GET | `/invoices/:id` | — | — | Detalle de factura |
| POST | `/invoices` | — | `CreateInvoiceDto` | Crear factura en Draft |
| POST | `/invoices/:id/submit` | — | — | Someter factura (asigna NCF) |
| POST | `/invoices/:id/cancel` | — | — | Cancelar factura sometida |
| POST | `/invoices/:id/amend` | — | — | Crear enmienda desde factura cancelada |
| GET | `/invoices/:id/pdf` | — | — | Obtener PDF de la factura |

**Query params adicionales** (lista):
| Parámetro | Tipo | Valores | Descripción |
|-----------|------|---------|-------------|
| `customer` | string | — | Filtrar por cliente |
| `status` | enum | `draft`, `submitted`, `cancelled`, `all` | Default: `submitted` |
| `fromDate` | string (ISO) | — | Fecha desde |
| `toDate` | string (ISO) | — | Fecha hasta |
| `paymentStatus` | enum | `paid`, `unpaid`, `overdue`, `partial` | Estado de pago |
| `ncfType` | string | — | Tipo NCF |

---

### 8.4 Cotizaciones (Quotations)

**Base:** `/api/v1/quotations`
**Swagger Tag:** `Cotizaciones`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/quotations` | `ListQuotationQueryDto` | — | Lista paginada de cotizaciones |
| GET | `/quotations/:id` | — | — | Detalle de cotización |
| POST | `/quotations` | — | `CreateQuotationDto` | Crear cotización (Draft) |
| PUT | `/quotations/:id` | — | `Partial<CreateQuotationDto>` | Actualizar cotización (solo Draft) |
| DELETE | `/quotations/:id` | — | — | Eliminar cotización (solo Draft) |
| POST | `/quotations/:id/submit` | — | — | Confirmar cotización |
| POST | `/quotations/:id/convert` | `ncfType?` (query) | — | Convertir cotización en factura Draft |

**Query params adicionales:**
| Parámetro | Tipo | Valores |
|-----------|------|---------|
| `customer` | string | — |
| `status` | enum | `draft`, `submitted`, `ordered`, `lost`, `cancelled`, `all` |
| `fromDate` | string | — |
| `toDate` | string | — |

**Convert to Invoice:** `POST /quotations/:id/convert?ncfType=B02` — pasa la cotización a factura.

---

### 8.5 Notas de Crédito y Débito

**Base:** `/api/v1/credit-notes` y `/api/v1/debit-notes`
**Swagger Tag:** `Notas de Crédito y Débito`

| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| GET | `/credit-notes` | `PaginationDto` | Listar notas de crédito |
| GET | `/credit-notes/:id` | — | Detalle |
| POST | `/credit-notes` | `CreateCreditNoteDto` | Crear nota de crédito |
| POST | `/credit-notes/:id/submit` | — | Confirmar (asigna NCF B04) |
| GET | `/debit-notes` | `PaginationDto` | Listar notas de débito |
| POST | `/debit-notes` | `CreateDebitNoteDto` | Crear nota de débito |
| POST | `/debit-notes/:id/submit` | — | Confirmar |

---

### 8.6 Catálogo — Categorías

**Base:** `/api/v1/catalog/categories`
**Swagger Tag:** `Catalog - Categories`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/catalog/categories` | `ListCategoryQueryDto` | — | Lista de categorías (plana o árbol) |
| GET | `/catalog/categories/:id` | — | — | Detalle de categoría |
| POST | `/catalog/categories` | — | `CreateCategoryDto` | Crear categoría |
| PUT | `/catalog/categories/:id` | — | `UpdateCategoryDto` | Actualizar categoría |
| DELETE | `/catalog/categories/:id` | — | — | Eliminar categoría |

**Query params adicionales:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `tree` | boolean | `?tree=true` devuelve jerarquía completa (padre → hijos) |

---

### 8.7 Catálogo — Marcas (Brands)

**Base:** `/api/v1/catalog/brands`
**Swagger Tag:** `Catalog - Brands`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/catalog/brands` | `ListBrandQueryDto` | — | Lista de marcas (opcional filtro por categoría) |
| GET | `/catalog/brands/:id` | — | — | Detalle |
| POST | `/catalog/brands` | — | `CreateBrandDto` | Crear |
| PUT | `/catalog/brands/:id` | — | `UpdateBrandDto` | Actualizar |
| DELETE | `/catalog/brands/:id` | — | — | Eliminar |

**Query params adicionales:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `category` | string | Filtrar marcas por categoría (Item Group name) |

---

### 8.8 Catálogo — Artículos (Items)

**Base:** `/api/v1/catalog/items`
**Swagger Tag:** `Catalog - Items`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/catalog/items` | `ListItemQueryDto` | — | Lista paginada con filtros |
| GET | `/catalog/items/:id` | — | — | Detalle con stock actual |
| POST | `/catalog/items` | — | `CreateItemDto` | Crear artículo |
| PUT | `/catalog/items/:id` | — | `UpdateItemDto` | Actualizar |
| DELETE | `/catalog/items/:id` | — | — | Desactivar (disabled=1) |
| POST | `/catalog/items/:id/toggle` | — | — | Activar/desactivar toggle |

**Query params adicionales:**
| Parámetro | Tipo | Valores |
|-----------|------|---------|
| `category` | string | Filtrar por categoría |
| `brand` | string | Filtrar por marca |
| `type` | enum | `product`, `service` |
| `disabled` | string | `"true"` para incluir desactivados |

---

### 8.9 Proveedores (Suppliers)

**Base:** `/api/v1/suppliers`
**Swagger Tag:** `Suppliers`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/suppliers` | `ListProveedorQueryDto` | — | Lista paginada con balance |
| GET | `/suppliers/:id` | — | — | Detalle con balance |
| GET | `/suppliers/:id/purchases` | `limit`, `offset` | — | Facturas de compra del proveedor |
| POST | `/suppliers` | — | `CreateProveedorDto` | Crear proveedor |
| PUT | `/suppliers/:id` | — | `UpdateProveedorDto` | Actualizar |
| DELETE | `/suppliers/:id` | — | — | Desactivar (disabled=1) |

**Query params adicionales (lista):**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `disabled` | boolean | Incluir desactivados |
| `esProveedorExterior` | boolean | Filtrar por exterior |
| `supplierGroup` | string | Filtrar por grupo |

---

### 8.10 Inventario

**Base:** `/api/v1/inventory`
**Swagger Tag:** `Inventario`

| Método | Ruta | Query | Descripción |
|--------|------|-------|-------------|
| GET | `/inventory` | `InventoryFilterDto` | Stock actual con inversión y valor |
| GET | `/inventory/summary` | — | Resumen: inversión total, valor, ganancia potencial |
| GET | `/inventory/warehouses` | — | Lista de almacenes disponibles |
| GET | `/inventory/history` | `HistoryFilterDto` | Historial de movimientos de stock |
| GET | `/inventory/history/:itemCode` | `HistoryFilterDto` | Historial de un artículo específico |

**InventoryFilterDto (query params):**
| Parámetro | Tipo | Valores |
|-----------|------|---------|
| `warehouse` | string | — |
| `category` | string | — |
| `brand` | string | — |
| `stockStatus` | enum | `all`, `in_stock`, `low_stock`, `out_of_stock` |
| `sortBy` | enum | `investment`, `value`, `profit` |

**HistoryFilterDto (query params):**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `warehouse` | string | — |
| `voucherType` | string | — |
| `fromDate` | string | — |
| `toDate` | string | — |

---

### 8.11 Inventario — Conteos Físicos

**Base:** `/api/v1/inventory/counts`
**Swagger Tag:** `Inventario — Conteos`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/inventory/counts` | `PaginationDto` | — | Listar conteos |
| GET | `/inventory/counts/template` | `warehouse` (query) | — | Plantilla con stock actual de un almacén |
| GET | `/inventory/counts/:id` | — | — | Detalle de un conteo |
| POST | `/inventory/counts` | — | `CreateCountDto` | Iniciar nuevo conteo (Draft) |
| POST | `/inventory/counts/:id/submit` | — | — | Confirmar conteo (ajusta inventario) |

---

### 8.12 Compras (Purchase Invoices — afectan inventario)

**Base:** `/api/v1/compras`
**Swagger Tag:** `Compras`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/compras` | `ListCompraQueryDto` | — | Lista paginada de compras |
| GET | `/compras/:id` | — | — | Detalle |
| POST | `/compras` | — | `CreateCompraDto` | Crear (Draft) — **update_stock=1** |
| PUT | `/compras/:id` | — | `UpdateCompraDto` | Actualizar (solo Draft) |
| POST | `/compras/:id/submit` | — | — | Someter (actualiza inventario + contabilidad) |
| POST | `/compras/:id/cancel` | — | — | Cancelar |
| POST | `/compras/:id/amend` | — | — | Enmendar |
| POST | `/compras/:id/return` | — | `{ items: [{itemCode, qty}] }` | Nota de crédito de compra (devolución) |

---

### 8.13 Gastos (Purchase Invoices — NO afectan inventario)

**Base:** `/api/v1/gastos`
**Swagger Tag:** `Gastos`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/gastos/resumen` | `month` (query) | — | Resumen por mes (deducibles vs no) |
| GET | `/gastos` | `ListGastoQueryDto` | — | Lista paginada — **update_stock=0** |
| GET | `/gastos/:id` | — | — | Detalle |
| POST | `/gastos` | — | `CreateGastoDto` | Crear (Draft) |
| POST | `/gastos/:id/submit` | — | — | Someter (valida 606 y B17) |
| POST | `/gastos/:id/cancel` | — | — | Cancelar |
| POST | `/gastos/:id/amend` | — | — | Enmendar |

---

### 8.14 Usuarios

**Base:** `/api/v1/usuarios`
**Swagger Tag:** `Usuarios`

| Método | Ruta | Query | Body | Descripción |
|--------|------|-------|------|-------------|
| GET | `/usuarios` | `ListUsuarioQueryDto` | — | Lista de usuarios del tenant |
| GET | `/usuarios/:email` | — | — | Detalle por email |
| POST | `/usuarios` | — | `CreateUsuarioDto` | Crear usuario en ERPNext |
| PUT | `/usuarios/:email` | — | `UpdateUsuarioDto` | Actualizar perfil y roles |
| DELETE | `/usuarios/:email` | — | — | Desactivar (enabled=0) |
| POST | `/usuarios/:email/enable` | — | — | Reactivar |
| POST | `/usuarios/:email/reset-password` | — | — | Enviar email de reset |

**Base:** `/api/v1/roles`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/roles` | Listar roles disponibles en el tenant |

---

### 8.15 Configuración

**Base:** `/api/v1/config`
**Swagger Tag:** `Configuración`

| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| GET | `/config/empresa` | — | Datos de la empresa (Company) |
| PUT | `/config/empresa` | `UpdateEmpresaDto` | Actualizar datos fiscales |
| GET | `/config/cobros` | — | Configuración de cobranza |
| PUT | `/config/cobros` | `UpdateCobrosConfigDto` | Actualizar cobranza |
| GET | `/config/metodos-pago` | — | Métodos de pago |
| POST | `/config/metodos-pago` | `CreateMetodoPagoDto` | Crear método de pago |
| PUT | `/config/metodos-pago/:id` | `UpdateMetodoPagoDto` | Actualizar |
| GET | `/config/almacenes` | — | Almacenes |
| POST | `/config/almacenes` | `CreateAlmacenDto` | Crear almacén |
| PUT | `/config/almacenes/:id` | `UpdateAlmacenDto` | Actualizar |
| DELETE | `/config/almacenes/:id` | — | Desactivar almacén |
| GET | `/config/uom` | — | Unidades de medida |
| POST | `/config/uom` | `CreateUomDto` | Crear UOM |
| GET | `/config/listas-precio` | — | Listas de precio |
| POST | `/config/listas-precio` | `CreateListaPrecioDto` | Crear lista de precio |
| GET | `/config/grupos-clientes` | — | Grupos de clientes |
| POST | `/config/grupos-clientes` | `CreateGrupoDto` | Crear grupo |
| GET | `/config/grupos-proveedores` | — | Grupos de proveedores |
| POST | `/config/grupos-proveedores` | `CreateGrupoDto` | Crear grupo |
| GET | `/config/ncf` | — | Secuencias NCF (requiere dgii-compliance) |
| GET | `/config/perfil` | — | Perfil del usuario autenticado |
| PUT | `/config/perfil` | `UpdatePerfilDto` | Actualizar perfil |

---

### 8.16 Cuentas por Cobrar (Módulo Parcial)

**Base:** `/api/v1/cobros`
**Swagger Tag:** `Cuentas por Cobrar`

| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| GET | `/cobros/aging` | — | Aging de cuentas por cobrar |
| GET | `/cobros/aging/:customer` | — | Aging por cliente específico |
| GET | `/cobros/semaforo` | — | Semáforo de crédito (verde/amarillo/rojo) |
| GET | `/cobros/historial/:customer` | — | Historial de pagos de un cliente |
| POST | `/cobros/pago` | — | Registrar pago |

---

### 8.17 Reportes (Módulo Parcial)

**Base:** `/api/v1/reportes`
**Swagger Tag:** `Reportes`

| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| GET | `/reportes/balance` | — | Balance General |
| GET | `/reportes/pl` | — | Estado de Resultados (P&L) |
| GET | `/reportes/606` | — | Reporte DGII 606 (Compras) |
| GET | `/reportes/607` | — | Reporte DGII 607 (Retenciones) |
| GET | `/reportes/608` | — | Reporte DGII 608 (Ventas) |
| GET | `/reportes/stock-balance` | — | Stock Balance |

---

## 9. Modelos de Datos (Entidades)

### 9.1 Customer (Cliente)

```typescript
interface Customer {
  id: string                    // name en ERPNext (ej: "CUST-00001")
  customerName: string
  customerType: 'Company' | 'Individual'
  tipoIdentificacion?: 'RNC' | 'Cedula' | 'Pasaporte' | 'NIT'
  rnc?: string                 // 9 dígitos con dígito verificador DGII
  cedula?: string              // 11 dígitos con dígito verificador JCE
  isCompany: boolean
  hasCredit: boolean
  isGovernment: boolean
  creditLimit: number
  creditDays: number
  emailInvoice?: string
  birthday?: string            // ISO date
  photo?: string
  disabled: boolean
  createdAt: string            // ISO datetime
  modifiedAt: string           // ISO datetime
}
```

### 9.2 Supplier (Proveedor)

```typescript
interface Supplier {
  id: string
  supplierName: string
  supplierType: 'Company' | 'Individual'
  tipoIdentificacion?: 'RNC' | 'Cedula' | 'Pasaporte' | 'NIT'
  rnc?: string
  cedula?: string
  esProveedorExterior: boolean
  paisOrigen?: string
  banco?: string
  tipoCuenta?: string          // 'Corriente' | 'Ahorros'
  numeroCuenta?: string
  abaSwift?: string
  tipoProveedor606?: string
  diasCredito: number
  supplierGroup?: string
  paymentTerms?: string
  emailId?: string
  emailPagos?: string
  mobileNo?: string
  disabled: boolean
  balance: number              // Saldo pendiente con el proveedor
  createdAt: string
  modifiedAt: string
}
```

### 9.3 Invoice (Factura de Venta)

```typescript
interface Invoice {
  id: string                   // ej: "SINV-00001"
  status: string               // 'Draft' | 'Submitted' | 'Cancelled'
  customer: string
  customerName: string
  postingDate: string          // ISO date
  dueDate: string              // ISO date
  ncf?: string                 // NCF asignado al submit
  ncfType?: string             // B01, B02, B14, B15, B16
  subtotal: number
  taxAmount: number
  grandTotal: number
  outstandingAmount: number    // Monto pendiente de pago
  items: InvoiceItem[]
  notes?: string
  amendedFrom?: string         // Si es enmienda, ID de la factura original
  createdAt: string
  modifiedAt: string
}

interface InvoiceItem {
  itemCode: string
  description: string
  qty: number
  rate: number
  amount: number
  uom: string
}
```

### 9.4 Invoice — Create DTO

```typescript
interface CreateInvoiceDto {
  customer: string             // ID del customer
  postingDate: string          // ISO date
  dueDate?: string             // ISO date (opcional)
  ncfType: 'B01' | 'B02' | 'B14' | 'B15' | 'B16'
  items: {
    itemCode: string
    description: string
    qty: number
    rate: number
    uom?: string
  }[]
  notes?: string
}
```

### 9.5 Quotation (Cotización)

```typescript
interface Quotation {
  id: string
  customer: string
  customerName: string
  date: string
  validTill: string
  status: string               // 'Draft' | 'Submitted' | 'Ordered' | 'Lost' | 'Cancelled'
  items: QuotationItem[]
  notes?: string
}

interface QuotationItem {
  itemCode: string
  description: string
  qty: number
  rate: number
  amount: number
  uom: string
}
```

### 9.6 Item (Artículo / Producto)

```typescript
interface Item {
  id: string                   // Item Code (ej: "PROD-001")
  itemName: string
  category: string             // Item Group name
  categoryName?: string
  brand?: string
  brandName?: string
  type: 'product' | 'service'
  standardRate: number         // Precio de venta
  valuationRate?: number       // Costo (solo products)
  currentStock?: number        // Stock disponible (solo products)
  description?: string
  image?: string
  disabled: boolean
}
```

### 9.7 Category (Categoría / Item Group)

```typescript
interface Category {
  id: string
  name: string
  parentCategory: string | null  // null = root
  isGroup: boolean
  image?: string
  children?: Category[]          // Solo si ?tree=true
}
```

### 9.8 Brand (Marca)

```typescript
interface Brand {
  id: string
  name: string
  description?: string
  categoryId?: string
  categoryName?: string
  image?: string
}
```

### 9.9 Inventory Item

```typescript
interface InventoryItem {
  itemCode: string
  itemName: string
  warehouse: string
  actualQty: number
  reservedQty: number
  pendingQty: number
  valuationRate: number
  valuationAmount: number       // Cantidad * valuationRate
  sellingRate: number           // standardRate
  sellingAmount: number
  potentialProfit: number
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock'
}

interface InventorySummary {
  totalInvestment: number
  totalValue: number
  potentialProfit: number
}
```

### 9.10 Warehouse (Almacén)

```typescript
interface Warehouse {
  name: string
  warehouseName: string
  isGroup: boolean
  disabled: boolean
}
```

### 9.11 Compra (Purchase Invoice — con update_stock=1)

```typescript
interface Compra {
  id: string
  supplier: string
  supplierName: string
  postingDate: string
  dueDate: string
  status: string                // 'Draft' | 'Submitted' | 'Cancelled'
  currency: string              // default 'DOP'
  items: CompraItem[]
  taxes?: CompraTax[]
  grandTotal: number
  // Campos 606:
  ncfProveedor?: string
  tipoBienes606?: string
  formaPago606?: string
  retencionItbis?: number
  retencionIsr?: number
  tipoPago?: 'Contado' | 'Crédito'
}

interface CompraItem {
  itemCode: string
  description: string
  qty: number
  rate: number
  amount: number
  warehouse?: string
  uom?: string
}

interface CompraTax {
  chargeType: string
  accountHead: string
  rate: number
  description?: string
}
```

### 9.12 Gasto (Purchase Invoice — con update_stock=0)

```typescript
interface Gasto {
  id: string
  supplier: string
  supplierName: string
  postingDate: string
  dueDate: string
  status: string
  currency: string
  items: GastoItem[]
  grandTotal: number
  // Campos 606:
  ncfProveedor?: string
  tipoComprobante?: 'B01' | 'B13' | 'B14' | 'B15' | 'B16' | 'B17' | 'E31'
  tipoBienes606?: string
  formaPago606?: string
  retencionItbis?: number
  retencionIsr?: number
  // Campos específicos:
  categoriaGasto?: 'Operativo' | 'Administrativo' | 'Ventas' | 'Financiero'
  esDeducible?: boolean
}
```

### 9.13 Usuario

```typescript
interface Usuario {
  email: string
  firstName: string
  lastName?: string
  fullName: string
  enabled: boolean
  roles: string[]
  language?: string
  timeZone?: string
  mobileNo?: string
  lastActive?: string
}

interface Role {
  name: string
}
```

### 9.14 Empresa (Company)

```typescript
interface Empresa {
  companyName: string
  rnc?: string
  regimenFiscal?: 'Ordinario' | 'Simplificado' | 'RST'
  actividadEconomica?: string
  representanteLegal?: string
  cedulaRepresentante?: string
  logoUrl?: string
  telefono?: string
  email?: string
  website?: string
  direccion?: string
  defaultCurrency?: string
  country?: string
}
```

### 9.15 Método de Pago

```typescript
interface MetodoPago {
  name: string
  type: 'Cash' | 'Bank' | 'General'
  codigo606?: string
  disabled: boolean
}
```

### 9.16 Lista de Precio

```typescript
interface ListaPrecio {
  name: string
  priceListName: string
  currency: string
  buying: boolean
  selling: boolean
  enabled: boolean
}
```

### 9.17 UOM (Unidad de Medida)

```typescript
interface UOM {
  name: string
  uomName: string
  mustBeWholeNumber: boolean
}
```

### 9.18 Grupo de Cliente/Proveedor

```typescript
interface Grupo {
  name: string
  parentGroup?: string
}
```

### 9.19 Cobros Config (Configuración de Cobranza)

```typescript
interface CobrosConfig {
  limiteCreditoAmarilloPct: number   // default 80
  limiteCreditoRojoPct: number       // default 100
  diasAlertaVencimiento: number      // default 3
  rangoAging1Dias: number            // default 30
  rangoAging2Dias: number            // default 60
  rangoAging3Dias: number            // default 90
  rangoAging4Label: string           // default "+90 días"
  enviarRecordatorioAutomatico: boolean
}
```

### 9.20 NCF Series

```typescript
interface NcfSerie {
  ncfType: string       // B01, B02, etc.
  prefix: string
  currentNumber: number
  validFrom: string
  validTo: string
}
```

---

## 10. Reglas de Negocio Especiales

### 10.1 Documentos Fiscales Dominicanos

- **NCF**: Número de Comprobante Fiscal. Asignado por ERPNext (dgii-compliance) al hacer **Submit** de una factura.
- **Factura de Venta**: tipos NCF → `B01` (Crédito Fiscal), `B02` (Consumidor Final), `B14` (Regímenes Especiales), `B15` (Gubernamentales), `B16` (Proveedores Informales).
- **Nota de Crédito**: tipo `B04` (devolución de factura de venta).
- **Nota de Débito**: tipo `B03` (cargo adicional).
- **Compras/Gastos**: el proveedor emite comprobantes tipo `B01`, `B13`, `B14`, `B15`, `B16`, `B17`, `E31`.
- El BFF **nunca calcula impuestos** — ERPNext lo hace.

### 10.2 update_stock (Compras vs Gastos)

| Módulo | `update_stock` | Impacto |
|--------|---------------|---------|
| Compras | `1` (true) | Afecta inventario — los items llegan al almacén |
| Gastos | `0` (false) | No afecta inventario — gastos operativos/administrativos |

### 10.3 Ciclo de Vida de Documentos

```
Draft → Submit → [NCF asignado, contabilizado]
  ↑                        ↓
  │                    Cancel → Amend → [Nuevo Draft con amended_from]
  └─────────────────────────┘
```

- Documentos en `Draft` se pueden editar/eliminar.
- Documentos `Submitted` son **inmutables**. Para modificarlos: Cancel → Amend.
- **Amend** crea un nuevo documento en Draft con el campo `amendedFrom` apuntando al original.

### 10.4 RNC y Cédula

- **RNC**: 9 dígitos con dígito verificador DGII.
- **Cédula**: 11 dígitos con dígito verificador JCE.
- Ambos se validan en el BFF **antes** de enviar a ERPNext usando los validadores DGII.
- El algoritmo de RNC trata `remainder === 0 || remainder === 10` → check digit = 2.

### 10.5 Paginación Global

- `limit` default 20, máximo 100.
- `offset` empieza en 0.
- `hasMore: true` si hay más resultados.
- El frontend debe calcular páginas como: `page = offset / limit + 1`.

### 10.6 Búsqueda

- El parámetro `search` en `PaginationDto` activa búsqueda textual. El backend busca en campos como nombre, email, RNC, etc. según el módulo.
- No hay un campo `searchField` — el backend decide dónde buscar.

### 10.7 Formato de Fechas

- Todas las fechas se envían como **ISO 8601** (ej: `"2025-01-15"` para dates, `"2025-01-15T14:30:00Z"` para datetimes).
- El frontend debe mostrar en formato dominicano (dd/mm/yyyy) y zona horaria `America/Santo_Domingo`.

### 10.8 Moneda

- Moneda por defecto: **DOP** (Peso Dominicano).
- Los montos se manejan como `number` (no strings).
- El ITBIS es 18% (manejado por ERPNext).

---

## 11. Validaciones DGII (RNC/Cédula)

El BFF valida estos formatos **antes** de enviar a ERPNext. Si un RNC o cédula no pasa validación, el BFF responde con error 400 antes de contactar ERPNext.

### RNC

```
- 9 dígitos exactos (sin guiones)
- Algoritmo: pesos [7,9,8,6,5,4,3,2], módulo 11
- Si remainder = 0 o 10 → check digit = 2
- Si remainder = 1 → check digit = 1
- Sino → check digit = 11 - remainder
```

### Cédula

```
- 11 dígitos exactos (sin guiones)
- Algoritmo: pesos alternos [1,2,1,2,1,2,1,2,1,2], módulo 10
- Si producto >= 10, sumar dígitos (ej: 12 → 1+2=3)
- Check digit = (10 - (suma % 10)) % 10
```

---

## 12. Estados de Documentos

| Estado | Significado | Editable | Eliminable |
|--------|-------------|----------|------------|
| `Draft` | Borrador, sin efectos contables | ✅ | ✅ |
| `Submitted` | Confirmado, NCF asignado, contabilizado | ❌ | ❌ |
| `Cancelled` | Cancelado tras submit | ❌ | ❌ (pero se puede Amend) |
| `Ordered` | Cotización convertida en orden | — | — |
| `Lost` | Cotización perdida | — | — |

---

## 13. Ciclo de Vida de Documentos Fiscales

### Factura de Venta

```
1. POST /invoices        → Crea Draft (sin NCF, sin efecto contable)
2. POST /invoices/:id/submit → Asigna NCF, contabiliza, genera asientos
3. GET  /invoices/:id/pdf    → Descarga PDF con formato "Factura RD"
4. POST /invoices/:id/cancel → Cancela (solo si está Submitted)
5. POST /invoices/:id/amend  → Crea Draft nuevo con amendedFrom
```

### Cotización → Factura

```
1. POST /quotations                    → Crea Draft
2. POST /quotations/:id/submit         → Confirma cotización
3. POST /quotations/:id/convert?ncfType=B02 → Convierte en factura Draft
4. POST /invoices/:newId/submit        → Somete la factura
```

### Nota de Crédito (Devolución)

```
1. POST /credit-notes                  → Crea nota de crédito (referencia factura original)
2. POST /credit-notes/:id/submit       → Asigna NCF B04, contabiliza
```

---

## 14. Códigos de Error

| Código HTTP | Código Interno | Significado |
|-------------|----------------|-------------|
| 400 | `BAD_REQUEST` | Error de validación (campos inválidos, formato incorrecto) |
| 401 | `UNAUTHORIZED` | Token inválido, expirado, o no presente |
| 403 | `FORBIDDEN` | No tiene permisos para esta operación |
| 403 | `TENANT_MISMATCH` | El tenant del JWT no coincide con el header X-Tenant |
| 404 | `TENANT_NOT_FOUND` | El slug en X-Tenant no existe en la DB |
| 404 | `NOT_FOUND` | Recurso no encontrado |
| 409 | `CONFLICT` | Conflicto (ej: documento ya sometido) |
| 422 | `VALIDATION_ERROR` | Error de validación de negocio |
| 429 | `TOO_MANY_REQUESTS` | Rate limit excedido (100 requests / 60s) |
| 500 | `INTERNAL_ERROR` | Error interno del servidor o de ERPNext |

---

## 15. Convenciones de Navegación y UI

### Sidebar / Navegación Principal

El menú principal debe reflejar los módulos del sistema y las reglas de dependencia:

1. **Dashboard** — KPIs agregados, resumen del día
2. **Clientes** — CRUD de clientes
3. **Catálogo** → Categorías → Marcas → Artículos
4. **Cotizaciones** — Crear y gestionar
5. **Facturación** → Facturas → Notas Crédito → Notas Débito
6. **Inventario** → Stock actual → Historial → Conteos
7. **Compras** — Facturas de compra (afectan inventario)
8. **Gastos** — Gastos operativos (no afectan inventario)
9. **Proveedores** — CRUD de proveedores
10. **Cuentas por Cobrar** → Aging → Semáforo → Pagos
11. **Usuarios** → Usuarios → Roles
12. **Reportes** → 606 → 607 → 608 → Balance → P&L → Stock Balance
13. **Configuración** → Empresa → Cobros → Almacenes → Métodos de Pago → UOM → Listas de Precio → Grupos → NCF → Perfil

### Diseño de Pantallas

- **Listas**: tabla paginada con filtros, búsqueda, columna de acciones (editar/eliminar/ver).
- **Formularios**: validación en tiempo real de RNC/Cédula. Selectores para enumerados (tipo NCF, forma de pago, etc.).
- **Detalle**: vista de solo lectura con acciones según estado (Submit si Draft, Cancel si Submitted, etc.).
- **PDF**: la factura se abre en una nueva pestaña o se descarga.
- **Semáforo de Crédito**: indicador visual verde/amarillo/rojo según consumo de límite.

### Colores / Branding

- El BFF sirve el logo de la empresa via `GET /config/empresa → logoUrl`.
- El Print Format "Factura RD" incluye logo, RNC, NCF, ITBIS breakdown, retenciones.
- No hay guía de colores fija — el frontend debe definir su propio theme; el backend no impone restricciones.

---

## 16. Módulos Futuros / No Implementados

| Módulo | Estado | Notas |
|--------|--------|-------|
| Dashboard (01) | ❌ No implementado | KPIs agregados con `Promise.all()` contra todos los módulos |
| Cotizaciones (04) | ✅ Implementado | Endpoints listos, probar con datos reales |
| Notas Crédito/Débito (04) | ✅ Implementado | Endpoints listos |
| Cuentas por Cobrar (10) | ⚠️ Parcial | Endpoints de aging, semáforo, historial, pagos. Probar contra datos reales |
| Reportes (11) | ⚠️ Parcial | Endpoints definidos (606/607/608, Balance, P&L). Requieren verificación |
| dgii-compliance fork | ❌ No instalado | Funcionalidad NCF limitada sin este plugin de ERPNext |

---

## Apéndice: Códigos de Tipo NCF

| Código | Descripción | Aplica a |
|--------|-------------|----------|
| B01 | Crédito Fiscal | Ventas a empresas con RNC |
| B02 | Consumidor Final | Ventas a consumidores sin RNC |
| B03 | Nota de Débito | Cargos adicionales post-factura |
| B04 | Nota de Crédito | Devoluciones, descuentos post-factura |
| B13 | Pago al Exterior | Compras a proveedores del exterior |
| B14 | Regímenes Especiales | Ventas a zonas francas, turismo, etc. |
| B15 | Gubernamental | Ventas al gobierno |
| B16 | Proveedores Informales | Compras a informales |
| B17 | Gastos Menores | Gastos sin comprobante fiscal |
| E31 | Exportación | Ventas de exportación |
