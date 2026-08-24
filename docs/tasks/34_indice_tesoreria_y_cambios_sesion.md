# Prompt para agente de frontend — Olvidé mi contraseña / Restablecer / Completar registro

> Este documento es un prompt autocontenido para un agente de IA de frontend. Da el contexto de
> negocio y qué construir en la UI — **no** el shape exacto de cada endpoint. API base
> `https://gensapi.ryancfx.click/api/v1` (o `http://localhost:4000/api/v1` en desarrollo).

> **Los shapes exactos de request/response NO están en este documento — están en `openapi.json`**
> (regenerarlo/consultarlo desde `GET /api/docs-json` del BFF). Buscar el tag **"Auth"**.

---

## Contexto — qué cambió en el backend

Antes, estos flujos dependían de las páginas nativas de ERPNext (`/login`, `/update-password`) —
el correo que mandaba ERPNext apuntaba a su propia UI, no a este frontend. Ahora el BFF maneja todo
el ciclo completo con 3 endpoints nuevos, **todos públicos** (no requieren estar logueado, solo el
header `X-Tenant`):

```
POST /auth/forgot-password        { email }
POST /auth/reset-password         { email, key, newPassword }
POST /auth/complete-registration  { email, key, newPassword }
```

`reset-password` y `complete-registration` son **mecánicamente idénticos** (mismo body, mismo
resultado) — son dos rutas separadas solo para que la UI pueda distinguir el copy/contexto ("elige
tu contraseña por primera vez" vs. "recupera tu contraseña"), no porque el backend los trate
distinto.

### Cómo se conectan los 3 flujos

1. **Olvidé mi contraseña**: usuario pide un reset desde la pantalla de login →
   `POST /auth/forgot-password` → siempre responde el mismo mensaje genérico (éxito), exista o no
   el correo — **nunca uses esta respuesta para decirle al usuario si su correo existe o no en el
   sistema**. Si el correo existe y tiene configurado el envío, le llega un correo con un link.
2. **El correo trae un link** con esta forma (que tu frontend debe generar/consumir, ya que la
   `FRONTEND_URL` configurada en el backend apunta a tu dominio):
   ```
   https://tu-frontend.com/reset-password?key=XXXXX&email=usuario@empresa.com
   ```
   El correo de bienvenida de un usuario nuevo (cuando un admin lo crea desde `POST /usuarios`)
   trae la misma forma de link pero a otra ruta:
   ```
   https://tu-frontend.com/completar-registro?key=XXXXX&email=usuario@empresa.com
   ```
3. **La pantalla de destino** (una para cada ruta, o una sola pantalla reutilizada con copy
   distinto) lee `key` y `email` de la URL, pide la nueva contraseña al usuario, y llama a
   `POST /auth/reset-password` o `POST /auth/complete-registration` según corresponda.
4. **La respuesta de ambos endpoints es un login completo** — mismo shape que `POST /auth/login`
   (`access_token`, `tenant`, `user`, etc.). El frontend debe tratarlo exactamente como un login
   exitoso: guardar el token y llevar al usuario directo a la app, **sin pedirle que inicie sesión
   de nuevo**.

### Casos de error a manejar

- Un `key` inválido, ya usado, o expirado → `400` con un mensaje ya en español listo para mostrar
  tal cual (ej. "El enlace es inválido o ya expiró. Solicite uno nuevo.") — mostrar ese mensaje y
  ofrecer un link para volver a pedir uno nuevo (volver a `forgot-password` para el caso de
  recuperación; para completar-registro, el usuario tendría que pedirle a un admin que le reenvíe
  la invitación).
- Una contraseña que no cumple la política de seguridad de ERPNext también devuelve `400` con el
  mensaje de esa validación — mostrarlo tal cual, no reinterpretarlo.

---

## Qué debe hacer el frontend

### 1. Pantalla de login — agregar "¿Olvidaste tu contraseña?"

Si no existe ya, agregar el link/botón en la pantalla de login que lleve a una pantalla que pida
solo el email y llame a `POST /auth/forgot-password`. Mostrar siempre el mismo mensaje de éxito
genérico que devuelve el backend — no inventar un mensaje distinto según si el correo existe.

### 2. Pantalla "Restablecer contraseña" (`/reset-password?key=...&email=...`)

- Lee `key` y `email` de los query params de la URL (no le pidas el email al usuario si ya viene
  en el link).
- Pide la nueva contraseña (con confirmación).
- Llama a `POST /auth/reset-password` con `{ email, key, newPassword }`.
- Si responde éxito, guarda el `access_token` y navega directo a la app (ya quedó logueado).
- Si responde 400, muestra el mensaje de error del backend y ofrece volver a "Olvidé mi
  contraseña".

### 3. Pantalla "Completar registro" (`/completar-registro?key=...&email=...`)

Mismo comportamiento que el punto 2, pero llamando a `POST /auth/complete-registration` — y con
copy apropiado para un usuario que está configurando su cuenta por primera vez (ej. "Bienvenido,
elige tu contraseña para comenzar" en vez de "Restablece tu contraseña").

### 4. Sin cambios en las pantallas de administración de usuarios

`POST /usuarios` (crear usuario) y el botón de "reset password" que un admin usa sobre otro
usuario ya disparan estos mismos correos automáticamente desde el backend — no hay que agregar
nada ahí, solo confirmar que sigan funcionando (el usuario creado recibirá el correo de completar
registro en vez del nativo de ERPNext).

---

## Checklist de implementación

- [ ] Consultar `openapi.json` (tag "Auth") para los nombres exactos de campos antes de tipar los
      formularios.
- [ ] Link "¿Olvidaste tu contraseña?" en el login → pantalla que llama a
      `POST /auth/forgot-password`, con el mensaje genérico de éxito.
- [ ] Pantalla `/reset-password` que lee `key`/`email` de la URL, pide nueva contraseña, llama a
      `POST /auth/reset-password`, y auto-loguea con la respuesta.
- [ ] Pantalla `/completar-registro` — mismo mecanismo, llamando a
      `POST /auth/complete-registration`, con copy de bienvenida.
- [ ] Manejo de error 400 (key inválida/expirada, contraseña débil) mostrando el mensaje del
      backend tal cual.
- [ ] Probar de punta a punta: pedir un "olvidé mi contraseña" real, confirmar que el correo llega
      con el link correcto a `/reset-password`, completar el cambio, y confirmar que la sesión
      queda iniciada sin pedir login de nuevo.
