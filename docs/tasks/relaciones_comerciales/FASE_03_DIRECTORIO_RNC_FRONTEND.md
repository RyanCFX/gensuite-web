# Prompt para el agente de frontend — Relaciones Comerciales, Fase 03: directorio por RNC

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-18 · plan: docs/plans/relaciones_comerciales/FASE_03_DIRECTORIO_RNC.md

## 1. Contexto

Es el paso 1 del asistente "Nueva relación comercial": el usuario escribe un RNC y el sistema le
dice qué hay ahí antes de invitar a nadie. Es el único endpoint del módulo que consulta datos de
otros tenants, así que su respuesta está deliberadamente acotada — no vas a recibir email,
teléfono, ni la URL del site de la contraparte.

## 2. Pantalla

"Nueva relación comercial" → paso 1: campo de RNC + botón buscar.

## 3. Endpoint

```
POST /api/v1/relaciones/directorio/buscar
Body: { "rnc": "131234567" }
```

**Es POST, no GET** — a propósito, porque el RNC es dato sensible de un tercero y no debe quedar
en logs de acceso ni historiales de navegador. No lo pongas en la URL ni en query params en
ningún rediseño futuro.

Permiso: `relaciones.directorio.buscar` (`GET /me/permissions`) — si el usuario no lo tiene, ni
muestres el campo de búsqueda.

Rate limit: 20 búsquedas por minuto por usuario, y un tope diario por tenant. Ambos devuelven
`429` — muestra un mensaje de "demasiadas búsquedas, intenta en un momento" genérico, sin exponer
los números exactos del límite.

### Respuesta de ejemplo (RNC que sí es de un tenant de GenSuite)

```json
{
  "success": true,
  "data": {
    "rnc": "130959994",
    "enGenSuite": true,
    "empresas": [
      {
        "tenantId": "dd82a640-15c4-4072-bcd7-a09d017509a5",
        "nombre": "JORGES BUSINESS CONSULTING",
        "rnc": "130959994",
        "estadoRelacion": null,
        "invitacion": null,
        "puedeInvitar": true,
        "motivoNoInvitable": null
      }
    ],
    "maestrosLocales": {
      "customer": null,
      "supplier": null,
      "duplicados": { "customer": false, "supplier": false }
    }
  }
}
```

Este ejemplo es real (verificado en vivo contra datos de producción, con `maestrosLocales`
mockeado para la prueba — la forma es exacta, los valores de `customer`/`supplier` si tu empresa
ya tenía esa contraparte cargada sí van a venir con datos).

### Respuesta cuando el RNC NO es de ningún tenant pero sí está en la DGII

```json
{
  "success": true,
  "data": {
    "rnc": "534876504",
    "enGenSuite": false,
    "empresas": [],
    "padronDgii": { "nombre": "CAWANI LIRANZO", "estado": "ANULADO" },
    "maestrosLocales": { "customer": null, "supplier": null, "duplicados": { "customer": false, "supplier": false } }
  }
}
```

`padronDgii` solo viene cuando `enGenSuite: false` y el RNC existe en el padrón local. **No
ofrezcas "invitar por correo" en este caso** — está explícitamente fuera de alcance del plan. El
mensaje correcto es algo como "esta empresa existe pero no usa GenSuite todavía".

### Cuando el RNC no existe en ningún lado

Igual que el caso anterior pero sin `padronDgii` — `empresas: []`, sin esa clave.

## 4. Valores posibles

| Campo | Valores | Qué significa |
|---|---|---|
| `estadoRelacion` | `null`, `invitada`, `activa`, `rechazada`, `revocada`, `suspendida` | `null` = nunca hubo relación entre ustedes |
| `invitacion` | `null`, `"enviada"`, `"recibida"` | Solo tiene sentido si hay una invitación `pendiente` ahora mismo |
| `puedeInvitar` | `true`/`false` | Si es `false`, oculta el botón de invitar y muestra `motivoNoInvitable` tal cual — **no intentes adivinar por qué es `false` a partir de `estadoRelacion`**, hay un caso (bloqueo) que se ve exactamente igual a otros |

## 5. Texto exacto para `puedeInvitar: false`

Muestra siempre `motivoNoInvitable` tal cual lo manda el backend — hoy es literalmente:

> "Esta empresa no está aceptando solicitudes por ahora."

Es el mismo texto para "ya tienen una relación activa", "ya hay una invitación pendiente" y "esa
empresa te bloqueó" — es deliberado (privacidad), no lo reemplaces por un mensaje más específico
ni intentes distinguir el caso en el frontend.

## 6. `maestrosLocales` — el aviso de adopción

Si `maestrosLocales.customer` o `.supplier` no es `null`, muestra un aviso ANTES de que el
usuario mande la invitación: *"Ya tiene a esta empresa como cliente (**{nombre}**). Se usará ese
registro; no se creará uno nuevo."* (o "proveedor", según cuál venga). Si `duplicados.customer`
o `.supplier` es `true`, cambia el aviso a: *"Tiene más de un cliente con este RNC — al activar
la relación deberá elegir cuál usar."*

Este bloque se devuelve siempre, incluso si `enGenSuite: false` — es información sobre TU propio
catálogo, no sobre la contraparte.

## 7. Checklist de aceptación para el frontend

- [ ] El campo de búsqueda valida el formato de RNC (9 dígitos) antes de llamar al backend, pero
      el backend igual puede rechazar por dígito verificador inválido (`400`) — mostrar el error
      tal cual.
- [ ] Un RNC con más de una empresa en `empresas` muestra las dos, cada una con su propio botón
      de invitar/estado.
- [ ] `puedeInvitar: false` oculta el botón de invitar y muestra `motivoNoInvitable`, siempre el
      mismo componente visual sin importar la causa.
- [ ] El aviso de `maestrosLocales` aparece antes del botón de invitar, no después.
- [ ] `429` muestra un mensaje genérico de "demasiadas búsquedas", no el número de intentos ni el
      tiempo exacto de espera.
