# Frontend — ERP RD

Frontend para el ERP localizado para República Dominicana. Se comunica exclusivamente con el BFF (NestJS + Fastify).

## URLs del BFF

| Recurso | URL |
|---------|-----|
| API Base | `https://gensapi.ryancfx.click/api/v1` |
| API Docs (Scalar) | `https://gensapi.ryancfx.click/api/docs` |
| OpenAPI JSON | `https://gensapi.ryancfx.click/api/docs-json` |
| Health | `https://gensapi.ryancfx.click/health` |

## Stack Recomendado

| Capa | Tecnología |
|------|-----------|
| Framework | **React 18** + **TypeScript 5** |
| Build | **Vite 5** |
| Router | **React Router v6** |
| Estado global | **Zustand** (auth, tenant, UI) |
| Queries / Cache | **TanStack Query v5** |
| Formularios | **React Hook Form** + **Zod** |
| UI Components | **shadcn/ui** (Radix + Tailwind) |
| Gráficos | **Recharts** o **Chart.js** |
| Tablas | **TanStack Table v8** |
| HTTP | **Axios** (con interceptores) |
| Fechas | **date-fns** con locale es-DO |
| Moneda | `Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })` |
| Notificaciones | **Sonner** (o shadcn/toast) |
| PDF viewer | `window.open()` con URL del BFF |

## Setup Rápido

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# Dependencias core
npm install axios @tanstack/react-query zustand react-router-dom react-hook-form zod
npm install @hookform/resolvers date-fns recharts

# shadcn/ui
npx shadcn-ui@latest init
```

## Variables de Entorno

```env
# .env
VITE_API_BASE_URL=https://gensapi.ryancfx.click/api/v1
VITE_TENANT_SLUG=tenant1
```

## Headers Obligatorios en Cada Request

```typescript
// Todo request autenticado requiere estos dos headers:
{
  'Authorization': `Bearer ${token}`,
  'X-Tenant': tenantSlug,
  'Content-Type': 'application/json',
}
```

## Arquitectura de Carpetas Recomendada

```
src/
├── api/                    ← Cliente Axios + funciones por módulo
│   ├── client.ts           ← Axios instance con interceptores
│   ├── auth.ts
│   ├── customers.ts
│   ├── invoices.ts
│   └── ...
├── components/             ← Componentes reutilizables
│   ├── ui/                 ← shadcn/ui (generados)
│   ├── layout/             ← Sidebar, Header, Layout
│   ├── forms/              ← Componentes de formulario compartidos
│   └── shared/             ← DataTable, Pagination, StatusBadge, etc.
├── features/               ← Un directorio por módulo
│   ├── auth/
│   ├── dashboard/
│   ├── customers/
│   ├── invoicing/
│   └── ...
├── hooks/                  ← Custom hooks (useAuth, useTenant, useDebounce)
├── lib/                    ← Utilidades (formatters, validators, constants)
│   ├── validators/         ← RNC, cédula, NCF
│   ├── formatters/         ← Moneda, fechas, estados
│   └── constants.ts        ← NCF types, 606 codes, etc.
├── stores/                 ← Zustand stores
│   ├── auth.store.ts
│   └── ui.store.ts
└── types/                  ← TypeScript types de todas las entidades
    └── api.types.ts
```

## Formato Universal de Respuesta

```typescript
// Respuesta exitosa — lista paginada
interface ApiListResponse<T> {
  success: true
  data: T[]
  meta: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

// Respuesta exitosa — entidad única
interface ApiResponse<T> {
  success: true
  data: T
}

// Error
interface ApiError {
  success: false
  error: {
    code: string         // 'NOT_FOUND', 'UNAUTHORIZED', etc.
    message: string      // En español
    statusCode: number
  }
}
```

## Archivo Principal — Ver `TAREAS.md`

La lista completa de tareas a implementar está en [`TAREAS.md`](./TAREAS.md).
