import { useEffect, useRef, useCallback } from 'react'

interface UseBarcodeScannerOptions {
  onBarcode: (code: string) => void
  minLength?: number
  interKeyDelay?: number
  enabled?: boolean
}

export function useBarcodeScanner({
  onBarcode,
  minLength = 4,
  interKeyDelay = 80,
  enabled = true,
}: UseBarcodeScannerOptions) {
  const buffer = useRef('')
  const lastKeyTime = useRef(0)

  const handler = useCallback((e: KeyboardEvent) => {
    if (!enabled) return
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return

    const now = Date.now()
    if (now - lastKeyTime.current < interKeyDelay) {
      buffer.current += e.key
    } else {
      buffer.current = e.key
    }
    lastKeyTime.current = now

    if (e.key === 'Enter' && buffer.current.length > minLength) {
      const code = buffer.current.replace('Enter', '').trim()
      if (code) onBarcode(code)
      buffer.current = ''
      e.preventDefault()
    }
  }, [onBarcode, minLength, interKeyDelay, enabled])

  useEffect(() => {
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handler])
}
