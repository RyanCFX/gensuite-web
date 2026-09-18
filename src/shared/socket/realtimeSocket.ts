// Socket.IO (namespace /realtime) — canal de avisos en vivo para Caja (POS) y Despacho.
// El backend nunca manda el documento completo, solo un id + metadata mínima; la reacción
// correcta es siempre invalidar la query REST correspondiente, nunca pintar el payload
// directo (ver docs de la feature). Conectar es seguro para cualquier usuario autenticado: el
// propio backend decide, según los permisos del JWT, a qué eventos queda suscrito el socket —
// no hay lógica de permisos que replicar acá.
import { io, type Socket } from 'socket.io-client'
import { queryClient } from '@/shared/api/queryClient'

let socket: Socket | null = null
let socketToken: string | null = null

function registerListeners(s: Socket) {
  s.on('connect_error', (err) => {
    console.warn('[realtime] connect_error:', err.message)
  })

  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      // El servidor cortó a propósito (token inválido/expirado, sesión revocada) — a diferencia
      // de un corte de red, socket.io-client NO reintenta solo en este caso.
      console.warn('[realtime] el servidor cerró la conexión:', reason)
    }
  })

  s.on('server.shutdown', () => {
    s.disconnect()
    s.connect()
  })

  const invalidateTurnos = () => queryClient.invalidateQueries({ queryKey: ['turnos'] })
  s.on('pos.turno.abierto', invalidateTurnos)
  s.on('pos.turno.cerrado', invalidateTurnos)

  const invalidateDespachos = () => queryClient.invalidateQueries({ queryKey: ['despachos-confirmaciones'] })
  s.on('despacho.solicitud.creada', invalidateDespachos)
  s.on('despacho.solicitud.confirmada', invalidateDespachos)
  s.on('despacho.solicitud.cancelada', invalidateDespachos)
}

/** Conecta el socket compartido de la app con el `access_token` actual. Idempotente: si ya hay
 * una conexión con ese mismo token no hace nada (se llama en cada resolución de sesión —
 * login, refresh/hydrate — no solo al iniciar sesión). */
export function connectRealtimeSocket(accessToken: string): Socket {
  if (socket && socketToken === accessToken) return socket

  socket?.disconnect()
  socketToken = accessToken
  socket = io(`${window.location.origin}/realtime`, {
    auth: { token: accessToken },
    transports: ['websocket'],
  })
  registerListeners(socket)
  return socket
}

export function getRealtimeSocket(): Socket | null {
  return socket
}

export function disconnectRealtimeSocket(): void {
  socket?.disconnect()
  socket = null
  socketToken = null
}
