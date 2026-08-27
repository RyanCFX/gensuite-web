// Borradores del editor de plantillas — a diferencia del resto del módulo (mocks.ts), esto NO
// es un stub esperando un backend: persiste de verdad en localStorage para que el usuario no
// pierda su trabajo en progreso al recargar la página, mientras no existe un backend real que
// guarde plantillas. Cuando exista el backend, esto puede migrarse a un endpoint tipo
// `POST /template-editor/borradores` sin cambiar la forma en que el store los consume.

import type { Draft, DraftSummary, TemplateDocument, TemplateType } from './types'

const STORAGE_KEY = 'tpl-editor-drafts'

function readAll(): Draft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Descarta borradores guardados con el esquema anterior (documento de una sola página,
    // sin `pages`) — evita que un borrador viejo en localStorage rompa el editor al cargarlo.
    return parsed.filter((d): d is Draft => Array.isArray(d?.document?.pages))
  } catch {
    return []
  }
}

function writeAll(drafts: Draft[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // localStorage lleno o no disponible (modo privado) — el borrador simplemente no persiste.
  }
}

export function listDrafts(): DraftSummary[] {
  return readAll()
    .map(({ id, type, name, savedAt }) => ({ id, type, name, savedAt }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function getDraft(id: string): Draft | undefined {
  return readAll().find((d) => d.id === id)
}

export function saveDraft(type: TemplateType, document: TemplateDocument, name?: string): Draft {
  const drafts = readAll()
  const draft: Draft = {
    id: `draft_${Date.now()}_${Math.round(Math.random() * 1000)}`,
    type,
    name: name?.trim() || `Borrador ${new Date().toLocaleString('es-DO')}`,
    savedAt: new Date().toISOString(),
    document,
  }
  writeAll([draft, ...drafts])
  return draft
}

export function deleteDraft(id: string) {
  writeAll(readAll().filter((d) => d.id !== id))
}
