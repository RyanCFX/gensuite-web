import { create, type StoreApi } from 'zustand'
import { DEFAULT_ZOOM, TEMPLATE_FORMATS, ZOOM_LEVELS } from './constants'
import { fetchDefaultTemplate, fetchTemplateGallery } from './mocks'
import { createDefaultElement, createElementFromField, createEmptyPage, cloneDocument } from './elementFactory'
import { deleteDraft as deleteDraftStorage, getDraft, listDrafts, saveDraft as saveDraftStorage } from './drafts'
import { toApiType, fromApiType } from './typeMapping'
import { mapCamposToFieldCategories } from './apiAdapters'
import {
  createPlantilla,
  deletePlantilla,
  getCamposDisponibles,
  getPlantillaDefault,
  listPlantillas,
  marcarPlantillaDefault,
  updatePlantilla,
} from '@/shared/api/plantillas'
import type {
  DraftSummary,
  ElementType,
  TemplateDocument,
  TemplateElement,
  TemplateFieldCategory,
  TemplateFieldDef,
  TemplateGalleryItem,
  TemplatePage,
  TemplateSummary,
  TemplateType,
} from './types'

/** Nombre por defecto para el primer guardado de un tipo — el usuario todavía no tiene UI
 * para renombrar la plantilla activa, así que se usa el label del formato. */
function defaultTemplateName(type: TemplateType): string {
  return TEMPLATE_FORMATS.find((f) => f.type === type)?.label ?? type
}

interface History {
  past: TemplatePage[][]
  future: TemplatePage[][]
}

function emptyHistory(): History {
  return { past: [], future: [] }
}

interface EditorState {
  format: TemplateType
  documents: Partial<Record<TemplateType, TemplateDocument>>
  /** Id de la plantilla persistida en el backend para cada tipo — `null` cuando el documento
   * activo es la plantilla sugerida (fallback por 404 de "sin default"), aún no guardada. */
  templateId: Partial<Record<TemplateType, string | null>>
  templateName: Partial<Record<TemplateType, string>>
  /** Página donde se insertan elementos nuevos cuando no se especifica una explícita (ej. clic
   * en la paleta) — se actualiza automáticamente al seleccionar un elemento de otra página. */
  activePageId: Partial<Record<TemplateType, string>>
  loadingDocuments: boolean
  /** Catálogo de campos del tipo actualmente activo — ver `availableFieldsByType` para el de
   * ambos tipos (el catálogo real es distinto por tipo, a diferencia del mock). */
  availableFields: TemplateFieldCategory[]
  availableFieldsByType: Partial<Record<TemplateType, TemplateFieldCategory[]>>
  fieldsLoading: boolean
  selectedIds: string[]
  zoom: number
  saving: boolean
  lastSavedAt: string | null
  history: Record<TemplateType, History>
  templateGallery: TemplateGalleryItem[]
  galleryLoading: boolean
  drafts: DraftSummary[]

  init: () => Promise<void>
  setFormat: (type: TemplateType) => void
  setPageHeight: (height: number | null) => void
  /** Reemplaza el documento activo del tipo. `meta.templateId` debe pasarse cuando el
   * documento viene de una plantilla ya guardada en el backend (para que `save()` la
   * actualice en vez de crear una nueva) — se omite (queda `null`) para plantillas de la
   * galería o borradores, que todavía no tienen un id persistido. */
  applyDocument: (document: TemplateDocument, meta?: { templateId?: string | null; templateName?: string }) => void
  saveDraft: (name?: string) => void
  loadDraft: (id: string) => void
  removeDraft: (id: string) => void

  /** Marca `id` como plantilla default de su `(company, plantillaType)` en el backend. */
  setDefaultTemplate: (id: string) => Promise<void>
  /** Elimina una plantilla guardada. El backend no protege la default (§1.7 del doc de la
   * tarea) — la confirmación/advertencia es responsabilidad de quien llame esto. */
  deleteTemplate: (id: string) => Promise<void>
  listSavedTemplates: (type: TemplateType) => Promise<TemplateSummary[]>

  addPage: () => void
  removePage: (pageId: string) => void

  addElement: (type: ElementType, position?: { x: number; y: number }, pageId?: string) => string
  addElementFromField: (field: TemplateFieldDef, position?: { x: number; y: number }, pageId?: string) => string
  updateElement: (id: string, patch: Partial<TemplateElement>) => void
  removeElement: (id: string) => void
  duplicateElement: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void

  selectIds: (ids: string[]) => void
  clearSelection: () => void

  beginTransaction: () => void

  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomByFactor: (factor: number) => void

  undo: () => void
  redo: () => void

  save: () => Promise<void>
}

function activeDocOf(state: EditorState): TemplateDocument {
  const doc = state.documents[state.format]
  if (!doc) throw new Error('La plantilla activa aún no se ha cargado')
  return doc
}

function findPageIndexOfElement(doc: TemplateDocument, id: string): number {
  return doc.pages.findIndex((p) => p.elements.some((el) => el.id === id))
}

/** Página donde insertar un elemento nuevo cuando no se pasa un `pageId` explícito — la última
 * página en la que el usuario seleccionó algo, o la primera si aún no hay ninguna referencia. */
function fallbackPageId(state: EditorState, doc: TemplateDocument): string {
  const active = state.activePageId[state.format]
  if (active && doc.pages.some((p) => p.id === active)) return active
  return doc.pages[0].id
}

/** Reemplaza el arreglo `pages` del documento activo aplicando `updater` solo a la página dada
 * (por id) — el resto de las páginas quedan intactas. */
function withPageElements(
  state: EditorState,
  pageId: string,
  updater: (elements: TemplateElement[]) => TemplateElement[],
): Partial<EditorState> {
  const doc = activeDocOf(state)
  const pages = doc.pages.map((p) => (p.id === pageId ? { ...p, elements: updater(p.elements) } : p))
  return { documents: { ...state.documents, [state.format]: { ...doc, pages } } }
}

/** Igual que `withPageElements`, pero localiza automáticamente la página que contiene `id`. */
function withOwningPageElements(
  state: EditorState,
  id: string,
  updater: (elements: TemplateElement[]) => TemplateElement[],
): Partial<EditorState> {
  const doc = activeDocOf(state)
  const pageIndex = findPageIndexOfElement(doc, id)
  if (pageIndex === -1) return {}
  const pages = doc.pages.map((p, i) => (i === pageIndex ? { ...p, elements: updater(p.elements) } : p))
  return { documents: { ...state.documents, [state.format]: { ...doc, pages } } }
}

/** Cuerpo de `init()` extraído a función de módulo para poder envolverlo en un try/finally
 * único (ver `init`) sin anidar otro nivel de try/catch dentro del store literal. */
async function initFromBackend(set: StoreApi<EditorState>['setState']) {
  const [fieldsByType, gallery, loaded] = await Promise.all([
    Promise.all(
      TEMPLATE_FORMATS.map(async (f) => {
        try {
          const campos = await getCamposDisponibles(toApiType(f.type))
          return [f.type, mapCamposToFieldCategories(campos)] as const
        } catch {
          // Backend caído/transitorio — no debe dejar el editor colgado en el spinner de
          // carga; se abre sin catálogo dinámico en vez de romper la pantalla por completo.
          return [f.type, [] as TemplateFieldCategory[]] as const
        }
      }),
    ),
    fetchTemplateGallery(),
    Promise.all(
      TEMPLATE_FORMATS.map(async (f) => {
        try {
          const plantilla = await getPlantillaDefault(toApiType(f.type))
          return {
            type: f.type,
            document: plantilla.documentJson as unknown as TemplateDocument,
            templateId: plantilla.id,
            templateName: plantilla.plantillaName,
          }
        } catch {
          // Sin plantilla default configurada (404, per §1.4) u otro error de red — cae a
          // la plantilla sugerida local, nunca error fatal de pantalla.
          const document = await fetchDefaultTemplate(f.type)
          return { type: f.type, document, templateId: null, templateName: undefined }
        }
      }),
    ),
  ])

  const availableFieldsByType: Partial<Record<TemplateType, TemplateFieldCategory[]>> = {}
  fieldsByType.forEach(([type, categories]) => {
    availableFieldsByType[type] = categories
  })

  const documents: Partial<Record<TemplateType, TemplateDocument>> = {}
  const activePageId: Partial<Record<TemplateType, string>> = {}
  const templateId: Partial<Record<TemplateType, string | null>> = {}
  const templateName: Partial<Record<TemplateType, string>> = {}
  loaded.forEach((entry) => {
    documents[entry.type] = entry.document
    activePageId[entry.type] = entry.document.pages[0]?.id
    templateId[entry.type] = entry.templateId
    templateName[entry.type] = entry.templateName ?? defaultTemplateName(entry.type)
  })

  set((state) => ({
    availableFieldsByType,
    availableFields: availableFieldsByType[state.format] ?? [],
    templateGallery: gallery,
    documents,
    activePageId,
    templateId,
    templateName,
    drafts: listDrafts(),
  }))
}

export const useTemplateEditorStore = create<EditorState>((set, get) => ({
  format: 'pos_invoice',
  documents: {},
  templateId: {},
  templateName: {},
  activePageId: {},
  loadingDocuments: false,
  availableFields: [],
  availableFieldsByType: {},
  fieldsLoading: false,
  selectedIds: [],
  zoom: DEFAULT_ZOOM,
  saving: false,
  lastSavedAt: null,
  history: {
    pos_invoice: emptyHistory(),
    label_5x2: emptyHistory(),
  },
  templateGallery: [],
  galleryLoading: false,
  drafts: [],

  init: async () => {
    set({ loadingDocuments: true, fieldsLoading: true, galleryLoading: true })
    try {
      await initFromBackend(set)
    } finally {
      // Defensa adicional: ante cualquier fallo no anticipado (no solo los ya cubiertos por
      // los try/catch internos), nunca dejar el editor colgado en el spinner de carga.
      set({ loadingDocuments: false, fieldsLoading: false, galleryLoading: false })
    }
  },

  setFormat: (type) => {
    const format = TEMPLATE_FORMATS.find((f) => f.type === type)
    if (format?.comingSoon) return
    set((state) => ({ format: type, selectedIds: [], availableFields: state.availableFieldsByType[type] ?? [] }))
  },

  setPageHeight: (height) => {
    set((state) => {
      const doc = state.documents[state.format]
      if (!doc) return {}
      return { documents: { ...state.documents, [state.format]: { ...doc, page: { ...doc.page, height } } } }
    })
  },

  applyDocument: (document, meta) => {
    const cloned = cloneDocument(document)
    set((state) => {
      const history = state.history[cloned.type]
      const previousPages = state.documents[cloned.type]?.pages
      return {
        format: cloned.type,
        documents: { ...state.documents, [cloned.type]: cloned },
        activePageId: { ...state.activePageId, [cloned.type]: cloned.pages[0]?.id },
        // Sin `meta.templateId` explícito (galería/borrador), se rompe el vínculo con
        // cualquier plantilla guardada que estuviera activa — de lo contrario `save()`
        // sobrescribiría esa plantilla del backend con un contenido no relacionado.
        templateId: { ...state.templateId, [cloned.type]: meta?.templateId ?? null },
        templateName: meta?.templateName
          ? { ...state.templateName, [cloned.type]: meta.templateName }
          : state.templateName,
        history: {
          ...state.history,
          [cloned.type]: previousPages ? { past: [...history.past, previousPages], future: [] } : history,
        },
        selectedIds: [],
      }
    })
  },

  saveDraft: (name) => {
    const state = get()
    const doc = state.documents[state.format]
    if (!doc) return
    saveDraftStorage(doc.type, doc, name)
    set({ drafts: listDrafts() })
  },

  loadDraft: (id) => {
    const draft = getDraft(id)
    if (!draft) return
    get().applyDocument(draft.document)
  },

  removeDraft: (id) => {
    deleteDraftStorage(id)
    set({ drafts: listDrafts() })
  },

  addPage: () => {
    get().beginTransaction()
    set((state) => {
      const doc = activeDocOf(state)
      const newPage = createEmptyPage()
      const pages = [...doc.pages, newPage]
      return {
        documents: { ...state.documents, [state.format]: { ...doc, pages } },
        activePageId: { ...state.activePageId, [state.format]: newPage.id },
        selectedIds: [],
      }
    })
  },

  removePage: (pageId) => {
    get().beginTransaction()
    set((state) => {
      const doc = activeDocOf(state)
      if (doc.pages.length <= 1) return {}
      const pages = doc.pages.filter((p) => p.id !== pageId)
      const wasActive = state.activePageId[state.format] === pageId
      return {
        documents: { ...state.documents, [state.format]: { ...doc, pages } },
        activePageId: wasActive ? { ...state.activePageId, [state.format]: pages[0].id } : state.activePageId,
        selectedIds: [],
      }
    })
  },

  beginTransaction: () => {
    const state = get()
    const doc = state.documents[state.format]
    if (!doc) return
    const history = state.history[state.format]
    set({
      history: {
        ...state.history,
        [state.format]: { past: [...history.past, doc.pages], future: [] },
      },
    })
  },

  addElement: (type, position, pageId) => {
    get().beginTransaction()
    const element = createDefaultElement(type, position ? { x: position.x, y: position.y } : undefined)
    set((state) => {
      const doc = activeDocOf(state)
      const targetPageId = pageId ?? fallbackPageId(state, doc)
      return {
        ...withPageElements(state, targetPageId, (elements) => [...elements, element]),
        activePageId: { ...state.activePageId, [state.format]: targetPageId },
        selectedIds: [element.id],
      }
    })
    return element.id
  },

  addElementFromField: (field, position, pageId) => {
    get().beginTransaction()
    const element = createElementFromField(field)
    if (position) { element.x = position.x; element.y = position.y }
    set((state) => {
      const doc = activeDocOf(state)
      const targetPageId = pageId ?? fallbackPageId(state, doc)
      return {
        ...withPageElements(state, targetPageId, (elements) => [...elements, element]),
        activePageId: { ...state.activePageId, [state.format]: targetPageId },
        selectedIds: [element.id],
      }
    })
    return element.id
  },

  updateElement: (id, patch) => {
    set((state) => withOwningPageElements(state, id, (elements) =>
      elements.map((el) => (el.id === id ? ({ ...el, ...patch } as TemplateElement) : el)),
    ))
  },

  removeElement: (id) => {
    get().beginTransaction()
    set((state) => ({
      ...withOwningPageElements(state, id, (elements) => elements.filter((el) => el.id !== id)),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    }))
  },

  duplicateElement: (id) => {
    get().beginTransaction()
    let newId: string | undefined
    set((state) => withOwningPageElements(state, id, (elements) => {
      const source = elements.find((el) => el.id === id)
      if (!source) return elements
      const copy: TemplateElement = { ...source, id: `${source.id}_copy_${Date.now() % 100000}`, x: source.x + 12, y: source.y + 12 }
      newId = copy.id
      return [...elements, copy]
    }))
    if (newId) set({ selectedIds: [newId] })
  },

  bringToFront: (id) => {
    get().beginTransaction()
    set((state) => withOwningPageElements(state, id, (elements) => {
      const target = elements.find((el) => el.id === id)
      if (!target) return elements
      return [...elements.filter((el) => el.id !== id), target]
    }))
  },

  sendToBack: (id) => {
    get().beginTransaction()
    set((state) => withOwningPageElements(state, id, (elements) => {
      const target = elements.find((el) => el.id === id)
      if (!target) return elements
      return [target, ...elements.filter((el) => el.id !== id)]
    }))
  },

  selectIds: (ids) => set((state) => {
    if (ids.length !== 1) return { selectedIds: ids }
    const doc = state.documents[state.format]
    if (!doc) return { selectedIds: ids }
    const pageIndex = findPageIndexOfElement(doc, ids[0])
    if (pageIndex === -1) return { selectedIds: ids }
    return { selectedIds: ids, activePageId: { ...state.activePageId, [state.format]: doc.pages[pageIndex].id } }
  }),
  clearSelection: () => set({ selectedIds: [] }),

  setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.25, zoom)) }),
  zoomIn: () => set((state) => {
    const next = ZOOM_LEVELS.find((z) => z > state.zoom + 0.001) ?? state.zoom
    return { zoom: next }
  }),
  zoomOut: () => set((state) => {
    const reversed = [...ZOOM_LEVELS].reverse()
    const next = reversed.find((z) => z < state.zoom - 0.001) ?? state.zoom
    return { zoom: next }
  }),
  zoomByFactor: (factor) => set((state) => ({ zoom: Math.min(2, Math.max(0.25, state.zoom * factor)) })),

  undo: () => {
    const state = get()
    const doc = state.documents[state.format]
    const history = state.history[state.format]
    if (!doc || history.past.length === 0) return
    const previous = history.past[history.past.length - 1]
    const newPast = history.past.slice(0, -1)
    const stillActive = previous.some((p) => p.id === state.activePageId[state.format])
    set({
      documents: { ...state.documents, [state.format]: { ...doc, pages: previous } },
      activePageId: stillActive ? state.activePageId : { ...state.activePageId, [state.format]: previous[0]?.id },
      history: { ...state.history, [state.format]: { past: newPast, future: [doc.pages, ...history.future] } },
      selectedIds: [],
    })
  },

  redo: () => {
    const state = get()
    const doc = state.documents[state.format]
    const history = state.history[state.format]
    if (!doc || history.future.length === 0) return
    const next = history.future[0]
    const newFuture = history.future.slice(1)
    const stillActive = next.some((p) => p.id === state.activePageId[state.format])
    set({
      documents: { ...state.documents, [state.format]: { ...doc, pages: next } },
      activePageId: stillActive ? state.activePageId : { ...state.activePageId, [state.format]: next[0]?.id },
      history: { ...state.history, [state.format]: { past: [...history.past, doc.pages], future: newFuture } },
      selectedIds: [],
    })
  },

  save: async () => {
    const state = get()
    const doc = state.documents[state.format]
    if (!doc) return
    set({ saving: true })
    try {
      const existingId = state.templateId[state.format]
      const documentJson = doc as unknown as Record<string, unknown>
      const saved = existingId
        ? await updatePlantilla(existingId, { documentJson })
        : await createPlantilla({
            plantillaType: toApiType(state.format),
            plantillaName: state.templateName[state.format] ?? defaultTemplateName(state.format),
            documentJson,
            isDefault: true,
          })
      set((s) => ({
        saving: false,
        lastSavedAt: new Date().toISOString(),
        templateId: { ...s.templateId, [state.format]: saved.id },
        templateName: { ...s.templateName, [state.format]: saved.plantillaName },
      }))
    } catch (err) {
      set({ saving: false })
      throw err
    }
  },

  setDefaultTemplate: async (id) => {
    const updated = await marcarPlantillaDefault(id)
    const type = fromApiType(updated.plantillaType)
    set((state) => ({
      templateId: { ...state.templateId, [type]: updated.id },
      templateName: { ...state.templateName, [type]: updated.plantillaName },
    }))
  },

  deleteTemplate: async (id) => {
    await deletePlantilla(id)
    set((state) => {
      const stillCurrent = (Object.keys(state.templateId) as TemplateType[]).find(
        (type) => state.templateId[type] === id,
      )
      if (!stillCurrent) return {}
      return { templateId: { ...state.templateId, [stillCurrent]: null } }
    })
  },

  listSavedTemplates: async (type) => {
    const { items } = await listPlantillas({ type: toApiType(type) })
    return items.map((p) => ({
      id: p.id,
      type: fromApiType(p.plantillaType),
      name: p.plantillaName,
      updatedAt: '',
      isDefault: p.isDefault,
    }))
  },
}))
