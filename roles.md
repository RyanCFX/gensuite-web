# Roles de ERPNext — guía para permisos de pantallas/botones en el frontend

Este documento explica brevemente qué es cada rol nativo de ERPNext/Frappe presente en el
sistema (más los dos roles propios del proyecto), para que el frontend pueda inferir qué
pantallas y acciones debería habilitar según los roles que trae el usuario autenticado
(`GET /api/v1/auth/login` devuelve los roles del usuario; `GET /api/v1/roles` lista el catálogo
completo con `{ id, label }` — `id` es el valor a comparar en código, `label` es el texto en
español para mostrar en UI de administración de usuarios).

**Regla general del proyecto**: casi ningún módulo de este BFF valida roles finos a nivel de
endpoint — la autorización real hoy es "tiene sesión válida en el tenant" (ver
`docs/ARCHITECTURE.md`/`CONVENTIONS.md`). Este documento es para que el **frontend** decida qué
mostrar/ocultar en la UI según el rol, no una fuente de verdad de permisos ya aplicados en el
backend. Dicho eso, unos pocos roles sí importan para el backend real (ver notas ⚠️).

Mapeo de referencia a los módulos del frontend: Dashboard, Catálogo, Inventario, Facturación,
Compras, Gastos, Clientes, Proveedores, Usuarios, Cuentas por Cobrar, Reportes, Configuración,
POS (turnos de caja).

---

## Roles propios del proyecto (ya en español, RD-specific)

### Cajero POS
Rol creado por `localizacion_rd` cuando se habilita el módulo POS (turnos de caja) para un
tenant. Pensado para el usuario que opera la caja física, no un administrador.
- **Acceso esperado**: POS (abrir/cerrar turno, registrar ventas al contado, arqueo de caja).
  Lectura de Facturación (para consultar sus propias ventas del turno).
- **Sin acceso esperado**: Configuración, Usuarios, Reportes gerenciales, edición de catálogo,
  Compras/Gastos, Cuentas por Cobrar.
- ⚠️ Backend: tiene permisos reales acotados en ERPNext (`ensure_cajero_role` en
  `provisioning/pos_provisioning.py`) — ve un subconjunto de doctypes en modo lectura y
  Facturacion Config le da 403 salvo el flujo POS.

### Notificaciones Bot
Cuenta de servicio interna (`notificaciones@sistema.local`), **no un usuario humano**. Ejecuta
el cron de disparadores programados (Fase E de notificaciones).
- **Acceso esperado**: ninguno vía UI — este rol nunca debería aparecer como opción asignable en
  la pantalla de gestión de usuarios. Si aparece en el listado de un usuario real, es un error de
  datos.

---

## Core / Sistema

### Administrator
La cuenta raíz del site ERPNext (no es exactamente un "rol" que se asigna a cualquiera — es el
usuario `Administrator` mismo, que siempre tiene todos los permisos). En este proyecto normalmente
no se usa día a día; el usuario admin nombrado del tenant recibe roles explícitos en su lugar.
- **Acceso esperado**: todo. En la práctica, el frontend no debería necesitar lógica especial para
  esto — se maneja como super-admin implícito.

### All
Rol especial que **todo usuario tiene automáticamente** (no se asigna manualmente, no se puede
quitar). Se usa en ERPNext para otorgar permisos de lectura base a catálogos comunes (Brand,
Warehouse, Item Attribute, etc. — ver `localizacion_rd` provisioning).
- **Acceso esperado**: no es un rol para condicionar UI (todos lo tienen) — ignóralo al construir
  lógica de "si tiene el rol X, mostrar Y".

### System Manager
El rol administrativo máximo dentro de Frappe/ERPNext — gestión de usuarios, roles, permisos,
configuración global del sistema, logs, backups.
- **Acceso esperado**: Configuración (todas las secciones), Usuarios (crear/editar/roles),
  acceso completo a todos los módulos de negocio. Es el equivalente a "admin del tenant".
- **Sin acceso esperado**: ninguna restricción — es el techo.

### Auditor
Rol de solo-lectura orientado a auditoría contable/operativa — pensado para alguien que revisa
todo pero no debe poder modificar nada.
- **Acceso esperado**: lectura en Facturación, Compras, Gastos, Cuentas por Cobrar, Reportes,
  Inventario (historial/kardex).
- **Sin acceso esperado**: cualquier botón de crear/editar/eliminar/someter/cancelar en
  cualquier módulo.

### Desk User
Marca que un usuario puede entrar al Desk de ERPNext (interfaz administrativa nativa) en
absoluto. No implica ningún permiso de negocio por sí solo.
- **Acceso esperado**: en el contexto de este BFF (que no expone el Desk directamente al usuario
  final) este rol es mayormente irrelevante para la UI del frontend propietario. Ignorar salvo
  que el frontend necesite decidir si mostrar un link "Abrir en ERPNext".

### Guest
Usuario no autenticado. Nunca debería llegar a este sistema (todo endpoint requiere JWT) — no
diseñar UI condicionada a este rol.

---

## Ventas / Facturación (Sales)

### Sales Master Manager
Igual que Sales Manager pero con permisos de creación/edición sobre el maestro de Clientes que,
de fábrica en ERPNext v16, **no** tiene Sales Manager (por eso `localizacion_rd` le da ese permiso
puntual a Sales Manager en el provisioning — ver `hooks.py`). En la práctica de este proyecto, Sales
Manager ya cubre lo necesario; Sales Master Manager es más un rol "legacy" de ERPNext.
- **Acceso esperado**: igual a Sales Manager (ver abajo) — trátalos como equivalentes en la UI
  salvo que definan lo contrario.

### Sales Manager
Rol gerencial de ventas — visibilidad y control completo del ciclo de venta.
- **Acceso esperado**: Facturación (crear/editar/someter/cancelar/anular, notas de
  crédito/débito), Cotizaciones, Pedidos, Clientes (crear/editar — permiso agregado por este
  proyecto), Cuentas por Cobrar (ver y aplicar saldos a favor), Reportes de ventas, Dashboard.
- **Sin acceso esperado**: Configuración de sistema, Usuarios, módulos de Compras/Gastos (a
  criterio del negocio — normalmente separado por área).

### Sales User
Vendedor de piso — opera el ciclo de venta pero sin visibilidad gerencial completa (ej. sin ver
márgenes/reportes agregados de toda la empresa).
- **Acceso esperado**: Facturación (crear factura/cotización/pedido), búsqueda de Clientes,
  catálogo (solo lectura, para cotizar).
- **Sin acceso esperado**: cancelar/anular documentos ya sometidos, Reportes gerenciales,
  Configuración, edición de Clientes (a discreción — algunos negocios sí lo permiten).

---

## Compras (Purchase)

### Purchase Master Manager
Análogo de Sales Master Manager pero para Compras — de fábrica no tiene permiso de escritura
sobre Supplier; este proyecto se lo agrega a Purchase Manager en su lugar.
- **Acceso esperado**: igual a Purchase Manager — tratar como equivalente en la UI.

### Purchase Manager
Rol gerencial de compras.
- **Acceso esperado**: Compras (crear/editar/someter/cancelar), Gastos, Devoluciones de Compra,
  Proveedores (crear/editar), Cuentas por Pagar (catálogo), Reportes de compras/606, Dashboard.
- **Sin acceso esperado**: Facturación de venta, Usuarios, Configuración de sistema.

### Purchase User
Encargado de registrar compras/gastos sin visibilidad gerencial completa.
- **Acceso esperado**: Compras (crear), Gastos (crear), búsqueda de Proveedores (solo lectura).
- **Sin acceso esperado**: cancelar/anular documentos sometidos, aplicar saldos a favor de
  devoluciones, Reportes agregados, edición de Proveedores.

---

## Contabilidad (Accounts)

### Accounts Manager
Control completo del área contable — plan de cuentas, asientos, conciliaciones, cierre.
- **Acceso esperado**: Cuentas por Cobrar/Pagar (todo), Reportes financieros, Configuración
  fiscal (NCF, retenciones, impuestos, cuentas contables), aplicar/deshacer reconciliaciones de
  notas de crédito/devoluciones, ver y editar cuentas contables alternas en Clientes/Proveedores.
- **Sin acceso esperado**: nada particular a restringir dentro de lo financiero — es el rol más
  amplio de esta área.

### Accounts User
Asistente contable — opera pero sin control total (ej. sin poder reconfigurar catálogo de
cuentas o parametrización fiscal).
- **Acceso esperado**: registrar pagos, ver Cuentas por Cobrar/Pagar, conciliar documentos.
- **Sin acceso esperado**: Configuración fiscal/contable, crear/editar cuentas contables,
  reportes de auditoría avanzados.

---

## Inventario (Stock)

La distinción entre estos tres roles es **"qué es el producto" (Item Manager) vs. "cuánto hay y
dónde" (Stock Manager/User)** — no son equivalentes aunque en ERPNext ambos suelen tener permiso
de escritura sobre el doctype `Item` de fábrica. En la UI conviene separarlos por la intención
principal de cada uno, no por lo que el permiso crudo de ERPNext técnicamente permite.

### Stock Manager
Control completo de los **movimientos y existencias** de inventario — no es dueño del maestro de
artículos, aunque pueda tocarlo incidentalmente.
- **Acceso esperado**: Inventario completo (kardex, ajustes/conteos físicos, transferencias entre
  almacenes, valorización), gestión de Almacenes (crear/editar Warehouse), Compras/Recepciones en
  lectura (para conciliar existencias). Catálogo en **solo lectura** (necesita ver el artículo
  para moverlo, no para redefinirlo).
- **Sin acceso esperado**: crear/editar Categorías, Marcas o Artículos, definir plantillas de
  impuesto por artículo, combos — eso es de Item Manager.

### Stock User
Versión sin visibilidad gerencial de Stock Manager — opera movimientos día a día.
- **Acceso esperado**: registrar movimientos/transferencias, consultar existencias, recepción de
  mercancía. Catálogo en solo lectura.
- **Sin acceso esperado**: ajustes de inventario con impacto contable/valorización, crear/editar
  Almacenes, cualquier edición de Catálogo, eliminar registros de stock.

### Item Manager
Dueño del **maestro de artículos** (catálogo) — define qué vendemos/compramos, no cuánto hay.
- **Acceso esperado**: Catálogo completo (Categorías, Marcas, Artículos, Combos, atributos,
  plantillas de impuesto por artículo, listas de precio/UOM). Inventario en **solo lectura**
  (útil para ver existencias al definir un artículo, ej. antes de descontinuarlo).
- **Sin acceso esperado**: ajustes de inventario, transferencias, conteos físicos, gestión de
  Almacenes — eso es de Stock Manager/User.

---

## Reportes / Analítica

### Report Manager
Puede crear y administrar reportes personalizados (Report Builder / Query Report) a nivel de
todo el sistema.
- **Acceso esperado**: sección de Reportes (crear/editar reportes custom, si el frontend expone
  esa capacidad) además de ver los reportes estándar.
- **Sin acceso esperado**: nada de negocio transaccional por este rol solo — normalmente se
  combina con otro rol de área.

### Prepared Report User
Puede generar y descargar "Prepared Reports" (reportes pesados que corren en background).
- **Acceso esperado**: botón de "generar/descargar reporte" en Reportes, para reportes que usen
  ese mecanismo.
- **Sin acceso esperado**: n/a — es un permiso aditivo específico, no reemplaza otros roles.

### Analytics
Acceso al módulo de Analítica/BI nativo de Frappe (dashboards con gráficos configurables).
- **Acceso esperado**: si el frontend expone dashboards analíticos custom, este es el rol lógico
  para habilitarlos.

### Dashboard Manager
Puede crear/editar Dashboards nativos de Frappe (los widgets/gráficos configurables del Desk).
- **Acceso esperado**: administración de Dashboard (si se expone edición, no solo lectura).

### Auditor
(ver sección Core — es transversal, no específico de un área)

---

## Administración técnica / Desk (rara vez relevante para el frontend de negocio)

### Script Manager
Puede crear/editar Server Scripts y Client Scripts (código custom dentro de ERPNext).
- **Acceso esperado**: ninguno en el frontend de negocio — es una capacidad de desarrollador
  sobre el Desk nativo, no una pantalla de este BFF.

### Workspace Manager
Puede reorganizar los Workspaces (páginas de inicio) del Desk nativo.
- **Acceso esperado**: ninguno en el frontend de negocio — mismo caso que Script Manager.

### Translator
Puede editar traducciones del sistema (el mecanismo que usamos para los labels de roles en
español).
- **Acceso esperado**: ninguno particular en este frontend salvo que se construya una pantalla
  de administración de traducciones.

### Inbox User
Acceso a la bandeja de entrada de Email nativa de Frappe (Email Inbox).
- **Acceso esperado**: irrelevante para este frontend salvo que se integre esa bandeja.

### Knowledge Base Contributor / Knowledge Base Editor
Pueden crear (Contributor) o publicar (Editor) artículos en la Base de Conocimiento nativa de
Frappe (help articles).
- **Acceso esperado**: irrelevante salvo que el frontend exponga una sección de ayuda/KB propia
  basada en este módulo nativo.

### Support Team
Rol del módulo de Helpdesk/Issues nativo (tickets de soporte).
- **Acceso esperado**: irrelevante salvo que se use el Helpdesk nativo de ERPNext.

---

## Portal (usuarios externos — clientes/proveedores/empleados con login)

### Customer
Rol asignado automáticamente a un **usuario del portal** vinculado a un `Customer` (no a un
empleado interno) — le da acceso de solo-lectura a SUS PROPIOS documentos vía el portal web de
ERPNext.
- **Acceso esperado**: si el frontend tiene un "portal de cliente" separado, este rol filtra a
  "solo mis facturas/cotizaciones/saldo". No debería tener acceso a ninguna pantalla interna del
  ERP administrativo.

### Supplier
Análogo a Customer pero para un usuario del portal vinculado a un `Supplier`.
- **Acceso esperado**: portal de proveedor (sus propias órdenes de compra/facturas), nunca
  pantallas internas.

### Employee
Marca que el `User` tiene un registro `Employee` vinculado (RRHH) — no es un rol de permisos de
negocio por sí solo, es más una bandera de "es personal interno".
- **Acceso esperado**: depende enteramente de qué OTROS roles tenga combinados — no condicionar
  UI solo por este rol.

---

## Recursos Humanos (HR) — módulo no implementado en este BFF todavía

### HR Manager
Control completo de RRHH (empleados, nómina, asistencia, permisos).
- **Acceso esperado**: ninguna pantalla existe todavía en este frontend — reservar para cuando
  se implemente el módulo de RRHH (fuera del alcance actual del BACKLOG).

### HR User
Asistente de RRHH sin control total.
- **Acceso esperado**: igual que HR Manager — sin pantallas todavía.

---

## Logística / Delivery / Flota — módulos no implementados en este BFF

### Delivery Manager / Delivery User
Gestión de notas de entrega y logística de despacho.
- **Acceso esperado**: sin pantallas todavía en este frontend (Facturación con `update_stock`
  cubre la salida de inventario, pero no hay un módulo de logística de entrega separado).

### Fulfillment User
Rol de e-commerce/fulfillment nativo de ERPNext (integración con canales de venta online).
- **Acceso esperado**: sin pantallas — este proyecto no integra canales de e-commerce todavía.

### Fleet Manager
Gestión de flota de vehículos (mantenimiento, combustible).
- **Acceso esperado**: sin pantallas — módulo no usado en este proyecto (negocio retail/
distribución, no transporte).

---

## Proyectos / Mantenimiento / Manufactura / Calidad — módulos no usados en este proyecto

### Projects Manager / Projects User
Gestión de proyectos y tareas nativa de ERPNext.

### Maintenance Manager / Maintenance User
Gestión de mantenimiento de equipos/contratos de servicio.

### Manufacturing Manager / Manufacturing User
Gestión de órdenes de producción, BOM, planificación de manufactura.

### Quality Manager
Gestión de procedimientos/inspecciones de calidad.

Ninguno de estos aplica al dominio de este ERP (retail/distribución RD, ver
`docs/ARCHITECTURE.md`) — no hay pantallas correspondientes en el frontend y no deberían
aparecer como opciones relevantes al asignar roles a un usuario de negocio típico.

---

## Marketing / Newsletter / Website — módulos no usados en este proyecto

### Marketing Manager
Gestión de campañas de marketing nativas de ERPNext (CRM).

### Newsletter Manager
Envío de boletines/newsletters nativos de Frappe.

### Website Manager
Administración del sitio web público que ERPNext puede generar (páginas, blog, portal).

Ninguno de estos tiene pantalla equivalente en este frontend — el sistema no usa el módulo CRM
ni el sitio web público de ERPNext.

---

## Educación — fuera de alcance

### Academics User
Rol del módulo de Educación de ERPNext (instituciones educativas — estudiantes, cursos,
calificaciones). **No aplica a este proyecto** (retail/distribución RD) — no debería ofrecerse
como opción al asignar roles, y si aparece en algún usuario es probablemente arrastrado del
catálogo estándar de roles de ERPNext, no una asignación intencional.

---

## Resumen rápido — qué mostrar por defecto según combinación de roles

| Si el usuario tiene... | Mostrar en el frontend |
|---|---|
| `System Manager` | Todo, incluyendo Usuarios y Configuración |
| `Sales Manager` / `Sales Master Manager` | Facturación, Cotizaciones, Pedidos, Clientes, CxC, Reportes de venta |
| `Sales User` | Facturación (crear), catálogo de solo lectura |
| `Purchase Manager` / `Purchase Master Manager` | Compras, Gastos, Devoluciones, Proveedores, CxP, Reportes 606 |
| `Purchase User` | Compras/Gastos (crear), proveedores de solo lectura |
| `Accounts Manager` / `Accounts User` | Cuentas por Cobrar/Pagar, Configuración fiscal (solo Manager) |
| `Stock Manager` / `Stock User` | Inventario (movimientos/ajustes/almacenes) — Catálogo solo lectura |
| `Item Manager` | Catálogo (categorías/marcas/artículos/combos) — Inventario solo lectura |
| `Auditor` | Todo en modo solo-lectura |
| `Cajero POS` | Solo POS |
| `Customer` / `Supplier` | Solo portal externo — nunca el ERP administrativo |
| Cualquiera de HR/Delivery/Fleet/Projects/Maintenance/Manufacturing/Quality/Marketing/Academics/Website | Ignorar — sin pantalla equivalente en este frontend |

Este resumen es un punto de partida razonable, no una política de seguridad — la decisión final
de qué combinación de roles habilita qué botón queda a criterio de negocio del frontend.
