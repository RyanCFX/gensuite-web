# Niveles de precio del artículo (A / B / C): regla al guardar

Aplica a `POST /catalog/items`, `PUT /catalog/items/:id` y la edición de precios del artículo
(`PUT /catalog/items/:id/precios`). Un artículo tiene tres niveles: **A** (máximo), **B** (promedio) y
**C** (mínimo). En modo costo + margen la misma regla aplica a `marginA/B/C`.

## Regla

| Niveles que quedan con valor | Qué pasa |
|---|---|
| **Uno solo** | Los otros dos se **igualan** a él (`priceB: 1500` → A, B y C = 1500) |
| **Dos** | **Error 400 `PRECIOS_NIVELES_INCOMPLETOS`**: falta uno |
| **Tres** | Se guardan tal cual |
| Ninguno enviado | No se toca nada (p. ej. artículos *template*, cuyas variantes llevan su precio) |

"Quedan" cuenta lo que se envía **más lo que el artículo ya tiene**:
- Editar **un** nivel de un artículo que ya tiene los tres cambia solo ese; **no** iguala los demás.
- Un artículo que ya tiene dos niveles (datos antiguos) y al que se le toca uno de ellos también da error:
  hay que completar el que falta.
- `0` es un precio válido.

## Error

```json
{ "statusCode": 400, "code": "PRECIOS_NIVELES_INCOMPLETOS",
  "message": "Falta el precio del nivel C (mínimo): el artículo tendría solo los niveles A y B. Indique los tres niveles (A, B y C) o solo uno, para que los demás se igualen a él.",
  "details": { "faltante": "C", "presentes": ["A", "B"] } }
```
(en modo costo + margen el mensaje dice "margen" en vez de "precio").

## Qué hacer en la UI
- Si el usuario llena **un** nivel, deja claro que los demás tomarán ese valor (o autocompleta los dos
  campos vacíos al salir del campo, editables).
- Si llena **dos**, marca el nivel vacío y no dejes enviar; el servidor igual lo rechaza.
- Respeta `details.faltante` para señalar el campo.
- La validación ocurre **antes** de crear o modificar el artículo: un error no deja nada guardado.
