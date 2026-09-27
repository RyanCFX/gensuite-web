# Pantallas modificadas — Dimensiones de Inventario

Listado de cada pantalla tocada por la implementación de
`docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md`, agrupado por commit.

## Fundaciones compartidas (no son pantallas, pero las usan todas)

- **`src/shared/api/types.ts`** — nuevos tipos (`DimensionInventario`, `ItemDimensionDeclarada`,
  `ReglaCombinacion`, `DimensionesLinea`, `StockPorDimensionResponse`, `AjusteDimensionDto/Result`,
  `ReclasificacionDimensionDto/Result`, etc.) + campo `dimensiones`/`lineaOriginal` agregado a los
  DTOs de línea de cada módulo existente.
- **`src/shared/api/endpoints.ts`** — rutas nuevas de `catalog.dimensionesInventario.*` e
  `inventory.{ajustesDimension,reclasificaciones,stockPorDimension,verificarStockPorDimension}`.
- **`src/shared/api/dimensiones-inventario.ts`** (nuevo) — cliente CRUD de dimensiones/valores.
- **`src/shared/api/inventory.ts`** — funciones nuevas: `getStockPorDimension`,
  `verificarStockPorDimension`, `ajustarDimension`, `reclasificarDimension`.
- **`src/shared/hooks/useDimensionesInventario.ts`** (nuevo) — cache de catálogo de
  dimensiones/valores.
- **`src/components/shared/CombinacionDimensionSelector.tsx`** (nuevo) — selector de combinación
  en cascada, reutilizado en todas las pantallas de abajo.
- **`src/shared/lib/mergeLineasIguales.ts`** (nuevo) — fusiona líneas idénticas (mismo artículo +
  combinación) antes de someter.
- **`src/shared/permissions/acciones.generated.ts` / `rutas.ts`** — 5 acciones nuevas
  (`catalogo.dimensiones.*`, `inventario.ajustar`, `inventario.reclasificar`) y sus rutas.
- **`docs/PROMPT_PERMISOS_FRONTEND.md`** — documenta esas 5 acciones nuevas.
- **`src/App.tsx` / `src/components/layout/AppLayout.tsx`** — rutas y entradas de menú nuevas.

## Catálogo

| Pantalla | Cambio |
|---|---|
| **Dimensiones de Inventario** (`DimensionesInventarioPage.tsx`, nueva) — `/catalogo/dimensiones` | Listar/crear/editar dimensiones (con slug automático), activar/desactivar (sin borrado), gestión de valores por dimensión con cascada por `dimensionPadre`. |
| **Ficha de Artículo** (`ItemForm.tsx`) | Bloque colapsable "Dimensiones de inventario": declarar dimensiones (orden = permanente), `valoresPermitidos`, grilla de `reglasCombinacion`, oculto para variantes/plantillas/servicios/lote, manejo del error de inmutabilidad. |
| **Detalle de Artículo** (`ItemDetail.tsx`) | Pestaña/acordeón "Stock por combinación" (resuelve etiquetas legibles del lado del cliente), y el modal de "Mover stock" entre ubicaciones ahora pide la combinación si el artículo la usa. |

## Compras

| Pantalla | Cambio |
|---|---|
| **Compras** (`CompraForm.tsx`) | Columna "Combinación" por línea, resend obligatorio en cada PUT, fusión de líneas idénticas. |
| **Recepción de Mercancía** (`RecepcionForm.tsx`) | Igual patrón que Compras. |
| **Órdenes de Compra** (`OrdenForm.tsx`) | Combinación por línea al crear/editar. |
| **Recibir Orden** (`OrdenDetail.tsx`) | Override opcional de combinación por línea (checkbox "corregir combinación"), off por defecto. |
| **Devoluciones de Compra** (`devoluciones-compras/DevolucionForm.tsx`) | Migrada a selector por línea de la factura original + `lineaOriginal` para desambiguar. Nunca pide combinación (se copia sola). |

## Ventas

| Pantalla | Cambio |
|---|---|
| **Facturación** (`InvoiceForm.tsx`) | Combinación por línea, resend siempre pese a la conservación automática del servidor. |
| **Pedidos** (`PedidoForm.tsx`) | Igual patrón. |
| **Pedidos — detalle** (`PedidoDetail.tsx`) | Generalizado el aviso de `warnings` al cancelar un apartado (ya no asume un set fijo de mensajes). |
| **Cotizaciones** (`QuotationForm.tsx`) | Igual patrón, con más cuidado por la conservación aún más frágil en `PUT`. |
| **Despachos** (`DespachoForm.tsx`) | Igual patrón. |
| **Notas de Crédito** (`invoicing/CreditNotesPage.tsx`) | Mismo patrón `lineaOriginal` que Devoluciones de Compra. |
| **Devoluciones de venta** (`invoicing/DevolucionForm.tsx`) | Mismo patrón `lineaOriginal` (endpoint distinto de Notas de Crédito, mismo mecanismo por dentro). |

## Inventario

| Pantalla | Cambio |
|---|---|
| **Transferencias** (`TransferenciaForm.tsx`) | Combinación por línea, misma para ambos tramos. |
| **Ubicaciones** (`ZonasPage.tsx`) | Combinación opcional en "distribuir" stock sin ubicar. |
| **Ajuste de Combinación** (`AjusteDimensionForm.tsx`, nueva) — `/inventario/ajustes-dimension` | Ajusta el saldo de una combinación puntual (cantidad final, no diferencia). |
| **Reclasificación de Combinación** (`ReclasificacionForm.tsx`, nueva) — `/inventario/reclasificaciones` | Cambia una combinación por otra dentro del mismo almacén. |
| **Carga Inicial** (`CargaInicialForm.tsx`) | Excluye artículos dimensionados del picker. |
| **Apertura de Inventario** (`apertura/InventarioForm.tsx`) | Igual exclusión. |
| **Combos** (`bundles/BundlesPage.tsx`) | Excluye artículos dimensionados como componente. |
| **Selector de artículo compartido** (`shared/ui/ItemSelect.tsx`) | Nuevo prop `excludeDimensioned` usado por las 3 pantallas de arriba. |

## Pendiente

- Bug en investigación: columna "Combinación" aparece vacía al elegir un artículo dimensionado en
  Compras — ver conversación de la sesión para el estado del diagnóstico.
