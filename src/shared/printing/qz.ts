// Cliente de QZ Tray (agente de escritorio local, wss://localhost:8181 por default) para
// impresión directa sin diálogo del navegador. Mensajes FIRMADOS vía el backend (§Parte B de
// docs/tasks/56_persistencia_configuracion_impresoras.md) — el backend guarda la clave privada
// y firma bajo demanda; el frontend nunca ve esa clave, solo pide el certificado público y
// pide firmar cada mensaje que QZ Tray exige firmar.
//
// Importante: firmar NO elimina el diálogo de QZ Tray la primerísima vez que este sitio se
// conecta desde una máquina — QZ Tray siempre pide aprobar un origen que nunca ha visto. Lo que
// sí logra: ese diálogo muestra el certificado como verificado (nombre de la organización) en
// vez de una advertencia genérica, y "Recordar esta decisión" queda persistido de forma
// confiable — sin firma, esa opción podía no sobrevivir ni una sesión, y confirmamos con
// hardware real que las peticiones podían quedarse colgadas indefinidamente esperando una
// aprobación que nadie ve en un terminal POS desatendido.
import * as qz from 'qz-tray'
import { client } from '@/shared/api/client'
import { ENDPOINTS } from '@/shared/api/endpoints'

let securityConfigured = false

function configureSignedSecurity() {
  if (securityConfigured) return
  // qz-tray.js firma con SHA1 por default salvo que se le diga lo contrario — el backend firma
  // con SHA512 (`crypto.createSign('RSA-SHA512')`, ver docs/tasks/56_...md §B.3). Sin esta
  // línea, QZ Tray verifica la firma con el algoritmo equivocado y la marca "Invalid Signature"
  // aunque el certificado y la firma en sí sean correctos.
  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setCertificatePromise((resolve, reject) => {
    client
      .get<string>(ENDPOINTS.qz.certificado, { responseType: 'text' })
      .then((res) => resolve(res.data))
      .catch(reject)
  })
  qz.security.setSignaturePromise((toSign: string) => (resolve, reject) => {
    client
      .post<{ success: true; data: { signature: string } }>(ENDPOINTS.qz.firmar, { request: toSign })
      .then((res) => resolve(res.data.data.signature))
      .catch(reject)
  })
  securityConfigured = true
}

/** Sin firma, QZ Tray puede mostrar un diálogo propio en el ESCRITORIO (fuera del navegador,
 * de la app QZ Tray) pidiendo aprobar la conexión/impresión — si nadie lo ve/aprueba, la
 * promesa de qz-tray.js se queda colgada indefinidamente (confirmado: `printers.find()` sin
 * este timeout nunca resuelve ni rechaza). Este timeout evita que la UI quede pegada en
 * "Conectando…" para siempre y da un mensaje accionable en su lugar. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

const QZ_TIMEOUT_MS = 15_000
const QZ_TIMEOUT_MESSAGE =
  'QZ Tray no respondió a tiempo — revisa si apareció un diálogo de QZ Tray en el escritorio (puede quedar detrás del navegador) pidiendo aprobar la conexión, y acéptalo antes de reintentar.'

export async function connectQz(): Promise<void> {
  configureSignedSecurity()
  if (qz.websocket.isActive()) return
  await withTimeout(qz.websocket.connect({ retries: 1, delay: 1 }), QZ_TIMEOUT_MS, QZ_TIMEOUT_MESSAGE)
}

export function isQzConnected(): boolean {
  return qz.websocket.isActive()
}

export async function listQzPrinters(): Promise<string[]> {
  await connectQz()
  const result = await withTimeout(qz.printers.find(), QZ_TIMEOUT_MS, QZ_TIMEOUT_MESSAGE)
  return Array.isArray(result) ? result : [result]
}

/** Descarga el certificado público como `override.crt` — el nombre exacto que QZ Tray espera
 * para el mecanismo de "confianza pre-registrada" (ver QzCertificateModal). Se pide sin pasar
 * por `connectQz()`: es solo un archivo estático, no requiere que QZ Tray esté corriendo. */
export async function downloadQzCertificate(): Promise<void> {
  const res = await client.get<string>(ENDPOINTS.qz.certificado, { responseType: 'text' })
  const blob = new Blob([res.data], { type: 'application/x-x509-ca-cert' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'override.crt'
  a.click()
  URL.revokeObjectURL(url)
}

/** Trabajo `pixel/html` — QZ rasteriza el HTML y se lo entrega al driver de la impresora ya
 * instalado en el sistema operativo (mismo mecanismo que usa el navegador hoy, sin diálogo). */
export async function printHtmlViaQz(
  printerName: string,
  html: string,
  sizeMm: { width: number; height: number | null },
): Promise<void> {
  await connectQz()
  const config = qz.configs.create(printerName, {
    units: 'mm',
    margins: 0,
    size: { width: sizeMm.width, height: sizeMm.height },
    scaleContent: false,
  })
  await withTimeout(
    qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]),
    QZ_TIMEOUT_MS,
    QZ_TIMEOUT_MESSAGE,
  )
}
