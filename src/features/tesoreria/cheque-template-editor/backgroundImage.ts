// Imagen de fondo (escaneo/foto del cheque real) usada solo para calibrar visualmente las
// posiciones en el canvas. Deliberadamente NO se envía al backend ni forma parte del DTO de la
// plantilla — es una ayuda puramente local, guardada en localStorage por id de plantilla (o
// "nueva" mientras aún no existe), igual que los borradores del editor de facturas.

const STORAGE_PREFIX = 'cheque-tpl-bg:'
// ~2 MB en base64 — margen prudente frente a la cuota típica de localStorage (5 MB) dejando
// espacio para el resto de datos que el navegador guarde en el mismo origen.
const MAX_BYTES = 2 * 1024 * 1024

export interface ChequeBackgroundImage {
  dataUrl: string
  opacity: number
  visible: boolean
}

function key(templateKey: string) {
  return `${STORAGE_PREFIX}${templateKey}`
}

export function getBackgroundImage(templateKey: string): ChequeBackgroundImage | null {
  try {
    const raw = localStorage.getItem(key(templateKey))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.dataUrl !== 'string') return null
    return {
      dataUrl: parsed.dataUrl,
      opacity: typeof parsed.opacity === 'number' ? parsed.opacity : 0.5,
      visible: parsed.visible !== false,
    }
  } catch {
    return null
  }
}

// Devuelve null en éxito, o un mensaje de error para mostrar al usuario.
export function setBackgroundImage(templateKey: string, image: ChequeBackgroundImage): string | null {
  if (image.dataUrl.length > MAX_BYTES) {
    return 'La imagen es demasiado grande (máx. ~2 MB). Prueba con una versión comprimida.'
  }
  try {
    localStorage.setItem(key(templateKey), JSON.stringify(image))
    return null
  } catch {
    return 'No se pudo guardar la imagen (almacenamiento local lleno o no disponible).'
  }
}

export function clearBackgroundImage(templateKey: string) {
  try {
    localStorage.removeItem(key(templateKey))
  } catch {
    // no-op
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
