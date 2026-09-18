# Handoffs de frontend — Relaciones Comerciales

Esta carpeta guarda **un archivo por fase** con el contrato que el agente de frontend necesita para
construir la interfaz de esa fase. Los escribe el agente de backend **después** de terminar y
probar la fase, nunca antes: el handoff describe lo que el BFF *hace*, no lo que el plan *decía*
que iba a hacer.

Nomenclatura: `FASE_NN_<TEMA>_FRONTEND.md`. Enlazarlo en la tabla de fases del
[plan raíz](../README.md#8-índice-de-fases).

---

## 1. Plantilla obligatoria

Mismo estilo que `docs/frontend-tasks/79_confirmacion_despacho_pedido.md` y que
`docs/plans/hr/frontend/`.

```markdown
# Prompt para el agente de frontend — Relaciones Comerciales, Fase NN: <tema>

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el AAAA-MM-DD · commits: <hash…> · plan: docs/plans/relaciones_comerciales/FASE_NN_*.md

## 1. Contexto — qué problema resuelve esto para el usuario final
## 2. Pantallas nuevas y cambios en pantallas existentes (ruta de menú, quién la ve)
## 3. Endpoints (método, ruta, query/body, respuesta de ejemplo REAL, errores con código y mensaje)
## 4. Flujos paso a paso, con los estados de la transacción y del documento (draft/submitted/cancelled)
## 5. Permisos — acciones `relaciones.*`, qué botón/pantalla oculta cada una (GET /me/permissions)
## 6. Validaciones que el frontend debe replicar (RNC, obligatorios, rangos)
## 7. Cambios rompedores / migración (si una pantalla existente cambia de contrato)
## 8. Casos borde y mensajes de error exactos a mostrar
## 9. Checklist de aceptación para el frontend
```

Reglas: ejemplos **copiados de una llamada real**, nunca inventados; lista explícita de acciones de
permiso; si una fase no tiene impacto en frontend, crear el archivo igual diciéndolo y por qué.

---

## 2. Mapa de pantallas del módulo completo

Para que el equipo de frontend vea el destino antes de recibir la primera fase. **Esto es una guía,
no el contrato** — el contrato es el handoff de cada fase.

### 2.1 Relaciones Comerciales (menú principal)

Una pantalla con **tres tabs** (lo que pidió el usuario):

| Tab | Contenido | Acciones |
|---|---|---|
| **Socios** | Relaciones `activa`, `activando`, `suspendida` | Ver detalle, suspender, terminar |
| **Invitaciones** | Enviadas y recibidas, con estado | Aceptar, rechazar (+ bloquear), cancelar, reenviar |
| **Bloqueadas** | Empresas que **yo** bloqueé | Desbloquear |

Botón principal: **Nueva relación** → asistente de 3 pasos:
1. RNC → búsqueda en el directorio (Fase 03). Resultados posibles: empresa encontrada / encontrada
   pero no invitable / no usa GenSuite / RNC inválido. **Si ese RNC ya está en el catálogo local**,
   mostrar el aviso de adopción (`maestrosLocales`): "ya tiene a esta empresa como cliente X; se
   usará ese registro, no se creará uno nuevo".
2. Términos comerciales (crédito, días, grupo de cliente, cuenta CxC alterna, encargado de CxC,
   forma de pago, + lado proveedor).
3. Mensaje y confirmación — repetir acá el aviso de adopción antes del botón.

### 2.2 Detalle de relación

- Datos de la contraparte (nombre, RNC) y estado.
- **Registros vinculados**: qué `Customer` y qué `Supplier` quedaron ligados, si fueron **adoptados**
  (ya existían) o **creados**, con link a cada uno y la opción de cambiarlos. Cuando la activación
  se detiene por `RNC_DUPLICADO_EN_SITE`, acá va el selector de candidatos — mostrando saldo y
  cantidad de documentos de cada uno, porque elegir mal tiene consecuencias contables.
- Términos vigentes, editables.
- Configuración de automatización: documento entrante (Compra/Gasto), almacén destino, defaults 606,
  auto-enviar ventas/compras, mapeo estricto.
- Mapeo de artículos acumulado (tabla editable).
- Historial de transacciones con ese socio.

### 2.3 Bandeja de transacciones

Lista filtrable por dirección (entrantes/salientes), tipo, estado y socio. Estados y su color:

| Estado | Significado para el usuario |
|---|---|
| `Pendiente de entrega` | Enviado, esperando que llegue |
| `Pendiente` | **Requiere acción**: aceptar, editar o rechazar |
| `Requiere Mapeo` | **Falta decidir equivalencias de artículos** — lleva al formulario de mapeo |
| `Requiere Configuración` | **Falta algo del propio tenant**: almacén de la relación, defaults 606, o habilitar la moneda del documento. El mensaje dice cuál |
| `Aceptada` / `Editada` | Cerrada |
| `Enlazada` | Cerrada: el socio ya tenía su documento registrado; puede traer diferencias, en solo lectura |
| `Rechazada` | Cerrada; se puede reenviar |
| `Cancelada` / `Error` | Informativo; `Error` permite reintentar |

### 2.4 Detalle de transacción

La pantalla más importante del módulo. Tres zonas:

1. **Lo que envió el socio** (snapshot: cabecera + líneas + totales).
2. **Mi documento** (borrador o sometido), con link a la pantalla de compras/facturación.
3. **Diferencias** (Fase 10), cuando las hay, y el botón "Igualar factura al socio".

Acciones según estado y permisos: Aceptar · Editar (lleva a la pantalla del documento) ·
**Enlazar documento existente** · Rechazar · Reintentar · Reenviar · Cancelar envío.

⚠️ Cuando la transacción llega con un documento del socio **ya sometido** (trae NCF), el botón
"Aceptar" **no existe**: solo "Enlazar mi factura" o "Rechazar" — y hay que explicar por qué
(emitir un comprobante nuevo duplicaría el NCF de la operación).

Advertencias que la UI **debe** mostrar de forma prominente cuando vengan del backend:
diferencia de totales, posible duplicado, el proveedor anuló su factura, UOM/impuesto distinto.

### 2.5 Formulario de mapeo de artículos (obligatorio antes de aceptar)

Son dos inventarios distintos: el usuario **debe** decir, para cada artículo del socio, cuál es el
equivalente en su catálogo. Una fila por línea del documento del socio:

| Columna | Contenido |
|---|---|
| Artículo del socio | Código, nombre, código de barras, cantidad, precio |
| Mi artículo | Selector con buscador sobre el catálogo propio. **Pre-llenado solo** si hubo coincidencia de código de barras o si ya se mapeó antes ese artículo con este socio |
| Estado | `confirmada` · `sugerida` · `sin sugerencia` · `ambigua` (dos artículos con ese barcode) |
| Acciones | "Usar este" · "Crear artículo desde el socio" · "Buscar otro" |

- Botón **"Confirmar todas las sugerencias"** para el caso normal (segunda transacción en adelante).
- **No se puede aceptar** hasta que todas las líneas estén confirmadas.
- Check **"Sincronizar códigos de barra"**, explicado en una línea: *"Los códigos de barra del
  socio se agregarán a sus artículos, para reconocerlos automáticamente la próxima vez."* Mostrar
  después el resultado, incluidos los códigos omitidos por pertenecer a otro artículo.
- Advertencias por línea: UOM distinta (pide factor de conversión), tasa de impuesto distinta.

### 2.6 Enlazar un documento existente

Cuando el usuario ya había registrado esa factura/compra a mano:

1. Buscador de candidatos: lista de documentos suyos **sometidos**, de una parte con el RNC del
   socio, ordenados por calidad de coincidencia. Mostrar **por qué** coincide cada uno (NCF igual,
   total igual, fecha cercana) y su número, fecha y monto.
2. Emparejamiento de líneas (mismo formulario de §2.5, pero contra las líneas de ese documento).
3. Confirmación: al enlazar se descarta el borrador que el sistema había preparado.
4. Resultado: la transacción queda **`Enlazada`** y la vista de diferencias se muestra en **solo
   lectura** — sin botón "Igualar", porque los dos documentos están sometidos.

Errores con pantalla propia: `RNC_NO_COINCIDE` (el cliente/proveedor del documento no es esa
empresa), `DOCUMENTO_YA_ENLAZADO`, `YA_EXISTE_DOCUMENTO_SOMETIDO` y la advertencia de NCF
discrepante.

### 2.7 Pantalla pública de invitación (sin login)

Ruta tipo `/relaciones/invitacion?token=…`. Tres estados: válida (con botones Aceptar / Rechazar y
el check "bloquear esta empresa"), vencida, ya respondida. No exige sesión y **no** debe pedir
login ni mostrar el menú de la aplicación.

### 2.8 Cambios en pantallas existentes

| Pantalla | Cambio | Fase |
|---|---|---|
| Detalle de factura de venta | Badge "Cliente socio" + estado del envío B2B + botón "Enviar al cliente" cuando el automático está apagado o falló | 08 |
| Detalle de compra (borrador) | Botón **"Enviar a proveedor"** con check "someter automáticamente" + badge de estado del socio | 09 |
| Detalle de compra (**sometida**) | Botón "Enviar al proveedor" para conciliar una compra ya registrada (sin auto-someter: no hay nada que someter) | 11 |
| Detalle de artículo | Los códigos de barra pueden haber crecido por la sincronización: nada que construir, pero sí que saber al depurar | 07 |
| Detalle de compra (tras respuesta) | Advertencia "el proveedor editó esta factura" + botón "Igualar factura al proveedor" | 09, 10 |
| Configuración → Notificaciones | La categoría nueva "Relaciones Comerciales" con sus 9 tipos y sus destinatarios | 02 |

---

## 3. Reglas transversales para el frontend

1. **Nunca inventar el estado.** Todos los estados vienen del backend; no derivarlos en el cliente.
2. **Los permisos mandan.** Cada botón se pinta según `GET /me/permissions` (acciones
   `relaciones.*`). Un botón visible que devuelve 403 es un bug de frontend.
3. **El texto del socio es texto ajeno.** Nombres, descripciones y motivos vienen de otra empresa:
   escapar siempre y no interpretarlos como HTML/markdown.
4. **Aceptar somete contabilidad.** El diálogo de confirmación debe decir qué va a pasar ("se
   registrará y someterá una compra por RD$ X, afectando inventario y contabilidad").
5. **Igualar una factura sometida anula y re-emite** con NCF nuevo: confirmación explícita y
   distinta de la de igualar un borrador.
6. **Nada de polling agresivo** en la bandeja: refresco manual + un intervalo razonable. Las
   entregas tardan segundos, no milisegundos.
7. **El mapeo no se salta.** Aunque el 100 % de las líneas venga sugerido, el usuario pasa por el
   formulario y confirma. Optimizar los clics, no eliminar el paso.
8. **Enlazar no es editar.** En una transacción `Enlazada` no se ofrece ningún botón que sugiera
   modificar el documento: está sometido.
