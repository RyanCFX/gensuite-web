# Pantallas y dependencias de API

Inventario de pantallas del frontend (`src/App.tsx`) con su gate de acceso actual y las consultas al BFF que cada una necesita. Objetivo: diseñar permisología por pantalla y por filtro — cada filtro/select de una pantalla se alimenta de uno de los endpoints listados en "Consultas GET".

Total: **192 pantallas** (rutas con componente; se excluyen redirects `Navigate` y `*`).

## Leyenda

- **Gate**: acción del catálogo (`src/shared/permissions/rutas.ts`, primera que matchea) · `solo-SM` = solo rol System Manager (§15, no va por acción) · `solo-farmacia` = vertical farmacia · `feat:X` = feature del tenant (`src/shared/features/catalog.ts`, ausente = núcleo, siempre visible). `—` = sin acción (autoservicio o fail-open; la seguridad real la aplica el backend).
- **Filtros UI** (señales en el código de la pantalla): `SS` = SearchSelect/buscador con opciones del API · `S` = Select · `N` = `<select>` nativo · `Filtros` = barra de filtros · `Fecha` = input de fecha · `Check` = checkboxes · `Tabs` = tabs internos.
- **Consultas GET**: endpoints `GET /api/v1…` (prefijo omitido) que la pantalla consume — incluyen el dato principal y los catálogos que alimentan selects/filtros. Incluye componentes hijos directos (hasta 2 niveles) del archivo de la ruta.
- **Mutaciones**: `POST/PUT/PATCH/DELETE` que la pantalla puede disparar.
- Metodología: extracción estática de `import { fn } from '@/shared/api/*'` por archivo de ruta + hijos relativos, con `fn → endpoint` resuelto desde `src/shared/api/endpoints.ts` (y URLs literales donde el módulo no usa `ENDPOINTS`). Casos dinámicos (endpoints armados a mano fuera de la capa api) pueden faltar; el archivo de la columna Pantalla es la referencia exacta.

## Acceso y páginas públicas (sin login) (6)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/login` | LoginPage<br>`pages/LoginPage.tsx` | — | N×1 | — | `POST /auth/login`<br>`POST /auth/mfa/resend`<br>`POST /auth/mfa/verify`<br>`POST /auth/switch-tenant` |
| `/forgot-password` | ForgotPasswordPage<br>`pages/ForgotPasswordPage.tsx` | — | — | — | `POST /auth/forgot-password` |
| `/reset-password` | ResetPasswordPage<br>`pages/ResetPasswordPage.tsx` | — | — | — | `POST /auth/reset-password` |
| `/invitacion` | InvitationPage<br>`pages/InvitationPage.tsx` | — | — | `/auth/invitations/:param` | `POST /auth/invitations/:param/accept`<br>`POST /auth/invitations/:param/reject` |
| `/relaciones/invitacion` | RelacionInvitacionPublicPage<br>`pages/RelacionInvitacionPublicPage.tsx` | — | Check×1 | `/relaciones/invitaciones/token/:param` | `POST /relaciones/invitaciones/token/:param/aceptar`<br>`POST /relaciones/invitaciones/token/:param/rechazar` |
| `/oauth/callback` | OauthCallbackPage<br>`pages/OauthCallbackPage.tsx` | — | — | — | `POST /auth/oauth/exchange` |

## Base (dashboard / inicio) (2)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/dashboard` | DashboardPage<br>`features/dashboard/DashboardPage.tsx` | `dashboard.ver` | — | `/dashboard/summary`<br>`/inventory`<br>`/invoices` | — |
| `/inicio` | StartPage<br>`pages/StartPage.tsx` | — | — | — | — |

## Clientes (4)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/clientes` | CustomersPage<br>`features/customers/CustomersPage.tsx` | `clientes.listar` | S×3, Filtros, Check×1 | `/cobros/estado-cuenta/:param/pdf`<br>`/customers` | `DELETE /customers/:param` |
| `/clientes/nuevo` | CustomerForm<br>`features/customers/CustomerForm.tsx` | `clientes.listar` | — | `/config/catalogos-fiscales`<br>`/customers/:param`<br>`/dgii/taxpayers/:param`<br>`/config/facturacion`<br>`/customers/groups/list`<br>`/config/impuestos-ventas`<br>`/config/metodos-pago`<br>`/sucursales`<br>`/usuarios` | `POST /customers`<br>`PUT /customers/:param` |
| `/clientes/:id` | CustomerDetail<br>`features/customers/CustomerDetail.tsx` | `clientes.listar` | — | `/cobros/estado-cuenta/:param/pdf`<br>`/credit-notes/saldo-favor/:param`<br>`/customers/:param`<br>`/cobros/estado-cuenta/:param`<br>`/cobros/saldo-favor/:param`<br>`/cobros/semaforo/:param` | `DELETE /customers/:param`<br>`DELETE /credit-notes/:param/aplicar-a-factura/:param` |
| `/clientes/:id/editar` | CustomerForm<br>`features/customers/CustomerForm.tsx` | `clientes.listar` | — | `/config/catalogos-fiscales`<br>`/customers/:param`<br>`/dgii/taxpayers/:param`<br>`/config/facturacion`<br>`/customers/groups/list`<br>`/config/impuestos-ventas`<br>`/config/metodos-pago`<br>`/sucursales`<br>`/usuarios` | `POST /customers`<br>`PUT /customers/:param` |

## Catálogo (categorías, marcas, items, servicios, atributos) (15)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/catalogo/categorias` | CategoriesPage<br>`features/catalog/CategoriesPage.tsx` | `catalogo.categorias.listar` | SS×1, S×1, Filtros, Check×1, Tabs | `/catalog/categories/:param`<br>`/permisos/catalogo`<br>`/catalog/categories` | `POST /catalog/categories`<br>`DELETE /catalog/categories/:param`<br>`PUT /catalog/categories/:param` |
| `/catalogo/marcas` | BrandsPage<br>`features/catalog/BrandsPage.tsx` | `catalogo.marcas.listar` | SS×2, Filtros | `/catalog/brands`<br>`/catalog/categories` | `POST /catalog/brands`<br>`DELETE /catalog/brands/:param`<br>`PUT /catalog/brands/:param` |
| `/catalogo/cuentas-por-pagar` | CuentasPorPagarPage<br>`features/catalog/CuentasPorPagarPage.tsx` | `catalogo.cuentas-pagar.listar` · feat:cuentasPorPagar | SS×1, S×2, Filtros | `/config/catalogos-fiscales`<br>`/catalog/cuentas-por-pagar` | `POST /catalog/cuentas-por-pagar`<br>`DELETE /catalog/cuentas-por-pagar/:param`<br>`PUT /catalog/cuentas-por-pagar/:param` |
| `/catalogo/combos` | BundlesPage<br>`features/bundles/BundlesPage.tsx` | `catalogo.combos.listar` | S×1, Filtros | `/catalog/bundles/:param`<br>`/catalog/bundles` | `POST /catalog/bundles`<br>`DELETE /catalog/bundles/:param`<br>`PUT /catalog/bundles/:param` |
| `/catalogo/descuentos` | PricingRulesPage<br>`features/catalog/PricingRulesPage.tsx` | `catalogo.descuentos.listar` | S×2, Filtros | `/catalog/brands`<br>`/catalog/categories`<br>`/catalog/items`<br>`/catalog/pricing-rules` | `POST /catalog/pricing-rules`<br>`POST /catalog/pricing-rules/:param/toggle`<br>`PUT /catalog/pricing-rules/:param` |
| `/inventario/productos` | ItemsPage<br>`features/catalog/ItemsPage.tsx` | `catalogo.items.listar` | SS×4, Filtros, Check×1 | `/catalog/brands`<br>`/catalog/categories`<br>`/catalog/items`<br>`/farmacia/principios-activos`<br>`/config/uom` | `POST /catalog/items/:param/toggle` |
| `/inventario/productos/nuevo` | ItemForm<br>`features/catalog/ItemForm.tsx` | `catalogo.items.listar` | SS×12, Check×5 | `/config/empresa`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/catalog/brands`<br>`/catalog/categories`<br>`/config/item-tax-templates`<br>`/config/uom`<br>`/inventory/warehouses` | `POST /catalog/items`<br>`PUT /catalog/items/:param`<br>`POST /catalog/items/:param/imagen` |
| `/inventario/productos/:id/editar` | ItemForm<br>`features/catalog/ItemForm.tsx` | `catalogo.items.listar` | SS×12, Check×5 | `/config/empresa`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/catalog/brands`<br>`/catalog/categories`<br>`/config/item-tax-templates`<br>`/config/uom`<br>`/inventory/warehouses` | `POST /catalog/items`<br>`PUT /catalog/items/:param`<br>`POST /catalog/items/:param/imagen` |
| `/inventario/productos/:id` | ItemDetail<br>`features/catalog/ItemDetail.tsx` | `catalogo.items.listar` | SS×7, S×2, Check×1 | `/catalog/attributes/:param`<br>`/catalog/items/:param/composicion`<br>`/catalog/items/:param/equivalentes`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/inventory/ubicaciones/item/:param`<br>`/inventory/items/:param/stock-por-dimension`<br>`/catalog/items/:param/variants`<br>`/farmacia/principios-activos`<br>`/inventory/ubicaciones`<br>`/inventory/warehouses`<br>`/inventory/zonas` | `POST /inventory/ubicaciones/asignar`<br>`POST /catalog/items/:param/variants`<br>`POST /catalog/items/:param/variants/generate`<br>`POST /inventory/ubicaciones/mover`<br>`POST /catalog/items/:param/toggle`<br>`DELETE /inventory/ubicaciones/asignar/:param`<br>`PUT /catalog/items/:param/composicion`<br>`PUT /catalog/items/:param/precios` |
| `/catalogo/servicios` | ItemsPage<br>`features/catalog/ItemsPage.tsx` | `catalogo.items.listar` | SS×4, Filtros, Check×1 | `/catalog/brands`<br>`/catalog/categories`<br>`/catalog/items`<br>`/farmacia/principios-activos`<br>`/config/uom` | `POST /catalog/items/:param/toggle` |
| `/catalogo/servicios/nuevo` | ItemForm<br>`features/catalog/ItemForm.tsx` | `catalogo.items.listar` | SS×12, Check×5 | `/config/empresa`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/catalog/brands`<br>`/catalog/categories`<br>`/config/item-tax-templates`<br>`/config/uom`<br>`/inventory/warehouses` | `POST /catalog/items`<br>`PUT /catalog/items/:param`<br>`POST /catalog/items/:param/imagen` |
| `/catalogo/servicios/:id/editar` | ItemForm<br>`features/catalog/ItemForm.tsx` | `catalogo.items.listar` | SS×12, Check×5 | `/config/empresa`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/catalog/brands`<br>`/catalog/categories`<br>`/config/item-tax-templates`<br>`/config/uom`<br>`/inventory/warehouses` | `POST /catalog/items`<br>`PUT /catalog/items/:param`<br>`POST /catalog/items/:param/imagen` |
| `/catalogo/servicios/:id` | ItemDetail<br>`features/catalog/ItemDetail.tsx` | `catalogo.items.listar` | SS×7, S×2, Check×1 | `/catalog/attributes/:param`<br>`/catalog/items/:param/composicion`<br>`/catalog/items/:param/equivalentes`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/inventory/ubicaciones/item/:param`<br>`/inventory/items/:param/stock-por-dimension`<br>`/catalog/items/:param/variants`<br>`/farmacia/principios-activos`<br>`/inventory/ubicaciones`<br>`/inventory/warehouses`<br>`/inventory/zonas` | `POST /inventory/ubicaciones/asignar`<br>`POST /catalog/items/:param/variants`<br>`POST /catalog/items/:param/variants/generate`<br>`POST /inventory/ubicaciones/mover`<br>`POST /catalog/items/:param/toggle`<br>`DELETE /inventory/ubicaciones/asignar/:param`<br>`PUT /catalog/items/:param/composicion`<br>`PUT /catalog/items/:param/precios` |
| `/catalogo/atributos` | AttributesPage<br>`features/catalog/AttributesPage.tsx` | `catalogo.atributos.listar` | Check×1 | `/catalog/attributes/:param`<br>`/catalog/attributes` | `POST /catalog/attributes`<br>`PUT /catalog/attributes/:param` |
| `/catalogo/dimensiones` | DimensionesInventarioPage<br>`features/catalog/DimensionesInventarioPage.tsx` | `catalogo.dimensiones.listar` | S×1, Check×1 | — | `POST /catalog/dimensiones-inventario`<br>`POST /catalog/dimensiones-inventario/:param/valores`<br>`POST /catalog/dimensiones-inventario/:param/toggle`<br>`PUT /catalog/dimensiones-inventario/:param`<br>`PUT /catalog/dimensiones-inventario/:param/valores/:param` |

## Farmacia ARS (vertical) (7)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/farmacia/aseguradoras` | AseguradorasPage<br>`features/aseguradoras/AseguradorasPage.tsx` | `aseguradoras.listar` · solo-farmacia | S×1, Filtros, Check×1 | `/aseguradoras` | `DELETE /aseguradoras/:param` |
| `/farmacia/aseguradoras/nueva` | AseguradoraForm<br>`features/aseguradoras/AseguradoraForm.tsx` | `aseguradoras.listar` · solo-farmacia | — | `/aseguradoras/:param`<br>`/usuarios` | `POST /aseguradoras`<br>`PUT /aseguradoras/:param` |
| `/farmacia/aseguradoras/:id` | AseguradoraDetail<br>`features/aseguradoras/AseguradoraDetail.tsx` | `aseguradoras.listar` · solo-farmacia | — | `/aseguradoras/:param` | `DELETE /aseguradoras/:param` |
| `/farmacia/aseguradoras/:id/editar` | AseguradoraForm<br>`features/aseguradoras/AseguradoraForm.tsx` | `aseguradoras.listar` · solo-farmacia | — | `/aseguradoras/:param`<br>`/usuarios` | `POST /aseguradoras`<br>`PUT /aseguradoras/:param` |
| `/farmacia/lotes` | LotesPage<br>`features/farmacia/LotesPage.tsx` | `farmacia.lotes.listar` · solo-farmacia | SS×1, S×1, Filtros | `/aseguradoras`<br>`/farmacia/lotes` | `POST /farmacia/lotes` |
| `/farmacia/lotes/:id` | LoteDetail<br>`features/farmacia/LoteDetail.tsx` | `farmacia.lotes.listar` · solo-farmacia | — | `/farmacia/lotes/:param/pdf`<br>`/farmacia/lotes/:param`<br>`/farmacia/lotes/facturas-elegibles` | `DELETE ???farmacia.lotes.facturaById`<br>`POST /farmacia/lotes/:param/facturar`<br>`PUT /farmacia/lotes/:param/en-revision`<br>`POST /farmacia/lotes/:param/recalcular`<br>`POST /farmacia/lotes/:param/facturas` |
| `/farmacia/principios-activos` | PrincipiosActivosPage<br>`features/farmacia/PrincipiosActivosPage.tsx` | `farmacia.principios-activos.listar` · solo-farmacia | SS×1, Filtros, Check×3 | `/farmacia/principios-activos` | `POST /farmacia/principios-activos`<br>`DELETE /farmacia/principios-activos/:param`<br>`POST /farmacia/principios-activos/:param/fusionar`<br>`PUT /farmacia/principios-activos/:param` |

## Ventas — Cotizaciones (5)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/cotizaciones` | QuotationsPage<br>`features/quotations/QuotationsPage.tsx` | `cotizaciones.listar` · feat:cotizaciones | SS×2, S×1, Filtros | `/customers`<br>`/quotations`<br>`/sucursales` | `POST /quotations/:param/cancel` |
| `/cotizaciones/nueva` | QuotationForm<br>`features/quotations/QuotationForm.tsx` | `cotizaciones.listar` · feat:cotizaciones | SS×2, Check×1 | `/customers/:param`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/quotations/:param`<br>`/quotations/:param/duplicate-source`<br>`/config/stock-settings`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/customers`<br>`/catalog/items`<br>`/sucursales` | `POST /quotations`<br>`PUT /quotations/:param` |
| `/cotizaciones/:id/editar` | QuotationForm<br>`features/quotations/QuotationForm.tsx` | `cotizaciones.listar` · feat:cotizaciones | SS×2, Check×1 | `/customers/:param`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/quotations/:param`<br>`/quotations/:param/duplicate-source`<br>`/config/stock-settings`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/customers`<br>`/catalog/items`<br>`/sucursales` | `POST /quotations`<br>`PUT /quotations/:param` |
| `/cotizaciones/:id/versions/:version` | QuotationDetail<br>`features/quotations/QuotationDetail.tsx` | `cotizaciones.listar` · feat:cotizaciones | SS×1 | `/quotations/:param/pdf`<br>`/config/catalogos-fiscales`<br>`/customers/:param`<br>`/config/facturacion`<br>`/quotations/:param`<br>`/quotations/:param/versions/:param` | `POST /quotations/:param/cancel`<br>`POST /quotations/:param/convert`<br>`DELETE /quotations/:param`<br>`POST /quotations/:param/submit` |
| `/cotizaciones/:id` | QuotationDetail<br>`features/quotations/QuotationDetail.tsx` | `cotizaciones.listar` · feat:cotizaciones | SS×1 | `/quotations/:param/pdf`<br>`/config/catalogos-fiscales`<br>`/customers/:param`<br>`/config/facturacion`<br>`/quotations/:param`<br>`/quotations/:param/versions/:param` | `POST /quotations/:param/cancel`<br>`POST /quotations/:param/convert`<br>`DELETE /quotations/:param`<br>`POST /quotations/:param/submit` |

## Ventas — Pedidos (5)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/pedidos` | PedidosPage<br>`features/pedidos/PedidosPage.tsx` | `pedidos.listar` · feat:pedidos | SS×2, S×2, Filtros, Check×1 | `/customers`<br>`/pedidos`<br>`/sucursales` | `POST /pedidos/:param/cancel` |
| `/pedidos/nuevo` | PedidoForm<br>`features/pedidos/PedidoForm.tsx` | `pedidos.listar` · feat:pedidos | SS×2, Check×2 | `/customers/:param`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/config/apartados`<br>`/pedidos/:param`<br>`/pedidos/:param/duplicate-source`<br>`/quotations/:param`<br>`/config/stock-settings`<br>`/sucursales/:param`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/customers`<br>`/catalog/items`<br>`/sucursales` | `POST /pedidos`<br>`PUT /pedidos/:param` |
| `/pedidos/:id` | PedidoDetail<br>`features/pedidos/PedidoDetail.tsx` | `pedidos.listar` · feat:pedidos | SS×1 | `/pedidos/:param/pdf`<br>`/config/facturacion`<br>`/pedidos/:param`<br>`/pedidos/:param/versions/:param`<br>`/config/metodos-pago` | `POST /pedidos/:param/amend`<br>`POST /pedidos/:param/cancel`<br>`POST /pedidos/:param/cancelar-apartado`<br>`POST /despachos/desde-pedido/:param`<br>`POST /pedidos/:param/facturar-apartado`<br>`POST /pedidos/:param/submit` |
| `/pedidos/:id/versions/:version` | PedidoDetail<br>`features/pedidos/PedidoDetail.tsx` | `pedidos.listar` · feat:pedidos | SS×1 | `/pedidos/:param/pdf`<br>`/config/facturacion`<br>`/pedidos/:param`<br>`/pedidos/:param/versions/:param`<br>`/config/metodos-pago` | `POST /pedidos/:param/amend`<br>`POST /pedidos/:param/cancel`<br>`POST /pedidos/:param/cancelar-apartado`<br>`POST /despachos/desde-pedido/:param`<br>`POST /pedidos/:param/facturar-apartado`<br>`POST /pedidos/:param/submit` |
| `/pedidos/:id/editar` | PedidoForm<br>`features/pedidos/PedidoForm.tsx` | `pedidos.listar` · feat:pedidos | SS×2, Check×2 | `/customers/:param`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/config/apartados`<br>`/pedidos/:param`<br>`/pedidos/:param/duplicate-source`<br>`/quotations/:param`<br>`/config/stock-settings`<br>`/sucursales/:param`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/customers`<br>`/catalog/items`<br>`/sucursales` | `POST /pedidos`<br>`PUT /pedidos/:param` |

## Inventario — Transferencias entre almacenes (3)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/transferencias` | TransferenciasPage<br>`features/transferencias/TransferenciasPage.tsx` | `inventario.transferencias.listar` · feat:inventario | SS×2, S×1, Filtros | `/usuarios/:param/almacenes-permitidos`<br>`/config/almacenes`<br>`/sucursales`<br>`/transferencias` | `POST /transferencias/:param/cancelar`<br>`POST /transferencias/:param/confirmar` |
| `/transferencias/nueva` | TransferenciaForm<br>`features/transferencias/TransferenciaForm.tsx` | `inventario.transferencias.listar` · feat:inventario | SS×4 | `/usuarios/:param/almacenes-permitidos`<br>`/config/almacenes`<br>`/inventory/ubicaciones` | `POST /transferencias` |
| `/transferencias/:id` | TransferenciaDetail<br>`features/transferencias/TransferenciaDetail.tsx` | `inventario.transferencias.listar` · feat:inventario | — | `/transferencias/:param`<br>`/usuarios/:param/almacenes-permitidos` | `POST /transferencias/:param/cancelar`<br>`POST /transferencias/:param/confirmar` |

## Ventas — Facturas (5)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/facturas` | InvoicesPage<br>`features/invoicing/InvoicesPage.tsx` | `ventas.factura.listar` | SS×3, S×3, Filtros | `/config/catalogos-fiscales`<br>`/aseguradoras`<br>`/invoices`<br>`/sucursales` | — |
| `/facturas/nueva` | InvoiceForm<br>`features/invoicing/InvoiceForm.tsx` | `ventas.factura.listar` | SS×5, Check×1 | `/farmacia/busqueda-asistida`<br>`/config/catalogos-fiscales`<br>`/customers/:param`<br>`/config/facturacion`<br>`/invoices/:param`<br>`/catalog/items/:param`<br>`/inventory/ubicaciones/item/:param`<br>`/config/stock-settings`<br>`/sucursales/:param`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/aseguradoras`<br>`/customers`<br>`/catalog/items`<br>`/sucursales` | `POST /invoices`<br>`PATCH /invoices/:param` |
| `/facturas/:id/editar` | InvoiceForm<br>`features/invoicing/InvoiceForm.tsx` | `ventas.factura.listar` | SS×5, Check×1 | `/farmacia/busqueda-asistida`<br>`/config/catalogos-fiscales`<br>`/customers/:param`<br>`/config/facturacion`<br>`/invoices/:param`<br>`/catalog/items/:param`<br>`/inventory/ubicaciones/item/:param`<br>`/config/stock-settings`<br>`/sucursales/:param`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/aseguradoras`<br>`/customers`<br>`/catalog/items`<br>`/sucursales` | `POST /invoices`<br>`PATCH /invoices/:param` |
| `/facturas/:id/versions/:version` | InvoiceDetail<br>`features/invoicing/InvoiceDetail.tsx` | `ventas.factura.listar` | SS×3, Check×3 | `/invoices/:param/ecf/pdfa`<br>`/invoices/:param/pdf`<br>`/catalog/bundles/:param`<br>`/config/catalogos-fiscales`<br>`/credit-notes/saldo-favor/:param`<br>`/customers/:param`<br>`/config/facturacion`<br>`/invoices/:param`<br>`/invoices/:param/versions/:param`<br>`/catalog/items/:param`<br>`/cobros/saldo-favor/:param`<br>`/pos/turnos/actual`<br>`/aseguradoras`<br>`/config/denominaciones`<br>`/despachos`<br>`/config/metodos-pago`<br>`/relaciones/transacciones` | `POST /pos/turnos/abrir`<br>`POST /invoices/:param/amend`<br>`POST /credit-notes/:param/aplicar-a-factura`<br>`POST /invoices/:param/aplicar-saldo-favor`<br>`POST /invoices/:param/asignar-tracking`<br>`POST /invoices/:param/cancel`<br>`POST /despachos/desde-factura/:param`<br>`POST /devoluciones`<br>`POST /relaciones/ventas/:param/enviar`<br>`POST /relaciones/transacciones/:param/igualar-con-enmienda`<br>`POST /invoices/:param/recalcular-cobertura`<br>`DELETE /credit-notes/:param/aplicar-a-factura/:param`<br>`DELETE /invoices/:param/aplicar-saldo-favor/:param`<br>`POST /invoices/:param/submit` |
| `/facturas/:id` | InvoiceDetail<br>`features/invoicing/InvoiceDetail.tsx` | `ventas.factura.listar` | SS×3, Check×3 | `/invoices/:param/ecf/pdfa`<br>`/invoices/:param/pdf`<br>`/catalog/bundles/:param`<br>`/config/catalogos-fiscales`<br>`/credit-notes/saldo-favor/:param`<br>`/customers/:param`<br>`/config/facturacion`<br>`/invoices/:param`<br>`/invoices/:param/versions/:param`<br>`/catalog/items/:param`<br>`/cobros/saldo-favor/:param`<br>`/pos/turnos/actual`<br>`/aseguradoras`<br>`/config/denominaciones`<br>`/despachos`<br>`/config/metodos-pago`<br>`/relaciones/transacciones` | `POST /pos/turnos/abrir`<br>`POST /invoices/:param/amend`<br>`POST /credit-notes/:param/aplicar-a-factura`<br>`POST /invoices/:param/aplicar-saldo-favor`<br>`POST /invoices/:param/asignar-tracking`<br>`POST /invoices/:param/cancel`<br>`POST /despachos/desde-factura/:param`<br>`POST /devoluciones`<br>`POST /relaciones/ventas/:param/enviar`<br>`POST /relaciones/transacciones/:param/igualar-con-enmienda`<br>`POST /invoices/:param/recalcular-cobertura`<br>`DELETE /credit-notes/:param/aplicar-a-factura/:param`<br>`DELETE /invoices/:param/aplicar-saldo-favor/:param`<br>`POST /invoices/:param/submit` |

## Ventas — Notas de crédito (2)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/notas-credito` | CreditNotesPage<br>`features/invoicing/CreditNotesPage.tsx` | `ventas.nota-credito.listar` · feat:notasCredito | SS×6, Filtros | `/credit-notes/:param/pdf`<br>`/config/catalogos-fiscales`<br>`/credit-notes/saldo-favor/:param`<br>`/customers/:param`<br>`/config/ecf/tipos`<br>`/invoices/:param`<br>`/credit-notes`<br>`/cuentas-bancarias`<br>`/customers`<br>`/departamentos`<br>`/invoices`<br>`/config/metodos-pago`<br>`/sucursales` | `POST /credit-notes/:param/aplicar-a-factura`<br>`POST /credit-notes`<br>`POST /credit-notes/:param/refund`<br>`DELETE /credit-notes/:param/aplicar-a-factura/:param`<br>`POST /credit-notes/:param/submit` |
| `/notas-credito/:id` | CreditNoteDetail<br>`features/invoicing/CreditNoteDetail.tsx` | `ventas.nota-credito.listar` · feat:notasCredito | — | `/credit-notes/:param/pdf`<br>`/credit-notes/:param`<br>`/credit-notes/saldo-favor/:param`<br>`/config/facturacion`<br>`/invoices/:param`<br>`/cuentas-bancarias`<br>`/invoices`<br>`/config/metodos-pago` | `POST /credit-notes/:param/aplicar-a-factura`<br>`POST /credit-notes/:param/refund`<br>`DELETE /credit-notes/:param/aplicar-a-factura/:param` |

## Ventas — Notas de débito (1)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/notas-debito` | DebitNotesPage<br>`features/invoicing/DebitNotesPage.tsx` | `ventas.nota-debito.crear` · feat:notasDebito | SS×3, Filtros | `/debit-notes/:param/pdf`<br>`/config/ecf/tipos`<br>`/debit-notes`<br>`/invoices`<br>`/sucursales` | `POST /debit-notes`<br>`POST /debit-notes/:param/submit` |

## Ventas — Devoluciones (3)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/devoluciones` | DevolucionesPage<br>`features/invoicing/DevolucionesPage.tsx` | `ventas.devolucion.listar` · feat:devoluciones | SS×4, Filtros | `/config/catalogos-fiscales`<br>`/customers`<br>`/departamentos`<br>`/devoluciones`<br>`/sucursales` | — |
| `/devoluciones/nueva` | DevolucionForm<br>`features/invoicing/DevolucionForm.tsx` | `ventas.devolucion.listar` · feat:devoluciones | SS×4, Check×2 | `/config/ecf/tipos`<br>`/invoices/:param`<br>`/customers`<br>`/invoices`<br>`/config/metodos-pago` | `POST /devoluciones` |
| `/devoluciones/:id` | DevolucionDetail<br>`features/invoicing/DevolucionDetail.tsx` | `ventas.devolucion.listar` · feat:devoluciones | — | `/credit-notes/:param/pdf`<br>`/config/catalogos-fiscales`<br>`/devoluciones/:param` | `POST /devoluciones/:param/cancelar`<br>`POST /devoluciones/:param/emitir-nc-aseguradora` |

## Inventario operativo (9)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/inventario/stock` | StockPage<br>`features/inventory/StockPage.tsx` | `inventario.stock.consultar` · feat:inventario | SS×2, S×1, Filtros | `/inventory`<br>`/sucursales`<br>`/inventory/warehouses` | — |
| `/inventario/historial` | HistoryPage<br>`features/inventory/HistoryPage.tsx` | `inventario.historial.consultar` · feat:inventario | SS×2, S×1, Filtros | `/inventory/history`<br>`/inventory/history/:param`<br>`/sucursales`<br>`/inventory/warehouses` | — |
| `/inventario/conteos` | CountsPage<br>`features/inventory/CountsPage.tsx` | `inventario.conteos.listar` · feat:inventario | SS×2 | `/inventory/counts/template`<br>`/config/almacenes`<br>`/inventory/counts`<br>`/sucursales`<br>`/inventory/warehouses` | `POST /inventory/counts`<br>`POST /inventory/counts/:param/submit` |
| `/inventario/zonas` | ZonasPage<br>`features/inventory/ZonasPage.tsx` | `inventario.zonas.listar` · feat:inventario | SS×3, Filtros, Check×3, Tabs | `/catalog/items/:param`<br>`/inventory/ubicaciones/movimientos`<br>`/inventory/ubicaciones`<br>`/inventory/ubicaciones/pendientes`<br>`/inventory/warehouses`<br>`/inventory/zonas` | `POST /inventory/ubicaciones`<br>`POST /inventory/zonas`<br>`DELETE /inventory/ubicaciones/:param`<br>`DELETE /inventory/zonas/:param`<br>`POST /inventory/ubicaciones/distribuir`<br>`PUT /inventory/ubicaciones/:param`<br>`PUT /inventory/zonas/:param` |
| `/inventario/carga-inicial` | CargaInicialListPage<br>`features/inventory/CargaInicialListPage.tsx` | `inventario.carga-inicial.listar` · feat:inventario | SS×1, S×1, Filtros | `/inventory/carga-inicial`<br>`/sucursales` | `POST /inventory/carga-inicial/:param/cancelar` |
| `/inventario/carga-inicial/nueva` | CargaInicialForm<br>`features/inventory/CargaInicialForm.tsx` | `inventario.carga-inicial.crear` · feat:inventario | SS×2 | `/config/cuentas-empresa`<br>`/config/facturacion`<br>`/config/almacenes`<br>`/sucursales` | `POST /inventory/carga-inicial` |
| `/inventario/carga-inicial/:id` | CargaInicialDetail<br>`features/inventory/CargaInicialDetail.tsx` | `inventario.carga-inicial.listar` · feat:inventario | — | `/inventory/carga-inicial/:param` | `POST /inventory/carga-inicial/:param/cancelar` |
| `/inventario/ajustes-dimension` | AjusteDimensionForm<br>`features/inventory/AjusteDimensionForm.tsx` | `inventario.ajustar` | SS×2 | `/config/cuentas-empresa`<br>`/inventory/items/:param/stock-por-dimension`<br>`/config/almacenes`<br>`/catalog/items` | `POST /inventory/ajustes-dimension` |
| `/inventario/reclasificaciones` | ReclasificacionForm<br>`features/inventory/ReclasificacionForm.tsx` | `inventario.reclasificar` | SS×2 | `/inventory/items/:param/stock-por-dimension`<br>`/config/almacenes`<br>`/catalog/items` | `POST /inventory/reclasificaciones` |

## Compras (19)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/compras` | ComprasPage<br>`features/compras/ComprasPage.tsx` | `compras.factura.listar` · feat:compras | SS×1, Filtros | `/compras`<br>`/sucursales` | — |
| `/compras/nueva` | CompraForm<br>`features/compras/CompraForm.tsx` | `compras.factura.listar` · feat:compras | SS×7, Check×1 | `/config/catalogos-fiscales`<br>`/compras/:param`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/compras/ordenes/:param`<br>`/suppliers/:param`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/catalog/items`<br>`/monedas`<br>`/compras/ordenes`<br>`/config/retenciones`<br>`/sucursales`<br>`/suppliers`<br>`/inventory/warehouses` | `POST /compras`<br>`PUT /compras/:param` |
| `/compras/:id/editar` | CompraForm<br>`features/compras/CompraForm.tsx` | `compras.factura.listar` · feat:compras | SS×7, Check×1 | `/config/catalogos-fiscales`<br>`/compras/:param`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/compras/ordenes/:param`<br>`/suppliers/:param`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/catalog/items`<br>`/monedas`<br>`/compras/ordenes`<br>`/config/retenciones`<br>`/sucursales`<br>`/suppliers`<br>`/inventory/warehouses` | `POST /compras`<br>`PUT /compras/:param` |
| `/compras/:id` | CompraDetail<br>`features/compras/CompraDetail.tsx` | `compras.factura.listar` · feat:compras | Check×1 | `/compras/:param/pdf`<br>`/config/catalogos-fiscales`<br>`/compras/:param`<br>`/compras/:param/estado-socio`<br>`/config/facturacion`<br>`/config/retenciones`<br>`/compras/:param/preview-asientos` | `POST /compras/:param/amend`<br>`POST /compras/:param/cancel`<br>`POST /compras/:param/cancelar-envio`<br>`DELETE /compras/:param`<br>`POST /compras/:param/enlazar-y-enviar`<br>`POST /compras/:param/enviar-a-proveedor`<br>`POST /relaciones/transacciones/:param/igualar`<br>`POST /compras/:param/submit`<br>`PUT /compras/:param` |
| `/compras/recepciones` | RecepcionesPage<br>`features/compras/RecepcionesPage.tsx` | `compras.recepcion.listar` · feat:compras | SS×1, Filtros | `/compras/purchase-receipt`<br>`/sucursales` | — |
| `/compras/recepciones/nueva` | RecepcionForm<br>`features/compras/RecepcionForm.tsx` | `compras.recepcion.listar` · feat:compras | SS×3 | `/config/facturacion`<br>`/catalog/items/:param`<br>`/compras/purchase-receipt/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/catalog/items`<br>`/sucursales`<br>`/suppliers`<br>`/inventory/warehouses` | `POST /compras/purchase-receipt`<br>`PUT /compras/purchase-receipt/:param` |
| `/compras/recepciones/:id/editar` | RecepcionForm<br>`features/compras/RecepcionForm.tsx` | `compras.recepcion.listar` · feat:compras | SS×3 | `/config/facturacion`<br>`/catalog/items/:param`<br>`/compras/purchase-receipt/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/catalog/items`<br>`/sucursales`<br>`/suppliers`<br>`/inventory/warehouses` | `POST /compras/purchase-receipt`<br>`PUT /compras/purchase-receipt/:param` |
| `/compras/recepciones/:id` | RecepcionDetail<br>`features/compras/RecepcionDetail.tsx` | `compras.recepcion.listar` · feat:compras | SS×3 | `/compras/purchase-receipt/:param/pdf`<br>`/config/catalogos-fiscales`<br>`/config/facturacion`<br>`/compras/purchase-receipt/:param`<br>`/suppliers/:param`<br>`/config/impuestos-compras` | `POST /compras/purchase-receipt/:param/amend`<br>`POST /compras/purchase-receipt/:param/cancel`<br>`POST /compras/purchase-receipt/:param/facturar`<br>`POST /compras/purchase-receipt/:param/submit` |
| `/compras/solicitudes` | SolicitudesPage<br>`features/compras/SolicitudesPage.tsx` | `compras.solicitud.listar` · feat:comprasSolicitudes | S×2, Filtros | `/compras/solicitudes` | — |
| `/compras/solicitudes/nueva` | SolicitudForm<br>`features/compras/SolicitudForm.tsx` | `compras.solicitud.listar` · feat:comprasSolicitudes | SS×2 | `/config/facturacion`<br>`/compras/solicitudes/:param`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/sucursales`<br>`/inventory/warehouses` | `POST /compras/solicitudes`<br>`PUT /compras/solicitudes/:param` |
| `/compras/solicitudes/:id/editar` | SolicitudForm<br>`features/compras/SolicitudForm.tsx` | `compras.solicitud.listar` · feat:comprasSolicitudes | SS×2 | `/config/facturacion`<br>`/compras/solicitudes/:param`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/sucursales`<br>`/inventory/warehouses` | `POST /compras/solicitudes`<br>`PUT /compras/solicitudes/:param` |
| `/compras/solicitudes/:id` | SolicitudDetail<br>`features/compras/SolicitudDetail.tsx` | `compras.solicitud.listar` · feat:comprasSolicitudes | SS×1 | `/compras/solicitudes/:param/pdf`<br>`/compras/solicitudes/:param`<br>`/suppliers` | `POST /compras/solicitudes/:param/amend`<br>`POST /compras/solicitudes/:param/cancel`<br>`POST /compras/solicitudes/:param/detener`<br>`POST /compras/solicitudes/:param/generar-orden`<br>`POST /compras/solicitudes/:param/reanudar`<br>`POST /compras/solicitudes/:param/submit` |
| `/compras/ordenes` | OrdenesPage<br>`features/compras/OrdenesPage.tsx` | `compras.orden.listar` · feat:comprasOrdenes | SS×1, S×3, Filtros | `/compras/ordenes`<br>`/sucursales` | — |
| `/compras/ordenes/nueva` | OrdenForm<br>`features/compras/OrdenForm.tsx` | `compras.orden.listar` · feat:comprasOrdenes | SS×3 | `/config/facturacion`<br>`/catalog/items/:param`<br>`/compras/ordenes/:param`<br>`/suppliers/:param`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/sucursales`<br>`/suppliers`<br>`/inventory/warehouses` | `POST /compras/ordenes`<br>`PUT /compras/ordenes/:param` |
| `/compras/ordenes/abastecimiento` | AbastecimientoPage<br>`features/compras/AbastecimientoPage.tsx` | `compras.orden.listar` · feat:comprasOrdenes | SS×1, Filtros, Check×1 | `/compras/ordenes/pendientes-abastecimiento`<br>`/suppliers` | `POST /compras/ordenes/desde-pedidos` |
| `/compras/ordenes/:id/editar` | OrdenForm<br>`features/compras/OrdenForm.tsx` | `compras.orden.listar` · feat:comprasOrdenes | SS×3 | `/config/facturacion`<br>`/catalog/items/:param`<br>`/compras/ordenes/:param`<br>`/suppliers/:param`<br>`/usuarios/:param`<br>`/usuarios/:param/sucursales`<br>`/config/almacenes`<br>`/sucursales`<br>`/suppliers`<br>`/inventory/warehouses` | `POST /compras/ordenes`<br>`PUT /compras/ordenes/:param` |
| `/compras/ordenes/:id` | OrdenDetail<br>`features/compras/OrdenDetail.tsx` | `compras.orden.listar` · feat:comprasOrdenes | SS×3, Check×1 | `/compras/ordenes/:param/pdf`<br>`/config/catalogos-fiscales`<br>`/config/facturacion`<br>`/catalog/items/:param`<br>`/compras/ordenes/:param`<br>`/suppliers/:param`<br>`/config/impuestos-compras` | `POST /compras/ordenes/:param/amend`<br>`POST /compras/ordenes/:param/cancel`<br>`POST /compras/ordenes/:param/cerrar`<br>`POST /compras/ordenes/:param/facturar`<br>`POST /compras/ordenes/:param/en-espera`<br>`POST /compras/ordenes/:param/reabrir`<br>`POST /compras/ordenes/:param/recibir`<br>`POST /compras/ordenes/:param/submit` |
| `/compras/costos-importacion` | CostosImportacionPage<br>`features/compras/CostosImportacionPage.tsx` | `compras.costos-importacion.listar` · feat:compras | SS×1, S×2, Filtros | `/compras`<br>`/compras/costos-importacion`<br>`/compras/purchase-receipt`<br>`/compras/costos-importacion/tipos-documento` | `POST /compras/costos-importacion` |
| `/compras/costos-importacion/:id` | CostoImportacionDetail<br>`features/compras/CostoImportacionDetail.tsx` | `compras.costos-importacion.listar` · feat:compras | — | `/compras/costos-importacion/:param` | `POST /compras/costos-importacion/:param/cancel`<br>`POST /compras/costos-importacion/:param/submit` |

## Devoluciones de compras (4)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/devoluciones-compras` | DevolucionesComprasPage<br>`features/devoluciones-compras/DevolucionesPage.tsx` | `compras.factura.listar` · feat:devolucionesCompras | SS×1, S×1, Filtros | `/compras`<br>`/devoluciones-compras`<br>`/sucursales` | `POST /devoluciones-compras/:param/aplicar-a-cxp` |
| `/devoluciones-compras/nueva` | DevolucionCompraForm<br>`features/devoluciones-compras/DevolucionForm.tsx` | `compras.factura.listar` · feat:devolucionesCompras | SS×2 | `/compras/:param`<br>`/devoluciones-compras/:param`<br>`/catalog/items/:param`<br>`/compras`<br>`/suppliers` | `POST /devoluciones-compras`<br>`PUT /devoluciones-compras/:param` |
| `/devoluciones-compras/:id/editar` | DevolucionCompraForm<br>`features/devoluciones-compras/DevolucionForm.tsx` | `compras.factura.listar` · feat:devolucionesCompras | SS×2 | `/compras/:param`<br>`/devoluciones-compras/:param`<br>`/catalog/items/:param`<br>`/compras`<br>`/suppliers` | `POST /devoluciones-compras`<br>`PUT /devoluciones-compras/:param` |
| `/devoluciones-compras/:id` | DevolucionCompraDetail<br>`features/devoluciones-compras/DevolucionDetail.tsx` | `compras.factura.listar` · feat:devolucionesCompras | — | `/devoluciones-compras/:param/pdf`<br>`/devoluciones-compras/:param`<br>`/config/facturacion`<br>`/compras` | `POST /devoluciones-compras/:param/amend`<br>`POST /devoluciones-compras/:param/aplicar-a-cxp`<br>`POST /devoluciones-compras/:param/cancel`<br>`DELETE /devoluciones-compras/:param`<br>`POST /devoluciones-compras/:param/submit`<br>`DELETE /devoluciones-compras/:param/aplicar-a-cxp/:param` |

## e-CF recibidos (2)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/ecf-recibidos` | EcfRecibidosPage<br>`features/ecf-recibidos/EcfRecibidosPage.tsx` | `ecf.recibidos.listar` | S×2, Filtros | `/ecf/recibidos` | `POST /ecf/recibidos/cargar-manual`<br>`POST /ecf/recibidos/:param/vincular` |
| `/ecf-recibidos/:voucherId` | EcfRecibidoDetail<br>`features/ecf-recibidos/EcfRecibidoDetail.tsx` | `ecf.recibidos.listar` | SS×1, S×1 | `/ecf/recibidos/:param`<br>`/compras` | `POST /ecf/recibidos/:param/aprobacion-comercial`<br>`POST /ecf/recibidos/:param/vincular` |

## e-CF emitidos (2)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/ecf-emitidos` | EcfEmitidosPage<br>`features/ecf-emitidos/EcfEmitidosPage.tsx` | `ecf.emitidos.listar` | S×3, Filtros, Check×1 | `/ecf/emitidos` | `POST /ecf/emitidos/:param/refresh` |
| `/ecf-emitidos/:voucherId` | EcfEmitidoDetail<br>`features/ecf-emitidos/EcfEmitidoDetail.tsx` | `ecf.emitidos.listar` | — | `/invoices/:param/ecf/pdfa`<br>`/ecf/emitidos/:param` | `POST /ecf/emitidos/:param/refresh`<br>`POST /ecf/emitidos/:param/regenerar` |

## Gastos (4)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/gastos` | GastosPage<br>`features/gastos/GastosPage.tsx` | `gastos.listar` · feat:gastos | SS×1, S×2, Filtros | `/config/catalogos-fiscales`<br>`/gastos/resumen`<br>`/gastos` | — |
| `/gastos/nuevo` | GastoForm<br>`features/gastos/GastoForm.tsx` | `gastos.listar` · feat:gastos | SS×6, S×1, Check×2 | `/config/catalogos-fiscales`<br>`/cuentas/:param`<br>`/config/cuentas-empresa`<br>`/config/facturacion`<br>`/gastos/:param`<br>`/suppliers/:param`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param/sucursales`<br>`/config/impuestos-compras`<br>`/monedas`<br>`/config/retenciones`<br>`/sucursales`<br>`/suppliers` | `POST /gastos`<br>`PUT /gastos/:param` |
| `/gastos/:id/editar` | GastoForm<br>`features/gastos/GastoForm.tsx` | `gastos.listar` · feat:gastos | SS×6, S×1, Check×2 | `/config/catalogos-fiscales`<br>`/cuentas/:param`<br>`/config/cuentas-empresa`<br>`/config/facturacion`<br>`/gastos/:param`<br>`/suppliers/:param`<br>`/monedas/tasas/vigente`<br>`/usuarios/:param/sucursales`<br>`/config/impuestos-compras`<br>`/monedas`<br>`/config/retenciones`<br>`/sucursales`<br>`/suppliers` | `POST /gastos`<br>`PUT /gastos/:param` |
| `/gastos/:id` | GastoDetail<br>`features/gastos/GastoDetail.tsx` | `gastos.listar` · feat:gastos | — | `/config/catalogos-fiscales`<br>`/gastos/:param`<br>`/config/impuestos-compras`<br>`/config/retenciones`<br>`/gastos/:param/preview-asientos` | `POST /gastos/:param/amend`<br>`POST /gastos/:param/cancel`<br>`POST /gastos/:param/submit`<br>`PUT /gastos/:param` |

## Proveedores (4)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/proveedores` | SuppliersPage<br>`features/suppliers/SuppliersPage.tsx` | `proveedores.listar` · feat:proveedores | S×1, Filtros, Check×1 | `/suppliers` | `DELETE /suppliers/:param` |
| `/proveedores/nuevo` | SupplierForm<br>`features/suppliers/SupplierForm.tsx` | `proveedores.listar` · feat:proveedores | — | `/config/catalogos-fiscales`<br>`/config/facturacion`<br>`/suppliers/:param`<br>`/config/almacenes`<br>`/config/bancos`<br>`/config/grupos-proveedores`<br>`/config/impuestos-compras`<br>`/config/paises`<br>`/config/retenciones` | `POST /suppliers`<br>`PUT /suppliers/:param` |
| `/proveedores/:id` | SupplierDetail<br>`features/suppliers/SupplierDetail.tsx` | `proveedores.listar` · feat:proveedores | — | `/pagos/historial/:param`<br>`/suppliers/:param`<br>`/suppliers/:param/purchases`<br>`/config/impuestos-compras`<br>`/config/retenciones`<br>`/suppliers/:param/verificar-emisor-electronico` | `DELETE /suppliers/:param` |
| `/proveedores/:id/editar` | SupplierForm<br>`features/suppliers/SupplierForm.tsx` | `proveedores.listar` · feat:proveedores | — | `/config/catalogos-fiscales`<br>`/config/facturacion`<br>`/suppliers/:param`<br>`/config/almacenes`<br>`/config/bancos`<br>`/config/grupos-proveedores`<br>`/config/impuestos-compras`<br>`/config/paises`<br>`/config/retenciones` | `POST /suppliers`<br>`PUT /suppliers/:param` |

## Relaciones comerciales (B2B) (4)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/relaciones-comerciales` | RelacionesComercialesPage<br>`features/relaciones-comerciales/RelacionesComercialesPage.tsx` | `relaciones.ver` · feat:relacionesComerciales | Check×1, Tabs | `/config/catalogos-fiscales`<br>`/relaciones/invitaciones/:param`<br>`/relaciones/bloqueos`<br>`/customers/groups/list`<br>`/config/grupos-proveedores`<br>`/relaciones/invitaciones`<br>`/relaciones`<br>`/usuarios` | `POST /relaciones/invitaciones/:param/aceptar`<br>`POST /relaciones/directorio/buscar`<br>`POST /relaciones/invitaciones/:param/cancelar`<br>`POST /relaciones/invitaciones`<br>`POST /relaciones/bloqueos/:param/levantar`<br>`POST /relaciones/invitaciones/:param/rechazar`<br>`POST /relaciones/invitaciones/:param/reenviar` |
| `/relaciones-comerciales/transacciones` | TransaccionesPage<br>`features/relaciones-comerciales/TransaccionesPage.tsx` | `relaciones.transacciones.ver` · feat:relacionesComerciales | S×3, Filtros | `/relaciones/transacciones` | `POST /relaciones/transacciones/:param/cancelar`<br>`POST /relaciones/transacciones/:param/reintentar` |
| `/relaciones-comerciales/transacciones/:uid` | TransaccionDetail<br>`features/relaciones-comerciales/TransaccionDetail.tsx` | `relaciones.transacciones.ver` · feat:relacionesComerciales | SS×2, Check×1 | `/relaciones/transacciones/:param/candidatos-enlace`<br>`/config/catalogos-fiscales`<br>`/compras/:param`<br>`/relaciones/transacciones/:param/diff`<br>`/invoices/:param`<br>`/relaciones/transacciones/:param/mapeo`<br>`/relaciones/:param`<br>`/suppliers/:param`<br>`/relaciones/transacciones/:param`<br>`/catalog/categories` | `POST /relaciones/transacciones/:param/aceptar`<br>`POST /relaciones/transacciones/:param/cancelar`<br>`PUT /relaciones/transacciones/:param/mapeo`<br>`POST /relaciones/transacciones/:param/mapeo/crear-articulo`<br>`POST /relaciones/transacciones/:param/enlazar`<br>`POST /relaciones/transacciones/:param/igualar`<br>`POST /relaciones/transacciones/:param/igualar-con-enmienda`<br>`POST /relaciones/transacciones/:param/rechazar`<br>`POST /relaciones/transacciones/:param/mapeo/refrescar`<br>`POST /relaciones/transacciones/:param/reintentar` |
| `/relaciones-comerciales/:id` | RelacionDetail<br>`features/relaciones-comerciales/RelacionDetail.tsx` | `relaciones.ver` · feat:relacionesComerciales | SS×3, Check×3 | `/config/catalogos-fiscales`<br>`/relaciones/:param/estado-activacion`<br>`/relaciones/:param/maestros-candidatos`<br>`/relaciones/:param/mapeo`<br>`/relaciones/:param`<br>`/config/almacenes`<br>`/customers/groups/list`<br>`/config/grupos-proveedores`<br>`/usuarios` | `PUT /relaciones/:param/configuracion`<br>`PUT /relaciones/:param/mapeo`<br>`PUT /relaciones/:param/terminos`<br>`POST /relaciones/:param/adoptar-maestros`<br>`POST /relaciones/:param/reactivar`<br>`POST /relaciones/:param/reintentar-activacion`<br>`POST /relaciones/:param/suspender`<br>`POST /relaciones/:param/terminar` |

## Caja (2)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/caja/pendientes` | CajaPage<br>`features/caja/CajaPage.tsx` | `caja.listar` · feat:caja | SS×1, Filtros | `/invoices/:param/pdf`<br>`/config/facturacion`<br>`/pos/turnos/actual`<br>`/config/denominaciones`<br>`/config/metodos-pago`<br>`/caja/pendientes` | `POST /caja/facturas/:param/cobrar` |
| `/caja/por-cobrar` | PorCobrarPage<br>`features/caja/PorCobrarPage.tsx` | `caja.listar` · feat:caja | SS×1, Filtros | `/invoices/:param/pdf`<br>`/customers/:param`<br>`/config/facturacion`<br>`/pos/turnos/actual`<br>`/config/denominaciones`<br>`/config/metodos-pago`<br>`/caja/por-cobrar` | `POST /caja/facturas/:param/completar-cobro`<br>`DELETE /caja/facturas/:param` |

## POS — Turnos (2)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/turnos` | TurnosPage<br>`features/pos/TurnosPage.tsx` | `pos.turno.listar` · feat:caja | SS×1, S×1, Filtros | `/pos/turnos`<br>`/usuarios` | — |
| `/turnos/:id` | TurnoDetailPage<br>`features/pos/TurnoDetailPage.tsx` | `pos.turno.listar` · feat:caja | — | `/pos/turnos/:param/pdf`<br>`/pos/turnos/:param`<br>`/config/denominaciones` | — |

## Cuentas por cobrar (5)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/cobros/lista` | CobrosPage<br>`features/cobros/CobrosPage.tsx` | `cobros.pago.listar` · feat:cuentasPorCobrar | SS×3, S×1, Filtros | `/cobros`<br>`/cuentas-bancarias`<br>`/customers`<br>`/config/metodos-pago` | — |
| `/cobros/pago` | PagoPage<br>`features/cobros/PagoPage.tsx` | `cobros.pago.crear` · feat:cuentasPorCobrar | SS×4, Check×3 | `/config/facturacion`<br>`/config/apartados`<br>`/usuarios/:param/sucursales`<br>`/cuentas-bancarias`<br>`/customers`<br>`/invoices`<br>`/config/metodos-pago`<br>`/pedidos`<br>`/sucursales` | `POST /cobros` |
| `/cobros/aging` | AgingPage<br>`features/cobros/AgingPage.tsx` | `cobros.aging.exportar` · feat:cuentasPorCobrar | SS×1, S×1, Filtros, Check×1 | `/reportes/cxc/aging/pdf`<br>`/cobros/aging`<br>`/customers` | — |
| `/cobros/semaforo` | SemaforoPage<br>`features/cobros/SemaforoPage.tsx` | `cobros.pago.listar` · feat:cuentasPorCobrar | — | `/cobros/semaforo` | — |
| `/cobros/:id` | CobroDetail<br>`features/cobros/CobroDetail.tsx` | `cobros.pago.listar` · feat:cuentasPorCobrar | — | `/cobros/:param/pdf`<br>`/cobros/:param`<br>`/cuentas-bancarias/:param`<br>`/config/facturacion` | `POST /cobros/:param/submit` |

## Cuentas por pagar (5)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/pagos/lista` | PagosPage<br>`features/pagos/PagosPage.tsx` | `cobros.pago.listar` · feat:cuentasPorPagar | SS×3, S×1, Filtros | `/config/metodos-pago`<br>`/pagos`<br>`/sucursales`<br>`/suppliers` | — |
| `/pagos/pendientes` | PendientesPagoPage<br>`features/pagos/PendientesPagoPage.tsx` | `cobros.pago.listar` · feat:cuentasPorPagar | Filtros, Check×1 | `/pagos/pendientes` | — |
| `/pagos/nuevo` | RegistrarPagoPage<br>`features/pagos/RegistrarPagoPage.tsx` | `cobros.pago.crear` · feat:cuentasPorPagar | SS×4, Check×2 | `/config/facturacion`<br>`/pagos/pendientes`<br>`/pagos/saldo-favor/:param`<br>`/tesoreria/cheques/siguiente`<br>`/usuarios/:param/sucursales`<br>`/cuentas-bancarias`<br>`/config/metodos-pago`<br>`/sucursales`<br>`/suppliers` | `POST /pagos/aplicar-saldo-favor`<br>`POST /pagos` |
| `/pagos/aging` | AgingProveedoresPage<br>`features/pagos/AgingProveedoresPage.tsx` | `cobros.aging.exportar` · feat:cuentasPorPagar | SS×1, S×1, Filtros, Check×1 | `/reportes/cxp/aging/pdf`<br>`/pagos/aging`<br>`/suppliers` | — |
| `/pagos/:id` | PagoDetail<br>`features/pagos/PagoDetail.tsx` | `cobros.pago.listar` · feat:cuentasPorPagar | — | `/pagos/:param`<br>`/pagos/:param/imprimir` | `POST /pagos/:param/cancel`<br>`POST /pagos/:param/submit` |

## Tesorería (12)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/tesoreria/emisiones` | EmisionesPage<br>`features/tesoreria/EmisionesPage.tsx` | `tesoreria.emision.listar` · feat:tesoreria | S×2, Filtros | `/cuentas-bancarias`<br>`/tesoreria/emisiones`<br>`/tesoreria/tipos-documento` | — |
| `/tesoreria/emisiones/nueva` | EmisionForm<br>`features/tesoreria/EmisionForm.tsx` | `tesoreria.emision.listar` · feat:tesoreria | SS×2, Check×1 | `/tesoreria/emisiones/pendientes/:param`<br>`/config/facturacion`<br>`/tesoreria/emisiones/siguiente-cheque`<br>`/cuentas-bancarias`<br>`/customers`<br>`/sucursales`<br>`/suppliers`<br>`/tesoreria/tipos-documento` | `POST /tesoreria/emisiones` |
| `/tesoreria/emisiones/:id` | EmisionDetail<br>`features/tesoreria/EmisionDetail.tsx` | `tesoreria.emision.listar` · feat:tesoreria | — | `/cuentas-bancarias/:param`<br>`/tesoreria/emisiones/:param`<br>`/tesoreria/emisiones/:param/imprimir`<br>`/tesoreria/emisiones/:param/preview-asientos` | `POST /tesoreria/emisiones/:param/cancel`<br>`POST /tesoreria/emisiones/:param/submit`<br>`PUT /tesoreria/emisiones/:param` |
| `/tesoreria/depositos` | DepositosPage<br>`features/tesoreria/DepositosPage.tsx` | `tesoreria.deposito.listar` · feat:tesoreria | S×2, Filtros | `/cuentas-bancarias`<br>`/tesoreria/depositos`<br>`/tesoreria/tipos-documento` | — |
| `/tesoreria/depositos/nuevo` | DepositoForm<br>`features/tesoreria/DepositoForm.tsx` | `tesoreria.deposito.listar` · feat:tesoreria | SS×2, Check×1 | `/tesoreria/depositos/pendientes/:param`<br>`/config/facturacion`<br>`/cuentas-bancarias`<br>`/customers`<br>`/sucursales`<br>`/suppliers`<br>`/tesoreria/tipos-documento` | `POST /tesoreria/depositos` |
| `/tesoreria/depositos/:id` | DepositoDetail<br>`features/tesoreria/DepositoDetail.tsx` | `tesoreria.deposito.listar` · feat:tesoreria | — | `/cuentas-bancarias/:param`<br>`/tesoreria/depositos/:param`<br>`/tesoreria/depositos/:param/preview-asientos` | `POST /tesoreria/depositos/:param/cancel`<br>`POST /tesoreria/depositos/:param/submit`<br>`PUT /tesoreria/depositos/:param` |
| `/tesoreria/transferencias` | TransferenciasInternasPage<br>`features/tesoreria/TransferenciasInternasPage.tsx` | `tesoreria.transferencia.listar` · feat:tesoreria | S×1, Filtros | `/cuentas-bancarias`<br>`/tesoreria/transferencias-internas` | — |
| `/tesoreria/transferencias/nueva` | TransferenciaInternaForm<br>`features/tesoreria/TransferenciaInternaForm.tsx` | `tesoreria.transferencia.listar` · feat:tesoreria | SS×1 | `/config/facturacion`<br>`/cuentas-bancarias`<br>`/tesoreria/tipos-documento` | `POST /tesoreria/transferencias-internas` |
| `/tesoreria/transferencias/:id` | TransferenciaInternaDetail<br>`features/tesoreria/TransferenciaInternaDetail.tsx` | `tesoreria.transferencia.listar` · feat:tesoreria | — | `/tesoreria/transferencias-internas/:param`<br>`/tesoreria/transferencias-internas/:param/preview-asientos` | `POST /tesoreria/transferencias-internas/:param/cancel`<br>`POST /tesoreria/transferencias-internas/:param/submit`<br>`PUT /tesoreria/transferencias-internas/:param` |
| `/tesoreria/movimientos` | MovimientosBancoPage<br>`features/tesoreria/MovimientosBancoPage.tsx` | `tesoreria.movimientos-banco.listar` · feat:tesoreria | Filtros | `/tesoreria/movimientos`<br>`/tesoreria/movimientos/resumen`<br>`/cuentas-bancarias` | — |
| `/tesoreria/cheques` | ChequesPage<br>`features/tesoreria/ChequesPage.tsx` | `tesoreria.cheques.listar` · feat:tesoreria | SS×1, S×2, Filtros | `/tesoreria/cheques`<br>`/cuentas-bancarias`<br>`/suppliers` | — |
| `/tesoreria/cheques/:id` | ChequeDetail<br>`features/tesoreria/ChequeDetail.tsx` | `tesoreria.cheques.listar` · feat:tesoreria | — | `/tesoreria/cheques/:param`<br>`/tesoreria/cheques/:param/imprimir`<br>`/tesoreria/emisiones/:param`<br>`/pagos/:param` | `POST /tesoreria/cheques/:param/anular` |

## Usuarios y roles (1)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/usuarios` | UsuariosPage<br>`features/usuarios/UsuariosPage.tsx` | `usuarios.listar` | SS×2, S×1, Filtros, Check×2 | `/roles/perfiles`<br>`/usuarios/:param`<br>`/usuarios/:param/almacenes-permitidos`<br>`/usuarios/:param/sucursales`<br>`/pos/cajas`<br>`/roles`<br>`/sucursales`<br>`/usuarios`<br>`/usuarios/lookup` | `POST /usuarios`<br>`POST /usuarios/:param/reactivar`<br>`POST /usuarios/:param/reinvitar`<br>`DELETE /usuarios/:param`<br>`POST /usuarios/:param/suspender`<br>`PUT /usuarios/:param` |

## Reportes (1)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/reportes/:tipo` | ReportesPage<br>`features/reportes/ReportesPage.tsx` | — | SS×27, S×11, Filtros | `/reportes/balance-general/pdf`<br>`/reportes/caja/cuadre/pdf`<br>`/reportes/compras/analitica/pdf`<br>`/reportes/compras/item-wise/pdf`<br>`/reportes/compras/ordenes-analitica/pdf`<br>`/reportes/compras/registro/pdf`<br>`/reportes/pos/corte-caja-dia/pdf`<br>`/reportes/pos/cuadre-turno/pdf`<br>`/reportes/cxc/aging/pdf`<br>`/reportes/cxp/aging/pdf`<br>`/reportes/dgii/facturacion-fiscal/pdf`<br>`/reportes/flujo-efectivo/pdf`<br>`/reportes/ingresos-egresos/pdf`<br>`/reportes/inventario/antiguedad/pdf`<br>`/reportes/inventario/movimientos/pdf`<br>`/reportes/inventario/proyeccion/pdf`<br>`/reportes/inventario/valoracion/pdf`<br>`/reportes/pedidos/analitica/pdf`<br>`/reportes/ventas/item-wise/pdf`<br>`/reportes/ventas/pdf`<br>`/reportes/balance-general`<br>`/reportes/caja/cuadre`<br>`/reportes/compras/analitica`<br>`/reportes/compras/item-wise`<br>`/reportes/compras/ordenes-analitica`<br>`/reportes/compras/registro`<br>`/reportes/pos/corte-caja-dia`<br>`/reportes/pos/cuadre-turno`<br>`/reportes/cxc/aging`<br>`/reportes/cxp/aging`<br>`/reportes/despacho/faltantes`<br>`/reportes/despacho/margen`<br>`/reportes/despacho/pendientes-compra`<br>`/reportes/despacho/reservas`<br>`/config/facturacion`<br>`/reportes/dgii/facturacion-fiscal`<br>`/reportes/flujo-efectivo`<br>`/reportes/ingresos-egresos`<br>`/reportes/inventario/antiguedad`<br>`/reportes/inventario/movimientos`<br>`/reportes/inventario/proyeccion`<br>`/reportes/inventario/valoracion`<br>`/reportes/libro-diario`<br>`/reportes/libro-mayor`<br>`/reportes/pedidos/analitica`<br>`/reportes/dgii/606`<br>`/reportes/dgii/607`<br>`/reportes/dgii/608`<br>`/farmacia/reportes/facturas-ars`<br>`/farmacia/reportes/lotes`<br>`/reportes/ventas`<br>`/reportes/solicitudes/:param`<br>`/reportes/ventas/item-wise`<br>`/config/almacenes`<br>`/aseguradoras`<br>`/customers`<br>`/catalog/items`<br>`/reportes/solicitudes`<br>`/sucursales`<br>`/suppliers`<br>`/usuarios` | `POST /reportes/inventario/movimientos/solicitar` |

## Contabilidad — Plan de cuentas (4)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/cuentas` | CuentasPage<br>`features/cuentas/CuentasPage.tsx` | `contabilidad.cuentas.listar` · feat:contabilidad | Filtros, Check×1, Tabs | `/cuentas/tree`<br>`/cuentas` | — |
| `/cuentas/nueva` | CuentaForm<br>`features/cuentas/CuentaForm.tsx` | `contabilidad.cuentas.listar` · feat:contabilidad | Check×3 | `/cuentas/:param` | `POST /cuentas`<br>`PUT /cuentas/:param` |
| `/cuentas/:id/editar` | CuentaForm<br>`features/cuentas/CuentaForm.tsx` | `contabilidad.cuentas.listar` · feat:contabilidad | Check×3 | `/cuentas/:param` | `POST /cuentas`<br>`PUT /cuentas/:param` |
| `/cuentas/:id` | CuentaDetail<br>`features/cuentas/CuentaDetail.tsx` | `contabilidad.cuentas.listar` · feat:contabilidad | — | `/cuentas/:param` | — |

## Contabilidad — Asientos (3)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/asientos` | JournalPage<br>`features/journal/JournalPage.tsx` | `contabilidad.asientos.listar` · feat:contabilidad | SS×2, Filtros | `/departamentos`<br>`/journal-entry`<br>`/sucursales` | — |
| `/asientos/nuevo` | JournalForm<br>`features/journal/JournalForm.tsx` | `contabilidad.asientos.listar` · feat:contabilidad | SS×2 | `/cuentas/:param`<br>`/config/facturacion`<br>`/sucursales` | `POST /journal-entry`<br>`POST /journal-entry/:param/submit` |
| `/asientos/:id` | JournalDetail<br>`features/journal/JournalDetail.tsx` | `contabilidad.asientos.listar` · feat:contabilidad | — | `/journal-entry/:param` | `POST /journal-entry/:param/cancel`<br>`POST /journal-entry/:param/submit` |

## Contabilidad — Cierres y libros (3)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/contabilidad/cierre-periodo` | CierrePeriodoPage<br>`features/contabilidad/CierrePeriodoPage.tsx` | `contabilidad.cierre-periodo.listar` · feat:contabilidad | SS×2, Filtros | `/contabilidad/cierre-periodo`<br>`/config/ejercicio-fiscal` | `POST /contabilidad/cierre-periodo`<br>`POST /contabilidad/cierre-periodo/:param/submit` |
| `/contabilidad/libro-diario` | LibroDiarioPage<br>`features/contabilidad/LibroDiarioPage.tsx` | `contabilidad.libros.ver` · feat:contabilidad | SS×2, S×3, Filtros | `/reportes/libro-diario/pdf`<br>`/reportes/libro-diario`<br>`/customers`<br>`/sucursales`<br>`/suppliers` | — |
| `/contabilidad/libro-mayor` | LibroMayorPage<br>`features/contabilidad/LibroMayorPage.tsx` | `contabilidad.libros.ver` · feat:contabilidad | SS×1, Filtros | `/reportes/libro-mayor/pdf`<br>`/reportes/libro-mayor`<br>`/sucursales` | — |

## Apertura / Migración de saldos (13)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/apertura/diagnostico` | AperturaDiagnosticoPage<br>`features/apertura/DiagnosticoPage.tsx` | `apertura.preparar.ver` | S×2 | `/apertura/preflight` | `POST /apertura/preparar` |
| `/apertura/ventas` | AperturaVentasPage<br>`features/apertura/VentasListPage.tsx` | `apertura.ventas.listar` | SS×1, Filtros | `/apertura/ventas`<br>`/customers` | `POST /apertura/ventas/:param/cancel` |
| `/apertura/ventas/nueva` | AperturaVentaForm<br>`features/apertura/VentaForm.tsx` | `apertura.ventas.crear` | SS×2, Check×1 | `/apertura/preflight`<br>`/config/facturacion`<br>`/customers`<br>`/monedas`<br>`/sucursales` | `POST /apertura/ventas` |
| `/apertura/ventas/importar` | AperturaVentasImportarPage<br>`features/apertura/VentasImportarPage.tsx` | `apertura.ventas.crear` | SS×1, Check×1 | `/apertura/preflight`<br>`/customers` | `POST /apertura/ventas/importar` |
| `/apertura/ventas/:id` | AperturaVentaDetail<br>`features/apertura/VentaDetail.tsx` | `apertura.ventas.listar` | — | `/apertura/ventas/:param` | `POST /apertura/ventas/:param/cancel` |
| `/apertura/compras` | AperturaComprasPage<br>`features/apertura/ComprasListPage.tsx` | `apertura.compras.listar` | SS×1, Filtros | `/apertura/compras`<br>`/suppliers` | `POST /apertura/compras/:param/cancel` |
| `/apertura/compras/nueva` | AperturaCompraForm<br>`features/apertura/CompraForm.tsx` | `apertura.compras.crear` | SS×3, Check×1 | `/apertura/preflight`<br>`/config/catalogos-fiscales`<br>`/config/facturacion`<br>`/monedas`<br>`/sucursales`<br>`/suppliers` | `POST /apertura/compras` |
| `/apertura/compras/importar` | AperturaComprasImportarPage<br>`features/apertura/ComprasImportarPage.tsx` | `apertura.compras.crear` | SS×1, Check×1 | `/apertura/preflight`<br>`/suppliers` | `POST /apertura/compras/importar` |
| `/apertura/compras/:id` | AperturaCompraDetail<br>`features/apertura/CompraDetail.tsx` | `apertura.compras.listar` | — | `/apertura/compras/:param` | `POST /apertura/compras/:param/cancel` |
| `/apertura/inventario` | AperturaInventarioPage<br>`features/apertura/InventarioListPage.tsx` | `apertura.inventario.listar` | SS×1, Filtros | `/apertura/inventario`<br>`/sucursales` | `POST /apertura/inventario/:param/cancel` |
| `/apertura/inventario/nueva` | AperturaInventarioForm<br>`features/apertura/InventarioForm.tsx` | `apertura.inventario.crear` | SS×2 | `/apertura/preflight`<br>`/config/facturacion`<br>`/config/almacenes`<br>`/sucursales` | `POST /apertura/inventario` |
| `/apertura/inventario/:id` | AperturaInventarioDetail<br>`features/apertura/InventarioDetail.tsx` | `apertura.inventario.listar` | — | `/apertura/inventario/:param` | `POST /apertura/inventario/:param/cancel` |
| `/apertura/resumen` | AperturaResumenPage<br>`features/apertura/ResumenPage.tsx` | `apertura.resumen.ver` | — | `/apertura/resumen` | — |

## Ventas — Despachos (6)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/despachos` | DespachosListPage<br>`features/despachos/DespachosListPage.tsx` | `despachos.ver` · feat:despacho | S×2, Filtros, Tabs | `/config/facturacion`<br>`/despachos/confirmaciones`<br>`/despachos`<br>`/despachos/pendientes` | `POST /despachos/desde-factura/:param`<br>`POST /despachos/desde-pedido/:param` |
| `/despachos/nuevo` | DespachoForm<br>`features/despachos/DespachoForm.tsx` | `despachos.ver` · feat:despacho | SS×3 | `/config/facturacion`<br>`/catalog/items/:param`<br>`/customers`<br>`/sucursales`<br>`/inventory/warehouses` | `POST /despachos` |
| `/despachos/pendientes` | DespachosListPage<br>`features/despachos/DespachosListPage.tsx` | `despachos.ver` · feat:despacho | S×2, Filtros, Tabs | `/config/facturacion`<br>`/despachos/confirmaciones`<br>`/despachos`<br>`/despachos/pendientes` | `POST /despachos/desde-factura/:param`<br>`POST /despachos/desde-pedido/:param` |
| `/despachos/confirmaciones` | DespachosListPage<br>`features/despachos/DespachosListPage.tsx` | `despachos.ver` · feat:despacho | S×2, Filtros, Tabs | `/config/facturacion`<br>`/despachos/confirmaciones`<br>`/despachos`<br>`/despachos/pendientes` | `POST /despachos/desde-factura/:param`<br>`POST /despachos/desde-pedido/:param` |
| `/despachos/confirmaciones/:id` | ConfirmacionDespachoDetail<br>`features/despachos/ConfirmacionDespachoDetail.tsx` | `despachos.ver` · feat:despacho | SS×1 | `/despachos/confirmaciones/:param`<br>`/catalog/items/:param`<br>`/config/almacenes` | `POST /despachos/confirmaciones/:param/confirmar` |
| `/despachos/:id` | DespachoDetail<br>`features/despachos/DespachoDetail.tsx` | `despachos.ver` · feat:despacho | SS×2 | `/despachos/:param/print`<br>`/despachos/:param`<br>`/catalog/items/:param`<br>`/config/almacenes`<br>`/inventory/warehouses` | `POST /despachos/:param/asignar-tracking`<br>`POST /despachos/:param/cancel`<br>`POST /despachos/:param/confirmar-stock`<br>`DELETE /despachos/:param`<br>`POST /despachos/:param/devolucion`<br>`POST /despachos/:param/facturar`<br>`POST /despachos/:param/submit`<br>`PUT /despachos/:param` |

## Configuración (28)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/config/empresa` | EmpresaConfig<br>`features/config/EmpresaConfig.tsx` | `config.empresa.ver` | SS×2, Check×2 | `/config/cuentas-empresa`<br>`/config/empresa`<br>`/config/almacenes` | `PUT /config/cuentas-empresa`<br>`PUT /config/empresa`<br>`POST /config/empresa/logo` |
| `/config/ncf` | NcfPage<br>`features/config/NcfPage.tsx` | `config.ncf.listar` | S×1, Tabs | `/config/catalogos-fiscales`<br>`/config/ecf`<br>`/config/ncf/:param`<br>`/config/ncf`<br>`/config/ecf/secuencias` | `POST /config/ecf/secuencias`<br>`POST /config/ncf`<br>`DELETE /config/ecf/secuencias/:param`<br>`POST /config/ncf/:param/disable`<br>`POST /config/ncf/:param/enable`<br>`PATCH /config/ecf/secuencias/:param`<br>`PUT /config/ncf/:param`<br>`POST /config/ecf/secuencias/anular-rangos` |
| `/config/monedas` | MonedasPage<br>`features/config/MonedasPage.tsx` | `monedas.ver` | S×5, Check×1 | `/monedas/convertir`<br>`/cuentas`<br>`/monedas`<br>`/monedas/tasas` | `POST /cuentas`<br>`POST /monedas/tasas`<br>`DELETE /monedas/tasas/:param`<br>`PATCH /monedas/:param`<br>`POST /monedas/tasas/sincronizar`<br>`PUT /monedas/tasas/:param` |
| `/config/ecf/admin` | EcfAdminPage<br>`features/config/EcfAdminPage.tsx` | — · solo-SM | S×1 | `/config/ecf/admin/clients/by-rnc/:param`<br>`/config/ecf`<br>`/config/empresa` | `POST /config/ecf/admin/connect`<br>`POST /config/ecf/admin/clients`<br>`POST /config/ecf/admin/clients/link`<br>`POST /config/ecf/admin/webhook`<br>`DELETE /config/ecf/admin/clients/:param`<br>`POST /config/ecf/admin/certificate` |
| `/config/ecf/certificacion` | EcfCertificacionPage<br>`features/config/EcfCertificacionPage.tsx` | — · solo-SM | — | `/config/ecf/certificacion`<br>`/config/ecf` | — |
| `/config/ecf/contingencia` | EcfContingenciaPage<br>`features/config/EcfContingenciaPage.tsx` | — · solo-SM | — | `/config/ecf/contingencia/pendientes`<br>`/config/ecf` | `POST /config/ecf/contingencia/activar`<br>`POST /config/ecf/contingencia/desactivar`<br>`POST /config/ecf/contingencia/flush` |
| `/config/sucursales` | SucursalesPage<br>`features/config/SucursalesPage.tsx` | `sucursales.listar` | SS×2, Filtros | `/config/almacenes`<br>`/sucursales` | `POST /sucursales`<br>`DELETE /sucursales/:param`<br>`PUT /sucursales/:param` |
| `/config/plantillas-facturas` | InvoiceTemplateEditorPage<br>`features/invoice-template-editor/InvoiceTemplateEditorPage.tsx` | `plantillas.impresion.listar` | Check×1 | `/plantillas/campos-disponibles`<br>`/plantillas/galeria`<br>`/impresoras/mi-seleccion`<br>`/plantillas/:param`<br>`/plantillas/default`<br>`/plantillas` | `POST /plantillas`<br>`DELETE /plantillas/:param`<br>`POST /plantillas/:param/predeterminada`<br>`PUT /plantillas/:param`<br>`POST /plantillas/logo` |
| `/config/plantillas-etiquetas` | InvoiceTemplateEditorPage<br>`features/invoice-template-editor/InvoiceTemplateEditorPage.tsx` | `plantillas.impresion.listar` | Check×1 | `/plantillas/campos-disponibles`<br>`/plantillas/galeria`<br>`/impresoras/mi-seleccion`<br>`/plantillas/:param`<br>`/plantillas/default`<br>`/plantillas` | `POST /plantillas`<br>`DELETE /plantillas/:param`<br>`POST /plantillas/:param/predeterminada`<br>`PUT /plantillas/:param`<br>`POST /plantillas/logo` |
| `/config/cajas` | CajasPage<br>`features/config/CajasPage.tsx` | — · solo-SM · feat:caja | SS×2, Filtros | `/pos/cajas`<br>`/sucursales`<br>`/inventory/warehouses` | `POST /pos/cajas`<br>`DELETE /pos/cajas/:param`<br>`PUT /pos/cajas/:param` |
| `/config/centros-costo` | CentrosCostoPage<br>`features/config/CentrosCostoPage.tsx` | `contabilidad.centros-costo.listar` · feat:contabilidad | SS×1, Filtros, Check×1 | `/centros-costo/tree`<br>`/centros-costo` | `POST /centros-costo`<br>`DELETE /centros-costo/:param`<br>`PUT /centros-costo/:param` |
| `/config/bancos` | BancosPage<br>`features/config/BancosPage.tsx` | `tesoreria.bancos.listar` · feat:tesoreria | Filtros | `/cuentas-bancarias/bancos` | `POST /cuentas-bancarias/bancos`<br>`PUT /cuentas-bancarias/bancos/:param` |
| `/config/cuentas-bancarias` | CuentasBancariasPage<br>`features/config/CuentasBancariasPage.tsx` | `tesoreria.cuentas-bancarias.listar` · feat:tesoreria | SS×1, S×5, Filtros, Check×2 | `/cuentas/:param`<br>`/cuentas-bancarias/:param/balance`<br>`/cuentas-bancarias/bancos`<br>`/tesoreria/cheque-print-templates`<br>`/cuentas-bancarias`<br>`/cuentas-bancarias/inconsistencias-moneda`<br>`/cuentas-bancarias/tipos` | `POST /cuentas-bancarias`<br>`DELETE /cuentas-bancarias/:param`<br>`PUT /cuentas-bancarias/:param` |
| `/config/tesoreria/tipos-documento` | TiposDocumentoPage<br>`features/tesoreria/TiposDocumentoPage.tsx` | `tesoreria.tipos-documento.listar` · feat:tesoreria | S×3, Filtros, Check×5 | `/tesoreria/tipos-documento` | `POST /tesoreria/tipos-documento`<br>`POST /tesoreria/tipos-documento/:param/disable`<br>`PUT /tesoreria/tipos-documento/:param` |
| `/config/tesoreria/plantillas-cheque` | PlantillasChequePage<br>`features/tesoreria/PlantillasChequePage.tsx` | `tesoreria.plantillas-cheque.listar` · feat:tesoreria | — | `/tesoreria/cheque-print-templates` | — |
| `/config/tesoreria/plantillas-cheque/nueva` | PlantillaChequeForm<br>`features/tesoreria/PlantillaChequeForm.tsx` | `tesoreria.plantillas-cheque.listar` · feat:tesoreria | — | `/tesoreria/cheque-print-templates/:param` | `POST /tesoreria/cheque-print-templates`<br>`POST /tesoreria/cheque-print-templates/:param/regenerar`<br>`PUT /tesoreria/cheque-print-templates/:param` |
| `/config/tesoreria/plantillas-cheque/:id` | PlantillaChequeForm<br>`features/tesoreria/PlantillaChequeForm.tsx` | `tesoreria.plantillas-cheque.listar` · feat:tesoreria | — | `/tesoreria/cheque-print-templates/:param` | `POST /tesoreria/cheque-print-templates`<br>`POST /tesoreria/cheque-print-templates/:param/regenerar`<br>`PUT /tesoreria/cheque-print-templates/:param` |
| `/config/departamentos` | DepartamentosPage<br>`features/config/DepartamentosPage.tsx` | `departamentos.listar` · feat:contabilidad | SS×1, Filtros, Check×1 | `/departamentos/tree`<br>`/departamentos` | `POST /departamentos`<br>`DELETE /departamentos/:param`<br>`PUT /departamentos/:param` |
| `/config/impresoras` | ImpresorasPage<br>`features/config/ImpresorasPage.tsx` | `impresoras.listar` | — | `/impresoras/mi-seleccion`<br>`/impresoras` | `POST /impresoras`<br>`DELETE /impresoras/:param`<br>`PUT /impresoras/mi-seleccion`<br>`PUT /impresoras/:param` |
| `/config/retenciones` | RetencionesPage<br>`features/config/RetencionesPage.tsx` | `config.retenciones.listar` · feat:contabilidad | S×2, Filtros | `/config/retenciones/:param`<br>`/config/retenciones`<br>`/config/tasas-impuesto` | `POST /config/retenciones`<br>`DELETE /config/retenciones/:param`<br>`PUT /config/retenciones/:param` |
| `/config/ajustes-avanzados` | AjustesAvanzadosPage<br>`features/config/AjustesAvanzadosPage.tsx` | `config.seguridad.ver` | SS×7, S×1, Check×14, Tabs | `/config/accounts-settings`<br>`/config/buying-settings`<br>`/config/seguridad`<br>`/config/selling-settings`<br>`/config/stock-settings`<br>`/customers/groups/list`<br>`/config/grupos-proveedores`<br>`/config/paises`<br>`/roles`<br>`/usuarios`<br>`/inventory/warehouses` | `PUT /config/accounts-settings`<br>`PUT /config/buying-settings`<br>`PUT /config/selling-settings`<br>`PUT /config/stock-settings` |
| `/config/recalculo-valuacion` | RepostValuacionPage<br>`features/inventory/RepostValuacionPage.tsx` | `inventario.valuacion.consultar` | SS×1 | `/inventory/repost-valuacion`<br>`/inventory/warehouses` | `POST /inventory/repost-valuacion` |
| `/config/notificaciones` | NotificacionesPage<br>`features/config/NotificacionesPage.tsx` | `notificaciones.tipos.listar` | SS×1, S×1, Filtros, Check×3, Tabs | `/notificaciones/canales/email`<br>`/notificaciones/logs/resumen`<br>`/notificaciones/tipos/:param`<br>`/notificaciones/logs`<br>`/notificaciones/tipos` | `POST /notificaciones/tipos/:param/probar`<br>`PUT /notificaciones/canales/email`<br>`PUT /notificaciones/tipos/:param` |
| `/config/permisos` | PermisosPage<br>`features/config/PermisosPage.tsx` | — · solo-SM | SS×2, Filtros, Check×2 | `/permisos`<br>`/permisos/catalogo` | `POST /permisos/asignar`<br>`DELETE /permisos`<br>`POST /permisos/reset` |
| `/config/roles` | RolesPage<br>`features/config/RolesPage.tsx` | — · solo-SM | Check×2, Tabs | `/roles/perfiles`<br>`/roles` | `POST /roles/perfiles`<br>`POST /roles`<br>`DELETE /roles/perfiles/:param`<br>`PUT /roles/perfiles/:param` |
| `/config/roles/:name` | RoleDetailPage<br>`features/config/RoleDetailPage.tsx` | — · solo-SM | Check×1 | `/roles/:param` | `DELETE /roles/:param`<br>`PUT /roles/:param` |
| `/config/auditoria-pin` | AdminPinLogPage<br>`features/config/AdminPinLogPage.tsx` | — · solo-SM | — | `/auth/admin-pin-log` | — |
| `/config/:seccion` | ConfigPage<br>`features/config/ConfigPage.tsx` | — | SS×11, S×12, Filtros, Check×39 | `/config/catalogos-fiscales`<br>`/config/cobros`<br>`/config/ecf`<br>`/config/ejercicio-fiscal/vigente`<br>`/config/facturacion`<br>`/config/ncf`<br>`/config/perfil`<br>`/config/uom/:param`<br>`/config/almacenes`<br>`/cuentas-bancarias`<br>`/customers/groups/list`<br>`/config/denominaciones`<br>`/config/ejercicio-fiscal`<br>`/config/impuestos-compras`<br>`/config/impuestos-ventas`<br>`/config/item-tax-templates`<br>`/config/listas-precio`<br>`/config/metodos-pago`<br>`/roles`<br>`/sucursales`<br>`/config/tasas-impuesto`<br>`/config/uom` | `PUT /config/despacho/futuro`<br>`POST /config/ejercicio-fiscal/:param/close`<br>`POST /config/almacenes`<br>`POST /customers/groups`<br>`POST /config/denominaciones`<br>`POST /config/ejercicio-fiscal`<br>`POST /config/metodos-pago`<br>`POST /config/tasas-impuesto`<br>`POST /config/uom`<br>`DELETE /config/almacenes/:param`<br>`DELETE /customers/groups/:param`<br>`DELETE /config/tasas-impuesto/:param`<br>`POST /config/despacho/deshabilitar`<br>`POST /config/pos/deshabilitar`<br>`POST /config/despacho/habilitar`<br>`POST /config/farmacia/habilitar`<br>`POST /config/pos/habilitar`<br>`POST /config/ejercicio-fiscal/:param/reopen`<br>`PUT /config/almacenes/:param`<br>`PUT /config/cobros`<br>`PUT /config/denominaciones/:param`<br>`PUT /config/ecf`<br>`PUT /config/ejercicio-fiscal/:param`<br>`PUT /config/facturacion`<br>`PUT /config/metodos-pago/:param`<br>`PUT /config/perfil`<br>`PUT /config/tasas-impuesto/:param`<br>`PUT /config/uom/:param` |

## Mi cuenta (1)

| Ruta | Pantalla | Gate | Filtros UI | Consultas GET | Mutaciones |
|---|---|---|---|---|---|
| `/mi-cuenta` | MiCuentaPage<br>`pages/MiCuentaPage.tsx` | — | Check×1 | `/me/profile`<br>`/me/identities`<br>`/me/mfa/factors` | `POST /me/password`<br>`POST /me/mfa/totp/confirm`<br>`DELETE /me/mfa/:param`<br>`POST /me/mfa/email`<br>`POST /me/mfa/totp`<br>`PATCH /me/profile`<br>`DELETE /me/identities/:param` |
