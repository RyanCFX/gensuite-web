# Prompt para agente de frontend — Tesorería: Movimientos (libro de banco)

> Prompt autocontenido. Contexto de negocio y UX — shapes exactos en `openapi.json`, tag
> **"Tesorería — Movimientos"**. API base `https://gensapi.ryancfx.click/api/v1`.

## Qué es

Una vista de **solo lectura** tipo "estado de cuenta" / kardex bancario: todos los movimientos que
afectan una cuenta bancaria específica, en orden cronológico, con **saldo corrido** (running
balance) calculado fila por fila. Es la vista de reconciliación — el usuario la usa para comparar
contra el estado de cuenta físico del banco.

**Importante**: esta vista NO se alimenta de los documentos de Emisiones/Depósitos/Transferencias
directamente — se alimenta de `GL Entry` (el libro mayor de ERPNext) filtrado por la cuenta
contable de la cuenta bancaria. Esto significa que **incluye absolutamente todo** lo que afecta esa
cuenta bancaria, no solo lo creado desde Tesorería: cobros y pagos de facturas hechos desde otros
módulos, ventas POS, asientos manuales, etc. Es la vista más completa/confiable de "qué pasó con
esta cuenta", más que cualquier listado de un submódulo individual.

## Endpoints

```
GET /tesoreria/movimientos?cuentaBancaria=<id>&fromDate=&toDate=&limit=&offset=
GET /tesoreria/movimientos/resumen?cuentaBancaria=<id>&fromDate=&toDate=
```

`cuentaBancaria` es **requerido** en ambos endpoints (no hay una vista "todas las cuentas
mezcladas" — el usuario siempre elige una cuenta primero).

### `GET /tesoreria/movimientos`

Respuesta:
```ts
{
  success: true,
  data: Array<{
    fecha: string;
    voucherType: string;       // ej. "Payment Entry", "Journal Entry", "Sales Invoice"...
    voucherNo: string;         // id del documento origen
    debito: number;
    credito: number;
    saldoCorrido: number;      // saldo acumulado DESPUÉS de esta fila
    party?: string;
    partyType?: string;
    remarks?: string;
    branch?: string;
    department?: string;
  }>,
  meta: {
    total, limit, offset, hasMore,
    cuentaBancaria: string,
    saldoInicialDelRango: number,  // saldo justo ANTES de la primera fila devuelta
  }
}
```

- Cada fila trae `voucherType` + `voucherNo` — usar esto para armar un link/navegación al
  documento origen. Si `voucherType` es "Payment Entry" o "Journal Entry" y el documento fue creado
  desde Tesorería, se puede intentar resolver la ruta interna del detalle de
  Emisión/Depósito/Transferencia correspondiente (`GET /tesoreria/emisiones/:voucherNo`, etc. — el
  backend no distingue esto en la respuesta, el frontend tendría que probar el endpoint apropiado
  o simplemente enlazar a una vista genérica "ver documento en ERPNext" si no vale la pena esa
  complejidad para v1). Si `voucherType` es "Sales Invoice"/"Purchase Invoice"/etc., enlazar a la
  vista de detalle existente de esos módulos.
- `saldoInicialDelRango` es importante para que la tabla no arranque "de la nada" — mostrar una
  fila de encabezado tipo "Saldo inicial al {fromDate}: {saldoInicialDelRango}" antes de la
  primera fila de datos, para que el saldo corrido de la primera fila visible tenga sentido visual.
- Paginación estándar (`limit`/`offset`/`total`/`hasMore`) — el saldo corrido ya viene calculado
  correctamente considerando TODA la historia de la cuenta desde antes del rango, no solo lo que
  cabe en la página actual.

### `GET /tesoreria/movimientos/resumen`

Respuesta:
```ts
{
  success: true,
  data: {
    cuentaBancaria: string;
    cuentaBancariaNombre: string;
    fromDate: string | null;
    toDate: string | null;
    saldoInicial: number;
    entradas: number;   // suma de débitos en el rango
    salidas: number;    // suma de créditos en el rango
    saldoFinal: number; // saldoInicial + entradas - salidas
  }
}
```

Usar para una tarjeta/resumen en la parte superior de la pantalla de movimientos: "Saldo inicial:
X — Entradas: Y — Salidas: Z — Saldo final: W", encima de la tabla detallada.

## UX sugerida

- Selector de cuenta bancaria (obligatorio) + rango de fechas (opcional, si se omite trae toda la
  historia) arriba de la pantalla.
- Tarjeta de resumen (`/resumen`) siempre visible mientras haya una cuenta seleccionada.
- Tabla paginada de movimientos (`/`) debajo, con columnas: fecha, tipo/documento (con link),
  débito, crédito, saldo corrido, referencia/party.
- Esta pantalla es puramente de consulta — no hay creación/edición acá, todas las acciones de
  escritura viven en los otros tres submódulos (Emisiones, Depósitos, Transferencias).
