# Prompt para agente de frontend — NCF default de venta, B14/E44 sin impuestos, filtro de catálogos fiscales y redondeo al cobro

> **Para quien recibe este documento.** Esto describe **4 cambios independientes** del módulo de
> Facturación, todos ya **implementados, compilados y con sus tests unitarios en verde** del lado
> del backend (NestJS/ERPNext). No hay nada pendiente de negociar con el equipo de backend salvo lo
> que se marque explícitamente como duda abierta. Los 4 cambios pueden implementarse por separado,
> en cualquier orden, y ninguno depende de los otros — pero los 4 tocan la misma pantalla base
> (Configuración de Facturación) y el mismo flujo (crear/editar una factura), así que este documento
> los agrupa en uno solo para que se revisen juntos.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable en
> Scalar en `https://gensapi.ryancfx.click/api/docs`). **Regenerá tu cliente/tipos desde ese archivo
> antes de empezar** — ahí está el shape exacto y tipado de cada campo nuevo (`ncfTipoVentaDefault`
> en `Facturacion Config`, el query param `type` de `GET /config/catalogos-fiscales`, etc.). Este
> documento no reemplaza el spec: explica el **flujo de negocio**, qué pantalla toca qué campo, en
> qué orden pasan las cosas, qué mostrar en cada estado y cómo manejar cada error. Si este documento
> y el `openapi.json` llegaran a diferir en el nombre exacto de un campo, **gana el `openapi.json`**
> — pero no debería pasar: todo lo escrito acá se extrajo directamente del código fuente ya
> mergeado, no de un diseño preliminar.
>
> Documento relacionado que asumimos ya tenés implementado, sin cambios en este documento:
> `PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos, `GET /me/permissions` → `data.acciones`).
> Ninguno de los 4 cambios de este documento agrega una acción de permiso nueva — todos reutilizan
> exactamente las que ya gatean la pantalla de Configuración de Facturación y la de Facturación
> (crear/editar factura). Ver §6.

---

## 0. Resumen ejecutivo — los 4 cambios de un vistazo

| # | Cambio | Pantalla(s) que toca | ¿Requiere UI nueva? |
|---|---|---|---|
| 1 | Tipo de comprobante (NCF) **sugerido por defecto** al facturar a un cliente ocasional, configurable por el tenant | Configuración de Facturación (agregar 1 campo) + pantalla de Nueva Factura (usar el default para preseleccionar) | Sí — 1 selector nuevo en Configuración + lógica de preselección en Nueva Factura |
| 2 | Facturas con comprobante **B14** (físico) o **E44** (electrónico) — Régimen Especial de Tributación — se someten **siempre sin ITBIS**, sin importar qué plantilla de impuestos se haya elegido | Pantalla de Nueva/Editar Factura, y conversión de Cotización → Factura | Sí — ocultar/deshabilitar el selector de impuestos cuando el comprobante elegido es B14/E44, y comunicarlo claramente al usuario |
| 3 | `GET /config/catalogos-fiscales` acepta un parámetro opcional `type=venta\|compra` para traer solo uno de los dos catálogos de NCF | Cualquier pantalla que hoy llama este endpoint (selector de NCF en Factura, en Compras/Gastos, en creación de Secuencia NCF) | No es obligatorio cambiar nada — es 100% retrocompatible. Opcional: usarlo para simplificar el payload en pantallas que solo necesitan un lado |
| 4 | El redondeo del total de una factura a `.00` deja de depender únicamente del momento de crearla — ahora, si se cobra 100% en efectivo, el backend puede absorber la diferencia de redondeo como un ajuste contable (write-off) al momento del cobro, sin tocar el total real de la factura | Ninguna pantalla nueva. Es un cambio 100% de comportamiento del backend — no hay ningún campo nuevo que el frontend tenga que mandar. Recomendado: actualizar el texto de ayuda de un toggle ya existente en Configuración (ver §4) | No — es transparente. Solo se recomienda un ajuste de copy |

**Lo que NO cambia en ninguno de los 4:**
- Los endpoints existentes de crear/editar/listar facturas siguen exactamente en la misma ruta,
  con el mismo verbo HTTP.
- Ningún campo existente cambia de tipo ni de nombre.
- No hay ningún permiso nuevo que agregar al catálogo de acciones del frontend.
- El ciclo de vida de una factura (Draft → Submit → Cancel → Amend) no cambia.

---

## 1. Tipo de comprobante (NCF) sugerido por defecto al facturar

### 1.1 El problema que resuelve

Hoy, cada vez que el cajero/vendedor abre la pantalla de Nueva Factura para un **cliente
ocasional** (sin registrar como `Customer`), tiene que elegir manualmente el tipo de comprobante
(NCF) en el selector correspondiente — típicamente `B02` (Consumo), pero puede variar según el
negocio. Esto agrega un clic/decisión repetitiva en el flujo de venta más común. El cambio permite
que el **administrador del tenant configure de antemano** cuál debería ser ese valor por defecto,
para que la pantalla de venta lo preseleccione automáticamente.

**Importante — esto es un valor sugerido, NO restrictivo.** El backend no bloquea ni valida que una
factura se cree con un `ncfType` distinto al configurado como default. El operador puede cambiarlo
libremente en cada venta, exactamente igual que hoy. Este cambio es puramente de **UX de
preselección** en el frontend — el backend solo guarda el valor y lo expone para que la UI lo lea.

### 1.2 El campo nuevo — `ncfTipoVentaDefault`

Vive en la configuración de Facturación, mismo endpoint que ya usás para leer/escribir el resto de
esa pantalla:

```jsonc
// GET /api/v1/config/facturacion
{
  "success": true,
  "data": {
    // ...el resto de los campos que ya conocés (rolesCancelacionFactura, flujoCobro,
    // plantillaImpuestoVentasDefault, ncfAlertaMinimo, etc.)...
    "ncfTipoVentaDefault": "B02"   // NUEVO — string con el código NCF, o `null` si no se configuró nada
  }
}
```

```jsonc
// PUT /api/v1/config/facturacion
{
  "ncfTipoVentaDefault": "B02"
}
```

Para **quitar** el default configurado (volver a "sin sugerencia"), mandá el campo como cadena
vacía `""` — mismo patrón que otros campos opcionales de tipo texto/Link de este mismo endpoint.

### 1.3 Regla de validación — físico vs. electrónico

Esta es la parte más importante de este cambio, y la única donde el backend SÍ valida algo al
guardar:

- Si el tenant **NO tiene facturación electrónica habilitada** (`GET /config/ecf` → `habilitado:
  false`, o el flag `facturacionElectronicaHabilitada: false` que ya trae `GET
  /config/catalogos-fiscales`), el backend **solo acepta un tipo físico** (`B01`, `B02`, `B11`,
  `B13`, `B14`, `B15`, `B16`, `B17` — cualquier código que empiece con `B`). Si se manda un código
  electrónico (`E31`, `E32`, etc.), el backend responde `400`:

  ```jsonc
  {
    "code": "BAD_REQUEST",
    "statusCode": 400,
    "message": "No se puede configurar un tipo de comprobante electrónico (E0x) como default: este tenant no tiene facturación electrónica habilitada. Use el tipo físico equivalente (\"B02\")."
  }
  ```

- Si el código enviado no es un NCF válido en absoluto (ni físico ni electrónico reconocido), el
  backend responde `400`:

  ```jsonc
  {
    "code": "BAD_REQUEST",
    "statusCode": 400,
    "message": "ncfTipoVentaDefault (\"XYZ\") no es un tipo de comprobante válido."
  }
  ```

- Si el tenant **SÍ tiene facturación electrónica habilitada**, el backend acepta tanto el código
  físico como el electrónico equivalente (ej. `B02` o `E32`, indistintamente) — internamente
  siempre se guarda normalizado como el código físico (`B0x`), pero eso es un detalle interno que no
  debería importarle al frontend: lo que devuelve el `GET` es lo relevante (ver §1.4).

**Implicación de UI:** el selector de "Tipo de Comprobante por Defecto" en Configuración debe
poblarse con el catálogo de NCF **de venta** (ver §3 — `GET /config/catalogos-fiscales?type=venta`,
o el `GET /config/catalogos-fiscales` completo si tu pantalla ya lo usa así), que YA devuelve solo
los tipos físicos si el tenant no tiene e-CF, o los electrónicos si sí lo tiene — es decir, **el
propio catálogo que ya usás para el selector de NCF en la pantalla de Nueva Factura sirve
exactamente igual para poblar este selector de configuración.** No hace falta armar una lista
separada ni filtrar nada del lado del frontend: si el catálogo te da tipos físicos, mandás uno de
esos; si te da electrónicos, mandás uno de esos, y el backend los acepta según corresponda.

### 1.4 Migración automática al habilitar facturación electrónica

Este es el comportamiento más importante a entender, aunque **no requiere ningún código nuevo en el
frontend** — es 100% automático del lado del backend:

Cuando un tenant que tenía `ncfTipoVentaDefault` configurado como físico (ej. `"B02"`) habilita la
facturación electrónica por primera vez (`PUT /config/ecf` con `{ "habilitado": true, ... }`), el
backend **automáticamente migra** ese valor a su equivalente electrónico (`"E32"`), sin que nadie
tenga que volver a tocar la pantalla de Configuración de Facturación.

**Lo único que el frontend necesita hacer:** si tu pantalla de Configuración de Facturación
mantiene el valor de `ncfTipoVentaDefault` en un estado local/caché después de habilitar e-CF,
**volvé a pedir `GET /config/facturacion`** después de un `PUT /config/ecf` exitoso que habilite
la facturación electrónica, para que el selector muestre el valor ya migrado (`E32`) en vez del
valor físico viejo (`B02`) que quedó desactualizado en memoria. Si tu pantalla ya hace un refetch
completo de la configuración después de cualquier cambio relevante, no hay nada que hacer — este
comportamiento ya está cubierto.

**Caso borde, informativo únicamente:** si el tipo configurado era `B12` (Registro Único de
Ingresos) — un tipo que no tiene equivalente electrónico — la migración simplemente no ocurre y el
valor físico se conserva tal cual, sin ningún error visible para el usuario. No hace falta manejar
este caso de forma especial en el frontend: el `GET` posterior a habilitar e-CF simplemente seguirá
devolviendo `"B12"`.

### 1.5 Dónde usar el default en la pantalla de Nueva Factura

Al abrir el formulario de Nueva Factura para un **cliente ocasional**:

1. Leé `ncfTipoVentaDefault` de `GET /config/facturacion` (mismo `GET` que ya hacés para leer el
   resto de la configuración de esta pantalla — no hace falta un endpoint aparte).
2. Si viene un valor (no `null`/vacío), **preseleccioná** ese valor en el selector de "Tipo de
   Comprobante" del formulario.
3. El usuario puede cambiarlo libremente antes de guardar — no hay ninguna restricción ni
   confirmación adicional al hacerlo. Al enviar `POST /invoices`, se manda el valor que quedó
   seleccionado en el formulario (igual que hoy), sea el default o uno distinto.
4. Si `ncfTipoVentaDefault` es `null` (tenant que nunca lo configuró), el comportamiento es
   **exactamente el de hoy**: el selector arranca sin preselección, o con el primer valor del
   catálogo si así lo tenés implementado actualmente — no cambia nada.

**No apliques esta preselección para un cliente registrado (`Customer` con ficha propia)** si ese
cliente ya tiene su propio `ncfTypeDefault` configurado en su ficha (`Customer.custom_ncf_type_default`,
expuesto como `ncfTypeDefault` en `GET/POST/PUT /customers`) — ese campo, que ya existe y es
independiente de este cambio, sigue siendo más específico y debe ganarle al default general del
tenant. Orden de prioridad de preselección, de mayor a menor especificidad:
1. `Customer.ncfTypeDefault` (si el cliente está registrado y lo tiene configurado).
2. `Facturacion Config.ncfTipoVentaDefault` (este cambio — aplica sobre todo a clientes
   ocasionales, que no tienen ficha propia).
3. Sin preselección (comportamiento actual si ninguno de los dos existe).

---

## 2. Comprobantes B14/E44 — Régimen Especial de Tributación, siempre sin impuestos

### 2.1 La regla de negocio

Cuando una factura se crea o edita con tipo de comprobante **B14** (físico, "Comprobantes para
Regímenes Especiales de Tributación") o su equivalente electrónico **E44**, el backend **fuerza
que la factura se someta sin ITBIS**, sin importar:

- Qué plantilla de impuestos de documento (`taxesTemplate`) haya mandado el frontend.
- Qué plantilla de impuesto tenga configurada cada artículo individualmente
  (`Item.custom_sales_tax_template`).

Esto es una **anulación forzosa**, no una omisión: aunque el frontend mande explícitamente una
plantilla de impuestos con ITBIS 18%, el backend la ignora por completo cuando el comprobante es
B14/E44 y somete la factura en 0. No hay forma de "forzar" que una factura B14/E44 lleve impuestos
— si el negocio necesita cobrar ITBIS en ese caso, el comprobante correcto no es B14/E44.

### 2.2 Qué tiene que hacer la UI

**En la pantalla de Nueva/Editar Factura:**

1. Cuando el usuario selecciona `B14` o `E44` en el selector de "Tipo de Comprobante":
   - **Ocultá o deshabilitá** cualquier selector de "Plantilla de Impuestos" / "Impuesto" a nivel
     de documento y a nivel de línea de artículo, si tu pantalla los tiene.
   - Mostrá un texto claro cerca del selector de NCF o del resumen de totales, del estilo:
     > *"Este tipo de comprobante (Régimen Especial de Tributación) se emite siempre sin ITBIS —
     > cualquier impuesto configurado se ignora."*
   - El resumen de totales de la factura (subtotal / impuesto / total) debe reflejar esto **antes**
     de guardar, no solo después: si tu pantalla calcula el total en el cliente para preview, forzá
     el cálculo de impuesto a `0` cuando el NCF seleccionado sea B14/E44, para que lo que el usuario
     ve en pantalla coincida con lo que el backend va a someter.

2. Cuando el usuario **cambia** el tipo de comprobante de B14/E44 a cualquier otro tipo (o
   viceversa) en un documento que todavía está en Draft (antes de someter):
   - El comportamiento de impuestos se recalcula en cada `PUT /invoices/:id` según el `ncfType`
     vigente en ese momento — no hay ningún estado "pegado" del guardado anterior. Si el usuario
     cambia de B14 a B02 y vuelve a guardar, la factura recupera los impuestos normales
     (plantilla de documento / plantilla por artículo), exactamente como si nunca hubiera sido
     B14. Tu UI debe reflejar este recálculo inmediatamente al cambiar el selector, sin necesidad
     de recargar la pantalla.

3. **No hace falta que el frontend oculte impuestos "a mano" antes de enviar** — podés seguir
   mandando `taxesTemplate` y las plantillas por artículo tal cual el usuario las tenía configuradas
   antes de cambiar a B14/E44 (por si el usuario vuelve a cambiar el tipo de comprobante antes de
   guardar). El backend es quien decide, en base al `ncfType` final del payload, si aplica o ignora
   esos campos. Ocultarlos en la UI es solo para no confundir al usuario mostrando un selector que
   no va a tener efecto.

**En la conversión de Cotización → Factura** (`POST /cotizaciones/:id/convert?ncfType=B14`, query
param, no body): la misma regla aplica — si el `ncfType` que se manda en la conversión es B14/E44,
la factura resultante se crea sin impuestos, sin importar qué plantilla de impuesto tuvieran las
líneas de la cotización original. Si tu pantalla de conversión tiene un selector de tipo de
comprobante antes de confirmar la conversión, aplicá el mismo aviso visual del punto 1 cuando el
usuario elija B14/E44 ahí.

### 2.3 Qué NO necesita cambiar en la respuesta

No hay ningún campo nuevo en la respuesta de `POST`/`GET`/`PUT /invoices` para indicar "esta
factura está exenta por régimen especial" — el campo `taxAmount` (impuesto total) que ya leés hoy
del detalle de la factura simplemente va a venir en `0` cuando el `ncfType` sea B14/E44, igual que
vendría `0` en cualquier otro escenario legítimamente exento. Si tu pantalla de detalle de factura
ya muestra `taxAmount`/`subtotal`/`grandTotal` correctamente, no hace falta ningún campo adicional
para reflejar este caso — el número ya sale correcto.

### 2.4 El único error nuevo a manejar

Si el tenant intenta someter una factura B14/E44 y **nunca fue provisionado** con el catálogo de
cuentas de República Dominicana (caso extremadamente raro — solo tenants muy viejos o mal
provisionados, no debería verse en producción normal), el backend responde `400`:

```jsonc
{
  "code": "BAD_REQUEST",
  "statusCode": 400,
  "message": "No existe la plantilla de impuesto \"ITBIS Exento\" para esta compañía — el tenant no fue provisionado con el catálogo de cuentas RD. Contacte a soporte."
}
```

Mostrá este mensaje tal cual (o mapeado a un texto amigable que invite a contactar soporte) si
aparece al someter una factura B14/E44 — no es un error de validación del formulario, es un problema
de provisioning del tenant que el usuario no puede resolver por su cuenta.

---

## 3. Filtro `type` en `GET /config/catalogos-fiscales`

### 3.1 Qué cambia

El endpoint `GET /api/v1/config/catalogos-fiscales` (que ya usás para poblar cualquier selector de
tipo de comprobante — en Factura, en Compras/Gastos, en la creación de Secuencias NCF) ahora acepta
un query param opcional `type`:

```
GET /api/v1/config/catalogos-fiscales
GET /api/v1/config/catalogos-fiscales?type=venta
GET /api/v1/config/catalogos-fiscales?type=compra
```

- **Sin el parámetro** (como lo usás hoy): la respuesta trae **ambos** bloques, `ncfTypes` +
  `ncfTypesFisicos` (venta) y `ncfTypesCompra` (compra) — **exactamente igual que antes de este
  cambio, byte a byte.** No tenés que cambiar nada en las pantallas que ya lo consumen así.
- **`?type=venta`**: la respuesta **omite** `ncfTypesCompra` — solo trae `ncfTypes`/`ncfTypesFisicos`.
- **`?type=compra`**: la respuesta **omite** `ncfTypes`/`ncfTypesFisicos` — solo trae `ncfTypesCompra`.
- En los tres casos, `tipoBienes606`, `formaPago606` y `facturacionElectronicaHabilitada` **siempre**
  vienen en la respuesta, sin importar el valor de `type` — esos catálogos no son específicos de
  venta ni de compra.

```jsonc
// GET /config/catalogos-fiscales?type=venta
{
  "success": true,
  "data": {
    "ncfTypes": [
      { "value": "B01", "label": "B01 - Facturas de Crédito Fiscal" },
      { "value": "B02", "label": "B02 - Facturas de Consumo" },
      { "value": "B14", "label": "B14 - Comprobantes para Regímenes Especiales de Tributación" }
      // ...o su equivalente electrónico (E31, E32, E44, ...) si facturacionElectronicaHabilitada=true
    ],
    "ncfTypesFisicos": [ /* siempre físicos B0x, igual que hoy */ ],
    "tipoBienes606": [ /* sin cambios */ ],
    "formaPago606": [ /* sin cambios */ ],
    "facturacionElectronicaHabilitada": false
    // "ncfTypesCompra" NO viene en esta respuesta
  }
}
```

Un valor de `type` distinto a `"venta"`/`"compra"` (ej. `?type=xyz`) responde `400` con el error
estándar de validación del backend (`class-validator`, formato ya conocido: `statusCode: 400`,
`message` listando el campo inválido).

### 3.2 Qué hacer en el frontend

**No es obligatorio cambiar nada** — este cambio es puramente aditivo y retrocompatible. Es una
optimización opcional:

- En pantallas que **solo** necesitan el catálogo de venta (ej. el selector de NCF en Nueva
  Factura, o el nuevo selector de `ncfTipoVentaDefault` de §1), podés agregar `?type=venta` a la
  llamada para que el backend no calcule ni devuelva el bloque de compra que de todas formas
  ibas a ignorar.
- En pantallas que **solo** necesitan el catálogo de compra (ej. el selector de NCF en Compras o
  Gastos), agregá `?type=compra` por el mismo motivo.
- En cualquier pantalla que ya lea **ambos** bloques de una sola llamada (por ejemplo, un
  componente compartido de configuración que muestra los dos catálogos a la vez), **dejala como
  está** — no hace falta tocarla.

Este es un cambio de bajo impacto, priorizalo solo si te da tiempo — no es bloqueante para los
otros 3 cambios de este documento.

---

## 4. Redondeo a `.00` movido al momento de cobrar (solo pago 100% en efectivo)

### 4.1 El comportamiento anterior (para contexto)

Hoy, cuando se crea/somete una factura y el total (`grandTotal`) no termina en `.00` (ej.
`168.57`), ERPNext redondea automáticamente ese total a `169.00` (`roundedTotal`) al momento de
**crear** el documento — esto ya lo ves reflejado en los campos `grandTotal`/`roundedTotal`/
`roundingAdjustment` que ya devuelve `GET`/`POST /invoices`. Este comportamiento se activa o
desactiva con el toggle `redondeoTotalDeshabilitado` en `Facturacion Config`, que probablemente ya
tenés como un switch en la pantalla de Configuración de Facturación.

### 4.2 El comportamiento nuevo

El backend ahora puede aplicar ese mismo redondeo — o parte de él — **en el momento del cobro**, en
vez de (o además de) al crear el documento, y **solo si el 100% del pago es en efectivo** (nunca si
hay tarjeta, transferencia, cheque, o una combinación mixta de métodos de pago). Esto ocurre en tres
flujos de cobro con pago completo:

1. Someter y pagar una factura en una sola llamada (`POST /invoices/:id/submit` con `payments[]`).
2. Completar el cobro de una factura en la cola de Caja/POS (`POST /caja/facturas/:id/completar-cobro`).
3. Cobrar una factura ya sometida a crédito, vía un Payment Entry (`POST /cobros`).

Cuando el pago es 100% efectivo y hay una diferencia de centavos entre el total de la factura (o el
monto asignado en el cobro) y su redondeo a `.00`, el backend absorbe esa diferencia como un ajuste
contable (write-off) nativo de ERPNext, sin modificar el total real/histórico de la factura.

### 4.3 Por qué esto NO requiere ningún campo nuevo en el frontend

**Este es el punto más importante de esta sección: no hay ningún request body nuevo, ningún query
param nuevo, ni ningún campo de respuesta nuevo que el frontend tenga que mandar o leer para este
comportamiento.** Es enteramente una decisión del backend, tomada automáticamente a partir de:

- El/los `modeOfPayment` que el frontend ya manda en `payments[]` (sin cambios de forma) — el
  backend internamente resuelve si ese método de pago es de tipo nativo "Cash" en ERPNext.
- El total de la factura o el monto asignado en el cobro (ya calculado por el backend).
- Si la compañía tiene configurada una cuenta contable de ajuste (`Company.writeOffAccount`, ver
  §4.4) — si no la tiene, el backend simplemente **no aplica** el ajuste y todo sigue funcionando
  como hoy (sin redondear en el cobro), sin ningún error visible.

El frontend sigue mandando `payments[]` exactamente igual que hoy, en los 3 endpoints mencionados
arriba, sin ningún campo adicional. No hay nada que agregar a ningún DTO de request.

### 4.4 Lo único a revisar/actualizar — la cuenta contable y el copy de un toggle existente

Para que este mecanismo tenga algo que absorber, el tenant necesita tener configurada la cuenta
`writeOffAccount` (**"Cuenta para ajuste de descuentos (write-off)"**) en `GET/PUT
/config/cuentas-empresa` — **este campo ya existe hoy** en esa pantalla (si ya la implementaste),
usado hasta ahora solo para ajustes de descuentos. A partir de este cambio, **la misma cuenta se
reutiliza también para absorber diferencias de redondeo al cobrar en efectivo** — no hay un campo
separado para esto, es la cuenta que ya está ahí.

**Recomendado (no bloqueante):** si tu pantalla de Configuración de Cuentas de Empresa muestra un
texto de ayuda para `writeOffAccount`, actualizalo para mencionar este segundo uso, algo como:

> *"Cuenta contable usada para absorber ajustes de descuentos y diferencias de redondeo al cobrar
> una factura 100% en efectivo."*

Y si tu pantalla de Configuración de Facturación muestra un texto de ayuda para el toggle
`redondeoTotalDeshabilitado` (que ya existe — no es nuevo), considerá agregar una aclaración:

> *"Si activás este toggle, la factura ya no se redondea automáticamente al crearla. Si luego se
> cobra 100% en efectivo, el sistema igual puede redondear el monto cobrado, absorbiendo la
> diferencia como un ajuste contable, sin modificar el total real de la factura."*

Ninguno de estos dos ajustes de copy es obligatorio para que la funcionalidad opere — son solo para
que un administrador entienda por qué configurar `writeOffAccount` importa ahora también para el
flujo de cobro, no solo para descuentos.

### 4.5 Qué NO hacer en el frontend

- **No calcules ni muestres tú mismo un "monto redondeado a cobrar"** distinto al que el backend
  calcula — seguí mostrando el total de la factura (`grandTotal`/`roundedTotal`) tal cual lo devuelve
  el backend, y seguí dejando que el cajero ingrese el monto que el cliente entrega en efectivo,
  exactamente como hoy. El ajuste de redondeo ocurre puertas adentro del backend al someter el pago,
  no es algo que el frontend tenga que anticipar o mostrar como un paso separado.
- **No agregues ninguna validación nueva de "el monto en efectivo debe ser múltiplo de 1 peso"** en
  el formulario de cobro — el backend acepta el monto que se le mande tal cual (con o sin
  centavos); es el propio backend el que decide si hace falta absorber una diferencia, no el
  frontend quien debe forzarla.
- **No toques el flujo de pago PARCIAL en POS** (cuando el cajero cobra una parte y el resto queda
  pendiente para completarse después en el mismo turno) — ese caso específico se dejó
  intencionalmente **sin cambios**, sigue redondeándose (o no) exactamente igual que hoy, según el
  toggle `redondeoTotalDeshabilitado` de siempre.
- **No toques el módulo de Pagos a proveedores (`/pagos`) ni el reembolso de Notas de Crédito** —
  ninguno de los dos está cubierto por este mecanismo, sin cambios.

---

## 5. Tabla resumen de errores nuevos

| # | HTTP | Endpoint | Mensaje | Cuándo aparece | Acción sugerida en UI |
|---|---|---|---|---|---|
| 1 | 400 | `PUT /config/facturacion` | `ncfTipoVentaDefault ("XYZ") no es un tipo de comprobante válido.` | Se guardó un código que no es ni un NCF físico ni electrónico reconocido | No debería poder pasar si el selector se pobló desde `GET /config/catalogos-fiscales` — validar en el cliente antes de enviar |
| 2 | 400 | `PUT /config/facturacion` | `No se puede configurar un tipo de comprobante electrónico (E0x) como default: este tenant no tiene facturación electrónica habilitada. Use el tipo físico equivalente ("B0X").` | Se intentó guardar un código `E0x` sin tener e-CF habilitado | No debería poder pasar si el selector se pobló con el catálogo correcto según `facturacionElectronicaHabilitada` — mostrar el mensaje tal cual si igual ocurre |
| 3 | 400 | `POST`/`PUT /invoices`, `POST /cotizaciones/:id/convert` | `No existe la plantilla de impuesto "ITBIS Exento" para esta compañía — el tenant no fue provisionado con el catálogo de cuentas RD. Contacte a soporte.` | Se sometió/actualizó una factura B14/E44 en un tenant sin el catálogo RD provisionado (caso raro) | Mostrar el mensaje, invitar a contactar soporte — no es un error de formulario |
| 4 | 400 | `GET /config/catalogos-fiscales` | Error estándar de validación (`class-validator`) sobre el campo `type` | Se mandó `?type=` con un valor distinto a `venta`/`compra` | No debería poder pasar — usar siempre uno de los dos valores exactos, en minúscula |

No hay errores nuevos para el cambio 4 (redondeo al cobro) — es transparente, ver §4.3.

---

## 6. Permisos

**No hay ninguna acción de permiso nueva que agregar.** Reutilizá exactamente las que ya usás:

| Acción | Controla |
|---|---|
| `config.facturacion.ver` | Ya gatea la lectura de `GET /config/facturacion` — suficiente para ver `ncfTipoVentaDefault` junto con el resto de la configuración |
| `config.facturacion.editar` | Ya gatea el botón "Guardar" de la pantalla de Configuración de Facturación — suficiente para editar `ncfTipoVentaDefault` |
| `config.ecf.ver` | Ya gatea la lectura de `GET /config/ecf` — usalo si necesitás leer `habilitado` para el gating del §1.3 sin pasar por `catalogos-fiscales` |
| `config.catalogos-fiscales.ver` | Ya gatea `GET /config/catalogos-fiscales` — sin cambios, cubre también las llamadas con `?type=` |
| `config.cuentas-empresa.ver` / `.editar` | Ya gatean la lectura/edición de `writeOffAccount` mencionada en §4.4 — sin cambios |
| (las que ya gatean crear/editar factura y convertir cotización) | Sin cambios — la lógica de B14/E44 (§2) y el redondeo al cobro (§4) corren para cualquier usuario que ya tenga permiso para crear/someter/cobrar una factura, sin ningún permiso adicional |

---

## 7. Qué NO hacer / decisiones ya tomadas — no toques estas pantallas ni asunciones

- **No conviertas el default de §1 en algo restrictivo.** El backend nunca rechaza una factura por
  tener un `ncfType` distinto al `ncfTipoVentaDefault` configurado — es solo una sugerencia de UI.
  No agregues ninguna validación de cliente que lo impida.
- **No intentes "traducir" tú mismo un código físico a electrónico o viceversa** en el frontend
  para el campo `ncfTipoVentaDefault` — mandá siempre el valor tal cual viene del selector (poblado
  desde el catálogo correcto, ver §1.3), y dejá que el backend decida qué aceptar y cómo
  normalizarlo internamente.
- **No agregues un selector de impuestos "forzado a 0%" ni ningún control manual para B14/E44** —
  simplemente ocultá/deshabilitá el selector normal de impuestos cuando el NCF sea B14/E44 (§2.2).
  No hay ninguna forma de que el usuario "elija" un impuesto distinto de 0 para ese comprobante.
- **No implementes ningún cálculo propio de redondeo en el frontend** para el cambio 4 — ni al
  mostrar el total de la factura, ni al armar el payload de cobro. Mostrá siempre los totales tal
  cual los devuelve el backend.
- **No agregues lógica nueva para el pago parcial de POS** relacionada al redondeo — ese caso queda
  fuera de alcance de este cambio a propósito (§4.5).
- **No toques el módulo de Cobros sueltos fuera del flujo de una factura puntual, Pagos a
  proveedores, ni reembolsos de Notas de Crédito** salvo por el comportamiento de redondeo
  transparente ya descrito en §4.2 para `POST /cobros` — el resto de esos módulos no tiene cambios.

---

## 8. Checklist de implementación

**Cambio 1 — NCF default de venta:**
- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado.
- [ ] `GET /config/facturacion` — leído y cacheado `ncfTipoVentaDefault` junto con el resto de la
      configuración que ya leías.
- [ ] Selector nuevo "Tipo de Comprobante por Defecto" en Configuración de Facturación, poblado con
      el mismo catálogo que ya usás para el selector de NCF en Nueva Factura (`GET
      /config/catalogos-fiscales`, opcionalmente con `?type=venta`).
- [ ] Guardado con `PUT /config/facturacion` mandando solo `ncfTipoVentaDefault` (o `""` para
      quitarlo).
- [ ] Manejo de los 2 errores 400 de §5 (#1 y #2) en el formulario de Configuración.
- [ ] Pantalla de Nueva Factura: preselección de `ncfTipoVentaDefault` para cliente ocasional, con
      la prioridad correcta frente a `Customer.ncfTypeDefault` (§1.5).
- [ ] Refetch de `GET /config/facturacion` después de un `PUT /config/ecf` exitoso que habilite
      e-CF, para reflejar la migración automática a electrónico (§1.4).

**Cambio 2 — B14/E44 sin impuestos:**
- [ ] En Nueva/Editar Factura: ocultar/deshabilitar selector(es) de impuestos (documento y por
      artículo) cuando el NCF elegido es `B14` o `E44`.
- [ ] Mostrar el texto de aviso sugerido en §2.2 cuando se selecciona B14/E44.
- [ ] Recalcular el preview de totales en el cliente a impuesto `0` cuando el NCF sea B14/E44, y
      restaurar el cálculo normal si el usuario cambia a otro tipo antes de guardar.
- [ ] Misma lógica aplicada al selector de tipo de comprobante en la conversión de Cotización →
      Factura (`POST /cotizaciones/:id/convert?ncfType=...`).
- [ ] Manejo del error 400 de §5 (#3) — mensaje de "contactar soporte", no tratado como error de
      formulario.

**Cambio 3 — filtro `type` en catálogos fiscales (opcional):**
- [ ] (Opcional) Agregado `?type=venta` en las pantallas que solo necesitan el catálogo de venta.
- [ ] (Opcional) Agregado `?type=compra` en las pantallas que solo necesitan el catálogo de compra.
- [ ] Confirmado que las pantallas que no se tocaron siguen funcionando igual (comportamiento
      default sin el parámetro no cambió).

**Cambio 4 — redondeo al cobro (mayormente transparente):**
- [ ] Confirmado que NO se agregó ningún campo nuevo a los payloads de `POST /invoices/:id/submit`,
      `POST /caja/facturas/:id/completar-cobro` ni `POST /cobros` — siguen mandando `payments[]`
      exactamente igual que antes.
- [ ] (Recomendado, no bloqueante) Actualizado el texto de ayuda de `writeOffAccount` en
      Configuración de Cuentas de Empresa (§4.4).
- [ ] (Recomendado, no bloqueante) Actualizado el texto de ayuda del toggle
      `redondeoTotalDeshabilitado` en Configuración de Facturación (§4.4).
- [ ] Confirmado que el flujo de pago parcial en POS no se tocó.
