# Prompt para agente de frontend — Método de Pago Default por Moneda (DOP / USD / EUR)

> **Para quien recibe este documento.** Esto **no** es un módulo nuevo — es una extensión chica
> pero transversal de algo que el frontend **ya tiene construido**: la pantalla de Configuración
> de Facturación (donde ya existe el selector "Método de Pago de Caja" para DOP) y los flujos de
> cobro de factura (someter y pagar, cobrar desde Cuentas por Cobrar, completar cobro en Caja/POS).
> Describe 1 cambio de configuración y 1 cambio de comportamiento (con su correspondiente ajuste de
> UI) en pantallas que ya existen. Todo lo descrito acá ya está **implementado, probado (tests
> unitarios en verde) y compila sin errores** del lado del backend — no hay nada pendiente de
> negociar con el equipo de backend salvo lo que se marque explícitamente.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable en
> Scalar en `https://gensapi.ryancfx.click/api/docs`). **Regenerá tu cliente/tipos desde ese
> archivo antes de empezar** — ahí está el shape exacto y tipado de cada campo nuevo
> (`modoPagoCajaUsd`/`modoPagoCajaEur` en `PUT /config/facturacion`, y el campo `modeOfPayment`
> pasando de obligatorio a opcional en las líneas de pago de `POST /invoices/:id/submit` y
> `POST /caja/facturas/:id/{cobrar,completar-cobro}`). Este documento no reemplaza el spec: explica
> el **flujo de negocio**, qué pantalla toca qué campo, en qué orden pasan las cosas, qué mostrar en
> cada estado y cómo manejar cada error. Si este documento y el `openapi.json` llegaran a diferir en
> el nombre exacto de un campo, **gana el `openapi.json`** — pero no debería pasar: todo lo escrito
> acá se extrajo directamente del código fuente ya mergeado, no de un diseño preliminar.
>
> Documento relacionado que asumimos ya tenés implementado, sin cambios en este documento:
> `PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos, `GET /me/permissions` → `data.acciones`).
> Este cambio **no agrega ninguna acción de permiso nueva** — reutiliza exactamente las que ya
> gatean la pantalla de Configuración de Facturación y los flujos de cobro (ver §5).

---

## 0. Resumen ejecutivo — qué cambia y qué NO cambia

| | Antes de este cambio | Después de este cambio |
|---|---|---|
| ¿Se puede configurar un método de pago default para cobrar/facturar sin que el usuario lo elija explícitamente? | Sí, pero **solo para DOP** (`modoPagoCaja`) | Sí, para **DOP, USD y EUR** de forma independiente (`modoPagoCaja`, `modoPagoCajaUsd`, `modoPagoCajaEur`) |
| ¿Puede un tenant sin USD/EUR habilitados configurar un default para esas monedas? | N/A (el campo no existía) | Técnicamente el backend lo acepta (no valida moneda habilitada al guardar), pero el frontend **no debe mostrar el campo** si esa moneda no está habilitada (ver §1) — es responsabilidad de la UI, no del backend |
| Al someter y pagar una factura (`POST /invoices/:id/submit`), o cobrarla desde Caja/Cuentas por Cobrar, ¿es obligatorio mandar `modeOfPayment` en cada línea de pago? | **Sí, siempre**, sin importar la moneda | **No** — es opcional. Si se omite, el backend usa el default configurado para la moneda de esa factura. Si no hay default configurado para esa moneda, el backend responde `400` pidiendo que se especifique explícitamente |
| ¿Esto afecta la apertura/cierre de turno de Caja (POS Opening/Closing Entry)? | El fondo de apertura siempre usa `modoPagoCaja` (DOP, efectivo físico) | **Sin cambios.** El fondo de apertura sigue usando únicamente `modoPagoCaja` — es efectivo físico en la moneda base del negocio, no tiene sentido en USD/EUR. Ver §6 |
| ¿Esto afecta Cobros (Cuentas por Cobrar sueltos), Pagos a proveedores, o reembolsos de Nota de Crédito? | Esos flujos ya exigían `modeOfPayment` explícito | **Sin cambios.** Ninguno de esos usa este mecanismo de default — siguen exigiendo que el usuario elija el método de pago siempre. Ver §6 |

**Lo que NO cambia:**
- El resto del ciclo de vida de una factura (`POST /invoices`, `.../cancel`, `.../amend`, etc.) es
  exactamente igual.
- El endpoint de configuración sigue siendo el mismo (`GET`/`PUT /config/facturacion`) — no hay
  pantalla ni doctype nuevo, solo dos campos más en un formulario que ya existe.
- Los tenants que **no** tienen USD ni EUR habilitados no ven ningún cambio de UI en absoluto — ni
  el campo de configuración nuevo, ni ningún cambio de comportamiento al cobrar (siguen mandando
  `modeOfPayment` en DOP como siempre, o ahora opcionalmente omitiéndolo si configuraron el default
  de DOP, que ya existía).
- Los tenants que **ya** tenían `modoPagoCaja` (DOP) configurado no ven ningún cambio de
  comportamiento salvo uno: **antes, `modeOfPayment` era obligatorio en cada línea de pago incluso
  teniendo `modoPagoCaja` configurado** (ese default solo se usaba para el fondo de caja y el
  cálculo de arqueo, nunca como fallback al cobrar). **Ahora, si tu formulario omite el campo, el
  backend lo completa solo.** Ver §3 para el detalle exacto de este comportamiento nuevo.

---

## 1. Gating: cuándo mostrar cada campo de configuración

Pedí `GET /api/v1/config/facturacion` (mismo endpoint que ya usás para leer el resto de la
configuración de facturación — roles de cancelación, POS, impresión, etc.) y mirá estos campos:

```jsonc
// GET /api/v1/config/facturacion
{
  "success": true,
  "data": {
    // ...el resto de los campos que ya conocés...
    "modoPagoCaja": "Efectivo",           // ya existía — default para DOP
    "modoPagoCajaUsd": null,              // NUEVO — default para USD, null = no configurado
    "modoPagoCajaEur": null,              // NUEVO — default para EUR, null = no configurado
    "monedaBase": "DOP",                  // ya existía
    "monedasHabilitadas": ["DOP", "USD"], // ya existía — lista de monedas ISO habilitadas para el tenant
    "multimonedaHabilitada": true         // ya existía — true si monedasHabilitadas tiene algo distinto de monedaBase
  }
}
```

Regla exacta de visibilidad en la pantalla de Configuración (§2):

- **`modoPagoCaja` (DOP)**: se muestra **siempre** — sin condición, igual que hoy. `monedaBase` es
  casi siempre `"DOP"` en este producto, pero aunque no lo fuera, este campo sigue siendo el
  fallback general (ver §3.2) y siempre debe estar visible.
- **`modoPagoCajaUsd`**: se muestra **solo si** `monedasHabilitadas.includes("USD")`.
- **`modoPagoCajaEur`**: se muestra **solo si** `monedasHabilitadas.includes("EUR")`.
- Si `monedasHabilitadas` no incluye ni `"USD"` ni `"EUR"` (tenant sin multimoneda), la pantalla se
  ve **exactamente igual que antes de este cambio** — un solo selector de método de pago default.

**No hace falta pedir un endpoint nuevo para saber qué monedas están habilitadas** — `monedasHabilitadas`
ya viaja en la misma respuesta que usás para leer/mostrar el resto de esta pantalla, así que un solo
`GET /config/facturacion` te alcanza para decidir el gating de los 3 campos.

---

## 2. Pantalla de Configuración — sección "Módulo POS (turnos de caja)"

Ya tenés (asumimos) el selector "Método de Pago de Caja" dentro de esta sección, que llama a
`PUT /config/facturacion` con `{ "modoPagoCaja": "Efectivo" }`. Agregá, **en el mismo bloque, justo
al lado o debajo del selector de DOP**, hasta dos selectores más, cada uno gateado según §1:

### 2.1 Los campos nuevos — texto exacto sugerido

| Campo | Tipo | Moneda | Mostrar si | Texto sugerido |
|---|---|---|---|---|
| `modoPagoCaja` | Selector de Mode of Payment (ya existente) | DOP | Siempre | **"Método de Pago Default (DOP)"** — "Se usa para comparar el efectivo físico en caja al cerrar turno, y como método de pago por defecto al cobrar una factura en pesos si no se especifica ninguno." |
| `modoPagoCajaUsd` | Selector de Mode of Payment (nuevo) | USD | `monedasHabilitadas.includes("USD")` | **"Método de Pago Default (USD)"** — "Método de pago que se usa por defecto al cobrar una factura en dólares si no se especifica ninguno. Opcional — si no se configura, hay que elegir el método de pago manualmente en cada cobro en USD." |
| `modoPagoCajaEur` | Selector de Mode of Payment (nuevo) | EUR | `monedasHabilitadas.includes("EUR")` | **"Método de Pago Default (EUR)"** — mismo texto que USD, adaptado a euros. |

Los tres campos son **independientes y opcionales** — un tenant puede tener default para DOP y no
para USD, o viceversa, sin ninguna restricción cruzada.

### 2.2 De dónde sacar las opciones del selector

Igual que el selector de DOP que ya tenés: `GET /config/metodos-pago` (endpoint ya existente, sin
cambios) devuelve la lista de métodos de pago (`Mode of Payment`) disponibles para poblar el
dropdown. **No hay un endpoint separado ni filtrado por moneda** — la lista de opciones es la misma
para los 3 selectores; es responsabilidad de quien configura elegir un método de pago que de verdad
opere en la moneda correspondiente (si se elige mal, el error aparece más adelante, al intentar
cobrar — ver §4.2, no al guardar la configuración).

### 2.3 Guardar — `PUT /config/facturacion`

Mismo endpoint y mismo patrón que ya usás para el resto de esta pantalla — mandá **solo los campos
que el usuario tocó**, no hace falta mandar los tres siempre:

```jsonc
// Ejemplo: el usuario solo configuró el default de USD
PUT /api/v1/config/facturacion
{
  "modoPagoCajaUsd": "Transferencia USD"
}
```

```jsonc
// Response
{
  "success": true,
  "data": {
    // ...el objeto completo de configuración actualizado, incluyendo monedaBase,
    // monedasHabilitadas, multimonedaHabilitada y los 3 campos de modo de pago...
  }
}
```

Para **quitar** un default ya configurado (volver a "sin default"), mandá el campo como cadena
vacía `""` — mismo patrón que otros campos opcionales de tipo Link en este mismo endpoint (ver
`chequePrintTemplateDefault` si ya lo implementaste, mismo comportamiento). El backend guarda lo que
se le mande tal cual para estos 3 campos — no valida que el método de pago elegido pertenezca a esa
moneda al momento de guardar (esa validación ocurre después, al cobrar de verdad — ver §4.2).

**Permiso:** `config.facturacion.editar` — el mismo que ya gatea el botón "Guardar" de toda esta
pantalla. No hay ningún permiso nuevo que agregar.

---

## 3. Comportamiento nuevo al cobrar — `modeOfPayment` pasa a ser opcional

Esto es el cambio más importante de este documento. Afecta a **3 endpoints**, todos ellos con un
array de líneas de pago (`payments`) donde cada línea tenía `modeOfPayment` como campo obligatorio:

| Endpoint | Pantalla típica | DTO de las líneas de pago |
|---|---|---|
| `POST /invoices/:id/submit` | Someter y pagar una factura en una sola llamada (venta al contado, con o sin módulo POS) | `payments[]` dentro del body |
| `POST /caja/facturas/:id/cobrar` | Cobrar una factura ya sometida con saldo pendiente (Cuentas por Cobrar / Caja) | `payments[]` dentro del body |
| `POST /caja/facturas/:id/completar-cobro` | Completar el cobro de una factura en la cola de Caja (módulo POS, cliente sin crédito fiscal) | `payments[]` dentro del body |

### 3.1 El campo `modeOfPayment` — antes vs. ahora

```jsonc
// Shape de cada línea de pago (payments[]), sin cambios salvo modeOfPayment:
{
  "modeOfPayment": "Efectivo",  // ANTES: obligatorio, string no vacío
                                 // AHORA: OPCIONAL — se puede omitir el campo por completo
  "amount": 500.00,
  "cardNumber": "...",          // opcional, sin cambios
  "authorizationCode": "...",   // opcional, sin cambios
  "bank": "...",                // opcional, sin cambios
  "checkNumber": "...",         // opcional, sin cambios
  "bankAccount": "..."          // opcional, sin cambios
}
```

**Tu formulario de cobro puede seguir mandando `modeOfPayment` siempre, explícitamente, si así lo
preferís — nada te obliga a cambiar el comportamiento actual.** Este cambio es aditivo: agrega la
POSIBILIDAD de omitir el campo, no la exige. Dicho esto, la sección 3.3 explica el caso de uso real
para el que tiene sentido aprovechar esto.

### 3.2 Qué hace el backend cuando `modeOfPayment` viene vacío/omitido

Por cada línea de `payments[]` sin `modeOfPayment` (o con el valor `""`/`null`/`undefined`), el
backend:

1. Determina la **moneda del documento** (la `currency` de la Factura que se está sometiendo o
   cobrando — no la moneda de la línea, las facturas de este sistema son de una sola moneda).
2. Resuelve el default configurado en `Facturacion Config` para esa moneda:
   - `currency === "USD"` → usa `modoPagoCajaUsd`
   - `currency === "EUR"` → usa `modoPagoCajaEur`
   - cualquier otro valor (en la práctica, `"DOP"`) → usa `modoPagoCaja`
3. Si encontró un default configurado, lo usa como si el frontend lo hubiera mandado — el resto del
   procesamiento (crear el `Payment Entry`, validar la cuenta contable del método de pago, sumar
   contra el saldo pendiente, etc.) es idéntico a como si hubiera venido explícito.
4. Si **no** hay ningún default configurado para esa moneda, responde `400` (ver §4.1) — la factura
   NO se cobra, nada se somete.

Esto corre **por línea**, no por el array completo: en una factura con múltiples métodos de pago
(ej. parte en efectivo, parte con tarjeta), podés mandar una línea con `modeOfPayment` explícito y
otra sin él — cada una se resuelve de forma independiente.

### 3.3 Cuándo tiene sentido aprovechar esto en la UI

Dos formas válidas de implementarlo — elegí la que mejor encaje con tu formulario actual:

**Opción A — no cambiar nada (más simple, mínimo esfuerzo):** seguí mandando siempre
`modeOfPayment` explícito, tal como hoy. El comportamiento nuevo del backend simplemente nunca se
activa. Válido si no querés tocar el formulario de cobro en absoluto.

**Opción B — aprovechar el default como conveniencia de UX (recomendado):** en el formulario donde
se elige el método de pago para cobrar una factura, **pre-seleccioná automáticamente** el default
correspondiente a la moneda de esa factura (leyendo `modoPagoCaja`/`modoPagoCajaUsd`/`modoPagoCajaEur`
de `GET /config/facturacion` según la `currency` de la factura que se está cobrando), dejando que el
usuario lo cambie si quiere. Al enviar, mandá igual el valor ya resuelto en el campo
`modeOfPayment` — **no dependas de que el backend lo complete**, porque así el usuario ve en pantalla
qué método de pago se está usando antes de confirmar el cobro, en vez de descubrirlo después en la
respuesta.

> El mecanismo de "omitir el campo y dejar que el backend lo resuelva" (§3.2) existe principalmente
> para no romper integraciones o flujos donde el cliente HTTP no arma el campo si no tiene un valor
> — por ejemplo, un formulario simplificado de un solo clic ("Cobrar con el método default") que no
> necesita mostrar ningún selector en absoluto. Si tu pantalla ya tiene un selector de método de
> pago, la Opción B (pre-seleccionar pero igual mandar el valor) da mejor UX que confiar en el
> fallback silencioso del backend.

### 3.4 La respuesta no cambia

Ninguno de los 3 endpoints agrega un campo nuevo a la respuesta para indicar "qué método de pago se
usó por default". Si tu pantalla necesita confirmarlo después de cobrar, consultá
`GET /invoices/:id` (o el detalle de la factura correspondiente) y mirá el/los `Payment Entry`
asociados — mismo mecanismo que ya usás hoy para mostrar el historial de pagos de una factura, sin
cambios.

---

## 4. Errores — tabla resumen para manejar en el cliente HTTP

### 4.1 Falta el default y no se mandó `modeOfPayment`

| HTTP | Endpoint | Mensaje exacto | Cuándo |
|---|---|---|---|
| 400 | `POST /invoices/:id/submit` | `Debe especificar "modeOfPayment" en cada línea de pago — el tenant no tiene un método de pago default configurado para USD (Facturacion Config.modoPagoCajaUsd, PUT /config/facturacion).` | Se sometió y pagó una factura en USD con una línea sin `modeOfPayment`, y el tenant no configuró `modoPagoCajaUsd` |
| 400 | `POST /caja/facturas/:id/cobrar` | Mismo mensaje, adaptado a la moneda real de la factura (`DOP`/`USD`/`EUR`) y al campo correspondiente (`modoPagoCaja`/`modoPagoCajaUsd`/`modoPagoCajaEur`) | Se cobró una factura sin `modeOfPayment` en alguna línea y sin default configurado para esa moneda |
| 400 | `POST /caja/facturas/:id/completar-cobro` | Igual que el anterior | Se completó un cobro desde la cola de Caja sin `modeOfPayment` y sin default configurado |

El mensaje siempre nombra la moneda exacta de la factura y el nombre exacto del campo de
configuración a llenar (`modoPagoCaja`, `modoPagoCajaUsd` o `modoPagoCajaEur`) — podés mostrarlo tal
cual, o mapearlo a un texto más amigable del tipo:

> *"No se pudo cobrar: esta factura está en {moneda} y no hay un método de pago seleccionado ni un
> default configurado para esa moneda. Seleccioná un método de pago, o configurá uno por defecto en
> Configuración > Facturación."*

**Cómo evitar que el usuario vea este error en la práctica:** si implementaste la Opción B de §3.3
(pre-seleccionar el default), este error solo puede aparecer si el tenant NO tiene default
configurado para esa moneda **y** tu formulario de todas formas dejó el selector vacío/sin
seleccionar. La forma más robusta de evitarlo del todo: en el formulario de cobro, si al resolver el
default para la moneda de la factura no hay ninguno configurado, **hacé el selector de método de
pago obligatorio en el formulario** (validación de cliente) en vez de dejar que el usuario lo deje
vacío y descubra el error recién al confirmar.

### 4.2 El método de pago configurado como default no opera en esa moneda

Esto **no es un error nuevo ni un mensaje nuevo** — es la misma validación de moneda que ya existe
hoy quien manda un `modeOfPayment` explícito equivocado (ej. un método de pago cuya cuenta contable
es en DOP, usado para cobrar una factura en USD). Si un admin configura, por ejemplo,
`modoPagoCajaUsd` apuntando por error a un método de pago que en realidad opera en DOP, el error
aparece **al cobrar** (no al guardar la configuración, ver §2.3), con el mismo mensaje que ya
manejás hoy para esa validación (algo del estilo *"El método de pago 'X' opera en DOP, pero la
factura es en USD"*). No hace falta agregar manejo nuevo para esto — el cliente HTTP que ya tenés
para ese error existente lo sigue cubriendo.

---

## 5. Permisos

**No hay ninguna acción de permiso nueva que agregar.** Reutilizá exactamente las que ya usás:

| Acción | Controla |
|---|---|
| `config.facturacion.ver` | Ya gatea la lectura de `GET /config/facturacion` — suficiente para ver los 2 campos nuevos junto con el resto de la configuración |
| `config.facturacion.editar` | Ya gatea el botón "Guardar" de la pantalla de Configuración de Facturación — suficiente para editar `modoPagoCajaUsd`/`modoPagoCajaEur` junto con el resto de los campos de ese formulario |
| (los que ya gatean cada pantalla de cobro) | Sin cambios — el comportamiento de `modeOfPayment` opcional no depende de ningún permiso adicional, corre igual para cualquier usuario que ya tenga permiso para someter/cobrar una factura |

---

## 6. Qué NO hacer / decisiones ya tomadas — no toques estas pantallas

- **No toques la apertura de turno de Caja (`POST /pos/turnos`, `OpenPosSessionDto`).** El fondo de
  apertura sigue usando únicamente `modoPagoCaja` (DOP) — abrir un turno sigue exigiendo que
  `modoPagoCaja` esté configurado, sin importar si el tenant tiene USD/EUR habilitados o no, y sin
  ningún campo nuevo que mandar al abrir turno. El mensaje de error si falta
  (`"No hay un método de pago de Caja configurado (Facturacion Config.modoPagoCaja)..."`) tampoco
  cambió.
- **No toques `GET /pos/turnos/actual` ni el cierre de turno (`POST /pos/turnos/:id/cerrar`).** El
  cálculo de `montoCaja` y la conciliación de efectivo al cerrar turno siguen basados
  exclusivamente en `modoPagoCaja` — no hay equivalente en USD/EUR para el arqueo físico de caja.
- **No toques el módulo de Cobros sueltos (`/cobros`, Cuentas por Cobrar fuera del flujo de una
  factura puntual).** Ese módulo sigue exigiendo `modeOfPayment` explícito siempre — no usa
  `PaymentLineDto` ni este mecanismo de default en absoluto.
- **No toques el módulo de Pagos a proveedores (`/pagos`).** Mismo caso — DTO propio, sin cambios,
  `modeOfPayment` sigue siendo obligatorio ahí.
- **No toques el reembolso de Notas de Crédito (`/credit-notes` o equivalente, el endpoint de
  reembolso en efectivo/otro método).** Mismo caso — DTO propio, sin cambios.
- **No agregues validación de "esta moneda no está habilitada" en el cliente al guardar la
  configuración (§2.3).** El backend no la hace tampoco — es intencional, para no bloquear a un
  admin que configura el default de una moneda que va a habilitar poco después. Lo único que SÍ es
  responsabilidad del frontend es no **mostrar** el campo si la moneda no está habilitada (§1) —
  ocultar, no validar.
- **No conviertas esto en una regla "obligatorio elegir método de pago si no hay default".** El
  backend no lo exige a nivel de contrato — un formulario que siempre manda `modeOfPayment`
  explícito (Opción A de §3.3) sigue siendo 100% válido y no requiere ningún cambio funcional, solo
  se beneficiaría de mostrar los 2 selectores nuevos en Configuración si aplica.

---

## 7. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado.
- [ ] `GET /config/facturacion` — leídos y cacheados `modoPagoCajaUsd`, `modoPagoCajaEur` junto con
      el resto de la configuración que ya leías (`modoPagoCaja`, `monedasHabilitadas`, etc.).
- [ ] Sección "Módulo POS (turnos de caja)" de Configuración: hasta 2 selectores nuevos (§2.1),
      gateados por `monedasHabilitadas.includes("USD"|"EUR")`, poblados desde
      `GET /config/metodos-pago` (mismo endpoint que ya usás para el selector de DOP), que guardan
      con `PUT /config/facturacion` mandando solo los campos tocados.
- [ ] Verificado que un tenant sin USD ni EUR habilitados ve la pantalla de Configuración
      exactamente igual que antes de este cambio (un solo selector de método de pago default).
- [ ] Decidida la Opción A o B de §3.3 para los 3 formularios de cobro (`submit` con pago,
      `cobrar`, `completar-cobro`) — si se eligió la Opción B, implementada la pre-selección del
      default según la moneda de la factura que se está cobrando.
- [ ] Si se eligió la Opción B: agregada la validación de cliente que obliga a elegir método de
      pago cuando no hay default configurado para la moneda de esa factura, para evitar que el
      usuario llegue al error 400 de §4.1 sin haberlo visto venir.
- [ ] Manejo del mensaje de error de §4.1 (falta `modeOfPayment` y no hay default configurado)
      mapeado a un texto legible en los 3 formularios de cobro.
- [ ] Confirmado que NO se tocó ningún campo/comportamiento de: apertura/cierre de turno de Caja,
      módulo de Cobros sueltos, módulo de Pagos a proveedores, reembolso de Notas de Crédito (§6).
