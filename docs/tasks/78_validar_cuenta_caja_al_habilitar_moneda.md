# Prompt para el agente de frontend — Validar/crear cuenta de Caja o Banco al habilitar USD o EUR

Copia y pega este prompt completo al agente de frontend.

---

## Contexto — el problema real que esto previene

Se reprodujo un bug en producción: un tenant habilitó USD, pudo facturar en dólares sin problema,
pero **al intentar cobrar esa factura en caja** (`POST /caja/facturas/:id/completar-cobro`) recibió
un error críptico de ERPNext:

```
Sales Invoice ACC-SINV-2026-00048: Customer is required against Receivable account
112-01-USD - CUENTAS POR COBRAR CLIENTES USD - FAR
```

**Causa raíz**: al habilitar USD (`PATCH /monedas/USD`), el backend crea automáticamente las
cuentas contables de **Cuentas por Cobrar/Pagar en USD** (`112-01-USD`, `21-01-001-USD` en este
ejemplo) — eso siempre funciona bien. Pero **nadie creó una cuenta de Caja o Banco en USD**, así
que cuando alguien configuró el método de pago "Dólar" en Configuración → Métodos de Pago, la
única cuenta en USD que aparecía en el selector era la de Cuentas por Cobrar — y la seleccionó ahí
por error, porque no había otra opción. ERPNext acepta esa configuración sin quejarse en el momento
(nada la valida al guardar el método de pago) — el error solo aparece **mucho después**, cuando un
cajero intenta cobrar con ese método de pago mal configurado, con un mensaje que no menciona en
absoluto "métodos de pago" ni da ninguna pista de cuál es la causa real.

**Tu tarea**: agregar una validación proactiva en el flujo de habilitar una moneda extranjera
(USD/EUR), para que este problema se detecte y se pueda resolver en el momento — antes de que
alguien configure mal un método de pago sin darse cuenta, y mucho antes de que un cajero se
encuentre con el error en pleno cobro.

Antes de implementar, abre `openapi.json` y localiza los endpoints listados abajo (tags
**"Monedas"**, **"Cuentas"** y **"Configuración"**) para confirmar los tipos exactos de cada campo
— lo que sigue es la explicación funcional completa del flujo, los endpoints y cómo encadenarlos.

---

## 1. El flujo a implementar, paso a paso

### Paso 1 — Habilitar la moneda (esto ya existe, no cambia)

```
PATCH /monedas/:code
Body: { "habilitada": true }
```

`:code` es `USD` o `EUR` (`DOP` es la moneda base y nunca se deshabilita — ni siquiera muestres el
toggle para ella si tu UI ya no lo hace). Esta llamada, del lado del backend, crea de forma
idempotente las cuentas de Cuentas por Cobrar/Pagar en esa moneda si no existían — esto no cambia,
sigue funcionando exactamente igual. La respuesta no incluye información de cuentas de Caja/Banco
— para eso viene el paso 2.

### Paso 2 — Justo después de habilitar con éxito, verificar si existe una cuenta de Caja/Banco en esa moneda

```
GET /cuentas
```

Sin parámetros de filtro por moneda (ese filtro no existe en el backend) — trae **todas** las
cuentas del tenant (el endpoint no pagina si no le mandas `limit`). Cada cuenta en la respuesta
trae, entre otros campos, `accountType` (string, valores nativos de ERPNext — los que importan acá
son `"Cash"` y `"Bank"`) y `currency` (`"DOP"` | `"USD"` | `"EUR"`).

Del lado del cliente, filtra el resultado así:

```ts
const cuentasCajaOBanco = cuentas.filter(
  (c) => (c.accountType === 'Cash' || c.accountType === 'Bank') && c.currency === code
);
```

- Si `cuentasCajaOBanco.length > 0`: ya existe al menos una — **no hace falta hacer nada más**, no
  muestres ningún modal. La moneda quedó habilitada y lista para operar en caja sin el riesgo de
  este bug.
- Si `cuentasCajaOBanco.length === 0`: **no existe ninguna** — acá es donde entra el modal opcional
  descrito abajo.

### Paso 3 — Modal opcional: crear la cuenta ahí mismo

Si no se encontró ninguna cuenta de Caja/Banco en la moneda recién habilitada, muestra un modal
(no bloqueante — el usuario puede cerrarlo sin crear nada, la moneda igual queda habilitada) con
un mensaje similar a:

> **No tienes una cuenta de Caja o Banco en {moneda}**
> Vas a poder facturar en {moneda}, pero para poder **cobrar** esas facturas en caja necesitas una
> cuenta de Caja o Banco en esta moneda — sin ella, alguien podría configurar por error un método
> de pago apuntando a la cuenta de Cuentas por Cobrar, lo que rompe el cobro más adelante con un
> error confuso.
> ¿Quieres crear una cuenta de Caja o Banco en {moneda} ahora?
> [Crear cuenta] [Más tarde]

Si el usuario elige "Crear cuenta", el modal pide:

| Campo del formulario | Tipo | Notas |
|---|---|---|
| Nombre de la cuenta | texto libre | ej. "Caja USD", "Banco Popular USD" — sugiere un default razonable como `"Caja ${moneda}"` pero déjalo editable |
| Tipo | selector: Caja / Banco | mapea a `accountType: "Cash"` o `"Bank"` |
| Cuenta padre (grupo) | selector | ver nota abajo — obligatorio para que la cuenta quede bien ubicada en el plan de cuentas |
| Moneda | fija, no editable | ya es `code` (USD o EUR) — no tiene sentido que el usuario la cambie acá, este modal existe justo para esa moneda |

**Cuenta padre**: pídele al backend los grupos de cuentas de Activo disponibles para que el usuario
elija dónde colgar la cuenta nueva:

```
GET /cuentas?rootType=Asset&isGroup=true
```

Muestra esa lista en el selector (usa `name` como value, `accountName` — o el campo equivalente
que confirmes en `openapi.json` — como label). Si tu proyecto ya tiene en algún lado un selector de
"cuenta padre" reutilizable (por ejemplo en una pantalla de Plan de Cuentas / Tesorería ya
existente), reutilízalo en vez de construir uno nuevo — el request es el mismo.

Al confirmar el modal:

```
POST /cuentas
Body: {
  "accountName": "<lo que escribió el usuario>",
  "parentAccount": "<la cuenta padre elegida>",
  "accountType": "Cash" | "Bank",
  "currency": "<code>"
}
```

Si la creación es exitosa, cierra el modal con un mensaje de confirmación simple ("Cuenta creada")
— **no hace falta** encadenar automáticamente la vinculación a un método de pago (ver Paso 4, es
un paso aparte y explícitamente opcional/manual).

### Paso 4 — (Opcional, mencionar al usuario pero no es obligatorio automatizarlo) Vincular la cuenta nueva a un método de pago

Este paso NO forma parte de lo pedido como obligatorio, pero vale la pena que el modal del Paso 3,
tras crear la cuenta exitosamente, muestre un mensaje/enlace hacia la pantalla de Métodos de Pago
(Configuración → Métodos de Pago) para que el usuario complete la configuración de una vez si
quiere — por ejemplo:

> Cuenta creada. Recuerda vincularla a un método de pago (ej. "Efectivo USD") en
> Configuración → Métodos de Pago para poder usarla al cobrar.

Si quieres ir más allá y automatizar también este paso dentro del mismo modal (opcional, no
bloqueante para el checklist de abajo), el flujo sería:

```
POST /config/metodos-pago
Body: { "name": "<nombre del método>", "type": "Cash" | "Bank" }
```
seguido de
```
PUT /config/metodos-pago/:id
Body: { "account": "<el name exacto de la cuenta creada en el Paso 3>" }
```

`:id` es el `name` que devolvió el `POST` anterior. `type` en `CreateMetodoPagoDto` acepta
`"Cash" | "Bank" | "General"` — usa el mismo tipo que eligió el usuario para la cuenta.

---

## 2. Detalle importante — por qué la verificación es "después de habilitar", no "antes"

No tiene sentido bloquear el `PATCH /monedas/:code` esperando a que exista una cuenta de
Caja/Banco — habilitar la moneda y tener cuentas de Caja/Banco son necesidades independientes (un
tenant podría querer habilitar USD solo para reportes o cotizaciones, sin cobrar nunca en efectivo
en esa moneda). Por eso el chequeo es un paso **posterior e informativo**, nunca un bloqueo del
`PATCH`. Si el `PATCH /monedas/:code` falla por cualquier otro motivo (permisos, moneda no
soportada, etc.), no llegues siquiera al Paso 2 — solo verifica la cuenta de Caja/Banco tras una
respuesta exitosa de habilitación.

## 3. Qué pasa si el usuario deshabilita una moneda

No hace falta ninguna validación ni modal al deshabilitar (`PATCH /monedas/:code` con
`habilitada: false`) — este prompt solo cubre el camino de habilitar. Las cuentas de Caja/Banco
que ya existan en esa moneda se quedan tal cual, sin que haga falta tocarlas.

---

## Checklist de verificación

1. Habilitar USD (o EUR) en un tenant que **ya tiene** una cuenta Cash/Bank en esa moneda: el modal
   **no aparece**.
2. Habilitar USD (o EUR) en un tenant que **no tiene** ninguna cuenta Cash/Bank en esa moneda: el
   modal aparece con el mensaje explicativo.
3. Cerrar el modal sin crear nada ("Más tarde"): la moneda queda habilitada igual, sin ningún error
   ni bloqueo — confirmar que `GET /monedas` sigue mostrando `habilitada: true` para esa moneda.
4. Completar el modal y crear la cuenta: `POST /cuentas` se envía con `currency` igual a la moneda
   que se acaba de habilitar (no a DOP), y la cuenta creada aparece luego en `GET /cuentas`
   filtrando por esa moneda.
5. El selector de "cuenta padre" del modal se puebla con `GET /cuentas?rootType=Asset&isGroup=true`
   y no permite enviar el formulario sin elegir una.
6. Repetir el chequeo del Paso 2 (deshabilitar y volver a habilitar, o simplemente re-visitar la
   pantalla) tras crear la cuenta ya no debe mostrar el modal — confirma que el filtro
   `accountType in ['Cash','Bank'] && currency === code` encuentra la cuenta recién creada.
7. Contrastado contra `openapi.json` actualizado para los tipos exactos de `GET /cuentas`,
   `POST /cuentas`, `PATCH /monedas/:code`, `POST /config/metodos-pago` y
   `PUT /config/metodos-pago/:id`.
