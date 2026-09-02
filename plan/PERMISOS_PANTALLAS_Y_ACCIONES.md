> 📋 **PLAN — no implementado todavía.** Escrito para que un agente de IA (o una persona) lo lea
> e implemente directamente. Complementa, no reemplaza, a [`roles.md`](../roles.md) (qué es cada
> rol) y [`plan/PERMISOS_POR_ROL.md`](./PERMISOS_POR_ROL.md) (un hook de UI para ocultar/mostrar
> módulos completos en el frontend). Este documento resuelve el nivel de detalle que faltaba:
> **cada pantalla y cada botón** de la aplicación, mapeado al motor de permisos real que ya existe
> (`/config/permisos`), más una propuesta de **roles con permisos precargados** para que un admin
> no tenga que armar la matriz a mano por cada usuario.

# Sistema de Permisos — pantallas, botones y roles predefinidos

## 0. Objetivo

Diseñar un sistema de permisos **elegante y completo** que cubra absolutamente toda la
aplicación — cada pantalla es un permiso distinto, y dentro de cada pantalla cada botón de
acción (Nueva, Editar, Eliminar, Someter, Anular, Ver PDF, Descargar PDF, Imprimir, Devolver,
Ver asientos, etc.) es también un permiso independiente — reutilizando en la mayor medida
posible el motor de permisos que **ERPNext ya trae de fábrica**, con sus nombres traducidos al
español, en vez de inventar un modelo paralelo. Sobre ese motor, se definen **roles con una
serie predeterminada de permisos** para que el administrador del tenant asigne un rol y listo,
sin tener que tocar la matriz permiso por permiso para cada usuario nuevo.

## 1. Principio rector: un solo motor de permisos, no dos

El backend (ERPNext/Frappe) ya implementa exactamente el motor que se necesita, y el frontend
**ya lo expone** en `/config/permisos` (`PermisosPage.tsx` + `src/shared/api/permisos.ts`):
una matriz **DocType × Rol × Nivel de permiso**, con 14 verbos (`PERMISO_PTYPES`) ya rotulados en
español:

| ptype (interno) | Etiqueta en español | Ya usado hoy en |
|---|---|---|
| `read` | Leer | Ver cualquier pantalla de detalle/listado |
| `write` | Escribir | Editar un borrador |
| `create` | Crear | Botón "Nuevo/Nueva" |
| `delete` | Eliminar | Eliminar un borrador |
| `submit` | Confirmar | Botón "Someter" |
| `cancel` | Cancelar | Botón "Anular"/"Cancelar" sobre un documento sometido |
| `amend` | Enmendar | Botón "Enmendar" sobre un documento cancelado |
| `report` | Reportes | Aparecer en listados de reportes/consultas agregadas |
| `export` | Exportar | Descargar Excel/CSV |
| `import` | Importar | Cargar XML e-CF, importar líneas desde otro documento |
| `share` | Compartir | (reservado, no usado activamente en la UI hoy) |
| `print` | Imprimir | Ver/Descargar PDF, Imprimir POS, Imprimir cheque, Imprimir etiqueta |
| `email` | Correo | Envío de documento por correo (si se habilita a futuro) |
| `select` | Seleccionar | Aparecer como opción en buscadores/selectores de otros formularios |

**Decisión de diseño**: no crear una tabla nueva "permiso por pantalla". En vez de eso, cada
pantalla/botón de este inventario se mapea a un par **(DocType, ptype)** de esa misma matriz.
Esto significa:

- El backend ya sabe hacer cumplir esto (permisos reales, no solo UI que oculta un botón).
- El admin ya tiene una pantalla (`/config/permisos`) para ajustar cualquier caso fino.
- Lo único que falta es (a) el catálogo de qué DocType/ptype gobierna cada botón — este
  documento — y (b) **roles con una configuración inicial sensata**, para que el 95% de los
  casos no requiera tocar la matriz manualmente.

## 2. Acciones de negocio sin ptype estándar (capa 2)

Varias acciones de este ERP no son un CRUD genérico: **transicionan un documento hacia otro
documento o estado específico del negocio** (p. ej. "Generar Orden" desde una Solicitud de
Compra, "Recibir" desde una Orden de Compra, "Activar contingencia" de e-CF). ERPNext no tiene
un ptype para "esta acción de botón específica" — el estándar de Frappe resuelve esto exigiendo
el permiso `create` sobre el **DocType destino** que la acción genera, más `write`/`submit`
sobre el DocType origen. Se sigue esa misma convención en vez de inventar ptypes nuevos:

| Acción de negocio | Se resuelve como |
|---|---|
| "Generar Orden" (desde Solicitud de Compra) | `create` en **Purchase Order** + `write` en **Material Request** |
| "Recibir" (desde Orden de Compra) | `create` en **Purchase Receipt** + `write` en **Purchase Order** |
| "Facturar" (desde Orden/Recepción/Pedido apartado) | `create` en **Purchase Invoice**/**Sales Invoice** + `write` en el doc origen |
| "Devolver producto(s)" / "Devolución" | `create` en **Sales Invoice**/**Purchase Invoice** (como nota de retorno) |
| "Emitir Nota de Crédito" | `create` en **Sales Invoice** (retorno) — no es DocType nuevo en ERPNext |
| "Aplicar saldo a favor / Nota de Crédito" | `write` en el documento que recibe la aplicación (p. ej. **Purchase Invoice**, **Sales Invoice**) |
| "Cerrar / Reabrir / En espera" (Orden de Compra), "Detener/Reanudar" (Solicitud) | `write` en el DocType respectivo (son solo cambios de `status`, no requieren ptype nuevo) |
| "Confirmar cierre de período" | `submit` en **Period Closing Voucher** |
| "Recalcular Valuación" | `write` en **Stock Settings** (o el DocType/singleton de configuración de inventario) |
| "Resetear contraseña" | `write` en **User** |
| "Probar notificaciones" | `write` en el singleton de configuración de Notificaciones |
| "Aceptar/Rechazar e-CF recibido", "Vincular" | `write` en el DocType custom **e-CF Recibido** (a confirmar nombre exacto con backend) |
| "Activar/Desactivar Contingencia", "Vaciar cola" | `write` en el singleton/DocType custom de configuración e-CF |
| "Restablecer a estándar" (permisos) | Acción exclusiva de **System Manager** — no delegable por rol, ver §6 |

> ⚠️ Los DocTypes marcados como "custom" (tesorería: Emisión/Depósito/Transferencia
> Interna/Cheque/Plantilla de Cheque; e-CF Recibido/Emitido/Contingencia; Turno POS) no son
> DocTypes nativos de ERPNext — son doctypes propios de este proyecto. Antes de implementar la
> matriz de permisos hay que **confirmar sus nombres exactos con el backend** (probablemente ya
> existen como DocTypes de Frappe, dado que `Payment Entry`/`Journal Entry` aparecen como
> `documentoOrigen` de Emisión/Depósito en `types.ts:4785,4838` — sugiere que Emisión/Depósito
> **son** Payment Entry/Journal Entry con un `voucher_type` específico, no doctypes nuevos).

## 3. Catálogo de pantallas → DocType → acciones → permiso

Convención de la tabla: **Acción** es el botón tal como aparece en la UI; **Permiso** es
`DocType.ptype` (o la combinación de capa 2 si no es CRUD estándar). Cuando el DocType exacto
no está confirmado, se marca `(custom?)`.

### 3.1 Catálogo (Item / Categorías / Marcas / Atributos / Precios)

| Pantalla | Acción | Permiso |
|---|---|---|
| Lista de Productos/Servicios | Nuevo | `Item.create` |
| " | Ver | `Item.read` |
| " | Activar/Desactivar | `Item.write` |
| Detalle de Artículo | Editar | `Item.write` |
| " | Actualizar Precios | `Item Price.write` |
| " | Imprimir etiqueta | `Item.print` |
| " | Agregar/Generar variantes | `Item.create` |
| " | Asignar/Mover/Quitar ubicación | `Warehouse.write` (o `Bin`/`Stock Entry.create` si mueve stock) |
| Categorías (Item Group) | Nueva / Editar / Eliminar | `Item Group.create` / `.write` / `.delete` |
| Marcas (Brand) | Nueva / Editar / Eliminar | `Brand.create` / `.write` / `.delete` |
| Atributos (Item Attribute) | Nuevo / Editar | `Item Attribute.create` / `.write` |
| Descuentos (Pricing Rule) | Nueva / Editar / Activar-Desactivar | `Pricing Rule.create` / `.write` |
| Combos (Product Bundle) | Nuevo / Editar / Desactivar | `Product Bundle.create` / `.write` |
| Cuentas por Pagar (catálogo fiscal) | Nueva / Editar / Deshabilitar | `(custom?) Payable Account.create/.write` |

### 3.2 Compras

| Pantalla | Acción | Permiso |
|---|---|---|
| Compra (Purchase Invoice) — lista | Nueva | `Purchase Invoice.create` |
| Detalle de Compra | Editar / Impacto contable (preview) | `Purchase Invoice.write` |
| " | Someter | `Purchase Invoice.submit` |
| " | Eliminar (borrador) | `Purchase Invoice.delete` |
| " | Ver PDF / Descargar PDF | `Purchase Invoice.print` |
| " | Anular | `Purchase Invoice.cancel` |
| " | Enmendar | `Purchase Invoice.amend` |
| " | Devolución | `Purchase Invoice.create` (doc de retorno) + `Purchase Invoice.write` (origen) |
| " | Ver asientos | `Journal Entry.read` |
| " | Aplicar/deshacer saldo a favor CxP | `Purchase Invoice.write` |
| " | Importar líneas desde Orden de Compra | `Purchase Invoice.import` |
| Recepción (Purchase Receipt) — lista/detalle | Nueva / Editar | `Purchase Receipt.create` / `.write` |
| " | Someter | `Purchase Receipt.submit` |
| " | Imprimir etiquetas | `Purchase Receipt.print` |
| " | Facturar | `Purchase Invoice.create` + `Purchase Receipt.write` |
| " | Anular / Enmendar | `Purchase Receipt.cancel` / `.amend` |
| Solicitud de Compra (Material Request) | Nueva / Editar / Someter | `Material Request.create` / `.write` / `.submit` |
| " | Generar Orden | `Purchase Order.create` + `Material Request.write` |
| " | Detener/Reanudar/Anular/Enmendar | `Material Request.write` / `.cancel` / `.amend` |
| Orden de Compra (Purchase Order) | Nueva / Editar / Someter | `Purchase Order.create` / `.write` / `.submit` |
| " | Recibir | `Purchase Receipt.create` + `Purchase Order.write` |
| " | Facturar | `Purchase Invoice.create` + `Purchase Order.write` |
| " | En Espera/Cerrar/Reabrir | `Purchase Order.write` |
| " | Anular / Enmendar | `Purchase Order.cancel` / `.amend` |
| Costos de Importación (Landed Cost Voucher) | Someter / Anular | `Landed Cost Voucher.submit` / `.cancel` |
| Devolución de Compra | Nueva / Editar / Someter / Eliminar | igual a Compra (es `Purchase Invoice` con `is_return`) |
| " | Ver/Descargar PDF, Anular, Enmendar | `Purchase Invoice.print` / `.cancel` / `.amend` |
| " | Aplicar a CxP / Revertir aplicación | `Purchase Invoice.write` |

### 3.3 Gastos

Modelado como `Purchase Invoice` de tipo gasto o un DocType propio "Gasto" — confirmar con
backend cuál es. Se listan las acciones asumiendo DocType `Expense Claim` o custom `Gasto`:

| Pantalla | Acción | Permiso |
|---|---|---|
| Gasto — lista/detalle | Nuevo / Editar | `Gasto.create` / `.write` *(custom?)* |
| " | Impacto contable / Someter | `Gasto.write` / `.submit` |
| " | Ver asientos | `Journal Entry.read` |
| " | Anular / Enmendar | `Gasto.cancel` / `.amend` |
| " | Saldo a favor CxP (aplicar/deshacer) | `Gasto.write` |

### 3.4 Facturación (Ventas)

| Pantalla | Acción | Permiso |
|---|---|---|
| Factura (Sales Invoice) — lista | Nueva | `Sales Invoice.create` |
| Detalle de Factura | Editar / Cancelar borrador | `Sales Invoice.write` |
| " | Someter | `Sales Invoice.submit` |
| " | Aplicar/remover Saldo a favor / Nota de Crédito | `Sales Invoice.write` |
| " | Ver PDF / Descargar PDF / PDF-A (e-CF) | `Sales Invoice.print` |
| " | Imprimir POS | `Sales Invoice.print` (o permiso propio `pos_print` si se quiere separar del PDF fiscal) |
| " | Devolver producto(s) | `Sales Invoice.create` (retorno) + `Sales Invoice.write` |
| " | Ver asientos | `Journal Entry.read` |
| " | Emitir Nota de Crédito | `Sales Invoice.create` (retorno) |
| " | Cancelar (con motivo DGII) | `Sales Invoice.cancel` |
| " | Enmendar | `Sales Invoice.amend` |
| Notas de Crédito — lista | Nueva Nota de Crédito | `Sales Invoice.create` |
| " | Reembolsar | `Payment Entry.create` |
| " | Aplicar / Deshacer | `Sales Invoice.write` |
| " | Descargar PDF | `Sales Invoice.print` |
| Notas de Débito — lista | Nueva / Descargar PDF | `Sales Invoice.create` / `.print` (o DocType propio de nota de débito) |
| Devoluciones (ventas) | Descargar PDF / Cancelar | `Sales Invoice.print` / `.cancel` |

### 3.5 Pedidos de Venta (Sales Order)

| Pantalla | Acción | Permiso |
|---|---|---|
| Lista de Pedidos | Nuevo / Duplicar | `Sales Order.create` |
| " | Cancelar (desde el menú de lista) | `Sales Order.cancel` |
| Detalle | Someter / "Someter Apartado" | `Sales Order.submit` |
| " | Editar | `Sales Order.write` |
| " | Cancelar / Cancelar Apartado | `Sales Order.cancel` |
| " | Facturar Apartado | `Sales Invoice.create` + `Sales Order.write` |
| " | Enmendar | `Sales Order.amend` |
| " | Descargar PDF | `Sales Order.print` |

### 3.6 Cotizaciones (Quotation)

| Pantalla | Acción | Permiso |
|---|---|---|
| Lista | Nueva / Duplicar / Cancelar | `Quotation.create` / `.cancel` |
| Detalle | Editar / Someter / Eliminar | `Quotation.write` / `.submit` / `.delete` |
| " | Convertir (a Pedido/Factura) | `Sales Order.create` / `Sales Invoice.create` + `Quotation.write` |
| " | Descargar PDF | `Quotation.print` |

### 3.7 Tesorería

Confirmar con backend si Emisión/Depósito/Transferencia Interna son `Payment Entry`/`Journal
Entry` con `voucher_type` distinto (lo sugiere `types.ts:4785,4838`) o DocTypes custom
independientes; se listan bajo esa hipótesis:

| Pantalla | Acción | Permiso |
|---|---|---|
| Tipos de Documento | Nuevo / Editar / Deshabilitar | `(custom) Mode of Payment.create/.write` |
| Emisión (egreso) | Nueva / Editar / Someter / Anular / Imprimir | `Payment Entry.create/.write/.submit/.cancel/.print` |
| Depósito (ingreso) | ídem | `Payment Entry.*` |
| Transferencia Interna | Nueva / Editar / Someter / Anular | `Journal Entry.*` |
| Movimientos de Banco | (solo lectura) | `Bank Account.read` |
| Cheques — detalle | Imprimir / Anular | `Payment Entry.print` / `.cancel` |
| Plantillas de Cheque | Nueva / Editar | `(custom) Cheque Template.create/.write` |

### 3.8 Cobros / Caja / Cuentas por Pagar / POS

| Pantalla | Acción | Permiso |
|---|---|---|
| Caja — Pendientes de Cobro / Por Cobrar | Cobrar | `Payment Entry.create` |
| " | Descartar | `Payment Entry.write` |
| Turnos POS | Cerrar turno | `(custom) POS Opening/Closing Entry.write` |
| " | Descargar PDF (cierre) | `.print` |
| Registrar Pago (cobro/pago) | Guardar/Someter | `Payment Entry.create` / `.submit` |
| Aging de Cobros/Proveedores | Descargar PDF | `Payment Entry.report` |
| Detalle de Cobro/Pago | Someter / Imprimir / Cancelar | `Payment Entry.submit` / `.print` / `.cancel` |

### 3.9 Contabilidad

| Pantalla | Acción | Permiso |
|---|---|---|
| Plan de Cuentas | Nueva cuenta / Editar | `Account.create` / `.write` |
| Asientos (Journal Entry) | Nuevo / Guardar borrador | `Journal Entry.create` |
| " | Someter / Cancelar | `Journal Entry.submit` / `.cancel` |
| Cierre de Período | Confirmar cierre | `Period Closing Voucher.submit` |
| Libro Diario / Libro Mayor | Ver / Descargar PDF | `Journal Entry.report` / `.print` |

### 3.10 Inventario

| Pantalla | Acción | Permiso |
|---|---|---|
| Conteos Físicos (Stock Reconciliation) | Nuevo / Guardar borrador | `Stock Reconciliation.create` |
| " | Someter | `Stock Reconciliation.submit` |
| Zonas y Ubicaciones (Warehouse) | Nueva / Editar / Activar-Desactivar / Eliminar | `Warehouse.create` / `.write` / `.delete` |
| Recalculo de Valuación | Recalcular | `Stock Settings.write` |

### 3.11 Terceros (Clientes / Proveedores)

| Pantalla | Acción | Permiso |
|---|---|---|
| Clientes | Nuevo / Editar / Desactivar | `Customer.create` / `.write` |
| " | Descargar Estado de Cuenta | `Customer.report` / `.print` |
| Proveedores | Nuevo / Editar / Desactivar | `Supplier.create` / `.write` |

### 3.12 Otros módulos

| Pantalla | Acción | Permiso |
|---|---|---|
| Transferencias entre Almacenes | Nueva / Confirmar / Cancelar | `Stock Entry.create` / `.submit` / `.cancel` |
| e-CF Recibidos | Cargar XML / Vincular | `(custom) e-CF Recibido.import` / `.write` |
| " | Aceptar / Rechazar | `(custom) e-CF Recibido.write` |
| e-CF Emitidos | Refrescar estado / Descargar PDF-A | `Sales Invoice.report` / `.print` |
| Usuarios | Nuevo / Editar / Deshabilitar / Restablecer contraseña | `User.create` / `.write` |
| Reportes (606/607/608/etc.) | Generar/Descargar Excel/PDF | `<DocType del reporte>.report` / `.export` / `.print` |
| Plantillas de Factura/Etiqueta | Guardar / Usar plantilla | `(custom) Print Format.write` |

### 3.13–3.14 Configuración

Todas las pantallas de `/config/*` (Almacenes, Métodos de Pago, UOM, Listas de Precio,
Secuencias NCF, Impuestos, Ejercicio Fiscal, Grupos de Clientes, Configuración de Facturación,
Denominaciones, Empresa, e-CF Admin/Certificación/Contingencia, Sucursales, Cajas, Centros de
Costo, Bancos, Cuentas Bancarias, Departamentos, Impresoras, Retenciones, Ajustes Avanzados,
Notificaciones) siguen el mismo patrón: **Nuevo → `<DocType>.create`**, **Editar →
`<DocType>.write`**, **Eliminar/Deshabilitar → `<DocType>.delete`/`.write`**, sobre su DocType
respectivo (`UOM`, `Mode of Payment`, `Price List`, `Warehouse`, `Tax Withholding Category`,
`Cost Center`, `Bank`, `Bank Account`, `Department`, `Branch`, `Company`, etc.). No se repite
tabla fila por fila porque el patrón es 1:1 — ver `PLAN_PERMISOS_PANTALLAS_CONFIG` (anexo, si se
requiere el detalle exhaustivo campo por campo, generarlo en una segunda pasada una vez
confirmados los DocTypes custom de e-CF/Tesorería).

Las pantallas `Roles` y `Permisos` (`/config/roles`, `/config/permisos`) son ellas mismas la capa
de administración del motor — su propio permiso es `Role.write` / `.create` / `.delete` para
Roles, y una regla especial: **solo `System Manager` puede escribir en la matriz de Permisos**
(no se delega ni siquiera a otros roles gerenciales, para evitar que un rol se auto-otorgue
permisos). Esto ya está implementado hoy vía `useIsSystemManager()`.

---

## 4. Roles predefinidos (plantillas de permisos)

El objetivo de esta sección es que **crear un usuario nuevo sea: elegir un rol → listo**, sin
tocar `/config/permisos` caso por caso. Se parte del catálogo de roles ya documentado en
[`roles.md`](../roles.md) (que ya usa nombres/roles nativos de ERPNext) y se les da una
**matriz de permisos concreta** por DocType, expresada como nivel de acceso resumido en vez de
repetir las 14 columnas por fila (el detalle fino sigue viviendo en `/config/permisos`; esto es
el **valor con el que se debe precargar** cada rol la primera vez que se crea en el tenant).

Niveles usados en la tabla: **Todo** (`create`+`write`+`submit`+`cancel`+`amend`+`print`+
`report`+`export`+`delete` cuando aplique), **Operar** (`create`+`write`+`submit`+`print`, sin
`cancel`/`delete`/`amend` — para roles operativos que no deben anular documentos ya sometidos),
**Solo lectura** (`read`+`report`+`print`), **Sin acceso** (ninguna fila en la matriz para ese
DocType/rol).

| Rol | Ventas (Sales Invoice/Order/Quotation) | Compras (Purchase Invoice/Order/Receipt/Material Request) | Gastos | Contabilidad (Account/Journal Entry) | Tesorería (Payment Entry) | Inventario (Stock Entry/Reconciliation/Warehouse) | Catálogo (Item/Item Group/Brand) | Clientes | Proveedores | Reportes | Configuración | Usuarios/Roles/Permisos |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Administrador del Sistema** (System Manager) | Todo | Todo | Todo | Todo | Todo | Todo | Todo | Todo | Todo | Todo | Todo | Todo |
| **Gerente de Ventas** (Sales Manager) | Todo | Sin acceso | Sin acceso | Solo lectura | Operar (cobros) | Solo lectura | Solo lectura | Todo | Sin acceso | Solo lectura (ventas) | Sin acceso | Sin acceso |
| **Vendedor** (Sales User) | Operar | Sin acceso | Sin acceso | Sin acceso | Operar (cobros) | Solo lectura | Solo lectura | Operar (sin eliminar) | Sin acceso | Sin acceso | Sin acceso | Sin acceso |
| **Cajero POS** | Operar (solo Sales Invoice, sin `cancel`) | Sin acceso | Sin acceso | Sin acceso | Operar (Payment Entry, solo su turno) | Solo lectura | Solo lectura | Solo lectura | Sin acceso | Sin acceso | Sin acceso | Sin acceso |
| **Gerente de Compras** (Purchase Manager) | Sin acceso | Todo | Todo | Solo lectura | Operar (pagos) | Solo lectura | Solo lectura | Sin acceso | Todo | Solo lectura (compras/606) | Sin acceso | Sin acceso |
| **Comprador** (Purchase User) | Sin acceso | Operar | Operar | Sin acceso | Sin acceso | Solo lectura | Solo lectura | Sin acceso | Solo lectura | Sin acceso | Sin acceso | Sin acceso |
| **Contador** (Accounts Manager) | Solo lectura | Solo lectura | Solo lectura | Todo | Todo | Solo lectura | Sin acceso | Solo lectura (cuentas) | Solo lectura (cuentas) | Todo (financieros) | Fiscal/contable (NCF, retenciones, impuestos, cuentas bancarias) | Sin acceso |
| **Asistente Contable** (Accounts User) | Sin acceso | Sin acceso | Sin acceso | Operar (sin `cancel` en asientos) | Operar | Sin acceso | Sin acceso | Sin acceso | Sin acceso | Solo lectura | Sin acceso | Sin acceso |
| **Gerente de Inventario** (Stock Manager) | Sin acceso | Solo lectura (recepciones) | Sin acceso | Sin acceso | Sin acceso | Todo | Solo lectura | Sin acceso | Sin acceso | Solo lectura (inventario) | Almacenes | Sin acceso |
| **Encargado de Almacén** (Stock User) | Sin acceso | Solo lectura | Sin acceso | Sin acceso | Sin acceso | Operar (sin ajustes de valuación) | Solo lectura | Sin acceso | Sin acceso | Sin acceso | Sin acceso | Sin acceso |
| **Gerente de Catálogo** (Item Manager) | Sin acceso | Sin acceso | Sin acceso | Sin acceso | Sin acceso | Solo lectura | Todo | Sin acceso | Sin acceso | Sin acceso | Sin acceso | Sin acceso |
| **Auditor** | Solo lectura | Solo lectura | Solo lectura | Solo lectura | Solo lectura | Solo lectura | Solo lectura | Solo lectura | Solo lectura | Todo (`report`) | Solo lectura | Solo lectura |

Reglas transversales que aplican a **todos** los roles menos System Manager:

- Nadie más que **System Manager** puede escribir en `/config/permisos` ni usar "Restablecer a
  estándar" — evita que un rol se auto-eleve privilegios.
- Nadie más que **System Manager** administra `Usuarios`/`Roles` ni las pantallas
  `e-CF Admin`/`e-CF Certificación`/`e-CF Contingencia` (ya reforzado hoy por
  `useIsSystemManager()`).
- **Auditor** nunca tiene `write`/`create`/`submit`/`cancel`/`delete`/`amend` en ningún DocType
  — solo `read`/`report`/`print`/`export`. Es el rol de "ver todo, tocar nada".
- **Cajero POS** debe quedar acotado además por sucursal/turno (esto no lo resuelve la matriz de
  permisos por sí sola — requiere el filtro de datos ya señalado en
  `plan/PERMISOS_POR_ROL.md` §6.2).

## 5. Cómo se materializa esto en el producto

1. **Backend / provisioning**: al crear el tenant (o via un endpoint de "sembrar roles
   estándar"), crear los 12 roles de la tabla §4 con sus reglas de permiso ya cargadas en la
   tabla nativa de Frappe (`DocPerm`) — usando el mismo mecanismo que hoy pobla los permisos de
   fábrica que ve el botón "Restablecer a estándar" en `PermisosPage.tsx`. Esto es trabajo de
   backend, no de este frontend.
2. **Frontend — pantalla `Roles`** (`/config/roles`): al crear un rol nuevo, ofrecer un
   selector "Crear desde plantilla" con los 12 roles de §4 como opciones (además de "en blanco"),
   que internamente llama a `assignPermiso`/`createPermiso` en lote para precargar la matriz
   completa del rol elegido — así el admin no repite el trabajo manualmente para cada tenant o
   cada rol custom que se parezca a uno estándar.
3. **Frontend — gating de UI**: cada botón de las tablas de §3 debe consultar el permiso real
   del usuario (no solo su rol) antes de renderizarse. Esto requiere que el backend exponga los
   permisos efectivos del usuario autenticado (p. ej. en el payload de `/auth/login` o un
   endpoint `GET /api/v1/me/permisos`) para que el frontend arme un hook
   `useHasPermission(doctype, ptype)` — más fino que el `usePermissions().canView/canMutate`
   de `plan/PERMISOS_POR_ROL.md`, que sigue siendo válido para el filtrado grueso del menú
   lateral (mostrar/ocultar el ítem de menú de un módulo completo), mientras que
   `useHasPermission` gatea el botón individual dentro de la pantalla ya visible.
4. Verificar antes de implementar: confirmar con el equipo de backend los nombres exactos de los
   DocTypes marcados `(custom?)` en este documento (Gasto, Emisión/Depósito/Transferencia
   Interna, Cheque, Plantilla de Cheque, e-CF Recibido/Emitido/Contingencia, POS Opening/Closing
   Entry, Nota de Débito) — son la única pieza de este plan que no se pudo verificar leyendo solo
   el frontend.

## 6. Resumen de lo que falta para implementar esto

- [ ] Backend: confirmar/crear los DocTypes custom marcados arriba y sus DocPerm de fábrica.
- [ ] Backend: endpoint de "sembrar rol desde plantilla" (o exponer permisos de fábrica por rol
      vía la misma API de `/permisos/reset` generalizada a "reset a la plantilla X").
- [ ] Backend: exponer los permisos efectivos del usuario autenticado para consumo del frontend.
- [ ] Frontend: hook `useHasPermission(doctype, ptype)` (nuevo, complementa
      `plan/PERMISOS_POR_ROL.md`).
- [ ] Frontend: selector "Crear desde plantilla" en `RolesPage.tsx`.
- [ ] Frontend: rollout botón por botón según la Fase 3 de `plan/PERMISOS_POR_ROL.md`, ahora
      usando `useHasPermission` en vez de (o además de) `canMutate` por módulo.
