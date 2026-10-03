import type { TemplateElement, TemplateType } from './types'

// Portapapeles del canvas como JSON con cabecera — permite copiar uno o varios elementos y
// pegarlos en otra pestaña o tenant tal cual. La cabecera (`clipboardKind`) es lo que le dice
// al motor que este texto es un JSON del canvas (y no un texto cualquiera del portapapeles):
// al pegar, si la cabecera está presente, los elementos se importan y renderizan
// automáticamente con sus campos; si no está, el pegado se ignora (o cae al portapapeles
// interno en memoria).
//
// Forma exacta de lo que queda en el portapapeles del sistema:
//
//   {
//     "clipboardKind": "gensuite-template-elements",
//     "clipboardVersion": 1,
//     "format": "pos_invoice",
//     "elements": [ { "id": "...", "type": "text", "x": 20, ... }, ... ]
//   }

export const ELEMENTS_CLIPBOARD_KIND = 'gensuite-template-elements'
export const ELEMENTS_CLIPBOARD_VERSION = 1

export interface ElementsClipboardPayload {
  clipboardKind: typeof ELEMENTS_CLIPBOARD_KIND
  clipboardVersion: number
  format: TemplateType
  elements: TemplateElement[]
}

const KNOWN_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'qr',
  'barcode',
  'formula',
  'line',
  'logo',
  'table',
  'list',
  'repeater',
  'date',
  'conditional',
  'rectangle',
  'group',
])

/** Serializa los elementos al formato con cabecera — lo que se escribe al portapapeles. */
export function encodeElementsClipboard(format: TemplateType, elements: TemplateElement[]): string {
  const payload: ElementsClipboardPayload = {
    clipboardKind: ELEMENTS_CLIPBOARD_KIND,
    clipboardVersion: ELEMENTS_CLIPBOARD_VERSION,
    format,
    elements,
  }
  return JSON.stringify(payload, null, 2)
}

export interface DecodedElementsClipboard {
  /** Tipo de plantilla de origen — se pega tal cual aunque sea distinto al activo. */
  format: TemplateType
  elements: TemplateElement[]
  /** Elementos descartados por forma inválida o tipo desconocido (nunca tumban el pegado). */
  dropped: number
}

/** Detecta la cabecera y extrae los elementos — `null` si el texto no es un JSON del canvas. */
export function decodeElementsClipboard(text: string): DecodedElementsClipboard | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (obj.clipboardKind !== ELEMENTS_CLIPBOARD_KIND) return null
  if (typeof obj.clipboardVersion !== 'number') return null
  if (!Array.isArray(obj.elements)) return null
  const elements: TemplateElement[] = []
  let dropped = 0
  for (const raw of obj.elements) {
    if (!raw || typeof raw !== 'object') {
      dropped += 1
      continue
    }
    const el = raw as Record<string, unknown>
    if (typeof el.id !== 'string' || typeof el.type !== 'string' || !KNOWN_ELEMENT_TYPES.has(el.type)) {
      dropped += 1
      continue
    }
    elements.push(raw as TemplateElement)
  }
  const format: TemplateType = obj.format === 'label_5x2' ? 'label_5x2' : 'pos_invoice'
  return { format, elements, dropped }
}

/** Escribe texto al portapapeles del sistema (cruza pestañas y tenants) con fallback a
 * `execCommand` cuando la Clipboard API no está disponible o niega el permiso. */
export async function writeTextToSystemClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Sin Clipboard API (contexto no seguro, permiso denegado) — fallback clásico.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/** Lee texto del portapapeles del sistema — `null` si no hay acceso (el caller decide el
 * fallback al portapapeles interno en memoria). */
export async function readTextFromSystemClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}
