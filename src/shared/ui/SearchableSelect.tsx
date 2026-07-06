import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useFloatingDropdown, FloatingPortal } from '@/lib/useFloatingPortal'

export interface SelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Text for the blank/reset option (e.g. "Sin marca"). Omit to require a value. */
  emptyLabel?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  error?: boolean
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  emptyLabel,
  placeholder = 'Seleccionar…',
  disabled = false,
  className = 'ff-select',
  error = false,
}: SearchableSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { open, style, toggle, close, portalRef } = useFloatingDropdown(triggerRef)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const allOptions: SelectOption[] = emptyLabel
    ? [{ value: '', label: emptyLabel }, ...options]
    : options

  const filtered = useMemo(() => {
    if (!query.trim()) return allOptions
    const q = query.toLowerCase()
    return allOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [query, allOptions])

  const selectedLabel = allOptions.find((o) => o.value === value)?.label

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlighted(0)
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open])

  const select = useCallback((val: string) => {
    onChange(val)
    close()
  }, [onChange, close])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlighted]) select(filtered[highlighted].value)
    } else if (e.key === 'Escape') {
      close()
    }
  }

  const triggerClass = [
    className,
    error ? ' ff-input-error' : '',
  ].join('')

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={triggerClass}
        disabled={disabled}
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          width: '100%',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selectedLabel ?? <span style={{ color: 'var(--text-tertiary)' }}>{placeholder}</span>}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
      </button>

      <FloatingPortal open={open} style={style} portalRef={portalRef}>
        <div className="select-content" style={{ minWidth: 200 }}>
          {/* Search input */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-default)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)', pointerEvents: 'none',
              }} />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlighted(0) }}
                onKeyDown={handleKeyDown}
                placeholder="Buscar…"
                style={{
                  width: '100%',
                  padding: '4px 8px 4px 26px',
                  fontSize: 13,
                  border: '1px solid var(--border-input, var(--border-default))',
                  borderRadius: 6,
                  background: 'var(--bg-input, var(--surface-raised))',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                Sin resultados
              </div>
            ) : (
              filtered.map((opt, idx) => (
                <button
                  key={opt.value}
                  type="button"
                  className="select-item"
                  data-selected={opt.value === value ? '' : undefined}
                  data-highlighted={idx === highlighted ? '' : undefined}
                  style={idx === highlighted ? { background: 'var(--surface-hover, var(--bg-hover))' } : undefined}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => select(opt.value)}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      </FloatingPortal>
    </div>
  )
}
