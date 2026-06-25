import { useEffect, useRef, useCallback } from 'react'

const DRAFT_PREFIX = 'draft:'

export function useDraft<T extends Record<string, unknown>>(
  key: string,
  formState: T,
  isNew: boolean,
) {
  const saved = useRef(false)

  const save = useCallback(() => {
    if (!isNew) return
    try {
      localStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify({ data: formState, savedAt: new Date().toISOString() }))
    } catch { /* quota exceeded */ }
  }, [key, formState, isNew])

  useEffect(() => {
    if (!isNew || saved.current) return
    const interval = setInterval(save, 30000)
    return () => clearInterval(interval)
  }, [save, isNew])

  useEffect(() => {
    if (!isNew) return
    const handler = (e: BeforeUnloadEvent) => {
      save()
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [save, isNew])

  function clearDraft() {
    try { localStorage.removeItem(`${DRAFT_PREFIX}${key}`) } catch { /* ignore */ }
    saved.current = true
  }

  function getDraft(): { data: T; savedAt: string } | null {
    try {
      const raw = localStorage.getItem(`${DRAFT_PREFIX}${key}`)
      if (!raw) return null
      return JSON.parse(raw)
    } catch { return null }
  }

  return { save, clearDraft, getDraft }
}
