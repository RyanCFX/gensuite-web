# Implementación de permisos en el frontend

> **Para quien recibe este documento:** describe todo lo que el frontend debe hacer para
> ocultar vistas y botones según los permisos de cada usuario. El backend ya está implementado
> y desplegable; acá no hay nada que negociar con backend salvo lo que se marca explícitamente
> como *pendiente*.
>
> En el repo del frontend hay un archivo con la documentación completa y actualizada del API.
> Este documento **no la reemplaza**: usalo junto con ella. Acá está el contrato de permisos y
> las reglas de UI; ahí está el detalle de cada endpoint de negocio.

---

## 1. Qué problema resuelve esto

Hoy el frontend muestra todas las pantallas y todos los botones a todos los usuarios. Cuando
alguien no tiene permiso, se entera **después** de hacer clic, con un error del servidor a mitad
de una operación.

El objetivo es que la UI refleje lo que el usuario puede hacer **antes** de que lo intente:

- Un vendedor no ve el módulo de Contabilidad en el menú.
- Un cajero ve la factura pero no el botón "Anular".
- Quien registra gastos no ve la pantalla de Compras, aunque ambas usen el mismo documento
  por debajo.

**Importante:** esconder un botón **no es seguridad**, es usabilidad. La seguridad ya la aplica
el servidor en cada llamada (ver §2). Si el frontend se equivoca y muestra un botón de más, el
servidor devuelve 403 y no pasa nada grave. Si esconde uno de menos, el usuario se queja. Optá
siempre por la exactitud, pero no construyas lógica de seguridad en el cliente.

---

## 2. Modelo mental: quién decide qué

Hay tres capas. El frontend solo consume la tercera.

| Capa | Dónde vive | Qué hace |
|---|---|---|
| **DocPerm de ERPNext** | El servidor ERPNext del tenant | Decide de verdad. El token del usuario lleva sus propias credenciales de ERPNext, así que **cada llamada se evalúa contra sus permisos reales** |
| **Perfiles de rol** | Provisioning del backend | Determinan qué roles tiene cada persona (Ventas, Compras, Gastos, Inventario, Contabilidad, Cajero POS, Administrador) |
| **Catálogo de acciones** | El BFF, expuesto vía API | Traduce "permiso sobre un documento" a **identificadores de botón** que el frontend entiende |

El frontend nunca razona sobre DocTypes ni sobre roles. Razona sobre **acciones**:
`ventas.factura.someter`, `catalogo.items.crear`, `tesoreria.emision.anular`. Hay **368**, sobre
113 pantallas.

---

## 3. Los dos niveles de permisos

Esta es la parte que hay que entender bien, porque usar el nivel equivocado produce bugs sutiles.

### Nivel 1 — Sesión

`GET /api/v1/me/permissions`

Devuelve, para el usuario autenticado, **un booleano por cada una de las 368 acciones**. Se pide
**una vez al iniciar sesión** y se guarda en memoria.

Sirve para todo lo que no depende de un documento concreto:

- Qué entradas del menú se muestran
- A qué rutas puede navegar
- El botón "Nuevo" de una pantalla de listado
- Botones de acciones masivas

### Nivel 2 — Documento

`GET /api/v1/me/permissions/:doctype/:name`

Devuelve los permisos **evaluados sobre un documento específico**. Es más caro (una llamada por
documento) pero es el único que sabe cosas que dependen del documento:

- Reglas de "solo el dueño puede" (`if_owner`)
- Restricciones por sucursal, almacén o compañía (User Permissions)
- Validaciones propias del tipo de documento

Se pide **al abrir una pantalla de detalle**, junto con el documento. Sirve para los botones de
esa pantalla: Editar, Someter, Anular, Enmendar, Eliminar.

### Cuál usar

| Situación | Nivel |
|---|---|
| Menú lateral, navegación, rutas | 1 |
| Botón "Nuevo" en un listado | 1 |
| Columna de acciones en una fila de listado | 1 (aproximación aceptable) |
| Botones de una pantalla de detalle | **2** |
| Confirmar antes de una acción destructiva | **2** |

Para los listados el nivel 1 es una aproximación aceptable: si por `if_owner` el usuario no
puede editar *esa* fila, el botón aparece y el servidor devuelve 403. Es un caso de borde y no
justifica una llamada por fila. En el detalle, en cambio, usá siempre el nivel 2.

---

## 4. Contrato de la API

Todas las respuestas del BFF vienen envueltas. **Éxito:**

```json
{ "success": true, "data": { ... } }
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "PERMISO_INSUFICIENTE",
    "message": "No tiene permiso para \"Someter\" en Detalle de Factura.",
    "statusCode": 403,
    "details": { ... }
  }
}
```

Todos los endpoints requieren:

```
Authorization: Bearer <jwt>
X-Tenant: <slug del tenant>
```

### 4.1 `GET /api/v1/me/permissions`

```json
{
  "success": true,
  "data": {
    "email": "maria@empresa.com",
    "vertical": "general",
    "roles": ["Accounts User", "All", "Desk User", "Gastos RD", "Purchase User"],
    "doctypes": {
      "Purchase Invoice": { "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "amend": 1, "print": 1 },
      "Item":             { "read": 1, "report": 1, "print": 1, "select": 1 },
      "Sales Invoice":    { "read": 1, "write": 1, "create": 1, "submit": 1 }
    },
    "acciones": {
      "gastos.crear": true,
      "gastos.someter": true,
      "compras.factura.crear": false,
      "catalogo.items.crear": false,
      "ventas.factura.someter": true
    }
  }
}
```

**Campos:**

- `email` — usuario autenticado.
- `vertical` — `"general"` o `"farmacia"`. **No es parte del sistema de permisos** — es una
  propiedad del TENANT, no del usuario, y no varía según quién pregunte. Gatea pantallas
  enteras que solo existen para el vertical de farmacia (venta de medicamentos, cobertura ARS):
  si `vertical !== "farmacia"`, ni siquiera mostrés esas rutas en el menú, sin importar qué diga
  `acciones` — el backend las rechaza con un mecanismo aparte (`VerticalGuard`) que no tiene
  nada que ver con roles ni con `DocPerm`.
- `roles` — roles de ERPNext. **No los uses para decidir la UI de negocio.** Decidir por rol
  es exactamente el error que este sistema viene a eliminar: los roles de ERPNext no heredan
  entre sí y razonar sobre ellos produce huecos. La ÚNICA excepción legítima son las pantallas de
  **meta-administración** (§15) que el propio backend gatea por rol y no por acción — ej.
  mostrar "Administrar roles y permisos" o "Conectar Aura (e-CF)" solo si `roles` incluye
  `'System Manager'`. Fuera de esos casos puntuales, no lo uses.
- `doctypes` — flags crudos por tipo de documento. Solo aparecen los flags **otorgados**; un
  flag ausente significa "no". Un DocType ausente significa "ningún permiso". Úsalo solo si
  necesitás una regla que el catálogo no cubre.
- `acciones` — **esto es lo que se usa el 99% del tiempo.** Siempre trae las 368 claves, cada
  una `true` o `false`. Nunca falta una: si no aparece, es un bug del backend, no un permiso
  denegado.

### 4.2 `GET /api/v1/me/permissions/:doctype/:name`

`doctype` va con su nombre real de ERPNext, URL-encoded (`Sales%20Invoice`).

```
GET /api/v1/me/permissions/Sales%20Invoice/ACC-SINV-2026-00042
```

```json
{
  "success": true,
  "data": {
    "doctype": "Sales Invoice",
    "name": "ACC-SINV-2026-00042",
    "permisos": {
      "read": 1, "write": 1, "create": 1, "submit": 1,
      "cancel": 0, "amend": 0, "delete": 0, "print": 1
    }
  }
}
```

`permisos` son los 14 flags de ERPNext, ya evaluados sobre ese documento. Un flag ausente o en
`0` significa "no puede".

### 4.3 Endpoints de administración de permisos

Solo para las pantallas de administración. Todos exigen que el usuario tenga el rol
`System Manager`; si no lo tiene, devuelven 403.

| Endpoint | Qué hace |
|---|---|
| `GET /api/v1/roles/perfiles` | Perfiles disponibles y qué roles agrupa cada uno |
| `GET /api/v1/roles` | Roles del tenant |
| `GET /api/v1/permisos?doctype=&role=` | Reglas de permiso actuales |
| `GET /api/v1/permisos/catalogo` | DocTypes y roles para armar reglas |
| `POST /api/v1/permisos` | Crear una regla |
| `PUT /api/v1/permisos` | Cambiar un flag |
| `DELETE /api/v1/permisos` | Borrar una regla |

`GET /api/v1/roles/perfiles` devuelve:

```json
{
  "success": true,
  "data": [
    { "nombre": "Administrador", "roles": ["System Manager", "Item Manager", "..."] },
    { "nombre": "Cajero POS",    "roles": ["Cajero POS", "Sales User", "Accounts User"] },
    { "nombre": "Compras",       "roles": ["Purchase User", "Purchase Manager", "Accounts User", "Compras RD"] },
    { "nombre": "Contabilidad",  "roles": ["Accounts User", "Accounts Manager", "Compras RD", "Gastos RD"] },
    { "nombre": "Gastos",        "roles": ["Purchase User", "Accounts User", "Gastos RD"] },
    { "nombre": "Inventario",    "roles": ["Stock User", "Stock Manager", "Item Manager"] },
    { "nombre": "Ventas",        "roles": ["Sales User", "Sales Manager", "Accounts User"] }
  ]
}
```

---

## 5. Ciclo de vida en el frontend

### 5.1 Al iniciar sesión

```ts
const { data } = await api.get('/me/permissions');
permisosStore.set(data);          // { email, roles, doctypes, acciones }
```

Hacelo **antes** de renderizar el layout principal. Si la app pinta el menú antes de tener los
permisos, se ve un parpadeo de opciones que después desaparecen — peor que esperar.

Mostrá un estado de carga hasta que la respuesta llegue. Si falla, **no asumas permisos**:
mostrá un error y ofrecé reintentar. Asumir `true` expone botones que fallarán; asumir `false`
deja al usuario con una app vacía sin explicación. Un error explícito es mejor que ambos.

### 5.2 Durante la sesión

Guardá el objeto en memoria (contexto de React, store, lo que use el proyecto). **No hace falta
volver a pedirlo**: los permisos de un usuario no cambian mientras trabaja.

Volvé a pedirlo cuando:

- El usuario recarga la app
- Un administrador cambia permisos desde la pantalla de administración (refrescá al salir de
  esa pantalla)
- El servidor devuelve un 403 con `code: "PERMISO_INSUFICIENTE"` en una acción que el frontend
  creía permitida — señal de que la caché quedó vieja

No lo guardes en `localStorage`. Es información derivada, barata de volver a pedir, y
persistirla crea el riesgo de mostrar permisos viejos tras un cambio.

### 5.3 Al cerrar sesión

Limpiá el store. Si no, un segundo usuario en el mismo navegador puede ver por un instante la
UI del anterior.

---

## 6. Esconder vistas

Cada ruta del frontend se asocia a **una acción de lectura**. Si el usuario no la tiene:

- La entrada **no se renderiza** en el menú
- La ruta **redirige** a una pantalla de "sin acceso" o al dashboard
- No basta con esconder el menú: alguien puede pegar la URL

```ts
const RUTAS = {
  '/facturas':        'ventas.factura.listar',
  '/compras':         'compras.factura.listar',
  '/gastos':          'gastos.listar',
  '/catalogo/items':  'catalogo.items.listar',
  '/inventario':      'inventario.stock.consultar',
  '/contabilidad':    'contabilidad.asientos.listar',
  // ...
};
```

Un módulo del menú con varias pantallas se muestra si el usuario puede ver **al menos una**:

```ts
const puedeVerCompras =
  can('compras.factura.listar') ||
  can('compras.orden.listar') ||
  can('compras.solicitud.listar') ||
  can('compras.recepcion.listar');
```

Un módulo cuyas sub-pantallas están todas denegadas no debe aparecer como carpeta vacía.

Las pantallas exclusivas del vertical Farmacia se esconden con una condición aparte, **antes**
de siquiera consultar `acciones`:

```ts
const puedeVerFarmacia = data.vertical === 'farmacia'; // no es un permiso, es del tenant
```

---

## 7. Esconder botones

### 7.1 En listados — nivel 1

```tsx
{can('ventas.factura.crear') && <Boton onClick={nueva}>Nueva factura</Boton>}
```

### 7.2 En pantallas de detalle — nivel 2

Al abrir el detalle, pedí el documento y sus permisos en paralelo:

```ts
const [doc, perms] = await Promise.all([
  api.get(`/invoices/${id}`),
  api.get(`/me/permissions/Sales Invoice/${id}`),
]);
```

Y combiná permiso con estado (§8).

### 7.3 Esconder o deshabilitar

- **Esconder** cuando el usuario nunca va a poder hacerlo (no tiene el permiso). Un botón
  permanentemente gris es ruido.
- **Deshabilitar con tooltip** cuando el permiso existe pero el **estado** no lo permite
  ("Ya está sometida", "Ya fue anulada"). Ahí sí conviene explicar.

Regla práctica: **falta de permiso → esconder. Estado incorrecto → deshabilitar y explicar.**

---

## 8. La regla más importante: permiso **Y** estado

**El endpoint de nivel 2 no mira el estado del documento.** Sobre una factura ya sometida sigue
devolviendo `submit: 1`, porque el permiso existe — lo que no aplica es el estado.

Todo documento de ERPNext tiene `docstatus`:

| `docstatus` | Estado | Significado |
|---|---|---|
| `0` | Borrador | Editable, se puede someter o eliminar |
| `1` | Sometido | Inmutable. Solo se puede anular o imprimir |
| `2` | Anulado | Terminal. Solo se puede enmendar (crea uno nuevo) o imprimir |

La visibilidad de cada botón es **permiso AND estado**:

| Botón | Permiso | Estado requerido |
|---|---|---|
| Editar | `write` | `docstatus === 0` |
| Eliminar | `delete` | `docstatus === 0` |
| Someter | `submit` | `docstatus === 0` |
| Anular | `cancel` | `docstatus === 1` |
| Enmendar | `amend` | `docstatus === 2` |
| Imprimir / PDF | `print` | cualquiera |
| Ver asientos | `read` de Journal Entry | `docstatus === 1` |

```tsx
const puedeSomerter = perms.submit === 1 && doc.docstatus === 0;
const puedeAnular   = perms.cancel === 1 && doc.docstatus === 1;
const puedeEnmendar = perms.amend  === 1 && doc.docstatus === 2;
```

Olvidar la mitad del estado es el error más frecuente: produce un botón "Someter" en una factura
ya sometida, que falla siempre.

---

## 9. Manejo del 403

Aunque la UI esté bien, un 403 puede llegar: la caché quedó vieja, un administrador cambió algo,
o el caso de borde de `if_owner` en un listado. **Manejalo siempre.**

```json
{
  "success": false,
  "error": {
    "code": "PERMISO_INSUFICIENTE",
    "message": "No tiene permiso para \"Someter\" en Detalle de Factura.",
    "statusCode": 403,
    "details": {
      "acciones": ["ventas.factura.someter"],
      "requiere": [{ "doctype": "Sales Invoice", "ptype": "submit" }],
      "marcadores": []
    }
  }
}
```

- `message` ya viene **en español y nombra el botón y la pantalla**. Mostralo tal cual; no lo
  reescribas.
- `details.acciones` — qué acciones faltaron. Útil para refrescar `/me/permissions` y corregir
  la UI sin recargar.
- `details.requiere` — qué permiso de ERPNext hace falta. Mostralo solo a administradores.
- `details.marcadores` — roles marcadores faltantes (ver §11).

Al recibir un `PERMISO_INSUFICIENTE`, refrescá `/me/permissions` en segundo plano: si la caché
estaba vieja, la UI se corrige sola.

Distinguí dos códigos distintos:

| Código | Significa | Qué hacer |
|---|---|---|
| `PERMISO_INSUFICIENTE` | El BFF frenó la acción antes de empezar | Mostrar el mensaje, refrescar permisos |
| `FORBIDDEN` | Vino de ERPNext, más abajo | Mostrar el mensaje; puede ser un permiso más fino |

Un `401` con token expirado es otra cosa: ahí se cierra sesión.

> **Corrección post-entrega (2026-09-10):** la primera versión de este documento describía el
> endpoint de nivel 2 correctamente, pero el servidor tenía un defecto que lo hacía mentir en la
> práctica — devolvía `write: 1`/`submit: 1` para restricciones como Compras/Gastos, sin
> evaluarlas. Ya está corregido en el backend; si tu implementación es anterior a esta fecha y
> viste botones habilitados que el servidor después rechazaba, no era un bug del frontend.

---

## 10. Utilidades sugeridas

```ts
// permisos.ts
type Acciones = Record<string, boolean>;

export function crearCan(acciones: Acciones) {
  return function can(...ids: string[]): boolean {
    // Varias acciones = AND, igual semántica que el backend.
    return ids.every((id) => acciones[id] === true);
  };
}
```

```tsx
// <Permitido> — envoltorio declarativo
<Permitido accion="ventas.factura.crear">
  <Boton onClick={nueva}>Nueva factura</Boton>
</Permitido>

// con fallback
<Permitido accion="contabilidad.asientos.crear" fallback={<MensajeSinAcceso />}>
  <FormularioAsiento />
</Permitido>
```

**Validá los identificadores en desarrollo.** Un typo en `can('ventas.factura.sometter')`
devuelve `false` en silencio y esconde un botón para siempre. En modo desarrollo, si el id no
existe en `acciones`, lanzá o registrá un error ruidoso.

Lo ideal es generar un tipo a partir de las claves de `acciones` para que el compilador atrape
los typos.

---

## 11. Marcadores: Compras vs. Gastos

Un caso especial que hay que entender para no confundirse.

Una **compra** y un **gasto** son el mismo tipo de documento en ERPNext. Se distinguen por un
campo, no por su tipo. Por eso el permiso normal no puede separarlos, y se usan dos **roles
marcadores**: `Compras RD` y `Gastos RD`.

Para el frontend esto es **transparente**: las acciones `compras.factura.*` y `gastos.*` ya
vienen resueltas en `acciones`, con el marcador considerado. No hay nada especial que hacer.

Lo único a tener en cuenta:

- Un usuario con perfil **Gastos** verá `gastos.crear: true` y `compras.factura.crear: false`.
- Un usuario con **ambos marcadores** (o **ninguno**) ve las dos en `true`. "Ninguno" significa
  "sin restricción" a propósito, para no romper usuarios que ya existían.
- En los **listados**, el servidor ya filtra: un usuario de Gastos que pida
  `GET /compras` recibe solo gastos. **No filtres de nuevo en el cliente**, y no te alarmes si
  el listado viene más corto de lo esperado.
- La restricción **solo aplica a modificar**, no a leer un documento suelto. Un usuario de
  Gastos que abra la URL de una compra puede verla, pero no editarla. Si querés, escondé la
  navegación; no hace falta bloquear la vista.

---

## 12. Administración de usuarios y permisos

### 12.1 Asignar permisos a un usuario

**Usá perfiles, no roles sueltos.**

```http
POST /api/v1/usuarios
{
  "email": "maria@empresa.com",
  "firstName": "María",
  "perfiles": ["Ventas"]
}
```

```http
PUT /api/v1/usuarios/maria@empresa.com
{ "perfiles": ["Ventas", "Cajero POS"] }
```

Reglas que la UI debe respetar:

1. **`perfiles` y `roles` son excluyentes.** Enviar los dos devuelve 400. El formulario debe
   ofrecer un modo u otro, no ambos a la vez.
2. **Los perfiles son autoritativos, no aditivos.** Asignar un perfil **elimina** del usuario
   todo rol que no pertenezca a él. Para combinar responsabilidades se asignan **varios
   perfiles**, nunca un perfil más un rol suelto.
3. Por lo anterior, **advertí antes de guardar** cuando el usuario ya tenía roles que se van a
   perder. Compará los roles actuales contra la unión de los perfiles elegidos y mostrá la
   diferencia. Es un cambio destructivo y silencioso si no se avisa.
4. El modo de roles sueltos debe quedar como opción avanzada, para combinaciones que ningún
   perfil cubre.

### 12.2 Pantalla de permisos por rol

Con `GET /api/v1/permisos/catalogo` y `GET /api/v1/permisos` se puede construir una matriz
DocType × Rol con los 14 flags. Solo para `System Manager`.

Al salir de esa pantalla, **refrescá `/me/permissions`**: el administrador pudo haberse cambiado
sus propios permisos.

---

## 13. Límites conocidos

Cosas que este sistema **no** cubre. No intentes suplirlas en el cliente.

1. **No hay permisos a nivel de campo.** No se puede decir "este usuario ve la factura pero no
   la columna de costo". Si hace falta, es trabajo de backend.
2. **`docstatus` es responsabilidad del frontend.** El backend informa permisos, no estados.
3. **Los listados vienen filtrados por el servidor.** Nunca filtres de nuevo por permisos en el
   cliente: duplicarías lógica y la tuya sería la incorrecta.
4. **Esconder no es proteger.** Todo lo que el frontend esconde sigue siendo alcanzable por API.
   Está bien: el servidor lo bloquea.
5. **Un puñado de rutas son autoservicio puro y no tienen acción en el catálogo** — ej.
   `GET/PUT /config/perfil` (el usuario edita su propio perfil) o
   `GET/PUT /impresoras/mi-seleccion` (qué impresora eligió para sí mismo). No busques un id de
   acción para ellas en `acciones`: no existe, a propósito. Mostralas siempre a cualquier usuario
   autenticado — el servidor ya las resuelve sin depender de rol. Ver §15.

---

## 14. Checklist de implementación

- [ ] Pedir `GET /me/permissions` al iniciar sesión, antes de renderizar el layout
- [ ] Store en memoria con los permisos; limpiarlo al cerrar sesión
- [ ] Estado de carga mientras llega; error explícito si falla (nunca asumir permisos)
- [ ] Helper `can(...acciones)` con semántica AND
- [ ] Componente `<Permitido>` con `fallback`
- [ ] Validación ruidosa de identificadores inexistentes en desarrollo
- [ ] Tipos generados a partir de las claves de `acciones`
- [ ] Mapa ruta → acción de lectura, aplicado al menú **y** al router
- [ ] Pantallas del vertical Farmacia gateadas por `data.vertical`, no por `acciones`
- [ ] Módulos del menú visibles si al menos una sub-pantalla lo está
- [ ] Botón "Nuevo" de cada listado detrás de su acción `.crear`
- [ ] Pantallas de detalle: pedir nivel 2 junto con el documento
- [ ] Todos los botones de detalle combinan **permiso AND `docstatus`**
- [ ] Esconder por permiso; deshabilitar con tooltip por estado
- [ ] Interceptor de 403: mostrar `error.message`, refrescar permisos en segundo plano
- [ ] Distinguir `PERMISO_INSUFICIENTE` de `FORBIDDEN` y de `401`
- [ ] Formulario de usuarios con perfiles (no roles sueltos) y advertencia de roles a perder
- [ ] Refrescar permisos al salir de la pantalla de administración
- [ ] No filtrar listados por permisos en el cliente
- [ ] No persistir permisos en `localStorage`
- [ ] Pantallas de meta-administración (roles, permisos, e-CF admin) gateadas por
      `roles.includes('System Manager')`, no por una acción del catálogo — no existe una

---

## 15. Cobertura del backend

**Cobertura completa: 540/540 rutas (100%).** Toda ruta del API está en uno de estos tres
estados — no queda ninguna sin resolver:

| Estado | Qué significa para el frontend |
|---|---|
| **Declara una acción** | Aparece en `acciones` de `/me/permissions` (§4.1). Es la inmensa mayoría — las 368 acciones del §16 |
| **Exenta** | No aparece en `acciones` porque no lo necesita: autoservicio (`config/perfil`, `impresoras/mi-seleccion`), infraestructura pública (login, health check, el certificado de QZ Tray, el webhook de la DGII) o los adjuntos servidos por URL directa (`files/*`) |
| **Meta-administración** | Gatea con rol (`System Manager`), no con una acción del catálogo — la administración de permisos/roles/e-CF y los triggers manuales de cron. Si tu pantalla es "administrar roles" o "conectar Aura", no busques una acción: es binario, la tiene o no la tiene un `System Manager` |

Para el frontend esto quiere decir: **cualquier pantalla del sistema ya se puede esconder con
lo que describe este documento.** No hay ningún módulo pendiente de que el backend lo cubra.

---

## 16. Catálogo completo de acciones

**368 acciones sobre 113 pantallas.** Esta es la lista definitiva de identificadores. La columna
"Permiso ERPNext" es informativa —el frontend no la necesita— pero ayuda a entender por qué dos
botones distintos a veces se habilitan juntos.

La columna "Marcador" indica que además del permiso se exige un rol marcador; ya viene resuelto
en `acciones` (§11). Solo dos acciones lo usan: `Compras RD` y `Gastos RD`, sobre las pantallas
de Compras/Gastos — el resto del catálogo (incluidas todas las pantallas de Configuración,
Reportes y catálogos horizontales agregadas en esta revisión) no lo necesita.

#### Aging de Cobros/Proveedores

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `cobros.aging.exportar` | Descargar PDF | `Payment Entry.report` | — |

#### Ajustes de Compras

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.buying-settings.ver` | Ver | `Buying Settings.read` | — |
| `config.buying-settings.editar` | Editar | `Buying Settings.write` | — |

#### Ajustes de Contabilidad

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.accounts-settings.ver` | Ver | `Accounts Settings.read` | — |
| `config.accounts-settings.editar` | Editar | `Accounts Settings.write` | — |

#### Ajustes de Inventario

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.stock-settings.ver` | Ver | `Stock Settings.read` | — |
| `config.stock-settings.editar` | Editar | `Stock Settings.write` | — |

#### Ajustes de Ventas

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.selling-settings.ver` | Ver | `Selling Settings.read` | — |
| `config.selling-settings.editar` | Editar | `Selling Settings.write` | — |

#### Asientos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `contabilidad.asientos.crear` | Nuevo / Guardar borrador | `Journal Entry.create` | — |
| `contabilidad.asientos.listar` | Ver | `Journal Entry.read` | — |
| `contabilidad.asientos.someter` | Someter | `Journal Entry.submit` | — |
| `contabilidad.asientos.anular` | Cancelar | `Journal Entry.cancel` | — |

#### Atributos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `catalogo.atributos.listar` | Ver | `Item Attribute.read` | — |
| `catalogo.atributos.crear` | Nuevo | `Item Attribute.create` | — |
| `catalogo.atributos.editar` | Editar | `Item Attribute.write` | — |

#### Balance General

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.contabilidad.balance-general.ver` | Ver | `Account.report` | — |
| `reportes.contabilidad.balance-general.imprimir` | Descargar PDF | `Account.print` | — |

#### Bancos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.bancos.listar` | Ver | `Bank.read` | — |
| `tesoreria.bancos.crear` | Nuevo | `Bank.create` | — |
| `tesoreria.bancos.editar` | Editar | `Bank.write` | — |

#### Caja — Pendientes de Cobro

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `caja.cobrar` | Cobrar | `Payment Entry.create` | — |
| `caja.listar` | Ver | `Sales Invoice.read` | — |
| `caja.descartar` | Descartar | `Payment Entry.write` | — |

#### Cajas POS

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `pos.cajas.listar` | Ver | `POS Profile.read` | — |
| `pos.cajas.crear` | Nueva | `POS Profile.create` | — |
| `pos.cajas.editar` | Editar | `POS Profile.write` | — |
| `pos.cajas.eliminar` | Eliminar | `POS Profile.delete` | — |

#### Canal de Email

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `notificaciones.canales-email.ver` | Ver | `Email Account.read` | — |
| `notificaciones.canales-email.editar` | Editar | `Email Account.write` | — |

#### Catálogo de Bancos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.bancos.ver` | Ver | `Bank.read` | — |

#### Catálogo de Monedas

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.currencies.ver` | Ver | `Currency.read` | — |

#### Catálogo de Países

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.paises.ver` | Ver | `Country.read` | — |

#### Catálogos Fiscales

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.catalogos-fiscales.ver` | Ver | `Facturacion Config.read` | — |

#### Categorías

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `catalogo.categorias.listar` | Ver | `Item Group.read` | — |
| `catalogo.categorias.crear` | Nueva | `Item Group.create` | — |
| `catalogo.categorias.editar` | Editar | `Item Group.write` | — |
| `catalogo.categorias.eliminar` | Eliminar | `Item Group.delete` | — |

#### Centros de Costo

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `contabilidad.centros-costo.listar` | Ver | `Cost Center.read` | — |
| `contabilidad.centros-costo.crear` | Nuevo | `Cost Center.create` | — |
| `contabilidad.centros-costo.editar` | Editar | `Cost Center.write` | — |
| `contabilidad.centros-costo.eliminar` | Eliminar | `Cost Center.delete` | — |

#### Cheques

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.cheques.listar` | Ver | `Cheque.read` | — |

#### Cheques — detalle

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.cheques.imprimir` | Imprimir | `Cheque.print` | — |
| `tesoreria.cheques.anular` | Anular | `Cheque.cancel` | — |

#### Cierre de Período

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `contabilidad.cierre-periodo.listar` | Ver | `Period Closing Voucher.read` | — |
| `contabilidad.cierre-periodo.crear` | Nuevo | `Period Closing Voucher.create` | — |
| `contabilidad.cierre-periodo.confirmar` | Confirmar cierre | `Period Closing Voucher.submit` | — |

#### Clientes

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `clientes.crear` | Nuevo | `Customer.create` | — |
| `clientes.listar` | Ver | `Customer.read` | — |
| `clientes.eliminar` | Eliminar | `Customer.delete` | — |
| `clientes.editar` | Editar / Desactivar | `Customer.write` | — |
| `clientes.estado-cuenta.ver` | Estado de Cuenta | `Customer.report` | — |
| `clientes.estado-cuenta.imprimir` | Descargar Estado de Cuenta | `Customer.print` | — |

#### Cobros y Pagos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `cobros.pago.listar` | Ver | `Payment Entry.read` | — |
| `cobros.pago.editar` | Editar / Aplicar saldo a favor | `Payment Entry.write` | — |

#### Cola de Cobro (Cajera)

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `farmacia.despachos.cola` | Ver | `Despacho Provisional ARS.read` | — |
| `farmacia.despachos.cobrar` | Cobrar | `Despacho Provisional ARS.write + Sales Invoice.create + Sales Invoice.submit` | — |
| `farmacia.despachos.imprimir` | Imprimir factura de contado | `Sales Invoice.read` | — |

#### Combos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `catalogo.combos.listar` | Ver | `Product Bundle.read` | — |
| `catalogo.combos.eliminar` | Eliminar | `Product Bundle.delete` | — |
| `catalogo.combos.crear` | Nuevo | `Product Bundle.create` | — |
| `catalogo.combos.editar` | Editar / Desactivar | `Product Bundle.write` | — |

#### Compra — lista

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `compras.factura.listar` | Ver | `Purchase Invoice.read` | — |
| `compras.factura.crear` | Nueva | `Purchase Invoice.create` | Compras RD |

#### Configuración de Apartados

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.apartados.ver` | Ver | `Layaway Config.read` | — |
| `config.apartados.editar` | Editar | `Layaway Config.write` | — |

#### Configuración de Cobros

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.cobros.ver` | Ver | `Cobros Config.read` | — |
| `config.cobros.editar` | Editar | `Cobros Config.write` | — |

#### Configuración de Facturación

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.facturacion.ver` | Ver | `Facturacion Config.read` | — |
| `config.facturacion.editar` | Editar | `Facturacion Config.write` | — |
| `config.pos.habilitar` | Habilitar módulo POS | `Facturacion Config.write` | — |

#### Configuración de Farmacia

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.farmacia.habilitar` | Habilitar vertical Farmacia ARS | `Farmacia Config.write` | — |

#### Configuración e-CF

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.ecf.ver` | Ver | `Facturacion Electronica Config.read` | — |
| `config.ecf.editar` | Editar | `Facturacion Electronica Config.write` | — |

#### Conteos Físicos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `inventario.conteos.listar` | Ver | `Stock Reconciliation.read` | — |
| `inventario.conteos.crear` | Nuevo / Guardar borrador | `Stock Reconciliation.create` | — |
| `inventario.conteos.someter` | Someter | `Stock Reconciliation.submit` | — |

#### Contingencia e-CF

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.ecf.contingencia.administrar` | Activar / Desactivar / Transmitir diferidos | `Facturacion Electronica Config.write` | — |

#### Corte de Caja del Día

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.pos.corte-caja-dia.ver` | Ver | `POS Closing Entry.report` | — |
| `reportes.pos.corte-caja-dia.imprimir` | Descargar PDF | `POS Closing Entry.print` | — |

#### Costos de Importación

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `compras.costos-importacion.listar` | Ver | `Landed Cost Voucher.read` | — |
| `compras.costos-importacion.crear` | Nuevo | `Landed Cost Voucher.create` | — |
| `compras.costos-importacion.someter` | Someter | `Landed Cost Voucher.submit` | — |
| `compras.costos-importacion.anular` | Anular | `Landed Cost Voucher.cancel` | — |

#### Cuadre de Caja

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.caja.cuadre.ver` | Ver | `Payment Entry.report` | — |
| `reportes.caja.cuadre.imprimir` | Descargar PDF | `Payment Entry.print` | — |

#### Cuadre de Turno POS

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.pos.cuadre-turno.ver` | Ver | `POS Closing Entry.report` | — |
| `reportes.pos.cuadre-turno.imprimir` | Descargar PDF | `POS Closing Entry.print` | — |

#### Cuentas Bancarias

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.cuentas-bancarias.listar` | Ver | `Bank Account.read` | — |
| `tesoreria.cuentas-bancarias.crear` | Nueva | `Bank Account.create` | — |
| `tesoreria.cuentas-bancarias.editar` | Editar | `Bank Account.write` | — |
| `tesoreria.cuentas-bancarias.eliminar` | Eliminar | `Bank Account.delete` | — |

#### Cuentas por Pagar (catálogo fiscal)

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `catalogo.cuentas-pagar.crear` | Nueva | `Account.create` | — |
| `catalogo.cuentas-pagar.listar` | Ver | `Account.read` | — |
| `catalogo.cuentas-pagar.eliminar` | Eliminar | `Account.delete` | — |
| `catalogo.cuentas-pagar.editar` | Editar / Deshabilitar | `Account.write` | — |

#### Dashboard

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `dashboard.ver` | Ver resumen, actividad reciente, top productos/clientes | `Sales Invoice.report` | — |

#### Datos de la Empresa

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.empresa.ver` | Ver | `Company.read` | — |
| `config.empresa.editar` | Editar | `Company.write` | — |

#### Denominaciones de Billetes

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.denominaciones.listar` | Ver | `Denominacion Billete.read` | — |
| `config.denominaciones.crear` | Nueva | `Denominacion Billete.create` | — |
| `config.denominaciones.editar` | Editar | `Denominacion Billete.write` | — |

#### Departamentos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `departamentos.listar` | Ver | `Department.read` | — |
| `departamentos.crear` | Nuevo | `Department.create` | — |
| `departamentos.editar` | Editar | `Department.write` | — |
| `departamentos.eliminar` | Eliminar | `Department.delete` | — |

#### Depósito (ingreso)

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.deposito.crear` | Nuevo | `Payment Entry.create` | — |
| `tesoreria.deposito.listar` | Ver | `Payment Entry.read` | — |
| `tesoreria.deposito.editar` | Editar | `Payment Entry.write` | — |
| `tesoreria.deposito.someter` | Someter | `Payment Entry.submit` | — |
| `tesoreria.deposito.anular` | Anular | `Payment Entry.cancel` | — |

#### Descuentos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `catalogo.descuentos.listar` | Ver | `Pricing Rule.read` | — |
| `catalogo.descuentos.crear` | Nueva regla | `Pricing Rule.create` | — |
| `catalogo.descuentos.editar` | Editar / Activar-Desactivar | `Pricing Rule.write` | — |

#### Despachos ARS

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `farmacia.despachos.listar` | Ver | `Despacho Provisional ARS.read` | — |
| `farmacia.despachos.crear` | Despachar preaprobación confirmada | `Despacho Provisional ARS.create` | — |

#### Detalle de Artículo

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `catalogo.items.eliminar` | Eliminar | `Item.delete` | — |
| `catalogo.items.consultar-stock` | Ver existencias por almacén | `Bin.read` | — |
| `catalogo.items.editar` | Editar | `Item.write` | — |
| `catalogo.items.actualizar-precios` | Actualizar Precios | `Item Price.write` | — |
| `catalogo.items.imprimir-etiqueta` | Imprimir etiqueta | `Item.print` | — |
| `catalogo.items.generar-variantes` | Agregar/Generar variantes | `Item.create` | — |
| `catalogo.items.asignar-ubicacion` | Asignar/Mover/Quitar ubicación | `Warehouse.write` | — |

#### Detalle de Cobro/Pago

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `cobros.pago.someter` | Someter | `Payment Entry.submit` | — |
| `cobros.pago.imprimir` | Imprimir | `Payment Entry.print` | — |
| `cobros.pago.anular` | Cancelar | `Payment Entry.cancel` | — |

#### Detalle de Compra

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `compras.factura.editar` | Editar / Impacto contable (preview) | `Purchase Invoice.write` | Compras RD |
| `compras.factura.someter` | Someter | `Purchase Invoice.submit` | Compras RD |
| `compras.factura.eliminar` | Eliminar (borrador) | `Purchase Invoice.delete` | Compras RD |
| `compras.factura.imprimir` | Ver / Descargar PDF | `Purchase Invoice.print` | Compras RD |
| `compras.factura.anular` | Anular | `Purchase Invoice.cancel` | Compras RD |
| `compras.factura.enmendar` | Enmendar | `Purchase Invoice.amend` | Compras RD |
| `compras.factura.devolver` | Devolución | `Purchase Invoice.create + Purchase Invoice.write` | Compras RD |
| `compras.factura.ver-asientos` | Ver asientos | `Journal Entry.read` | — |
| `compras.factura.aplicar-saldo` | Aplicar/deshacer saldo a favor CxP | `Purchase Invoice.write` | Compras RD |
| `compras.factura.importar-lineas-oc` | Importar líneas desde Orden de Compra | `Purchase Order.read + Purchase Invoice.write` | Compras RD |

#### Detalle de Cotización

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `cotizaciones.enmendar` | Enmendar | `Quotation.amend` | — |
| `cotizaciones.editar` | Editar | `Quotation.write` | — |
| `cotizaciones.someter` | Someter | `Quotation.submit` | — |
| `cotizaciones.eliminar` | Eliminar | `Quotation.delete` | — |
| `cotizaciones.convertir-pedido` | Convertir a Pedido | `Sales Order.create + Quotation.write` | — |
| `cotizaciones.convertir-factura` | Convertir a Factura | `Sales Invoice.create + Quotation.write` | — |
| `cotizaciones.imprimir` | Descargar PDF | `Quotation.print` | — |

#### Detalle de Factura

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `ventas.factura.editar` | Editar / Cancelar borrador | `Sales Invoice.write` | — |
| `ventas.factura.someter` | Someter | `Sales Invoice.submit` | — |
| `ventas.factura.aplicar-saldo` | Aplicar/remover saldo a favor o Nota de Crédito | `Sales Invoice.write` | — |
| `ventas.factura.imprimir` | Ver / Descargar PDF / PDF-A (e-CF) | `Sales Invoice.print` | — |
| `ventas.factura.imprimir-pos` | Imprimir POS | `Sales Invoice.print` | — |
| `ventas.factura.devolver` | Devolver producto(s) / Emitir Nota de Crédito | `Sales Invoice.create + Sales Invoice.write` | — |
| `ventas.factura.anular` | Cancelar (con motivo DGII) | `Sales Invoice.cancel` | — |
| `ventas.factura.enmendar` | Enmendar | `Sales Invoice.amend` | — |
| `ventas.factura.ver-asientos` | Ver asientos | `Journal Entry.read` | — |

#### Detalle de Pedido

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `pedidos.editar` | Editar | `Sales Order.write` | — |
| `pedidos.someter` | Someter / Someter Apartado | `Sales Order.submit` | — |
| `pedidos.anular` | Cancelar / Cancelar Apartado | `Sales Order.cancel` | — |
| `pedidos.facturar` | Facturar Apartado | `Sales Invoice.create + Sales Order.write` | — |
| `pedidos.enmendar` | Enmendar | `Sales Order.amend` | — |
| `pedidos.imprimir` | Descargar PDF | `Sales Order.print` | — |

#### Devoluciones (ventas)

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `ventas.devolucion.listar` | Ver | `Sales Invoice.read` | — |
| `ventas.devolucion.crear` | Nueva | `Sales Invoice.create` | — |
| `ventas.devolucion.imprimir` | Descargar PDF | `Sales Invoice.print` | — |
| `ventas.devolucion.anular` | Cancelar | `Sales Invoice.cancel` | — |

#### e-CF Emitidos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `ecf.emitidos.listar` | Ver | `Sales Invoice.read` | — |
| `ecf.emitidos.refrescar` | Refrescar estado | `Sales Invoice.report` | — |
| `ecf.emitidos.imprimir` | Descargar PDF-A | `Sales Invoice.print` | — |
| `ecf.emitidos.regenerar` | Regenerar e-CF rechazado | `Sales Invoice.write` | — |

#### e-CF Recibidos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `ecf.recibidos.listar` | Ver | `Purchase Invoice.read` | — |
| `ecf.recibidos.cargar-xml` | Cargar XML / Vincular | `Purchase Invoice.write` | Compras RD |
| `ecf.recibidos.aceptar-rechazar` | Aceptar / Rechazar | `Purchase Invoice.write` | Compras RD |

#### Ejercicios Fiscales

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.ejercicio-fiscal.listar` | Ver | `Fiscal Year.read` | — |
| `config.ejercicio-fiscal.crear` | Nuevo | `Fiscal Year.create` | — |
| `config.ejercicio-fiscal.editar` | Editar | `Fiscal Year.write` | — |
| `config.ejercicio-fiscal.cerrar` | Cerrar | `Fiscal Year.write` | — |
| `config.ejercicio-fiscal.reabrir` | Reabrir | `Fiscal Year.write` | — |

#### Emisión (egreso)

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.emision.crear` | Nueva | `Payment Entry.create` | — |
| `tesoreria.emision.listar` | Ver | `Payment Entry.read` | — |
| `tesoreria.emision.editar` | Editar | `Payment Entry.write` | — |
| `tesoreria.emision.someter` | Someter | `Payment Entry.submit` | — |
| `tesoreria.emision.anular` | Anular | `Payment Entry.cancel` | — |
| `tesoreria.emision.imprimir` | Imprimir | `Payment Entry.print` | — |

#### Factura — lista

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `ventas.factura.crear` | Nueva | `Sales Invoice.create` | — |
| `ventas.factura.listar` | Ver | `Sales Invoice.read` | — |

#### Gasto — detalle

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `gastos.editar` | Editar / Impacto contable | `Purchase Invoice.write` | Gastos RD |
| `gastos.someter` | Someter | `Purchase Invoice.submit` | Gastos RD |
| `gastos.anular` | Anular | `Purchase Invoice.cancel` | Gastos RD |
| `gastos.enmendar` | Enmendar | `Purchase Invoice.amend` | Gastos RD |
| `gastos.aplicar-saldo` | Saldo a favor CxP (aplicar/deshacer) | `Purchase Invoice.write` | Gastos RD |
| `gastos.ver-asientos` | Ver asientos | `Journal Entry.read` | — |

#### Gasto — lista

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `gastos.listar` | Ver | `Purchase Invoice.read` | — |
| `gastos.crear` | Nuevo | `Purchase Invoice.create` | Gastos RD |

#### Grupos de Clientes

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `clientes.grupos.listar` | Ver | `Customer Group.read` | — |
| `clientes.grupos.crear` | Nuevo | `Customer Group.create` | — |
| `clientes.grupos.editar` | Editar | `Customer Group.write` | — |
| `clientes.grupos.eliminar` | Eliminar | `Customer Group.delete` | — |

#### Grupos de Proveedores

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.grupos-proveedores.listar` | Ver | `Supplier Group.read` | — |
| `config.grupos-proveedores.crear` | Nuevo | `Supplier Group.create` | — |
| `config.grupos-proveedores.editar` | Editar | `Supplier Group.write` | — |
| `config.grupos-proveedores.eliminar` | Eliminar | `Supplier Group.delete` | — |

#### Historial de Notificaciones

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `notificaciones.logs.listar` | Ver | `Notificacion Log.read` | — |

#### Impresoras

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `impresoras.listar` | Ver | `POS Profile.read` | — |
| `impresoras.administrar` | Nueva / Editar / Eliminar | `POS Profile.write` | — |

#### Impuestos de Compras

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.impuestos-compras.ver` | Ver | `Purchase Taxes and Charges Template.read` | — |

#### Impuestos de Ventas

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.impuestos-ventas.ver` | Ver | `Sales Taxes and Charges Template.read` | — |

#### Ingresos y Egresos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.contabilidad.ingresos-egresos.ver` | Ver | `Journal Entry.report` | — |
| `reportes.contabilidad.ingresos-egresos.imprimir` | Descargar PDF | `Journal Entry.print` | — |

#### Inventario

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `inventario.stock.consultar` | Ver existencias | `Bin.read` | — |
| `inventario.historial.consultar` | Ver historial de movimientos | `Stock Ledger Entry.read` | — |
| `inventario.lotes.consultar` | Ver lotes | `Batch.read` | — |
| `inventario.seriales.consultar` | Ver seriales | `Serial No.read` | — |

#### Libro Diario / Libro Mayor

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `contabilidad.libros.ver` | Ver | `Journal Entry.report` | — |
| `contabilidad.libros.imprimir` | Descargar PDF | `Journal Entry.print` | — |

#### Lista de Cotizaciones

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `cotizaciones.crear` | Nueva / Duplicar | `Quotation.create` | — |
| `cotizaciones.listar` | Ver | `Quotation.read` | — |
| `cotizaciones.anular` | Cancelar | `Quotation.cancel` | — |

#### Lista de Pedidos

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `pedidos.crear` | Nuevo / Duplicar | `Sales Order.create` | — |
| `pedidos.listar` | Ver | `Sales Order.read` | — |

#### Lista de Productos/Servicios

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `catalogo.items.listar` | Ver | `Item.read` | — |
| `catalogo.items.crear` | Nuevo | `Item.create` | — |
| `catalogo.items.activar` | Activar/Desactivar | `Item.write` | — |

#### Listas de Precio

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.listas-precio.listar` | Ver | `Price List.read` | — |
| `config.listas-precio.crear` | Nueva | `Price List.create` | — |
| `config.listas-precio.editar` | Editar | `Price List.write` | — |
| `config.listas-precio.eliminar` | Eliminar | `Price List.delete` | — |

#### Lotes de Facturación ARS

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `farmacia.lotes.listar` | Ver | `Lote de Facturacion ARS.read` | — |
| `farmacia.lotes.crear` | Nuevo | `Lote de Facturacion ARS.create` | — |
| `farmacia.lotes.recalcular` | Recalcular totales | `Lote de Facturacion ARS.write` | — |
| `farmacia.lotes.marcar-en-revision` | Marcar "En Revisión" | `Lote de Facturacion ARS.write` | — |
| `farmacia.lotes.vincular-despacho` | Agregar / Quitar despacho | `Lote de Facturacion ARS.write + Despacho Provisional ARS.write` | — |
| `farmacia.lotes.facturar` | Facturar (cerrar lote) | `Lote de Facturacion ARS.write + Sales Invoice.create + Sales Invoice.submit + Despacho Provisional ARS.write` | — |
| `farmacia.lotes.imprimir` | Imprimir factura consolidada | `Sales Invoice.read` | — |

#### Marcas

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `catalogo.marcas.listar` | Ver | `Brand.read` | — |
| `catalogo.marcas.crear` | Nueva | `Brand.create` | — |
| `catalogo.marcas.editar` | Editar | `Brand.write` | — |
| `catalogo.marcas.eliminar` | Eliminar | `Brand.delete` | — |

#### Métodos de Pago

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.metodos-pago.listar` | Ver | `Mode of Payment.read` | — |
| `config.metodos-pago.crear` | Nuevo | `Mode of Payment.create` | — |
| `config.metodos-pago.editar` | Editar | `Mode of Payment.write` | — |

#### Movimientos de Banco

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.movimientos-banco.listar` | Ver | `Bank Account.read` | — |

#### Movimientos de Inventario

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.inventario.movimientos.ver` | Ver | `Stock Ledger Entry.report` | — |
| `reportes.inventario.movimientos.imprimir` | Descargar PDF | `Stock Ledger Entry.print` | — |

#### Notas de Crédito

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `ventas.nota-credito.crear` | Nueva | `Sales Invoice.create` | — |
| `ventas.nota-credito.listar` | Ver | `Sales Invoice.read` | — |
| `ventas.nota-credito.someter` | Someter | `Sales Invoice.submit` | — |
| `ventas.nota-credito.reembolsar` | Reembolsar | `Payment Entry.create` | — |
| `ventas.nota-credito.aplicar` | Aplicar / Deshacer | `Sales Invoice.write` | — |
| `ventas.nota-credito.imprimir` | Descargar PDF | `Sales Invoice.print` | — |

#### Notas de Débito

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `ventas.nota-debito.crear` | Nueva | `Sales Invoice.create` | — |
| `ventas.nota-debito.imprimir` | Descargar PDF | `Sales Invoice.print` | — |

#### Orden de Compra

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `compras.orden.listar` | Ver | `Purchase Order.read` | — |
| `compras.orden.eliminar` | Eliminar (borrador) | `Purchase Order.delete` | — |
| `compras.orden.imprimir` | Descargar PDF | `Purchase Order.print` | — |
| `compras.orden.crear` | Nueva | `Purchase Order.create` | — |
| `compras.orden.editar` | Editar / En Espera / Cerrar / Reabrir | `Purchase Order.write` | — |
| `compras.orden.someter` | Someter | `Purchase Order.submit` | — |
| `compras.orden.recibir` | Recibir | `Purchase Receipt.create + Purchase Order.write` | — |
| `compras.orden.facturar` | Facturar | `Purchase Invoice.create + Purchase Order.write` | Compras RD |
| `compras.orden.anular` | Anular | `Purchase Order.cancel` | — |
| `compras.orden.enmendar` | Enmendar | `Purchase Order.amend` | — |

#### Plan de Cuentas

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `contabilidad.cuentas.listar` | Ver | `Account.read` | — |
| `contabilidad.cuentas.crear` | Nueva cuenta | `Account.create` | — |
| `contabilidad.cuentas.editar` | Editar | `Account.write` | — |

#### Plantillas de Cheque

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.plantillas-cheque.crear` | Nueva | `Cheque Print Template.create` | — |
| `tesoreria.plantillas-cheque.listar` | Ver | `Cheque Print Template.read` | — |
| `tesoreria.plantillas-cheque.editar` | Editar | `Cheque Print Template.write` | — |

#### Plantillas de Factura/Etiqueta

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `plantillas.impresion.listar` | Ver | `Plantilla Impresion RD.read` | — |
| `plantillas.impresion.crear` | Nueva | `Plantilla Impresion RD.create` | — |
| `plantillas.impresion.eliminar` | Eliminar | `Plantilla Impresion RD.delete` | — |
| `plantillas.impresion.editar` | Guardar / Usar plantilla | `Plantilla Impresion RD.write` | — |

#### Plantillas de Impuesto por Artículo

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.item-tax-templates.ver` | Ver | `Item Tax Template.read` | — |

#### Preaprobaciones ARS

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `farmacia.preaprobaciones.listar` | Ver | `Preaprobacion ARS.read` | — |
| `farmacia.preaprobaciones.crear` | Nueva | `Preaprobacion ARS.create` | — |
| `farmacia.preaprobaciones.editar` | Editar detalle / Distribuir cobertura | `Preaprobacion ARS.write` | — |
| `farmacia.preaprobaciones.recalcular` | Recalcular distribución | `Preaprobacion ARS.write` | — |
| `farmacia.preaprobaciones.confirmar` | Confirmar | `Preaprobacion ARS.write` | — |

#### Proveedores

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `proveedores.crear` | Nuevo | `Supplier.create` | — |
| `proveedores.listar` | Ver | `Supplier.read` | — |
| `proveedores.editar` | Editar / Desactivar | `Supplier.write` | — |

#### Recálculo de Valuación

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `inventario.valuacion.consultar` | Ver recálculos | `Repost Item Valuation.read` | — |
| `inventario.valuacion.recalcular` | Recalcular | `Stock Settings.write` | — |

#### Recepción

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `compras.recepcion.listar` | Ver | `Purchase Receipt.read` | — |
| `compras.recepcion.crear` | Nueva | `Purchase Receipt.create` | — |
| `compras.recepcion.editar` | Editar | `Purchase Receipt.write` | — |
| `compras.recepcion.someter` | Someter | `Purchase Receipt.submit` | — |
| `compras.recepcion.imprimir-etiquetas` | Imprimir etiquetas | `Purchase Receipt.print` | — |
| `compras.recepcion.facturar` | Facturar | `Purchase Invoice.create + Purchase Receipt.write` | Compras RD |
| `compras.recepcion.anular` | Anular | `Purchase Receipt.cancel` | — |
| `compras.recepcion.enmendar` | Enmendar | `Purchase Receipt.amend` | — |

#### Registrar Pago

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `cobros.pago.crear` | Guardar | `Payment Entry.create` | — |

#### Reporte de Ventas

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.ventas.ver` | Ver | `Sales Invoice.report` | — |
| `reportes.ventas.imprimir` | Descargar PDF | `Sales Invoice.print` | — |

#### Reporte DGII 606

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.dgii606.ver` | Ver / Exportar | `Purchase Invoice.report` | — |

#### Reporte DGII 607

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.dgii607.ver` | Ver / Exportar | `Sales Invoice.report` | — |

#### Reporte DGII 608

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.dgii608.ver` | Ver / Exportar | `Sales Invoice.report` | — |

#### Reportes Farmacia ARS

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `farmacia.reportes.lotes.listar` | Ver — Listado de Lotes | `Lote de Facturacion ARS.read` | — |
| `farmacia.reportes.despachos-ncf.listar` | Ver — Relación Despacho/Lote/NCF | `Despacho Provisional ARS.read + Preaprobacion ARS.read + Lote de Facturacion ARS.read` | — |

#### Retenciones

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.retenciones.listar` | Ver | `Tax Withholding Category.read` | — |
| `config.retenciones.crear` | Nueva | `Tax Withholding Category.create` | — |
| `config.retenciones.editar` | Editar | `Tax Withholding Category.write` | — |
| `config.retenciones.eliminar` | Eliminar | `Tax Withholding Category.delete` | — |

#### Secuencias e-CF

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.ecf.secuencias.administrar` | Crear / Editar / Anular rangos | `Facturacion Electronica Config.write` | — |

#### Secuencias NCF (físico)

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.ncf.listar` | Ver | `Secuencia NCF.read` | — |
| `config.ncf.crear` | Nueva | `Secuencia NCF.create` | — |
| `config.ncf.editar` | Editar / Habilitar / Deshabilitar | `Secuencia NCF.write` | — |

#### Seguridad

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.seguridad.ver` | Ver | `System Settings.read` | — |
| `config.seguridad.editar` | Editar | `System Settings.write` | — |

#### Solicitud de Compra

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `compras.solicitud.listar` | Ver | `Material Request.read` | — |
| `compras.solicitud.eliminar` | Eliminar (borrador) | `Material Request.delete` | — |
| `compras.solicitud.imprimir` | Descargar PDF | `Material Request.print` | — |
| `compras.solicitud.crear` | Nueva | `Material Request.create` | — |
| `compras.solicitud.editar` | Editar / Detener / Reanudar | `Material Request.write` | — |
| `compras.solicitud.someter` | Someter | `Material Request.submit` | — |
| `compras.solicitud.generar-orden` | Generar Orden | `Purchase Order.create + Material Request.write` | — |
| `compras.solicitud.anular` | Anular | `Material Request.cancel` | — |
| `compras.solicitud.enmendar` | Enmendar | `Material Request.amend` | — |

#### Sucursales

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `sucursales.listar` | Ver | `Branch.read` | — |
| `sucursales.crear` | Nueva | `Branch.create` | — |
| `sucursales.editar` | Editar | `Branch.write` | — |
| `sucursales.eliminar` | Eliminar | `Branch.delete` | — |

#### Tasas de Impuesto

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.tasas-impuesto.listar` | Ver | `Tasa Impuesto RD.read` | — |
| `config.tasas-impuesto.crear` | Nueva | `Tasa Impuesto RD.create` | — |
| `config.tasas-impuesto.editar` | Editar | `Tasa Impuesto RD.write` | — |
| `config.tasas-impuesto.eliminar` | Eliminar | `Tasa Impuesto RD.delete` | — |

#### Tipos de Documento

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.tipos-documento.crear` | Nuevo | `Bank Document Type.create` | — |
| `tesoreria.tipos-documento.listar` | Ver | `Bank Document Type.read` | — |
| `tesoreria.tipos-documento.editar` | Editar / Deshabilitar | `Bank Document Type.write` | — |

#### Tipos de Notificación

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `notificaciones.tipos.listar` | Ver | `Notificacion Tipo.read` | — |
| `notificaciones.tipos.editar` | Editar | `Notificacion Tipo.write` | — |
| `notificaciones.tipos.probar` | Probar | `Notificacion Tipo.write` | — |

#### Transferencia Interna

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `tesoreria.transferencia.crear` | Nueva | `Journal Entry.create` | — |
| `tesoreria.transferencia.listar` | Ver | `Journal Entry.read` | — |
| `tesoreria.transferencia.editar` | Editar | `Journal Entry.write` | — |
| `tesoreria.transferencia.someter` | Someter | `Journal Entry.submit` | — |
| `tesoreria.transferencia.anular` | Anular | `Journal Entry.cancel` | — |

#### Transferencias entre Almacenes

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `inventario.transferencias.listar` | Ver | `Stock Entry.read` | — |
| `inventario.transferencias.crear` | Nueva | `Stock Entry.create` | — |
| `inventario.transferencias.someter` | Confirmar | `Stock Entry.submit` | — |
| `inventario.transferencias.anular` | Cancelar | `Stock Entry.cancel` | — |

#### Turnos POS

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `pos.turno.listar` | Ver turnos | `POS Opening Entry.read` | — |
| `pos.turno.cerrar` | Cerrar turno | `POS Closing Entry.write` | — |
| `pos.turno.imprimir-cierre` | Descargar PDF (cierre) | `POS Closing Entry.print` | — |
| `pos.turno.abrir` | Abrir turno | `POS Opening Entry.create` | — |

#### Ubicaciones de Inventario

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `inventario.ubicaciones.listar` | Ver | `Almacen Ubicacion.read` | — |
| `inventario.ubicaciones.crear` | Nueva | `Almacen Ubicacion.create` | — |
| `inventario.ubicaciones.editar` | Editar | `Almacen Ubicacion.write` | — |
| `inventario.ubicaciones.eliminar` | Eliminar | `Almacen Ubicacion.delete` | — |
| `inventario.ubicaciones.asignar` | Asignar artículo | `Item Ubicacion.create` | — |
| `inventario.ubicaciones.editar-asignacion` | Editar asignación | `Item Ubicacion.write` | — |
| `inventario.ubicaciones.quitar-asignacion` | Quitar asignación | `Item Ubicacion.delete` | — |
| `inventario.ubicaciones.mover` | Mover artículos entre ubicaciones | `Item Ubicacion.write + Stock Entry.create` | — |
| `inventario.ubicaciones.distribuir` | Distribuir entre ubicaciones | `Item Ubicacion.write` | — |

#### Unidades de Medida

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `config.uom.listar` | Ver | `UOM.read` | — |
| `config.uom.crear` | Nueva | `UOM.create` | — |
| `config.uom.editar` | Editar | `UOM.write` | — |
| `config.uom.eliminar` | Eliminar | `UOM.delete` | — |

#### Usuarios

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `usuarios.crear` | Nuevo | `User.create` | — |
| `usuarios.listar` | Ver | `User.read` | — |
| `usuarios.editar` | Editar / Deshabilitar / Restablecer contraseña | `User.write` | — |

#### Valoración de Inventario

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `reportes.inventario.valoracion.ver` | Ver | `Item.report` | — |
| `reportes.inventario.valoracion.imprimir` | Descargar PDF | `Item.print` | — |

#### Zonas de Almacén

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `inventario.zonas.listar` | Ver | `Almacen Zona.read` | — |
| `inventario.zonas.crear` | Nueva | `Almacen Zona.create` | — |
| `inventario.zonas.editar` | Editar | `Almacen Zona.write` | — |
| `inventario.zonas.eliminar` | Eliminar | `Almacen Zona.delete` | — |

#### Zonas y Ubicaciones

| Acción | Botón / control | Permiso ERPNext | Marcador |
|---|---|---|---|
| `inventario.almacenes.listar` | Ver | `Warehouse.read` | — |
| `inventario.almacenes.crear` | Nueva | `Warehouse.create` | — |
| `inventario.almacenes.editar` | Editar / Activar-Desactivar | `Warehouse.write` | — |
| `inventario.almacenes.eliminar` | Eliminar | `Warehouse.delete` | — |
