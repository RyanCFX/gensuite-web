# Separación de Aseguradoras y Clientes en el vertical Farmacia ARS

> **Para quien recibe este documento:** el frontend de Farmacia ARS ya está implementado —
> Preaprobaciones, Despachos, Lotes, Cola de Cobro — y hasta ahora una ARS se manejaba como un
> `Customer` más, elegido desde el mismo picker/pantalla que un paciente. Este documento describe
> **un cambio de contrato**, no una funcionalidad nueva de negocio: el backend ahora separa
> "Cliente" de "Aseguradora" en dos endpoints distintos, y el frontend tiene que dejar de tratarlos
> como lo mismo.
>
> En el repo del frontend hay un `openapi.json` con la documentación completa y actualizada del
> API — ahí está el shape exacto de request/response de `/aseguradoras` (y de todo lo demás). Este
> documento **no lo reemplaza**: explica el *porqué* del cambio y qué hay que tocar en la UI ya
> existente; el detalle campo por campo está en el spec.
>
> Documento de referencia del vertical completo: `docs/frontend/FARMACIA_ARS_FRONTEND.md` (ver
> §4.7.1, ya actualizado con este cambio).

---

## 1. Qué cambia y por qué

**Antes:** una ARS era, para el frontend, un `Customer` idéntico a cualquier cliente/paciente. La
única forma de distinguirla era el `customerGroup` ("ARS"), un texto libre sin ningún enforcement
— el picker de "aseguradora" en Preaprobaciones y Lotes consumía `/customers` igual que cualquier
otra pantalla, y nada impedía seleccionar por error un paciente donde iba una ARS (o viceversa).

**Ahora:** por debajo, en ERPNext, una ARS sigue siendo el mismo doctype `Customer` — eso no
cambió y nunca va a cambiar (evita duplicar el maestro fiscal). Lo que cambió es que el **BFF ya
no expone eso como un solo concepto**:

- `GET /customers` **ya no incluye las ARS** en tenants con el vertical Farmacia habilitado.
- Hay un CRUD nuevo y separado: `GET/POST/PUT/DELETE /aseguradoras`.
- El servidor ahora **valida** que el campo `aseguradora` de una Preaprobación o un Lote sea
  efectivamente una aseguradora — si el frontend manda por error el ID de un paciente, la
  respuesta es `400`, no un guardado silencioso.

Esto es puramente un cambio de **contrato de API**, no de flujo de negocio: el proceso
Preaprobación → Despacho → Cobro → Lote sigue siendo exactamente el mismo que ya construiste. Lo
único que cambia es **de dónde sale la lista de aseguradoras** y **dónde se administran**.

---

## 2. Qué hay que tocar en el frontend ya implementado

### 2.1 Pantalla de Clientes — sin cambios de código, pero el listado se acorta

`GET /customers` ahora excluye las ARS del lado del servidor. Si tu implementación actual filtraba
manualmente por `customerGroup !== 'ARS'` en el cliente para no mostrarlas en Clientes, **ese
filtro ya no hace nada porque ya no llegan** — podés dejarlo o quitarlo, es inofensivo de cualquier
forma. Si en cambio las mostrabas mezcladas (sin filtrar), notarás que las que tenían
`customerGroup = 'ARS'` desaparecen del listado — es el comportamiento esperado, no un bug.

### 2.2 Pantalla nueva: CRUD de Aseguradoras

Construí un módulo nuevo, calcado en estructura al de Clientes (listado paginado + formulario de
alta/edición), contra `/aseguradoras`:

| Acción | Endpoint | Permiso (`GET /me/permissions`) |
|---|---|---|
| Listar | `GET /aseguradoras` | `aseguradoras.listar` |
| Ver detalle | `GET /aseguradoras/:id` | `aseguradoras.listar` |
| Crear | `POST /aseguradoras` | `aseguradoras.crear` |
| Editar | `PUT /aseguradoras/:id` | `aseguradoras.editar` |
| Eliminar | `DELETE /aseguradoras/:id` | `aseguradoras.eliminar` |

Campos del formulario (ver `openapi.json` para tipos y validaciones exactas):
`nombre`, `rnc` (obligatorio — una aseguradora siempre es una empresa, no hay opción
Individual/Company como en Clientes), `email`, `phone`, `address`, `hasCredit` (el formulario debe
sugerir `true` por defecto — ver §2.4), `creditLimit`, `creditDays`, `cuentaCxcDefault`,
`encargadoCxc`, `telefonos[]`.

Igual que en Clientes: `GET /aseguradoras` es paginado (`limit`/`offset`) y acepta `nombre`
(búsqueda aproximada), `disabled` y `hasCredit` como filtros. `DELETE` puede devolver `409` si la
aseguradora ya tiene preaprobaciones/lotes/facturas — mostralo como el mismo tipo de error que ya
manejás para no poder eliminar un cliente con facturas.

Esta pantalla, igual que el resto del vertical, va detrás de `data.vertical === 'farmacia'` (no es
un permiso, es del tenant — mismo criterio que ya aplicás en el resto de Farmacia) y de los
permisos de la tabla de arriba.

### 2.3 Picker de "aseguradora" en Preaprobaciones y Lotes

Los formularios de **Nueva Preaprobación** y **Nuevo Lote** tienen un campo para elegir la ARS.
Si ese picker hoy consume `/customers` (filtrando o no por grupo), **cambialo para que consuma
`/aseguradoras`**. Es el único cambio funcional real de este documento: en todo lo demás, los
payloads de `POST /farmacia/preaprobaciones` y `POST /farmacia/lotes` siguen siendo idénticos
(`aseguradora` sigue siendo un string con el ID del `Customer` — solo cambia de dónde sale ese ID
en el picker).

### 2.4 Nuevo caso de error a manejar: `400` por tipo incorrecto

Si el picker todavía apunta a `/customers` (por una migración a medias, o alguien pega un ID a
mano), el servidor ahora rechaza la creación/edición con `400`:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "\"CUST-00042\" no está registrado como aseguradora (ver POST /aseguradoras). Verifique que no esté seleccionando por error un cliente/paciente.",
    "statusCode": 400
  }
}
```

Mostrá `error.message` tal cual — ya viene en español y explica el problema. No hace falta un
manejo especial más allá de tu interceptor de errores genérico; es solo una señal de que vale la
pena revisar que el picker esté apuntando al endpoint correcto.

### 2.5 Precondición de crédito para facturar un lote — ahora se resuelve en Aseguradoras

`POST /farmacia/lotes/:id/facturar` sigue exigiendo que la ARS tenga `hasCredit = true` (§3.5.1 de
`FARMACIA_ARS_FRONTEND.md`). Antes esto se verificaba/editaba desde Clientes; ahora se verifica y
edita desde **Aseguradoras**. `POST /aseguradoras` ya lo activa por defecto, así que una ARS creada
desde la pantalla nueva no debería toparse con este problema — pero si el frontend muestra una
advertencia temprana antes de facturar (recomendado en ese mismo documento), el dato hay que
leerlo ahora de `GET /aseguradoras/:id`, no de `GET /customers/:id`.

---

## 3. Migración de datos — no hay nada que el frontend deba disparar

Las ARS que ya existían (dadas de alta antes de este cambio, con `customerGroup = 'ARS'`) fueron
reclasificadas automáticamente por un patch de backend la primera vez que corra `bench migrate` en
cada tenant — **sus IDs no cambian**, solo pasan a aparecer en `/aseguradoras` en vez de
`/customers`. No hace falta que el frontend re-cree nada ni migre referencias guardadas
(`aseguradora` en preaprobaciones/lotes existentes sigue apuntando al mismo ID de siempre).

---

## 4. Checklist de migración

- [ ] Confirmar que `/customers` ya no muestra ARS en un tenant de prueba con el vertical
      habilitado (no hace falta cambiar código de Clientes por esto, es automático).
- [x] Construir la pantalla de Aseguradoras (listado + detalle + alta/edición) contra
      `/aseguradoras`, gateada por `data.vertical === 'farmacia'` y los permisos `aseguradoras.*`
      (`src/features/aseguradoras/`, `src/shared/api/aseguradoras.ts`).
- [x] Agregar la entrada de menú correspondiente (`NAV_FARMACIA` en `AppLayout.tsx` +
      `CommandPalette.tsx`; rutas en `App.tsx` y `rutas.ts`).
- [x] Cambiar el picker de "aseguradora" en Preaprobaciones y en Lotes (forms y filtros de
      listado) para que consuma `/aseguradoras` en vez de `/customers`.
- [ ] Verificar que el flujo completo (crear aseguradora → preaprobación → despacho → cobro →
      lote → facturar) sigue funcionando de punta a punta con una ARS creada desde la pantalla
      nueva.
- [x] La advertencia de crédito de §3.5.1 (`LoteCreateModal`) ahora lee `hasCredit` de
      `/aseguradoras`.
- [x] Acciones `aseguradoras.*` agregadas al catálogo (`PROMPT_PERMISOS_FRONTEND.md §16` +
      `acciones.generated.ts` regenerado). Pendiente: confirmar el shape exacto de la respuesta de
      `GET /aseguradoras` contra el servidor (`openapi.json` no trae schema de respuesta) y ajustar
      la interfaz `Aseguradora` si hace falta.
