# Prompt para agente de frontend — Aging CxC/CxP: filtros, agrupación e historial ampliado

> Prompt autocontenido. Contexto de negocio y UX — shapes exactos en `openapi.json`, tags
> **"Cobros"**, **"Pagos"** y **"Reportes"**. API base `https://gensapi.ryancfx.click/api/v1`.
> Módulo independiente de Tesorería — se puede implementar en paralelo a los prompts 35–41.

## 1. Filtro por cliente/proveedor en Aging (antigüedad de cartera)

Los endpoints de aging ya existían; se les agregó un query param `customer` (CxC) / `supplier`
(CxP) para ver la cartera de un solo tercero en vez de todos:

```
GET /cobros/aging?customer=CUST-00001
GET /pagos/aging?supplier=SUPP-00001
GET /reportes/cxc/aging?customer=CUST-00001
GET /reportes/cxc/aging/pdf?customer=CUST-00001
GET /reportes/cxp/aging?supplier=SUPP-00001
GET /reportes/cxp/aging/pdf?supplier=SUPP-00001
```

UX: agregar un selector de cliente (CxC) / proveedor (CxP) opcional en la pantalla de aging
existente, poblado con el mismo autocomplete que ya se usa en Clientes/Proveedores. Al elegir uno,
recargar el reporte con el filtro — al limpiarlo, vuelve a la vista consolidada de toda la cartera.
El botón de exportar/imprimir PDF debe pasar el mismo filtro activo (`customer`/`supplier`) al
endpoint `/pdf` correspondiente, para que el PDF exportado coincida con lo que se está viendo en
pantalla.

## 2. Nuevo parámetro `groupBy` en Aging

```
GET /cobros/aging?groupBy=party|invoice
GET /pagos/aging?groupBy=party|invoice
GET /reportes/cxc/aging?groupBy=party|invoice   (y su variante /pdf)
GET /reportes/cxp/aging?groupBy=party|invoice   (y su variante /pdf)
```

- **`groupBy=party` (default, si se omite el parámetro)**: una fila por cliente/proveedor, con los
  saldos de cada rango de antigüedad y el total **sumados** entre todas sus facturas pendientes.
  Es la vista resumen — útil para ver de un vistazo quién debe/a quién se le debe más, sin entrar
  en el detalle de cada factura.
- **`groupBy=invoice`**: una fila por factura pendiente individual (la granularidad que el reporte
  ya tenía antes de este cambio). Útil para ver el detalle exacto de qué factura específica está en
  qué rango de vencimiento.

### Shape de respuesta según `groupBy`

Ambos modos comparten la envoltura:
```ts
{
  success: true,
  groupBy: 'party' | 'invoice',
  data: [...],  // shape distinto según el modo, ver abajo
  config: { rangos: string[] },  // 5 labels descriptivos de los rangos configurados (Cobros)
}
```

- **`groupBy=party`**, cada fila de `data`:
  ```ts
  { customer: string; customerName: string; totalOutstanding: number;
    current: number; range1: number; range2: number; range3: number; range4: number }
  ```
  (En CxP, los campos equivalentes usan `supplier`/`supplierName` — confirmar el nombre exacto en
  openapi.json antes de asumir simetría total con CxC.)

- **`groupBy=invoice`**, cada fila de `data`:
  ```ts
  { customer: string; customerName: string; invoice: string; dueDate: string | null;
    totalOutstanding: number; current: number; range1: number; range2: number; range3: number; range4: number }
  ```

- `current` es el monto **aún no vencido** (la fecha de vencimiento todavía no llega) — no confundir
  con "recién facturado"; una factura con vencimiento a 60 días sigue en `current` hasta que pase su
  `dueDate`. `range1`–`range4` son los tramos vencidos, en orden creciente de antigüedad;
  `config.rangos` trae las 5 etiquetas ya formateadas para usar directamente como headers de columna
  (ej. "Corriente", "0–30 días", "31–60 días", "61–90 días", "+90 días" — los números exactos
  dependen de la configuración de Cobros del tenant, por eso vienen del backend y no deben
  hardcodearse).
- El aging se calcula sobre **fecha de vencimiento** (`due_date`), no fecha de emisión de la
  factura — un cliente con términos de pago largos no aparece como "vencido" hasta que pase su
  fecha de vencimiento real, aunque la factura sea vieja.
- Los montos mostrados son el **saldo pendiente** de cada factura (`outstanding_amount` /
  `totalOutstanding`), no el monto total original de la factura — si una factura de $1,000 ya tiene
  un abono parcial de $400, el aging la muestra por $600.

### UX sugerida

- Un toggle/tabs "Por cliente" / "Por factura" (o "Resumen" / "Detalle") arriba de la tabla de
  aging, que cambie el query param `groupBy` y las columnas mostradas (agregar columnas
  `invoice`/`dueDate` solo en modo detalle).
- Mantener el filtro de `customer`/`supplier` (sección 1) independiente del `groupBy` — son
  ortogonales, se pueden combinar (ej. ver el detalle factura por factura de un solo cliente).

## 3. Historial ampliado (Pay + Receive)

Los endpoints `GET /cobros/historial/:customerId` y `GET /pagos/historial/:supplierId` ya
existían, filtrando internamente por `payment_type`. Antes cada uno mostraba solo su tipo nativo
(Receive para Cobros, Pay para Pagos); ahora ambos incluyen **ambos tipos de movimiento**
(`Pay` y `Receive`) para dar una vista completa de todo lo que pasó con ese tercero, incluyendo
casos donde a un cliente se le hizo un reembolso (Pay) o a un proveedor se le hizo un cobro/nota de
crédito aplicada como entrada (Receive).

Cada fila de la respuesta ahora trae un campo nuevo:
```ts
paymentType: 'Pay' | 'Receive' | undefined
```

**UX**: si la tabla de historial no distinguía visualmente el tipo de movimiento antes (porque
antes todas las filas eran del mismo tipo por construcción), ahora sí hace falta — agregar una
columna o badge que muestre `paymentType` (ej. "Cobro"/"Recibido" para `Receive`, "Pago"/"Enviado"
para `Pay`), especialmente en pantallas de proveedor donde ver un `Receive` inesperado (un cobro al
proveedor) es información relevante que antes simplemente no aparecía en esa vista.
