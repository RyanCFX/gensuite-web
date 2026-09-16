# Prompt para el agente de frontend — Hacer configurable si una compra actualiza el costo del artículo

Copia y pega este prompt completo al agente de frontend.

---

## Contexto — qué se corrigió/agregó en el backend

Se reportó: *"Creo un artículo con Costo de Valoración en $1000, pero después registro una compra
a $1500, y el Costo de Valoración se actualiza a $1500 — esto está bien, pero debería ser
configurable si esto se va a actualizar o no."*

Al investigar se confirmó que **esto NO era configurable en absoluto**: cada vez que se sometía
una compra (`POST /compras/:id/submit`), el backend actualizaba `Item.valuation_rate` (el "Costo
de Valoración"/"Precio de compra" que ves en el catálogo) con la tasa de esa compra,
**incondicionalmente, sin ningún interruptor para desactivarlo** — ni por empresa ni por
artículo. El comentario del propio código decía "independiente del modo de precio", lo cual era
cierto pero engañoso: esa frase se refería a que el recálculo del PRECIO DE VENTA en modo "sobre
costo" (`cost_plus`) sí es configurable por artículo desde siempre — pero la actualización del
COSTO en sí (`valuation_rate`) nunca lo fue, y es un concepto totalmente distinto.

**No confundas las dos cosas** — son dos configuraciones independientes que ya convivían de forma
confusa, y ahora hay una tercera pieza nueva:

1. **`priceMode` del artículo** (`'manual'` | `'cost_plus'`) — YA EXISTÍA, no cambió. Decide si el
   PRECIO DE VENTA (A/B/C) se recalcula automáticamente aplicando un margen sobre el costo, o si
   el usuario lo digita a mano. Esto ya era configurable por artículo y sigue funcionando
   exactamente igual — no hay nada que tocar en la UI que ya exista para esto.

2. **`actualizarCostoEnCompra` — NUEVO, a nivel de configuración de la empresa (tenant)**. Decide
   si, por defecto, registrar una compra actualiza el `valuation_rate`/"Costo de Valoración" del
   artículo comprado. Viene con `true` por defecto (o sea: **ningún tenant existente cambia de
   comportamiento** a menos que alguien lo desactive explícitamente — la migración del backend ya
   se encargó de esto).

3. **`actualizarCostoEnCompraOverride` — NUEVO, a nivel de artículo individual**. Permite que un
   artículo puntual se salga del comportamiento por defecto del tenant, en cualquier dirección:
   forzar que SÍ actualice su costo aunque el tenant lo tenga desactivado, o forzar que NUNCA lo
   actualice aunque el tenant lo tenga activado (por ejemplo, un artículo importado cuyo costo se
   fija a propósito a una tasa de cambio específica y no debe moverse con cada compra local).

**Precedencia** (idéntico al patrón que probablemente ya conozcas de otros overrides
tenant→artículo en este sistema): el override del artículo, si está seteado, **siempre gana**
sobre el default del tenant. Si el artículo no tiene override (`''`/ausente), se usa el default
del tenant.

Antes de implementar, abre `openapi.json` y localiza los endpoints y campos exactos listados abajo
— confirma ahí los tipos, nullability y ejemplos. Lo que sigue acá es la explicación funcional
completa del comportamiento, para que no quede ambigüedad sobre qué hace cada pieza y cómo se
relacionan entre sí.

---

## 1. Configuración a nivel de empresa (tenant)

### `GET /config/facturacion`

La respuesta ahora incluye un campo booleano nuevo, junto a los demás ajustes de facturación que
ya lee esta pantalla (`requiereSerialLoteCompra`, `despachoHabilitado`, etc.):

```json
{
  "actualizarCostoEnCompra": true
}
```

- `true` (default): comprar un artículo actualiza su `valuation_rate` con la tasa de esa compra —
  comportamiento de siempre, sin cambios visibles para un tenant que no toque este ajuste.
- `false`: comprar un artículo **ya no** actualiza automáticamente su costo. El costo del artículo
  se queda fijo en lo que tenga guardado hasta que alguien lo edite a mano (o hasta que un
  artículo puntual tenga su propio override que lo reactive — ver sección 2).

### `PUT /config/facturacion`

Acepta el mismo campo como parte del body parcial (igual que el resto de los toggles de esta
pantalla — solo se envía si el usuario lo tocó, no hace falta reenviar todo el objeto):

```json
{
  "actualizarCostoEnCompra": false
}
```

**Dónde ponerlo en la UI**: en la pantalla de Configuración → Facturación (o donde sea que hoy
vive el ajuste "Requiere Serial/Lote al Comprar" — son conceptualmente hermanos, ambos afectan el
flujo de Compras), agregar un switch/checkbox:

> **Actualizar costo del artículo al comprar**
> Si está activo, cada compra sometida actualiza el "Costo de Valoración" del artículo con el
> precio de esa compra. Si lo desactivas, el costo se mantiene fijo hasta que lo edites
> manualmente — útil si prefieres controlar el costo de tus artículos a mano en vez de que se
> mueva con cada compra.

No afecta el cálculo de precio de venta en modo "sobre costo" — aclara esto en el texto de ayuda
si tu UI ya tiene contexto de esa otra configuración cerca, para que el usuario no piense que
desactivar esto también congela sus precios de venta (no lo hace: el precio "sobre costo" sigue
recalculándose con la tasa de cada compra, tal como funcionaba antes — ver nota al final de la
sección 3 si necesitas el detalle exacto).

---

## 2. Override a nivel de artículo individual

### Campo nuevo: `actualizarCostoEnCompraOverride`

Tipo: `'' | 'si' | 'no'` (string, no booleano — es un tri-estado). Aparece en:

| Endpoint | Uso |
|---|---|
| `POST /catalog/items` | Crear un artículo con override explícito desde el inicio (opcional) |
| `PUT /catalog/items/:id` | Editar el artículo completo — cambiar o quitar el override |
| `PUT /catalog/items/:id/precios` | Endpoint dedicado a precios/costos — también acepta este campo, útil si tu UI ya usa este endpoint más liviano para la pantalla de "editar precios" en vez del PUT completo del artículo |
| `GET /catalog/items/:id` (detalle) | Devuelve el override actual del artículo, si tiene alguno |

Significado de cada valor:

- **Ausente / no enviado** (en una edición): no toca el override actual — igual que el resto de
  los campos opcionales de estos DTOs.
- **`''` (string vacío) enviado explícitamente**: quita el override — el artículo vuelve a usar el
  default del tenant. Es la forma de "resetear a automático" desde la UI.
- **`'si'`**: este artículo SIEMPRE actualiza su costo al comprarse, sin importar lo que diga el
  toggle del tenant.
- **`'no'`**: este artículo NUNCA actualiza su costo al comprarse automáticamente, sin importar lo
  que diga el toggle del tenant.

En la respuesta de `GET /catalog/items/:id`, el campo viene como `'si' | 'no' | undefined`
(nunca `''` — si no hay override, el campo simplemente no viene, tal como el resto de los campos
opcionales de este DTO, por ejemplo `maxDiscountPct`).

### Dónde ponerlo en la UI

En el formulario de artículo (crear/editar), cerca de donde ya está el selector de `priceMode`
("Modo de Precio: Manual / Sobre Costo") — son ajustes relacionados y el usuario probablemente
quiera verlos juntos. Sugerido: un selector de 3 opciones (no un checkbox, porque el "sin
override" es un tercer estado real, no equivalente a "no"):

```
Actualizar costo al comprar:
  ( ) Usar configuración de la empresa   ← default, equivale a enviar '' o no tocar el campo
  ( ) Sí, siempre actualizar
  ( ) No, nunca actualizar
```

- Si el usuario selecciona "Usar configuración de la empresa" sobre un artículo que ya tenía un
  override puesto, el frontend debe enviar `actualizarCostoEnCompraOverride: ''` explícitamente
  (no omitir el campo) para que el backend efectivamente lo borre — omitirlo en una edición no
  cambia nada, según la regla de "ausente = no tocar" de arriba.
- Mostrar, junto al selector, el default actual del tenant entre paréntesis para dar contexto sin
  que el usuario tenga que ir a otra pantalla a revisarlo — por ejemplo: "Usar configuración de la
  empresa (actualmente: **activado**)". Esto requiere que la pantalla de artículo tenga a mano el
  valor de `GET /config/facturacion → actualizarCostoEnCompra` (probablemente ya cacheado/en
  contexto global si tu app ya lo usa en otro lado).

---

## 3. Cómo se resuelve el comportamiento final (para tu propio entendimiento, no hace falta que lo calcules en frontend)

El backend resuelve el valor efectivo así, en este orden — **puramente informativo**, esta lógica
vive del lado del servidor y no hace falta replicarla en el cliente, pero entenderla ayuda a saber
qué esperar al probar:

```
si (artículo.actualizarCostoEnCompraOverride === 'si') → SIEMPRE actualiza
si (artículo.actualizarCostoEnCompraOverride === 'no') → NUNCA actualiza
si no → usa el default del tenant (actualizarCostoEnCompra)
```

**Nota sobre el precio de venta "sobre costo" (`cost_plus`)**: esta configuración nueva
(`actualizarCostoEnCompra`/override) SOLO afecta si `Item.valuation_rate` se sincroniza con la
compra. El recálculo del precio de venta en modo `cost_plus` sigue exactamente igual que antes —
sigue usando la tasa de la compra recién sometida para calcular A/B/C con los márgenes
configurados, **incluso si el costo mostrado (`valuation_rate`) no se actualizó** por tener esta
nueva configuración desactivada. Esto es intencional (así se decidió el alcance del fix): son dos
mecanismos independientes y el segundo no cambió. Si al probar ves que el precio de venta se
recalculó mientras el "Costo de Valoración" se quedó igual, eso es el comportamiento esperado, no
un bug — no lo reportes como inconsistencia.

Esta actualización de costo (y el eventual recálculo del precio de venta en modo `cost_plus`)
ocurre de forma asíncrona/en segundo plano tras someter la compra (`POST /compras/:id/submit`) —
no esperes ver el nuevo costo reflejado en la MISMA respuesta del submit; si tu UI muestra el
costo del artículo justo después de someter una compra, puede que necesites refrescar esa
información (o esperar un instante y re-consultar `GET /catalog/items/:id`) para verlo
actualizado. Esto ya era así antes de este cambio — no es un comportamiento nuevo, solo lo
mencionamos para que no se interprete como una regresión al probar.

---

## Checklist de verificación

1. `GET /config/facturacion` muestra `actualizarCostoEnCompra` y la pantalla de configuración
   tiene un switch para editarlo vía `PUT /config/facturacion`.
2. Con el switch del tenant **activado** y un artículo **sin override**: comprar el artículo a un
   precio distinto actualiza su "Costo de Valoración" (comportamiento de siempre).
3. Con el switch del tenant **desactivado** y un artículo **sin override**: comprar el artículo NO
   cambia su "Costo de Valoración" (verificar refrescando el detalle del artículo tras la compra).
4. Un artículo con override `'si'` actualiza su costo al comprarse **aunque el switch del tenant
   esté desactivado**.
5. Un artículo con override `'no'` **no** actualiza su costo al comprarse aunque el switch del
   tenant esté activado.
6. Seleccionar "Usar configuración de la empresa" sobre un artículo que tenía un override previo
   envía `actualizarCostoEnCompraOverride: ''` (no omite el campo) y el artículo vuelve a seguir
   el default del tenant en la siguiente compra.
7. El selector de override en el formulario de artículo muestra correctamente el estado actual al
   editar un artículo que ya tiene `'si'` o `'no'` guardado (`GET /catalog/items/:id`).
8. El selector de `priceMode` ("Modo de Precio: Manual / Sobre Costo") sigue funcionando exacto
   igual que antes — no se tocó ni se mezcló con este nuevo ajuste.
9. Contrastado contra `openapi.json` actualizado para los tipos exactos de los 4 endpoints
   listados en la sección 2.
