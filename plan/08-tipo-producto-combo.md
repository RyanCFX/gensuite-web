# Fase 8 — Tipo de producto "Combo"

## Requerimiento
Agregar un tipo de producto "combo": combinación de 2+ artículos existentes (ej. lápiz + grapadora). Al vender el combo, se descuenta cada artículo componente del inventario; al comprar un combo, se suma la cantidad a cada componente.

## ¿Lo maneja nativo ERPNext? Sí, casi al 100% — doctype `Product Bundle`
ERPNext tiene exactamente este concepto de forma nativa: **`Product Bundle`** (antes llamado "Sales BOM"):
- Un `Product Bundle` vincula un `new_item_code` (el item "combo", que se marca con `is_stock_item=0` porque el combo en sí no se almacena, solo sus componentes) con una tabla hija `items` (`item_code`, `qty`) — los componentes reales.
- **Al vender** (Sales Invoice / Delivery Note con `update_stock=1`) un item que tiene un `Product Bundle` asociado, ERPNext **automáticamente explota la venta en los componentes** y descuenta el stock de cada uno (no del item combo, que nunca tuvo stock propio). Esto es comportamiento nativo, cero código custom necesario para la venta.
- **Al comprar**: aquí está la única brecha — `Product Bundle` en ERPNext **es un mecanismo de venta**, no de compra. Comprar un "combo" y que se sumen las cantidades a cada componente **no es nativo**; ERPNext asume que compras cada componente por separado. Esto requiere lógica custom en el BFF (ver abajo).

## Diseño recomendado

### 1. Catálogo — nuevo tipo `combo`
- `CreateItemDto.type: 'product' | 'service' | 'combo'`.
- Al crear un item `type: 'combo'`:
  - Se crea el `Item` en ERPNext con `is_stock_item=0` (igual que servicio, el combo no tiene stock propio) pero con un custom field `custom_item_type` (Select: `Producto`, `Servicio`, `Combo`) para distinguirlo de un servicio real en reportes (aunque `is_stock_item` sea 0 en ambos casos). Esto responde a la necesidad de filtrar/reportar combos como categoría propia, no confundirlos con servicios.
  - Se crea además el doctype nativo `Product Bundle` con `new_item_code = <item combo>` y la tabla `items` con los componentes y cantidades (ej. `lapiz: 1, grapadora: 1`).
- Nuevo DTO:
```ts
export class CreateComboItemDto extends CreateItemDto {
  type: 'combo'
  components: { itemCode: string; qty: number }[]  // mínimo 2 componentes
}
```
- `ItemsService.create()`: si `type === 'combo'`, después de crear el `Item`, crear el `Product Bundle` correspondiente (`frappe.client.insert` doctype `Product Bundle`).
- `ItemsService.update()`: si cambian los componentes, actualizar el `Product Bundle` (`frappe.client.save`).

### 2. Venta de combos (Facturas, Cotizaciones, Pedidos)
- **Sin cambios de lógica** — el BFF simplemente vende el `item_code` del combo como una línea normal. ERPNext explota el `Product Bundle` automáticamente al someter el documento con `update_stock=1` (Factura con `update_stock=1`, o Delivery Note). Verificar que Cotización/Pedido (que no mueven stock, solo la Factura generada después sí) no necesiten ningún cambio — la explosión ocurre en el documento que efectivamente tiene `update_stock=1`.
- Único ajuste necesario: en el cálculo de "notas por línea" (`attachItemNotes`) y "tipo de item", el BFF debe reconocer que un combo no tiene `warehouse` propio con stock (igual que un servicio) para no pedirlo directamente en la línea del combo — el descuento de stock ocurre a nivel de componente, resuelto por ERPNext internamente vía el `Product Bundle`, usando el `warehouse` que sí se especifique en la línea de venta del combo (ERPNext descuenta los componentes del mismo warehouse indicado en la línea del combo).

### 3. Compra de combos (requiere lógica custom — no nativo)
Como `Product Bundle` no aplica a compras, se necesita:
- En `ComprasService.create()`: cuando una línea de la Purchase Invoice tenga un `itemCode` cuyo `custom_item_type === 'Combo'`, **no enviar esa línea tal cual a ERPNext** (un combo no debería registrarse como comprado directamente, ya que no tiene stock propio ni costo unitario real). En su lugar:
  - Expandir la línea del combo en N líneas (una por componente), multiplicando `qty_combo * qty_componente`, usando el mismo `warehouse` y prorrateando el `rate`/costo del combo entre los componentes (estrategia simple: por proporción de `standard_rate` de cada componente, o configurable).
  - Esto requiere resolver los componentes del `Product Bundle` del item combo (consulta a ERPNext: `frappe.client.get` doctype `Product Bundle` filtrando `new_item_code`) antes de armar el payload de la Purchase Invoice.
- Nuevo helper: `combo.helpers.ts`:
```ts
export async function expandComboLine(erpnext, tenant, line: PurchaseItemLine): Promise<PurchaseItemLine[]>
```
- Este es el punto de mayor riesgo/complejidad de toda la fase — requiere definir la regla de prorrateo de costo con el usuario (ver preguntas abiertas).

**Alternativa nativa considerada y descartada para este caso — `Stock Entry` tipo `Repack`:** ERPNext tiene un mecanismo nativo para "convertir" un ítem en otro(s): un `Stock Entry` con `purpose: 'Repack'` consume un ítem de entrada y produce uno o más ítems de salida (ej. recibir un kit físico empacado y desempacarlo en sus componentes). Se descarta como solución principal para la compra de combos porque: (a) el combo en este diseño **nunca tiene stock propio** (`is_stock_item=0`, igual que un servicio) — no hay nada que "recibir" físicamente como una unidad para luego desempacar; el proveedor factura directamente por unidades de cada componente en la práctica, o el negocio decide comprar el combo como abstracción de precio, no como bulto físico. Repack tendría sentido solo si el negocio compra un **kit físico real** con su propio código de barras que luego se desarma — un escenario distinto al de "combo = agrupación de venta de 2 artículos ya vendidos por separado". Mencionar esta alternativa para descartarla explícitamente evita reconsiderarla más adelante sin justificación registrada.

## Custom fields / doctypes nuevos
- `Item.custom_item_type` (Select: Producto/Servicio/Combo) — fixture `custom_field.json`.
- Ningún doctype custom nuevo — se reutiliza `Product Bundle` (ya nativo, tabla `tabProduct Bundle` y `tabProduct Bundle Item` existen en cualquier instalación de ERPNext con la app `erpnext` instalada, sin necesidad de crear nada vía `localizacion_rd`).

## Endpoints resultantes
| Método | Ruta | Cambio |
|---|---|---|
| `POST /catalog/items` | Acepta `type: 'combo'` + `components[]`, crea `Item` + `Product Bundle` |
| `PUT /catalog/items/:id` | Actualiza `Product Bundle` si cambian componentes |
| `GET /catalog/items/:id` | Incluye `components[]` en la respuesta si `type === 'combo'` |
| `POST /compras` | Expande líneas de combo en sus componentes antes de crear la Purchase Invoice |

## Preguntas abiertas
1. **Regla de prorrateo de costo en compra de combos**: si compro un combo a $100 y sus componentes normalmente valen $60 (lápiz) y $40 (grapadora) por separado, ¿el costo se prorratea proporcionalmente ($60/$40), se divide equitativo, o se ingresa manualmente el costo de cada componente al momento de la compra? Esto es una decisión de negocio que cambia el diseño del endpoint de compras.
2. ¿Se puede vender un combo con cantidad fraccionada o siempre es unidad completa (1 combo = 1 lápiz + 1 grapadora, no 0.5 combos)?
3. ¿Un combo puede contener otro combo (anidado)? Se recomienda **no permitirlo** en v1 (simplifica la expansión en compras) — validar en el DTO que los `components[]` no sean ellos mismos de `type: 'combo'`.
4. ¿Se requiere reportar inventario "virtual" del combo (ej. "tengo stock para armar 15 combos más" según el mínimo de componentes disponibles)? Esto sería un reporte adicional (no crítico para v1), calculable con `MIN(componente.stock / componente.qty_en_combo)`.
