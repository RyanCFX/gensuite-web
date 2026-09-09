# Vertical Farmacia ARS — guía de implementación para el frontend

> **Para quien recibe este documento:** describe todo lo que hay que construir en el frontend
> para el vertical "Farmacia con cobertura de ARS" — un modelo de negocio nuevo, que convive con
> el modelo general (comercio) que el frontend ya implementa. El backend (BFF + app Frappe
> `farmacia_ars`) ya está completo, probado contra un bench real de ERPNext v16 y desplegable.
> Acá no hay nada que negociar con backend salvo lo que se marca explícitamente como *pendiente*
> o *fuera de alcance*.
>
> En el repo del frontend hay un `openapi.json` con la documentación completa y actualizada de
> **todos** los endpoints del BFF (schemas exactos de request/response, incluidos los de este
> documento). Este documento **no lo reemplaza** — úsalo junto con él. Acá está el flujo de
> negocio, el orden en que hay que llamar las cosas, los estados, las reglas que la UI debe
> anticipar y los mensajes de error exactos que el usuario va a ver. Ahí está el tipo exacto de
> cada campo. Busca cada ruta mencionada acá en `openapi.json` por su `operationId` o su path
> antes de tipar el request/response — no asumas un shape sin confirmarlo ahí.
>
> Referencia de diseño del backend (por si hace falta entender el *porqué* de una regla):
> `docs/plans/PLAN_VERTICAL_FARMACIA_ARS.md`, en este mismo repo del BFF.

---

## 1. Qué es este vertical, en una frase

Una farmacia que vende medicamentos con cobertura de una ARS (Administradora de Riesgos de
Salud) necesita: (1) registrar cuánto cubre la ARS de una receta antes de despachar, (2)
despachar y cobrarle al paciente solo su parte, y (3) una vez al mes (o con la periodicidad que
se acuerde), consolidar todo lo que la ARS le debe en una sola factura y enviársela. El BFF
general (Clientes, Catálogo, Facturación, Inventario, Caja, e-CF...) sigue funcionando exactamente
igual — este vertical **agrega** tres pantallas nuevas y una pequeña cola de cobro, no reemplaza
nada.

Nombre del flujo, de punta a punta:

```
Preaprobación ARS  →  Despacho  →  Cobro (factura de contado al paciente)  →  Lote de Facturación
     (registro)      (entrega)      (venta real, dos formas de pago)         (factura a la ARS)
```

Cada flecha es una pantalla o una acción de este documento. Nada de esto es opcional ni se puede
saltar: cada paso valida que el anterior esté en el estado correcto (ver §4).

### 1.1 Quién hace qué (para diseñar los roles/pantallas)

| Rol de negocio | Qué hace | Pantallas que usa |
|---|---|---|
| **Dependiente** (empleada que recibe la receta) | Registra la preaprobación, la confirma, despacha | Preaprobaciones ARS, Despachos ARS |
| **Cajera Farmacia** | Cobra al paciente lo que no cubre la ARS | Cola de Cobro (Cajera) |
| **Encargada de facturación / Administración** | Arma los lotes mensuales por ARS y los cierra | Lotes de Facturación ARS |

Estos son los mismos nombres de los **Role Profile** que el backend provisiona
(`Dependiente`, `Cajera Farmacia`) — no son una convención libre del frontend, son roles reales de
ERPNext que ya determinan qué puede hacer cada usuario (ver §7).

### 1.2 Glosario rápido

Para quien no conozca el contexto fiscal dominicano — el mínimo para entender el resto del
documento sin tener que buscar cada término por separado:

| Término | Qué es |
|---|---|
| **ARS** | Administradora de Riesgos de Salud — el seguro médico dominicano. La entidad que cubre parte del costo de la receta. En el sistema es un `Customer` normal (ver §4.7). |
| **DGII** | Dirección General de Impuestos Internos — la autoridad fiscal dominicana. Quien recibe y aprueba/rechaza cada e-CF. |
| **NCF / e-NCF** | Número de Comprobante Fiscal — el identificador fiscal obligatorio de cada factura (ej. `B0200000456`). El "e-" es la versión electrónica, firmada digitalmente. |
| **e-CF** | Comprobante Fiscal Electrónico — el documento firmado y transmitido a la DGII detrás de cada NCF electrónico. Módulo aparte (`/ecf/*`), no exclusivo de farmacia. |
| **B01 / B02** | Los dos tipos de e-NCF que usa este vertical. **B01 — Crédito Fiscal**: para quien lo va a usar como gasto deducible con su propio RNC (la factura de lote a la ARS siempre es B01). **B02 — Consumo**: venta a un consumidor final sin RNC (la factura de contado al paciente, salvo que el paciente pida crédito fiscal). |
| **ITBIS** | Impuesto sobre Transferencias de Bienes Industrializados y Servicios — el IVA dominicano (18% estándar). La mayoría de los medicamentos están **exentos** por la Ley 253-12 — ver §3.4.1, es la causa más común de que `cobrar()` falle. |
| **RNC** | Registro Nacional del Contribuyente — el identificador fiscal de una empresa (equivalente a un RUC/CUIT/RFC en otros países). |
| **Cédula** | El identificador fiscal de una persona física (no una empresa). |
| **Carnet de afiliado** | El identificador que la ARS le entrega al paciente para probar su cobertura — se imprime en la factura de contado (§4.8) junto al número de autorización. |
| **Preaprobación** | La autorización que la ARS da POR ADELANTADO, antes de despachar, sobre cuánto va a cubrir de una receta puntual — no es lo mismo que tener seguro en general. |

---

## 2. Vertical gating — cómo saber si este tenant tiene el módulo

**No existe un flag "farmacia" que el frontend controle.** Es una propiedad del tenant, fijada en
el control-plane cuando se aprovisiona (`tenants.vertical` = `'general'` o `'farmacia'`), y el
backend la aplica en cada request con un guard — no es una preferencia de UI, es una barrera real:
un tenant `general` recibe **403** de cualquier ruta `/farmacia/*`, sin importar los permisos que
tenga el usuario.

### 2.1 Cómo detectarlo

`GET /api/v1/me/permissions` (la misma llamada de nivel-1 que ya usás para pintar el menú, ver
`docs/frontend/PROMPT_PERMISOS_FRONTEND.md`) ahora también devuelve:

```json
{
  "success": true,
  "data": {
    "email": "maria@farmacia.com",
    "vertical": "farmacia",
    "roles": ["Dependiente", "All", "Desk User"],
    "doctypes": { "...": "..." },
    "acciones": { "farmacia.preaprobaciones.crear": true, "...": "..." }
  }
}
```

`vertical` es `"general"` o `"farmacia"`. **Esta es la única fuente de verdad.** Pedila una vez al
iniciar sesión, igual que `acciones`, y guardala junto con el resto del contexto de sesión.

- Si `vertical !== "farmacia"`: no mostrar el módulo Farmacia en el menú, ni sus rutas. No hace
  falta nada más — no existe ninguna preaprobación, despacho ni lote en un tenant que no sea de
  este vertical (la tabla ni siquiera existe en su base de datos).
- Si `vertical === "farmacia"`: mostrar el módulo, y además dentro de él aplicar los permisos por
  acción de la forma normal (`acciones['farmacia.preaprobaciones.crear']`, etc. — ver §7).

### 2.2 Habilitación (una sola vez, por un administrador)

`POST /api/v1/config/farmacia/habilitar` — sin body. Termina de aprovisionar el vertical dentro
de ERPNext (cuenta puente contable, modo de pago "Cobertura ARS", grupo de clientes "ARS", los
Role Profile). Es **idempotente**: llamarlo dos veces no duplica nada, así que el frontend puede
ofrecer un botón "Reintentar/Reparar configuración de Farmacia" en la pantalla de Configuración sin
miedo a romper algo.

- Precondición: el tenant ya debe tener `vertical: "farmacia"` (eso lo fija un operador al crear
  el tenant, **no** este endpoint — no hay ningún flujo de "convertir un tenant general en
  farmacia" desde la UI). Si se llama sobre un tenant `general`, responde 403.
- Permiso: `config.farmacia.habilitar`.
- Ubicación sugerida: Configuración → una sección "Farmacia ARS" que solo aparece si
  `vertical === "farmacia"`.
- **No hay un `GET` para leer el estado de esta configuración.** El frontend no tiene forma de
  preguntar "¿ya se ejecutó `habilitar`?" salvo intentando una operación real (crear un lote y
  facturarlo) y manejar el error si falla (ver §6.4). Esto es una limitación conocida — si hace
  falta un indicador de "configuración completa" en la UI, es un endpoint nuevo a pedir a backend,
  no algo que el frontend pueda inferir hoy.

### 2.3 Qué mostrar solo a un tenant `farmacia` — y qué NO gatear por vertical

Esta tabla es la referencia rápida para decidir, pantalla por pantalla, si algo va detrás de
`vertical === "farmacia"` o si se muestra a **todos** los tenants. Es fácil equivocarse en el
segundo grupo: varias de estas capacidades nacieron pensando en farmacia, pero terminaron siendo
horizontales — gatearlas por vertical las escondería sin necesidad en un tenant general que sí
podría usarlas (vencimiento de lotes, categorías restringidas, regenerar un e-CF rechazado no son
problemas exclusivos de una farmacia).

**Exclusivo de farmacia — mostrar solo si `vertical === "farmacia"` (el servidor además responde
403 en cualquier otro caso, esto es UX, no la barrera real):**

| Pantalla / elemento | Por qué es exclusivo |
|---|---|
| Menú "Farmacia ARS" completo (Preaprobaciones, Despachos, Cola de Cobro, Lotes de Facturación) | Rutas bajo `/farmacia/*` — `@RequiereVertical('farmacia')` en cada controller |
| "Reportes Farmacia ARS" (§4.9) | Mismo prefijo `/farmacia/reportes/*`, mismo gate |
| Botones "Imprimir factura de contado" / "Imprimir factura consolidada" (§4.8) | Viven dentro de las pantallas de Despachos/Lotes — ya están gateados por vivir ahí, no hace falta un chequeo aparte |
| Configuración → sección "Farmacia ARS" (botón "Habilitar/Reparar", §2.2) | `POST /config/farmacia/habilitar` también exige `vertical === "farmacia"` |

**General — mostrar a TODOS los tenants, sin mirar `vertical` (el motivo de negocio fue farmacia,
pero la capacidad no depende de ese vertical y otro tenant puede necesitarla):**

| Pantalla / elemento | Dónde vive | Por qué NO es exclusivo |
|---|---|---|
| `hasExpiryDate`/`shelfLifeInDays` en el formulario de ítem, filtros de vencimiento en Inventario, FEFO (§6) | Catálogo / Inventario, ya existentes | Cualquier tenant que trackee lotes por vencimiento se beneficia — la guarda de venta de lote vencido es una política de `Facturacion Config`, no del vertical |
| `rolesPermitidosVenta` por categoría — "medicamentos controlados" (§8) | Pantalla de Categorías, ya existente | El hook de ERPNext corre para toda `Sales Invoice` de cualquier tenant; cualquier categoría regulada (no solo medicamentos) puede usarlo |
| Botón "Regenerar" sobre un e-CF `REJECTED` (§4.6) | Bandeja e-CF Emitidos, ya existente | Aplica a cualquier `Sales Invoice` rechazada por la DGII, de cualquier tenant |
| Convención de nombres de UOM por tamaño de empaque (§5) | `POST /config/uom`, ya existente | Es una convención de uso, no una pantalla ni un campo nuevo — nada que gatear |

Si te llega un ticket pidiendo "ocultar esto en tenants que no son de farmacia" para algo de la
segunda tabla, es casi seguro un error de alcance — confirmá primero si el pedido real es otro
(por ejemplo, permisos del rol del usuario, no el vertical del tenant).

### 2.4 Checklist de puesta en marcha (antes de operar de verdad)

`POST /config/farmacia/habilitar` (§2.2) deja el tenant técnicamente listo, pero hay precondiciones
que viven en OTROS lugares (Clientes, Catálogo, Configuración → NCF) y que, si faltan, no fallan al
habilitar — fallan más tarde, a mitad de un cobro o una facturación real, con un usuario esperando.
Vale la pena que la pantalla de onboarding de un tenant `farmacia` (o su checklist de soporte) las
repase todas antes de dar por lista una farmacia nueva:

1. **`tenant.vertical === "farmacia"`** — lo fija un operador al crear el tenant (§2.1). Sin esto,
   nada de lo demás importa: toda ruta `/farmacia/*` da 403.
2. **`POST /config/farmacia/habilitar` ejecutado** (§2.2) — cuenta puente, Mode of Payment
   "Cobertura ARS", Customer Group "ARS", Role Profiles. Reintentable sin riesgo.
3. **Cada ARS dada de alta como `Customer` con `custom_tiene_credito = true`** (§3.5.1) — si no,
   `facturar()` rechaza el lote entero recién al final, con todos sus despachos ya vinculados.
4. **Los medicamentos, sin plantilla de impuesto de venta (exentos de ITBIS, Ley 253-12)** — a
   menos que el negocio deliberadamente venda algo gravado bajo este flujo. Si no, `cobrar()`
   rechaza con el mensaje de §3.4.1 en el primer intento de cobro real.
5. **Secuencias NCF configuradas para B01 y B02** (Configuración → NCF, endpoint general, no
   documentado acá). Este vertical usa **ambos tipos**: B02 para la factura de contado del
   paciente (default), B01 para la factura de lote a la ARS (fijo, no configurable). **Si falta la
   secuencia del tipo pedido, el servidor no rechaza la operación — asigna igual un e-NCF, pero de
   OTRO tipo disponible**, sin avisar que no coincide con lo solicitado (comportamiento verificado
   contra un site de prueba real, no es específico de farmacia — es así para cualquier documento
   del sistema). **Implicación para el frontend: nunca asumas que el `ncf`/`ncfType` que te
   devuelve la respuesta es el que pediste — mostrá siempre el que realmente vino en la
   respuesta/detalle del documento**, y si hace falta garantizar el tipo, la corrección es
   configurar la secuencia faltante, no algo que el frontend pueda forzar.
6. **Role Profiles asignados a cada usuario real** (`Dependiente`, `Cajera Farmacia`, y
   `Dispensador Controlados` si aplica, §8) desde la pantalla de Usuarios — `habilitar()` los CREA
   pero no se los asigna a nadie.

---

## 3. Los tres documentos y sus estados

Todas las pantallas de este vertical viven bajo el prefijo `/api/v1/farmacia/*`. Los tres
recursos son documentos de ERPNext (no filas de una tabla propia del BFF), así que cada uno tiene
un `estado` que la UI debe respetar estrictamente: **las acciones que no aplican al estado actual
ni siquiera deberían mostrarse** (más allá de que el servidor las rechace igual si se intentan).

### 3.1 Preaprobación ARS — `/api/v1/farmacia/preaprobaciones`

Registra lo que la ARS aprobó para una receta, línea por línea (cada línea = un medicamento).

```
Borrador → Confirmada → Despachado
```

- **Borrador**: recién creada, `montoAprobadoArs` de cada línea puede estar en 0 o sin definir.
  Mientras esté acá, usá `diferencia` (ver §3.1.1) — no un estado — como señal visual de si ya se
  puede confirmar: llamar "Recalcular" o ajustar líneas a mano NO cambia `estado`.
- **Confirmada**: `confirmar` fue llamado con éxito (exige `diferencia === 0`, ver §3.1.1).
  **Inmutable en la práctica**: aunque ERPNext no lo bloquea a nivel de campo, el flujo de negocio
  no contempla "desconfirmar" — no ofrezcas esa acción en la UI.
- **Despachado**: ya existe un Despacho creado sobre ella (lo marca el servidor automáticamente al
  crear el despacho, no una llamada aparte).

El campo `estado` exacto que devuelve la API es uno de `Borrador | Confirmada | Despachado` —
usalo tal cual para filtrar (`GET .../preaprobaciones?estado=Confirmada`) y para las etiquetas de
la UI. **No existen los estados `Distribuido`/`Ajustado`/`Cuadrado`** que una versión anterior de
este documento (y la spec de negocio original) mencionaban — el servidor nunca los escribe; si tu
UI todavía los usa como paso intermedio de una máquina de estados, migrala a leer `diferencia`
directamente (§3.1.1) en su lugar.

#### 3.1.1 La regla central: `diferencia` debe ser 0 antes de confirmar

Cada preaprobación reparte `valorCoberturaArs` (lo que la dependiente digitó desde la plataforma
de la ARS) entre las líneas de la receta. El backend expone estos campos calculados en la
respuesta — **nunca los calcules en el frontend, son responsabilidad exclusiva del servidor**:

| Campo | Qué es |
|---|---|
| `valorCoberturaArs` | Dato fuente: lo que la ARS aprobó en total, tal cual lo digitó la dependiente |
| `montoDistribuido` | Suma de `montoAprobadoArs` de todas las líneas — se recalcula solo |
| `diferencia` | `valorCoberturaArs - montoDistribuido` — **debe llegar a 0 para poder confirmar** |
| `porcientoCobertura` | Informativo: `valorCoberturaArs / montoTotalReceta` — **no** `montoDistribuido / montoTotalReceta` (M2 de la auditoría: una versión anterior de este documento tenía la fórmula equivocada; difieren siempre que `diferencia !== 0`, justo el estado en que esta pantalla vive) |

Por cada línea del detalle:

| Campo | Qué es |
|---|---|
| `precioLinea` | `cantidad × precioUnitario` — el precio total de esa línea al 100% |
| `montoAprobadoArs` | Cuánto de esa línea cubre la ARS — **nunca puede superar `precioLinea`** |
| `porcientoReal` | `montoAprobadoArs / precioLinea` — informativo |
| `montoPaciente` | `precioLinea - montoAprobadoArs` — lo que le queda a cargo del paciente |
| `lineaBloqueada` | Si `true`, "Recalcular" no debe tocar el `montoAprobadoArs` de esa línea |

**Flujo de UI recomendado** (así es como fue pensado, no una libertad de diseño):

1. La dependiente crea la preaprobación con el detalle de medicamentos y `valorCoberturaArs`.
2. Aprieta "Recalcular" (`POST .../:id/recalcular`) — el servidor reparte proporcionalmente el
   `valorCoberturaArs` entre las líneas no bloqueadas, sin que ninguna supere su propio
   `precioLinea` (algoritmo de reparto con topes — si una línea se satura, el excedente se
   redistribuye entre las que quedan abiertas; está implementado y probado en el servidor, el
   frontend no necesita saber el algoritmo, solo mostrar el resultado).
3. Si la dependiente necesita ajustar una línea a mano (la ARS a veces aprueba distinto a lo
   proporcional), edita `montoAprobadoArs` de esa línea vía `PUT .../:id` y marca `lineaBloqueada:
   true` para que un futuro "Recalcular" no la pise. **Cómo referenciar la línea:** `PUT` es un
   merge por fila, no un reemplazo de la tabla — mandá `detalle: [{ id: <detalle[].id de la
   respuesta>, montoAprobadoArs: ..., lineaBloqueada: true }]` con solo esa línea; el resto del
   detalle (y los campos que no incluyas de esa misma línea) se conservan tal cual están en el
   servidor. **No hace falta reenviar todas las líneas** para editar una sola, y omitir `id` en una
   entrada la trata como una línea nueva (exige `item`/`cantidad`/`precioUnitario` en ese caso).
4. Repite recalcular/ajustar hasta que `diferencia === 0` (mostralo en pantalla, en rojo mientras
   no sea 0, en verde cuando lo sea — es la señal visual de "ya podés confirmar").
5. "Confirmar" (`POST .../:id/confirmar`) — si `diferencia !== 0`, el servidor rechaza con 400 y
   el mensaje explica por qué (viene de `_validar_confirmacion()` en el doctype). El frontend
   debería deshabilitar el botón "Confirmar" mientras `diferencia !== 0`, para no depender solo del
   error del servidor.

#### 3.1.2 Editar `montoAprobadoArs` de una línea — permiso especial (permlevel)

Este es el único campo de todo el vertical con una restricción de ERPNext que **no es un ptype
normal** (`read`/`write`/`create`) y que el frontend debe conocer para no confundir un bug con una
regla esperada: `monto_aprobado_ars` tiene *permlevel 1* en ERPNext, otorgado solo al rol
`Dependiente` (y a roles administrativos). Si un usuario sin ese permlevel manda un `PUT` con ese
campo modificado, **ERPNext no rechaza la escritura — la descarta en silencio** y el resto del
documento sí se guarda. Prácticamente: si un usuario que no es Dependiente edita esa línea y ve
que "no pasó nada" al guardar, no es un bug del frontend ni del backend, es este comportamiento.
`GET /me/permissions` no puede exponer permlevel (no es un ptype), así que la única forma de saber
si el usuario actual puede editar ese campo específico es que su rol sea `Dependiente` — si el rol
no está en la lista `roles` de `/me/permissions`, deshabilitá el input de `montoAprobadoArs` en la
UI aunque el resto del formulario esté editable.

### 3.2 Despacho Provisional ARS — `/api/v1/farmacia/despachos`

Representa la entrega física de los medicamentos al paciente, ya con los montos fijados
(`montoArs`, `montoPaciente`) heredados de la preaprobación.

```
Confirmado → Cobrado → Facturado
```

- **Confirmado**: recién creado. `montoArs`/`montoPaciente` ya vienen fijados desde el servidor
  (`_inicializar_desde_preaprobacion()`), copiados de la preaprobación en el momento de crear el
  despacho — **no** se recalculan después aunque la preaprobación cambie.
- **Cobrado**: la cajera ya cobró (`POST .../:id/cobrar`, ver §4) — a partir de acá existe una
  factura real (`facturaContado`).
- **Facturado**: el despacho quedó incluido en un Lote que ya se cerró (§3.3). Terminal.

`POST /farmacia/despachos` **solo acepta** `{ preaprobacion: string }`. La preaprobación
referenciada **debe estar en estado "Confirmada"** — si no lo está, el servidor rechaza la
creación (esto lo exige el propio doctype al insertar, no un chequeo del BFF). El frontend debería
solo permitir "Despachar" desde la pantalla de una preaprobación cuyo `estado === "Confirmada"`.

### 3.3 Cola de cobro de la cajera — `GET /api/v1/farmacia/despachos/cola` (SSE)

Pantalla dedicada para la cajera: lista, en vivo, los despachos en estado `Confirmado` (los que
están esperando que alguien cobre `montoPaciente`).

- Es un endpoint **Server-Sent Events** (`Content-Type: text/event-stream`, no JSON normal — usar
  `EventSource` o un cliente SSE, no `fetch` + `.json()`).
- Cada evento trae el **snapshot completo** de la cola (no deltas): `{ data: { items: [...] } }`,
  cada `item` con la misma forma que un despacho normal más los datos de la preaprobación
  (`numeroAprobacion`, `aseguradora`, `cliente`, `carnetAfiliado`) ya resueltos — no hace falta una
  llamada aparte para mostrar de quién es cada despacho.
- Se reenvía cada 5 segundos. **No hay push real** desde ERPNext — es polling disfrazado de SSE.
  Tratalo como tal: si la conexión se cae, no reintentes agresivamente, y ofrecé igual el refresco
  manual de respaldo (`GET /farmacia/despachos?estado=Confirmado`) por si el navegador o un proxy
  intermedio no sostiene bien una conexión SSE larga.
- Permiso: `farmacia.despachos.cola` (mismo requisito que `farmacia.despachos.listar`, pero es una
  acción separada porque es una pantalla distinta — la de la cajera, no la de gestión de
  despachos).

### 3.4 Cobrar un despacho — `POST /api/v1/farmacia/despachos/:id/cobrar`

Esta es la operación más importante del vertical desde el punto de vista contable, y la que más
detalle necesita en el frontend porque **crea y somete una factura real** (afecta inventario,
cuentas por cobrar, e-CF).

**Qué hace, en una frase**: crea UNA factura de venta a nombre del paciente, por el precio
completo de los medicamentos, pagada con dos líneas — la cobertura de la ARS (que no la paga
nadie, se registra sola) y lo que el paciente efectivamente entrega. El backend arma esta factura
combinando los dos números que ya conocés (`despacho.montoArs`, `despacho.montoPaciente`), no hay
que enviarlos.

**Es seguro reintentar esta llamada** si la conexión se corta a mitad de un cobro (el caso típico:
la cajera no está segura de si el cobro se procesó) — el servidor nunca somete una segunda
factura para el mismo despacho, retoma la que ya haya creado. Un segundo cobro genuinamente
simultáneo (dos cajeras, mismo despacho) recibe un 400 explícito del primero que llegó, en vez de
que ambos sometan.

**Precondición dura**: `despacho.estado` debe ser exactamente `"Confirmado"`. Si es `"Cobrado"` o
`"Facturado"`, el servidor rechaza con 400 (`El despacho {id} está en estado "{estado}" — solo se
puede cobrar un despacho "Confirmado".`) — no ofrezcas el botón "Cobrar" fuera de ese estado.

**Body** (`CobrarDespachoDto` — confirmar tipos exactos en `openapi.json`, esto es la semántica):

```jsonc
{
  // OBLIGATORIO. Pago(s) que hace el PACIENTE por su parte (montoPaciente). NO incluir acá la
  // cobertura ARS — el servidor la agrega solo como una línea "Cobertura ARS" aparte.
  "payments": [
    { "modeOfPayment": "Efectivo", "amount": 350.00 }
    // También puede ser tarjeta, transferencia, etc. — mismo PaymentLineDto que usa Caja/Facturación
    // (modeOfPayment, amount, y opcionalmente cardNumber/authorizationCode/bank/checkNumber/bankAccount).
  ],
  // Opcional — igual que en Caja: denominaciones del vuelto entregado si el pago fue en efectivo
  // y sobra dinero.
  "vuelto": [{ "denominacion": "RD$100", "cantidad": 2 }],
  "tenderedCash": 400.00,
  // Opcional. Default "B02". Usar "B01" solo si el paciente tiene RNC y lo necesita para su
  // propia contabilidad — el caso normal es B02 (persona física sin RNC).
  "ncfType": "B02"
}
```

La suma de `payments[].amount` **debe coincidir exactamente** (tolerancia de 1 centavo) con
`despacho.montoPaciente`. Si no coincide, 400 con un mensaje que ya trae ambos montos formateados
— mostralo tal cual, es lo suficientemente claro para el usuario final. **Validá esto en el
frontend antes de someter el pago** (deshabilitar el botón "Cobrar" mientras la suma no cuadre),
para no depender solo del error 400.

**Respuesta de éxito:**

```json
{
  "success": true,
  "data": {
    "despachoId": "DESP-2026-00042",
    "invoiceId": "ACC-SINV-2026-00123",
    "ncf": "B0200000456"
  }
}
```

`ncf` puede venir `undefined` si la emisión del e-CF quedó pendiente de forma asíncrona (mismo
comportamiento que cualquier otra factura del sistema general — no es específico de este
endpoint). Tratalo igual que ya tratás el NCF de una factura normal en el flujo de Facturación: si
no viene, la pantalla de detalle de la factura (`GET /invoices/:id` o el módulo e-CF) lo
completará cuando la DGII responda.

**Cancelar la factura de contado de un despacho**: no hay un endpoint dedicado para esto — se
cancela como cualquier `Sales Invoice` (`POST /invoices/:id/cancel`). Dos comportamientos a tener
en cuenta si tu UI ofrece cancelar una factura que resulte ser la de un despacho ARS:

- Si el despacho ya está en un lote **Facturado**, la cancelación se **rechaza** (400) — la
  consolidada a la ARS ya reclama esa cobertura y no hay reversa automática.
- Si el despacho todavía no llegó a un lote Facturado, la cancelación se acepta y el despacho
  **vuelve solo a `"Confirmado"`** (pierde `facturaContado`, y si estaba en un lote abierto se
  desvincula de él) — queda disponible para cobrarse de nuevo desde cero, no hace falta ninguna
  llamada extra. Si tu pantalla de detalle de despacho está abierta cuando esto pasa en otra
  pestaña/usuario, refrescala para reflejar el estado real.

#### 3.4.1 Errores posibles y qué comunicar al usuario

| Situación | Qué devuelve el servidor | Qué mostrar en la UI |
|---|---|---|
| Despacho no está "Confirmado" | 400, mensaje con el estado actual | "Este despacho ya fue cobrado / facturado" |
| Suma de `payments` ≠ `montoPaciente` | 400, mensaje con ambos montos | Igual el mensaje del servidor, pero **prevenilo antes** con validación en el formulario |
| El total de la factura no coincide con `montoArs + montoPaciente` | 400, mensaje explícito mencionando ITBIS/Ley 253-12 | Este es un problema de **configuración del catálogo** (un medicamento con plantilla de impuesto aplicada quedó afectado por ITBIS cuando debería estar exento) — no algo que el cajero pueda resolver. Mostrar el mensaje completo y sugerir contactar a quien administra Catálogo. |
| Tenant con POS habilitado y `Facturacion Config.flujoCobro = "directo"` | 400, mensaje que menciona `flujoCobro="caja"` | Este es un problema de **configuración del tenant**, no del cobro puntual — mostrar el mensaje completo (indica exactamente qué configurar y dónde) y dirigir a un administrador a Configuración → Facturación. |

Ninguno de estos tres últimos casos son errores que el cajero pueda resolver por sí mismo con un
reintento — son configuraciones incorrectas que alguien con permisos de administración debe
corregir. Vale la pena que la UI los distinga visualmente de un error transitorio de red.

### 3.5 Lote de Facturación ARS — `/api/v1/farmacia/lotes`

Agrupa varios despachos ya **cobrados** de **una misma ARS**, para facturarlos todos juntos al
final del período. Su naming series es `LOTE-ARS-.YYYY.-.##` (dos dígitos — techo de 99 lotes por
año; suficiente para lotes mensuales por ARS, pero ajustado si el negocio pasa a lotes semanales
con varias ARS).

```
Abierto → En Revisión → Facturado
```

- **Abierto**: recién creado o con despachos siendo agregados/quitados todavía.
- **En Revisión**: paso manual (`PUT .../:id/en-revision`) — puramente informativo, no bloquea
  nada; útil para que quien arma el lote marque "ya terminé de juntar despachos, que alguien más
  lo revise antes de facturar".
- **Facturado**: `POST .../:id/facturar` fue llamado con éxito. **Inmutable de verdad esta vez**
  — a diferencia de la Preaprobación, ERPNext sí bloquea cualquier intento de agregar/quitar
  despachos o modificar totales una vez en este estado (400 explícito). No ofrezcas ninguna acción
  de edición sobre un lote Facturado, salvo lectura.

**Flujo de UI:**

1. Crear el lote: `POST /farmacia/lotes` con `{ aseguradora, periodoInicio, periodoFin,
   responsable? }` (`aseguradora` es el mismo Customer que representa a la ARS; `periodoInicio`/
   `periodoFin` son fechas ISO, puramente descriptivas para identificar el período que cubre este
   lote — no filtran automáticamente los despachos).
2. Agregar despachos: `POST /farmacia/lotes/:id/despachos` con `{ despachoId }`, uno por uno. Para
   elegir cuáles, usar `GET /farmacia/despachos?sinLote=true&estado=Cobrado` (despachos ya cobrados
   y sin lote asignado). El servidor rechaza (400) si el despacho ya tiene lote, si el despacho ya
   está "Facturado", **o si el despacho no está "Cobrado"** — solo un despacho ya cobrado tiene el
   asiento contable (el Debe a la cuenta puente) que sostiene la reclasificación de la factura de
   lote; un despacho "Confirmado" sin cobrar no se puede vincular.
3. Quitar un despacho por error: `DELETE /farmacia/lotes/:id/despachos/:despachoId` — mismo
   bloqueo si el lote ya está Facturado.
4. `POST /farmacia/lotes/:id/recalcular` en cualquier momento para refrescar
   `cantidadDespachos`/`montoTotalLote` en pantalla (agregar/quitar un despacho ya lo llama
   automáticamente, así que rara vez hace falta invocarlo a mano — está expuesto para refrescar la
   vista sin tocar la lista de despachos).
5. `PUT /farmacia/lotes/:id/en-revision` — opcional, solo cambia la etiqueta de estado.
6. `POST /farmacia/lotes/:id/facturar` — cierra el lote. **Irreversible.** Mostrar una
   confirmación explícita antes de esta llamada (tipo "¿Confirmas facturar este lote a {ARS} por
   RD${montoTotalLote}? Esta acción no se puede deshacer."). Genera la factura consolidada a la
   ARS y marca todos sus despachos como "Facturado". **Es seguro reintentar esta llamada** si un
   timeout de red deja la duda de si se ejecutó — el servidor nunca genera una segunda factura
   consolidada para el mismo lote (retoma la ya creada). Si la respuesta trae
   `despachosNoMarcados: string[]`, la consolidada ya se emitió correctamente pero esos despachos
   puntuales no llegaron a quedar en "Facturado" — mostralo como una advertencia post-cierre, no
   como un fallo de la operación completa (la factura y el estado del lote son válidos igual).

> **Despachos sin cobrar**: el servidor exige `estado === "Cobrado"` para vincular un despacho a
> un lote (tanto el BFF como, como respaldo, un `validate()` en `Despacho Provisional ARS` para
> quien escriba directo contra ERPNext). Filtrá siempre por `estado=Cobrado` al elegir despachos
> para un lote — no ofrezcas "Confirmado" como opción en esta pantalla, el servidor lo va a
> rechazar con 400 explicando por qué.

#### 3.5.1 Precondición silenciosa de `facturar` — el cliente ARS necesita crédito fiscal

`POST /farmacia/lotes/:id/facturar` genera una factura de **reclasificación contable** a nombre de
la ARS (no es una venta con inventario, es un movimiento entre cuentas — ver
`docs/plans/PLAN_VERTICAL_FARMACIA_ARS.md` si hace falta el detalle contable). Esa factura exige
que el **Customer que representa a la ARS tenga `custom_tiene_credito = true`** (el mismo campo
"Tiene crédito fiscal" que ya existe en el módulo de Clientes para clientes B01). Si no lo tiene,
el servidor rechaza con 400 explicando exactamente esto.

**Implicación de UX**: antes de dejar que alguien cree un Lote para una ARS nueva, verificá (o
recordá verificar) que el registro de esa ARS en Clientes tenga "Tiene crédito fiscal" activado.
Si no lo tiene, `facturar()` va a fallar recién al final, después de que el lote ya esté armado con
todos sus despachos — lo cual es frustrante pero no destructivo (el lote queda igual en estado
"Abierto"/"En Revisión", se puede corregir el cliente y reintentar `facturar` sin perder nada). Una
mejora de UX razonable: al elegir la ARS al crear el lote, si el frontend ya tiene el dato de
`custom_tiene_credito` de ese cliente (desde el módulo Clientes), mostrar una advertencia temprana
en vez de esperar a que falle `facturar`.

---

## 4. Referencia completa de endpoints

Todos bajo `/api/v1`. Todos requieren `Authorization: Bearer <jwt>` + `X-Tenant: <slug>`, y todos
(salvo el de habilitación) exigen `tenant.vertical === "farmacia"` — 403 en cualquier otro caso.
El shape exacto de cada request/response está en `openapi.json`; acá el propósito de cada uno y su
id de permiso.

### 4.1 Preaprobaciones

| Método y ruta | Acción/permiso | Propósito |
|---|---|---|
| `GET /farmacia/preaprobaciones` | `farmacia.preaprobaciones.listar` | Lista paginada. Filtros: `estado`, `aseguradora`, `cliente` |
| `GET /farmacia/preaprobaciones/:id` | `farmacia.preaprobaciones.listar` | Detalle completo con `detalle[]` |
| `POST /farmacia/preaprobaciones` | `farmacia.preaprobaciones.crear` | Crear con cabecera + `detalle[]` (ver §3.1) |
| `PUT /farmacia/preaprobaciones/:id` | `farmacia.preaprobaciones.editar` | Editar cabecera y/o `detalle[]` — parcial (`PartialType`, mandá solo lo que cambia) |
| `POST /farmacia/preaprobaciones/:id/recalcular` | `farmacia.preaprobaciones.recalcular` | Redistribuir `valorCoberturaArs` entre líneas no bloqueadas |
| `POST /farmacia/preaprobaciones/:id/confirmar` | `farmacia.preaprobaciones.confirmar` | Requiere `diferencia === 0` |

### 4.2 Despachos

| Método y ruta | Acción/permiso | Propósito |
|---|---|---|
| `GET /farmacia/despachos` | `farmacia.despachos.listar` | Filtros: `estado`, `preaprobacion`, `lote`, `sinLote` |
| `GET /farmacia/despachos/cola` (SSE) | `farmacia.despachos.cola` | Cola en vivo de despachos "Confirmado" — ver §3.3 |
| `GET /farmacia/despachos/:id` | `farmacia.despachos.listar` | Detalle |
| `POST /farmacia/despachos` | `farmacia.despachos.crear` | `{ preaprobacion }` — requiere preaprobación "Confirmada" |
| `POST /farmacia/despachos/:id/cobrar` | `farmacia.despachos.cobrar` | Ver §3.4 — la operación crítica |
| `GET /farmacia/despachos/:id/pdf` | `farmacia.despachos.imprimir` | PDF de la factura de contado — ver §4.8 |

### 4.3 Lotes de Facturación

| Método y ruta | Acción/permiso | Propósito |
|---|---|---|
| `GET /farmacia/lotes` | `farmacia.lotes.listar` | Filtros: `estado`, `aseguradora` |
| `GET /farmacia/lotes/:id` | `farmacia.lotes.listar` | Detalle |
| `POST /farmacia/lotes` | `farmacia.lotes.crear` | `{ aseguradora, periodoInicio, periodoFin, responsable? }` |
| `POST /farmacia/lotes/:id/recalcular` | `farmacia.lotes.recalcular` | Refresca `cantidadDespachos`/`montoTotalLote` |
| `POST /farmacia/lotes/:id/despachos` | `farmacia.lotes.vincular-despacho` | `{ despachoId }` |
| `DELETE /farmacia/lotes/:id/despachos/:despachoId` | `farmacia.lotes.vincular-despacho` | Quitar despacho (antes de facturar) |
| `PUT /farmacia/lotes/:id/en-revision` | `farmacia.lotes.marcar-en-revision` | Cambia estado a "En Revisión" |
| `POST /farmacia/lotes/:id/facturar` | `farmacia.lotes.facturar` | **Irreversible** — ver §3.5 |
| `GET /farmacia/lotes/:id/pdf` | `farmacia.lotes.imprimir` | PDF de la factura consolidada a la ARS — ver §4.8 |

### 4.4 Reportes

| Método y ruta | Acción/permiso | Propósito |
|---|---|---|
| `GET /farmacia/reportes/lotes` | `farmacia.reportes.lotes.listar` | Listado de lotes con totales y NCF — ver §4.9 |
| `GET /farmacia/reportes/despachos-ncf` | `farmacia.reportes.despachos-ncf.listar` | Relación despacho → lote → NCF — ver §4.9 |

### 4.5 Configuración (fuera de `/farmacia`, pero parte del vertical)

| Método y ruta | Acción/permiso | Propósito |
|---|---|---|
| `POST /config/farmacia/habilitar` | `config.farmacia.habilitar` | Aprovisionamiento idempotente — ver §2.2 |

### 4.6 e-CF — regenerar un comprobante rechazado (general, no exclusivo de Farmacia)

Este endpoint **no es específico de Farmacia** — vive en el módulo e-CF y aplica a **cualquier**
`Sales Invoice` del sistema (incluidas las que genera este vertical: la factura de contado del
paciente y la factura consolidada a la ARS). Se documenta acá porque el flujo de farmacia es el
caso de uso que lo motivó, y porque tanto "Cobrar despacho" como "Facturar lote" pueden terminar
con un e-CF `REJECTED` que hay que regenerar sin perder el documento ya sometido.

`POST /ecf/emitidos/:voucherId/regenerar` — Permiso: `ecf.emitidos.regenerar`.

- Solo aplica a un voucher en estado `REJECTED` (rechazado por la DGII). El servidor valida esto.
- Asigna un **e-NCF nuevo sobre el mismo documento** (`numero_factura`/`invoiceId` no cambia). No
  toca montos, asientos contables, pagos ni ningún vínculo (el `lote` o `facturaContado` de un
  despacho siguen apuntando al mismo `invoiceId` de siempre).
- Respuesta: `{ docname, ncf, status, qrUrl, securityCode, voucherId }`.
- Ubicación sugerida: el mismo lugar donde el frontend ya muestra el estado de un e-CF rechazado
  (bandeja de "Emitidos" del módulo e-CF) — agregar un botón "Regenerar" que aparece solo cuando
  `status === 'REJECTED'`. Si la pantalla de detalle de una factura de farmacia (contado o de
  lote) ya muestra el estado del e-CF embebido, el mismo botón puede vivir ahí también, apuntando
  al mismo endpoint.

### 4.7 Endpoints del vertical general reutilizados sin cambios

Estos **no son nuevos** y **no tienen nada específico de farmacia** — se listan acá porque el
flujo de este vertical los toca directa o indirectamente y vale la pena que quien construya las
pantallas de Farmacia sepa que ya existen:

- **Clientes** (`/customers`) — la ARS y el paciente son ambos `Customer` normales. La ARS necesita
  `custom_tiene_credito = true` (ver §3.5.1). No hay un tipo de cliente "ARS" separado a nivel de
  API — es un Customer Group (`"ARS"`, ya provisionado por `habilitar`) puramente organizativo.
- **Catálogo** (`/catalog/items`) — los medicamentos son ítems normales. Ver §5 para la única
  particularidad relevante (UOM por tamaño de empaque).
- **Categorías** (`/catalog/categories`) — ver §8 (medicamentos controlados, roles por categoría).
- **Inventario** (`/inventory/lotes`, `/inventory/lotes/sugerido`) — ver §6 (vencimiento y FEFO),
  compartido con cualquier tenant que trackee lotes, no exclusivo de farmacia.

### 4.8 Impresión (PDF)

Dos documentos imprimibles, cada uno con un Print Format propio del vertical — nunca genera el
PDF a mano, el servidor delega en el mismo mecanismo (`/printview` de Frappe + Puppeteer) que ya
usa Facturación general.

**`GET /farmacia/despachos/:id/pdf?formato=a4|carta|a6`** — la factura de contado del paciente,
con un bloque adicional **"Pago con Seguro"** (aseguradora, afiliado, carnet, número de
autorización) para que paciente y ARS puedan verificar la venta contra la aprobación original
desde el mismo documento impreso, y el QR/código de seguridad del e-CF si ya se emitió.

- Solo existe una vez que el despacho fue cobrado (`factura_contado` seteado) — si no, 400.
- `formato` es opcional (default del tenant, igual que en Facturación general). **No existe la
  variante `"pos"`** (ticket de 80mm) para esta factura — si se pide, el servidor responde 400
  explicando que este documento es de página completa. No ofrezcas esa opción en el selector de
  formato para esta pantalla en particular.

**`GET /farmacia/lotes/:id/pdf`** — la factura consolidada a la ARS, con un **anexo por
despacho** (N.º provisional, N.º de autorización, monto ARS de cada uno) para que la ARS pueda
conciliar el lote contra sus propios registros al recibirlo.

- Solo existe una vez que el lote fue facturado (`factura_consolidada` seteado) — si no, 400.
- Un solo formato (A4, tamaño carta) — no acepta `formato` como query param; es un documento de
  archivo/conciliación, no algo que se entregue en caja.

Ambos devuelven `application/pdf` directo (no la envoltura `{success, data}` del resto de la
API) — tratalos como una descarga/preview de archivo, igual que ya hacés con
`GET /invoices/:id/pdf`.

### 4.9 Reportes de auditoría

Dos reportes de solo lectura, pensados para cuando la ARS reclama o concilia pagos meses después
de facturado el lote. Misma forma de respuesta que el resto de `src/modules/reportes/`:
`{ success: true, data: { columns, rows, totalRows } }` — columnas ya vienen con `label` y
`fieldtype` listos para pintar una tabla genérica, no hace falta mapear a mano.

**`GET /farmacia/reportes/lotes?aseguradora=&estado=&desde=&hasta=`** — listado de lotes con sus
totales (`cantidadDespachos`, `montoTotalLote`, `ncfAsignado`, `estado`). `desde`/`hasta` filtran
por `periodoInicio`/`periodoFin` del lote (fechas ISO).

**`GET /farmacia/reportes/despachos-ncf?aseguradora=&desde=&hasta=`** — la relación despacho →
lote → NCF: para cada despacho ya vinculado a un lote, en qué NCF y con qué estado de lote quedó,
y la fecha en que se facturó. Un despacho **sin** lote asignado no aparece en este reporte (no hay
nada que auditar todavía). Útil como pantalla de búsqueda por número de autorización o por
paciente cuando una ARS pregunta por un caso puntual meses después.

---

## 5. Catálogo: unidades de medida por tamaño de empaque

Un caso común en farmacia: un medicamento se compra por caja pero se vende suelto, y **distintos
medicamentos vienen en cajas de distinto tamaño** (una caja de 30 tabletas, otra de 24). Esto
**no requiere ningún endpoint ni campo nuevo** — es una convención de nomenclatura al dar de alta
las unidades de medida, y ya funciona hoy con el catálogo general. Documentado acá porque es
información que useste vertical necesita y que no está en ningún otro lado.

**Por qué no hay un "factor de conversión por ítem"**: en ERPNext, la conversión entre dos
unidades de medida (ej. "Caja" → "Unidad") es una tabla **global del tenant** — no por artículo.
Si dos medicamentos usaran ambos una UOM llamada simplemente "Caja" pero con factores distintos (30
vs 24), ERPNext sobrescribiría silenciosamente el factor de uno con el del otro en cuanto se
guardara el segundo ítem. No es un bug del BFF ni algo que se pueda arreglar con una opción —
es un comportamiento nativo de ERPNext v16, verificado contra un bench real.

**La solución (ya soportada, sin código nuevo)**: dar cada tamaño de empaque su **propio nombre de
UOM, globalmente distinto**, que codifique el tamaño en el nombre:

- `"Caja x30"` con conversión `1 Caja x30 = 30 Unidad`
- `"Caja x24"` con conversión `1 Caja x24 = 24 Unidad`

Cada nombre es una fila separada en la tabla global, así que nunca hay dos ítems compitiendo por
el mismo par `(uom, stock_uom)` con factores distintos.

**Qué debe hacer el frontend**: en la pantalla de creación/edición de un ítem farmacéutico que se
vende suelto de una caja, si el usuario intenta reusar un nombre de UOM ya existente ("Caja") para
un tamaño de empaque distinto al que esa UOM ya tiene registrado, **advertir y sugerir crear una
nueva UOM con un nombre distintivo** (ej. `"Caja x{N}"`) en vez de dejar que lo intente y se
encuentre con que ERPNext ignoró el valor que puso. Concretamente:

1. `GET /config/uom` — trae todas las UOM del tenant con sus conversiones.
2. Si el usuario va a crear una unidad de empaque nueva, ofrecer `POST /config/uom` con un `name`
   que incluya el tamaño (`"Caja x30"`) y su `conversions: [{ toUom: "Unidad", factor: 30 }]`.
3. Al armar el catálogo de UOM de un ítem (`stockUom`, y las conversiones que aplican), el backend
   descubre automáticamente (`buildUomsFromGlobal`, sin intervención del frontend) todas las
   conversiones globales que tocan el `stockUom` del ítem — no hay que enviar manualmente la lista
   de UOM aplicables al crear/editar un ítem, alcanza con que la UOM y su conversión ya existan
   globalmente (paso 2).

No hay ninguna ruta `/catalog/items` nueva ni cambiada por esto — es enteramente una convención de
uso de `POST /config/uom`, que ya existe para el vertical general.

---

## 6. Vencimiento de lotes y FEFO (compartido, no exclusivo de Farmacia)

Aunque esto se construyó pensando en farmacia (medicamentos vencidos son un riesgo real y legal),
es una capacidad **horizontal**: cualquier tenant que trackee inventario por lote se beneficia, y
las rutas viven en el módulo general de Inventario, no en `/farmacia`.

### 6.1 Catálogo — marcar un ítem como perecedero

Al crear/editar un ítem (`POST`/`PUT /catalog/items`), dos campos nuevos, **nativos de ERPNext**
(no custom fields), solo tienen efecto si `trackingType: "batch"`:

| Campo | Tipo | Efecto |
|---|---|---|
| `hasExpiryDate` | `boolean` | Si `true`, ERPNext exige `expiryDate` al crear cada lote de este ítem |
| `shelfLifeInDays` | `number` (entero, ≥1) | Si se omite `expiryDate` al crear un lote, ERPNext lo calcula sumando estos días a la fecha de fabricación |

Si se envían estos campos para un ítem con `trackingType` distinto de `"batch"`, el servidor
rechaza con 400 — deshabilitar estos dos inputs en el formulario de ítem hasta que el usuario elija
seguimiento por lote.

### 6.2 Inventario — consultar y filtrar por vencimiento

`GET /inventory/lotes` gana dos filtros nuevos, combinables con los que ya tenía
(`itemCode`, `limit`, `offset`):

- `soloVencidos=true` — solo lotes con `expiryDate` **hoy o antes**.
- `venceEnDias=N` — lotes que vencen dentro de N días desde hoy (incluye los ya vencidos). Útil
  para una vista de alerta "por vencer" en la pantalla de inventario o en el punto de venta.

El orden de resultados ya viene por vencimiento más próximo primero (FEFO) cuando se usa
cualquiera de estos dos filtros — no hace falta ordenar en el frontend.

Cada lote en la respuesta: `{ id, itemCode, expiryDate (o null), qty, disabled }`.

### 6.3 Sugerencia de despacho (FEFO real, por almacén)

`GET /inventory/lotes/sugerido?itemCode=...&warehouse=...` — a diferencia de `getLotes` (que es
una lista plana, sin cruzar con existencia real en un almacén concreto), este endpoint delega en
el nativo de ERPNext y devuelve **qué lote(s) despachar primero**, ya excluyendo vencidos y ya
cruzado contra el stock real de ese almacén puntual:

```json
{
  "success": true,
  "data": [
    { "batchId": "BATCH-00042", "qtyDisponible": 15, "expiryDate": "2026-11-01" },
    { "batchId": "BATCH-00051", "qtyDisponible": 30, "expiryDate": "2027-02-15" }
  ]
}
```

**Uso recomendado en la pantalla de despacho/venta**: cuando el usuario elige un ítem con
seguimiento por lote, llamar este endpoint con el almacén de origen y preseleccionar (o al menos
resaltar como sugerido) el primer resultado — es el lote que hay que sacar primero para minimizar
pérdida por vencimiento. El usuario puede igual elegir otro lote manualmente; esto es una
sugerencia, no una restricción.

### 6.4 Bloqueo de venta de lote vencido — configurable, default apagado

Existe una política de servidor, `Facturacion Config.politica_lote_vencido`, con tres valores:
`off` (default — no valida nada, comportamiento histórico) | `advertir` | `bloquear`. Si un tenant
la activa (vía Configuración → Facturación, fuera del alcance de este documento porque ya es un
endpoint general existente, no nuevo), un intento de vender un lote ya vencido responde con un
error del servidor en el momento de someter el documento (factura o remisión) que use ese lote. El
frontend no necesita implementar ninguna lógica nueva para esto — el error de servidor, si la
política está en `bloquear`, ya llega como cualquier otro 400 de validación de documento; solo
asegurate de mostrar el `message` del error tal cual, porque explica específicamente qué lote está
vencido.

---

## 7. Permisos — qué agrega este vertical al contrato ya conocido

Todo lo de `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` sigue aplicando sin cambios (los dos
niveles, el contrato de `/me/permissions`, cómo ocultar botones). Esta sección solo agrega lo
nuevo.

### 7.1 Nuevas acciones del catálogo

| Acción | Pantalla | Qué habilita |
|---|---|---|
| `farmacia.preaprobaciones.listar` | Preaprobaciones ARS | Ver listado y detalle |
| `farmacia.preaprobaciones.crear` | Preaprobaciones ARS | Botón "Nueva" |
| `farmacia.preaprobaciones.editar` | Preaprobaciones ARS | Editar cabecera/detalle |
| `farmacia.preaprobaciones.recalcular` | Preaprobaciones ARS | Botón "Recalcular" |
| `farmacia.preaprobaciones.confirmar` | Preaprobaciones ARS | Botón "Confirmar" |
| `farmacia.despachos.listar` | Despachos ARS | Ver listado y detalle |
| `farmacia.despachos.crear` | Despachos ARS | Botón "Despachar" (desde una preaprobación confirmada) |
| `farmacia.despachos.cola` | Cola de Cobro (Cajera) | Acceso a esa pantalla — separado de `.listar` aunque requiere el mismo permiso de ERPNext, porque es una pantalla distinta |
| `farmacia.despachos.cobrar` | Cola de Cobro (Cajera) | Botón "Cobrar" |
| `farmacia.lotes.listar` | Lotes de Facturación ARS | Ver listado y detalle |
| `farmacia.lotes.crear` | Lotes de Facturación ARS | Botón "Nuevo lote" |
| `farmacia.lotes.recalcular` | Lotes de Facturación ARS | Botón "Recalcular totales" |
| `farmacia.lotes.marcar-en-revision` | Lotes de Facturación ARS | Botón "Marcar en revisión" |
| `farmacia.lotes.vincular-despacho` | Lotes de Facturación ARS | Agregar/quitar despacho |
| `farmacia.lotes.facturar` | Lotes de Facturación ARS | Botón "Facturar" (irreversible) |
| `farmacia.despachos.imprimir` | Cola de Cobro (Cajera) | Botón "Imprimir factura de contado" |
| `farmacia.lotes.imprimir` | Lotes de Facturación ARS | Botón "Imprimir factura consolidada" |
| `farmacia.reportes.lotes.listar` | Reportes Farmacia ARS | Ver — Listado de Lotes |
| `farmacia.reportes.despachos-ncf.listar` | Reportes Farmacia ARS | Ver — Relación Despacho/Lote/NCF |
| `config.farmacia.habilitar` | Configuración → Farmacia ARS | Botón "Habilitar/Reparar" |
| `ecf.emitidos.regenerar` | Bandeja e-CF Emitidos (general) | Botón "Regenerar" sobre un voucher `REJECTED` |

Usalas exactamente como ya usás las 226 que documenta `PROMPT_PERMISOS_FRONTEND.md`:
`acciones['farmacia.preaprobaciones.crear']` desde el nivel 1 para menú/listado/botón "Nuevo"; para
los botones de una pantalla de detalle de un despacho o lote concreto, nivel 2
(`GET /me/permissions/:doctype/:name` con `doctype` = `"Preaprobacion ARS"` / `"Despacho
Provisional ARS"` / `"Lote de Facturacion ARS"`, exactamente esos nombres con espacios, tal como
están en ERPNext).

### 7.2 El caso especial de `monto_aprobado_ars` (permlevel)

Ya explicado en §3.1.2 — no es una acción del catálogo, es una restricción de campo que solo el
rol `Dependiente` (visible en `roles`, no en `acciones`) puede editar. Repetido acá porque es el
único permiso de todo el vertical que **no** sigue el patrón "una acción = un botón".

---

## 8. Medicamentos controlados — roles autorizados por categoría

Capacidad horizontal (vive en `localizacion_rd`, no en `farmacia_ars`) pero la motivó este
vertical: restringir la venta de una categoría entera de artículos (medicamentos controlados,
pero sirve para cualquier categoría regulada) a usuarios con un rol específico. **No hay ningún
endpoint nuevo bajo `/farmacia`** — se configura y se aplica enteramente a través del módulo de
Catálogo ya existente.

### 8.1 Configurar la restricción

`POST`/`PUT /catalog/categories` (`create-category.dto.ts`/`category-response.dto.ts`) ganó un
campo:

```jsonc
{
  "rolesPermitidosVenta": ["Dispensador Controlados"]
}
```

- **Vacío u omitido (default)**: cualquiera con permiso de venta puede vender artículos de esa
  categoría — cero cambio de comportamiento para categorías existentes.
- **Con roles**: solo un usuario con AL MENOS uno de esos roles puede crear/editar/someter una
  `Sales Invoice` que incluya un artículo de esa categoría.
- `GET /catalog/categories/:id` devuelve `rolesPermitidosVenta` en la respuesta — **solo al pedir
  una categoría puntual**, no en el listado paginado (mismo patrón que `incomeAccount`/
  `item_group_defaults` de esa misma pantalla).
- El servidor valida que cada rol enviado exista y esté activo en el tenant; si no, 400 con la
  lista de roles disponibles.
- `habilitar()` (§2.2) provisiona de conveniencia un rol `"Dispensador Controlados"` — pero el
  mecanismo funciona con **cualquier** rol que un administrador ponga en la lista, no depende de
  ese nombre. Un usuario puede combinarlo con su rol principal (ej. `Dependiente` +
  `Dispensador Controlados`) desde la pantalla de Usuarios existente, que ya soporta asignar
  varios perfiles.

### 8.2 Qué pasa al vender

La restricción se aplica **por línea**, no por documento completo — una factura puede mezclar
artículos controlados y normales en la misma venta. Si el usuario no tiene un rol autorizado para
la categoría de alguna línea, el servidor rechaza la operación completa con un mensaje que nombra
la categoría y el artículo problemático (no un 403 genérico).

**Importante para la UI**: esto se aplica en ERPNext, no en una acción del catálogo de permisos —
no hay un `farmacia.*`/`catalogo.*` en `acciones` que lo refleje, porque depende de qué categoría
tenga cada línea de CADA venta puntual, algo que el nivel 1 de permisos no puede modelar. La forma
correcta de dar feedback temprano en la UI (opcional, de UX) es que el frontend conozca de
antemano qué categorías tienen restricción (`GET /catalog/categories` + `rolesPermitidosVenta` por
categoría) y qué roles tiene el usuario actual (`roles` de `/me/permissions`), y avise ANTES de
someter si detecta un artículo de una categoría restringida sin el rol correspondiente — pero la
validación real y definitiva sigue siendo la del servidor al someter.

---

## 9. Qué NO debe hacer el frontend (checklist rápido)

- **No** recalcular `diferencia`, `montoPaciente`, `montoDistribuido` ni ningún otro campo
  derivado de la Preaprobación en el cliente — son responsabilidad exclusiva del servidor
  (`recalcular()` del doctype). Mostralos, no los deduzcas.
- **No** enviar la línea de pago "Cobertura ARS" al cobrar un despacho — el servidor la agrega
  solo. Enviarla manualmente duplicaría la cobertura.
- **No** ofrecer "desconfirmar" una Preaprobación ni "reabrir" un Lote Facturado — no son
  transiciones que el negocio contemple; el servidor las rechaza si se intentan.
- **No** dejar que el usuario reintente indefinidamente "Facturar" un lote sin mostrar antes una
  confirmación explícita — es irreversible.
- **No** construir un factor de conversión de UOM "por ítem" en el frontend — usar el patrón de
  nombres distintos de §5, ya soportado por el backend sin cambios.
- **No** asumir que `vertical` puede cambiar en caliente durante una sesión — pedila una vez al
  iniciar sesión junto con `acciones`, igual que hoy.
- **No** tratar la cola SSE (`/farmacia/despachos/cola`) como un canal confiable de eventos en
  tiempo real — es polling de 5s; siempre ofrecer el refresco manual de respaldo.
- **No** ofrecer formato `"pos"` (ticket 80mm) para la factura de contado ni la consolidada
  (§4.8) — ninguna de las dos tiene esa variante, el servidor la rechaza con 400.
- **No** asumir que la restricción de "medicamentos controlados" (§8) se refleja en `acciones` —
  depende de la categoría de cada línea de cada venta puntual, no es una acción del catálogo de
  permisos. La validación real vive en el servidor al someter.

---

## 10. Catálogo de errores del vertical

Todos son `400 Bad Request` con `{ success: false, error: { message, ... } }` (ver el contrato de
error de `PROMPT_PERMISOS_FRONTEND.md` §4) salvo que se indique otro código. "Mensaje" es un
resumen — mostrá el `message` real de la respuesta, ya viene completo y específico. "Quién lo
resuelve" te dice si conviene reintentar, corregir el formulario, o escalar a un administrador —
útil para decidir el tono del error en la UI (uno accionable por el usuario vs. uno que necesita
soporte).

| Endpoint | Disparador | Quién lo resuelve |
|---|---|---|
| `POST .../preaprobaciones/:id/confirmar` | `diferencia !== 0` | Dependiente (recalcular o ajustar líneas) |
| `PUT .../preaprobaciones/:id` | Una línea de `detalle` trae un `id` que no existe | Frontend — bug de referencia, no mostrar tal cual al usuario |
| `PUT .../preaprobaciones/:id` | Una línea nueva (sin `id`) sin `item`/`cantidad`/`precioUnitario` | Frontend — validar antes de enviar |
| `POST .../despachos` | La preaprobación referenciada no está "Confirmada" | Dependiente |
| `POST .../despachos/:id/cobrar` | El despacho no está "Confirmado" (ya cobrado/facturado) | — (refrescar la pantalla, ya no aplica la acción) |
| `POST .../despachos/:id/cobrar` | Suma de `payments` ≠ `montoPaciente` | Cajera (corregir el monto) — prevenible en el formulario, ver §3.4 |
| `POST .../despachos/:id/cobrar` | Total de la factura ≠ cobertura + pago (ITBIS mal aplicado) | Administrador de Catálogo (revisar plantilla de impuesto del ítem) |
| `POST .../despachos/:id/cobrar` | Tenant con POS habilitado y `flujoCobro="directo"` | Administrador (Configuración → Facturación) |
| `POST .../despachos/:id/cobrar` | "ya tiene un cobro en curso" (dos intentos casi simultáneos) | Reintentar en unos segundos; si persiste, administrador del sistema |
| `POST .../despachos/:id/cobrar` | Factura de un intento anterior quedó CANCELADA | Administrador del sistema — dato inconsistente, requiere revisión manual |
| `POST .../lotes/:id/despachos` | El despacho ya tiene lote / ya está "Facturado" / no está "Cobrado" | — (elegir otro despacho) |
| `POST .../lotes/:id/facturar` | El lote ya está "Facturado" | — (ya no aplica la acción) |
| `POST .../lotes/:id/facturar` | El lote no tiene despachos vinculados | Quien arma el lote (agregar despachos primero) |
| `POST .../lotes/:id/facturar` | Farmacia no completamente habilitada (falta cuenta puente/ítem) | Administrador — ejecutar `POST /config/farmacia/habilitar` |
| `POST .../lotes/:id/facturar` | El cliente ARS no tiene `custom_tiene_credito` | Administrador — activarlo en el registro del cliente, ver §3.5.1 |
| `POST .../lotes/:id/facturar` | "ya tiene una facturación en curso" | Igual que el análogo de despachos — reintentar, luego escalar |
| `POST /invoices/:id/cancel` (factura de contado de un despacho) | El despacho ya está en un lote "Facturado" | Administrador — corrección contable manual, no soportado por este flujo (§4.8/C3) |
| Cualquier `/farmacia/*` en un tenant `general` | `403` — falta `vertical === "farmacia"` | — (no debería llegar a mostrarse; ver §2) |
| `GET /catalog/categories` / `Sales Invoice` con línea restringida | Usuario sin rol autorizado para la categoría (§8) | Quien vende (usar otro usuario) o administrador (agregar el rol a la categoría o al usuario) |

---

## 11. Ejemplos completos de extremo a extremo

Fragmentos de request/response reales de punta a punta — útil para tipar sin ambigüedad o para
armar fixtures de test. El shape exacto (tipos, opcionalidad) sigue siendo el de `openapi.json`;
esto son valores de ejemplo coherentes entre sí a lo largo de todo el flujo.

**1. Crear la preaprobación** — `POST /farmacia/preaprobaciones`

```jsonc
// Request
{
  "aseguradora": "ARS Humano",
  "numeroAprobacion": "AUTH-2026-00981",
  "cliente": "Juana Pérez",
  "cedula": "00112345678",
  "carnetAfiliado": "HUM-778899",
  "valorCoberturaArs": 60,
  "detalle": [
    { "item": "MED-AMOX-500", "cantidad": 1, "precioUnitario": 70 },
    { "item": "MED-IBUP-400", "cantidad": 1, "precioUnitario": 30 }
  ]
}
// Response — antes de "Recalcular": montoAprobadoArs en 0, diferencia = 60
{
  "success": true,
  "data": {
    "id": "PREAPR-2026-00003", "estado": "Borrador", "confirmada": false,
    "valorCoberturaArs": 60, "montoTotalReceta": 100, "montoDistribuido": 0, "diferencia": 60,
    "detalle": [
      { "id": "...", "item": "MED-AMOX-500", "cantidad": 1, "precioUnitario": 70,
        "precioLinea": 70, "montoAprobadoArs": 0, "montoPaciente": 70, "lineaBloqueada": false },
      { "id": "...", "item": "MED-IBUP-400", "cantidad": 1, "precioUnitario": 30,
        "precioLinea": 30, "montoAprobadoArs": 0, "montoPaciente": 30, "lineaBloqueada": false }
    ]
  }
}
```

**2. Recalcular** — `POST /farmacia/preaprobaciones/PREAPR-2026-00003/recalcular` — reparte los 60
proporcionalmente; la segunda línea (precioLinea=30) topa contra su propio precio y se cierra en
30, la primera se queda con los 30 restantes. Resultado: `montoDistribuido: 60, diferencia: 0` —
ya se puede confirmar. Confirmar (`POST .../confirmar`) deja `estado: "Confirmada"`.

**3. Despachar y cobrar** — `POST /farmacia/despachos` con `{ "preaprobacion": "PREAPR-2026-00003" }`
devuelve un despacho con `montoArs: 60, montoPaciente: 40` (heredados). Cobrarlo:

```jsonc
// POST /farmacia/despachos/DESP-2026-00042/cobrar
{ "payments": [{ "modeOfPayment": "Efectivo", "amount": 40 }] }
// Response
{
  "success": true,
  "data": { "despachoId": "DESP-2026-00042", "invoiceId": "ACC-SINV-2026-00123", "ncf": "B0200000456" }
}
```

**4. Armar y facturar el lote** — tras cobrar varios despachos de la misma ARS:

```jsonc
// POST /farmacia/lotes  { "aseguradora": "ARS Humano", "periodoInicio": "2026-09-01", "periodoFin": "2026-09-30" }
// POST /farmacia/lotes/LOTE-ARS-2026-05/despachos  { "despachoId": "DESP-2026-00042" }  (uno por cada despacho)
// POST /farmacia/lotes/LOTE-ARS-2026-05/facturar
{
  "success": true,
  "data": {
    "id": "LOTE-ARS-2026-05", "estado": "Facturado", "aseguradora": "ARS Humano",
    "cantidadDespachos": 1, "montoTotalLote": 60,
    "facturaConsolidada": "ACC-SINV-2026-00145", "ncfAsignado": "B0100000012"
    // "despachosNoMarcados" NO aparece acá — solo se incluye si el fan-out final falló parcialmente
  }
}
```

Notá el naming series real: `LOTE-ARS-.YYYY.-.##` (con "ARS-" en el medio, dos dígitos al final —
confirmado contra un site real, no `LOTE-.YYYY.-.##`).
