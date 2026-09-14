# Prompt para agente de frontend — Migración de Libro Diario/Libro Mayor a `General Ledger` nativo

> Este documento es un prompt autocontenido para un agente de IA de frontend. API base
> `https://gensapi.ryancfx.click/api/v1` (o `http://localhost:4000/api/v1` en desarrollo).
>
> **El shape exacto de columnas puede variar levemente** — está en `openapi.json` (tag
> "Reportes", endpoints `GET /reportes/libro-diario` y `GET /reportes/libro-mayor`), pero
> **léelo junto con este documento**: la respuesta de estos dos reportes es un `{columns, rows}`
> genérico (reporte nativo de ERPNext) — el spec no puede documentar los nombres de columna
> exactos ni las filas especiales que arma ERPNext, que es lo que este documento sí explica.

---

## 1. Qué cambió y por qué

`GET /reportes/libro-diario` y `GET /reportes/libro-mayor` **dejaron de ser una implementación
propia** (consulta directa a `GL Entry` armada a mano) **y ahora corren el reporte nativo
`General Ledger` de ERPNext** — mismo mecanismo que ya usan `GET /reportes/ventas` o
`GET /reportes/balance-general` en este mismo módulo.

**Motivo (no es un capricho técnico):** la implementación anterior tenía un límite fijo de 500
(Diario) / 1000 (Mayor) filas sin paginación real — en un rango de fechas con más movimientos
que ese límite, el reporte devolvía datos incompletos **y los totales (`totalDebit`,
`closingBalance`, etc.) quedaban mal calculados, sin ningún aviso de error**. El reporte nativo
no tiene ese problema — calcula sobre el rango completo, sin límite oculto.

Como beneficio adicional, el reporte nativo trae más información que la versión anterior
(sección 3) y los 5 modos de agrupación del filtro `groupBy` (antes solo 2 de 5 funcionaban de
verdad).

**Las rutas no cambiaron** (`GET /reportes/libro-diario`, `GET /reportes/libro-mayor`, y sus
`/pdf`), pero **el shape de la respuesta sí cambió por completo** — esto requiere actualizar
cualquier componente que renderice estas dos pantallas.

## 2. Shape de la respuesta — antes vs. ahora

### 2.1 Libro Diario (`GET /reportes/libro-diario`)

**Antes** (camelCase propio, ya no aplica):
```json
{
  "success": true,
  "data": {
    "fromDate": "2026-08-01", "toDate": "2026-08-31",
    "rows": [
      { "glEntryId": "ACC-GLE-2026-00639", "sequence": 1, "postingDate": "2026-08-03",
        "account": "111-01 - CAJA GENERAL - JBC", "voucherType": "Sales Invoice",
        "voucherNo": "ACC-SINV-2026-00042", "debit": 1180.0, "credit": 0.0,
        "balance": 1180.0, "remarks": null, "party": null, "partyType": null,
        "costCenter": null, "branch": "Santo Domingo", "department": null }
    ],
    "totalDebit": 65652.74, "totalCredit": 5180.0, "closingBalance": 60472.74,
    "totalRows": 342
  }
}
```

**Ahora** (nativo, vía `normalizeReport()` — igual convención que Sales Analytics/Balance
Sheet/Stock Ledger en este mismo módulo):
```json
{
  "success": true,
  "data": {
    "columns": [
      { "fieldname": "gl_entry", "label": "Entrada GL" },
      { "fieldname": "posting_date", "label": "Fecha de Contabilización" },
      { "fieldname": "account", "label": "Cuenta" },
      { "fieldname": "debit", "label": "Débito (DOP)" },
      { "fieldname": "credit", "label": "Crédito (DOP)" },
      { "fieldname": "balance", "label": "Balance (DOP)" },
      { "fieldname": "voucher_type", "label": "Tipo de Comprobante" },
      { "fieldname": "voucher_subtype", "label": "Voucher Subtype" },
      { "fieldname": "voucher_no", "label": "Comprobante No." },
      { "fieldname": "against", "label": "Contra la cuenta" },
      { "fieldname": "party_type", "label": "Tipo de entidad" },
      { "fieldname": "party", "label": "Tercero" },
      { "fieldname": "project", "label": "Project" },
      { "fieldname": "branch", "label": "Sucursal" },
      { "fieldname": "department", "label": "Departamento" },
      { "fieldname": "cost_center", "label": "Centro de costos" },
      { "fieldname": "against_voucher_type", "label": "Tipo de comprobante" },
      { "fieldname": "against_voucher", "label": "Contra comprobante" },
      { "fieldname": "bill_no", "label": "Factura de proveedor No." }
    ],
    "rows": [
      {
        "gl_entry": "ACC-GLE-2026-00639", "posting_date": "2026-08-03",
        "account": "111-01 - CAJA GENERAL - JBC", "party_type": null, "party": null,
        "voucher_type": "Sales Invoice", "voucher_subtype": "Factura de Venta",
        "voucher_no": "ACC-SINV-2026-00042", "cost_center": null, "project": null,
        "against_voucher_type": null, "against_voucher": null, "account_currency": null,
        "against": "Consumidor Final", "is_opening": "No",
        "debit": 1180.0, "credit": 0.0,
        "debit_in_account_currency": 1180.0, "credit_in_account_currency": 0.0,
        "bill_no": "", "remarks": null, "balance": 1180.0,
        "presentation_currency": "DOP", "branch": "Santo Domingo", "department": null
      }
    ],
    "totalRows": 342
  }
}
```

Ya no hay `totalDebit`/`totalCredit`/`closingBalance` como campos separados a nivel raíz —
si la UI necesita esos totales, calcularlos sumando `debit`/`credit` de todas las `rows` (el
propio ERPNext ya garantiza que vienen completas, sin el límite de 500 de antes), o pedirle al
backend un total agregado si hace falta uno explícito (avisar si esto es necesario).

**Columnas nuevas que no existían antes** — vale la pena mostrarlas si hay espacio en la tabla:
`against` (cuenta contrapartida del asiento), `against_voucher_type`/`against_voucher`
(qué comprobante salda ese movimiento — útil para rastrear pagos aplicados a facturas),
`bill_no` (factura de proveedor), `voucher_subtype` (etiqueta humana, ej. "Factura de Venta" en
vez de "Sales Invoice"), `is_opening`, `project`.

⚠️ **Ojo — esto no es exclusivo de Libro Mayor**: verificado en vivo, incluso el Libro Diario
(sin agrupar) trae **3 filas sintéticas** al principio y al final del listado —
`account: "'Apertura'"`, `account: "'Total'"`, `account: "'Cierre (Apertura + Total)'"` (un solo
trío global, no uno por cuenta como en el Mayor) — con `voucher_no` vacío. La misma lógica de
detección de la sección 2.2 (por `voucher_no` ausente) aplica igual acá.

### 2.2 Libro Mayor (`GET /reportes/libro-mayor`)

**Antes** (agrupado por cuenta, calculado a mano):
```json
{
  "success": true,
  "data": {
    "fromDate": "...", "toDate": "...",
    "accounts": [
      {
        "account": "111-01 - CAJA GENERAL - JBC",
        "openingDebit": 0, "openingCredit": 0, "openingBalance": 0,
        "movements": [ { "glEntryId": "...", "sequence": 1, "postingDate": "...", "voucherType": "...",
                         "voucherNo": "...", "debit": 1180, "credit": 0, "balance": 1180,
                         "remarks": null, "party": null, "partyType": null,
                         "costCenter": null, "branch": "...", "department": null } ],
        "periodDebit": 65652.74, "periodCredit": 5180.0, "closingBalance": 60472.74
      }
    ],
    "totalAccounts": 12
  }
}
```

**Ahora** (mismo reporte nativo `General Ledger` que Libro Diario, pero con
`group_by: "Group by Account"`): **el mismo shape `{columns, rows}` de la sección 2.1**, pero
ERPNext inserta filas sintéticas por cada cuenta, en este orden:

1. Una fila con `account: "'Apertura'"` (**con comillas simples literales dentro del string** —
   así lo formatea Frappe) — el saldo de apertura de esa cuenta al inicio del rango, ya
   calculado por ERPNext. `voucher_no` viene vacío/null en esta fila.
2. Las filas de movimiento normales de esa cuenta (mismo shape que la sección 2.1), con
   `balance` corriendo acumulado desde la apertura.
3. Una fila con `account: "'Total'"` — el débito y crédito del período para esa cuenta
   (`voucher_no` vacío).
4. Una fila con `account: "'Cierre (Apertura + Total)'"` — el saldo de cierre de esa cuenta
   (`voucher_no` vacío). Este es el saldo final: apertura + movimientos del período.
5. Una fila separadora con **todos los campos en `null`** (incluyendo `account`) antes de pasar
   a la siguiente cuenta.

**Cómo detectar cada tipo de fila en el frontend:**
- Fila de **movimiento normal**: tiene `voucher_no` con valor.
- Fila de **Apertura/Total/Cierre**: `voucher_no` vacío/null, y `account` es uno de los 3
  strings literales de arriba (comparar con `.includes("Apertura")`, `.includes("Total")`,
  `.includes("Cierre")` es más robusto que igualdad exacta, por las comillas simples
  embebidas). Renderizar en negrita/resaltado, como fila de subtotal.
- Fila **separadora**: `account` es `null` (y todo lo demás también). Se puede usar para
  insertar un espacio visual entre bloques de cuenta, o simplemente filtrarla (`.filter(r =>
  r.account !== null)`) si no aporta nada a la UI y ya se detectan los cambios de cuenta por
  las filas de Apertura/Cierre.

## 3. Cambio de comportamiento del filtro `party` — no es solo un rename

**Antes:** `party` era un campo de texto libre con búsqueda por sustring (`LIKE %texto%`) —
no hacía falta saber si es cliente o proveedor.

**Ahora:** el reporte nativo exige **valor exacto** (no sustring) y **requiere saber el tipo de
entidad** (`partyType`: `"Customer"` o `"Supplier"` — nuevo campo en el filtro). Si se manda
`party` sin `partyType`, o con un valor que no coincide exactamente con el nombre/id real, el
filtro simplemente no aplica bien.

**Cambio de UI necesario:** reemplazar el input de texto libre de "Tercero"/"Party" por:
1. Un selector de tipo: Cliente / Proveedor (mapea a `partyType: "Customer"` / `"Supplier"`
   en el request — valores en inglés, no traducir esto en el query param, solo en la etiqueta
   visible).
2. Un campo de búsqueda con autocompletar (contra `GET /customers` o `GET /suppliers` según lo
   elegido en el paso 1) que al seleccionar un resultado manda el nombre/id exacto en `party`.

Si la pantalla no tiene espacio/tiempo para este rediseño ahora mismo, se puede dejar el filtro
de `party` fuera de la UI temporalmente (los reportes funcionan igual sin él) y agregarlo en una
iteración posterior — avisar si se opta por esto.

## 4. Filtro `groupBy` — ahora los 5 valores funcionan de verdad

Antes, del enum `groupBy` (`'Group by Voucher'`, `'Group by Voucher (Consolidated)'`,
`'Group by Account'`, `'Group by Sucursal'`, `'Group by Departamento'`), solo los dos últimos
estaban implementados — los otros tres eran aceptados por la API pero no hacían nada. **Ahora
los 5 funcionan.** Si la UI tiene un selector de agrupación que hoy deshabilita o esconde esas
3 opciones, se pueden habilitar.

## 5. Qué debe hacer el frontend

- [ ] Actualizar el componente/tabla de **Libro Diario** para leer `columns`/`rows` en vez del
      shape anterior — usar `fieldname` de cada columna para el nombre de campo real en cada
      fila (no asumir los nombres viejos en camelCase).
- [ ] Actualizar el componente de **Libro Mayor** para lo mismo, agregando la detección de filas
      Apertura/Total/Cierre/separador descrita en la sección 2.2, y su render especial
      (negrita/resaltado para las 3 primeras, separador visual o filtrado para la última).
- [ ] Si la UI muestra columnas fijas hoy (ej. solo cuenta/fecha/débito/crédito/balance),
      considerar mostrar también `against`, `bill_no`, `voucher_subtype` si hay espacio — son
      columnas nuevas útiles para auditoría contable.
- [ ] Rediseñar el filtro de `party` como selector de tipo + autocompletar (sección 3), o
      quitarlo temporalmente si no da tiempo ahora.
- [ ] Habilitar las 3 opciones de `groupBy` que antes estaban deshabilitadas/escondidas
      (sección 4), si la UI las tenía ocultas.
- [ ] Probar contra un tenant con suficiente actividad contable en el rango de prueba, incluyendo
      al menos una cuenta con movimientos en varios meses (para verificar que el saldo de
      apertura/cierre del Libro Mayor se ve razonable) y un filtro por sucursal/departamento
      (para confirmar que las columnas `branch`/`department` siguen viniendo).
- [ ] Los endpoints `/pdf` de ambos reportes (`GET /reportes/libro-diario/pdf`,
      `GET /reportes/libro-mayor/pdf`) siguen devolviendo un PDF binario igual que antes — el
      layout interno del PDF se actualizó del lado del backend, no requieren cambios de
      integración en el frontend (siguen respondiendo `application/pdf`).
