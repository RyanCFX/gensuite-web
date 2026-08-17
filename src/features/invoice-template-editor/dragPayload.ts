import type { ElementType, TemplateFieldDef } from './types'

const MIME = 'application/x-template-editor'

export type DragPayload =
  | { kind: 'element'; elementType: ElementType }
  | { kind: 'field'; field: TemplateFieldDef }

export function setDragPayload(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(MIME, JSON.stringify(payload))
}

export function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DragPayload
  } catch {
    return null
  }
}
