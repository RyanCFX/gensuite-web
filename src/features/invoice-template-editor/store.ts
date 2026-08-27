import { create } from 'zustand'
import { DEFAULT_ZOOM, TEMPLATE_FORMATS, ZOOM_LEVELS } from './constants'
import { fetchAvailableFields, fetchDefaultTemplate, fetchTemplateGallery, saveTemplate } from './mocks'
import { createDefaultElement, createElementFromField, createEmptyPage, cloneDocument } from './elementFactory'
import { deleteDraft as deleteDraftStorage, getDraft, listDrafts, saveDraft as saveDraftStorage } from './drafts'
import type {
  DraftSummary,
  ElementType,
  TemplateDocument,
  TemplateElement,
  TemplateFieldCategory,
  TemplateFieldDef,
  TemplateGalleryItem,
  TemplatePage,
  TemplateType,
} from './types'

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
  /** Página donde se insertan elementos nuevos cuando no se especifica una explícita (ej. clic
   * en la paleta) — se actualiza automáticamente al seleccionar un elemento de otra página. */
  activePageId: Partial<Record<TemplateType, string>>
  loadingDocuments: boolean
  availableFields: TemplateFieldCategory[]
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
  applyDocument: (document: TemplateDocument) => void
  saveDraft: (name?: string) => void
  loadDraft: (id: string) => void
  removeDraft: (id: string) => void

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

export const useTemplateEditorStore = create<EditorState>((set, get) => ({
  format: 'pos_invoice',
  documents: {},
  activePageId: {},
  loadingDocuments: false,
  availableFields: [],
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
    const [fields, gallery, ...docs] = await Promise.all([
      fetchAvailableFields(),
      fetchTemplateGallery(),
      ...TEMPLATE_FORMATS.map((f) => fetchDefaultTemplate(f.type)),
    ])
    const documents: Partial<Record<TemplateType, TemplateDocument>> = {}
    const activePageId: Partial<Record<TemplateType, string>> = {}
    TEMPLATE_FORMATS.forEach((f, i) => {
      documents[f.type] = docs[i]
      activePageId[f.type] = docs[i].pages[0]?.id
    })
    set({
      availableFields: fields,
      templateGallery: gallery,
      documents,
      activePageId,
      drafts: listDrafts(),
      loadingDocuments: false,
      fieldsLoading: false,
      galleryLoading: false,
    })
  },

  setFormat: (type) => {
    const format = TEMPLATE_FORMATS.find((f) => f.type === type)
    if (format?.comingSoon) return
    set({ format: type, selectedIds: [] })
  },

  setPageHeight: (height) => {
    set((state) => {
      const doc = state.documents[state.format]
      if (!doc) return {}
      return { documents: { ...state.documents, [state.format]: { ...doc, page: { ...doc.page, height } } } }
    })
  },

  applyDocument: (document) => {
    const cloned = cloneDocument(document)
    set((state) => {
      const history = state.history[cloned.type]
      const previousPages = state.documents[cloned.type]?.pages
      return {
        format: cloned.type,
        documents: { ...state.documents, [cloned.type]: cloned },
        activePageId: { ...state.activePageId, [cloned.type]: cloned.pages[0]?.id },
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
    const result = await saveTemplate(doc)
    set({ saving: false, lastSavedAt: result.updatedAt })
  },
}))
