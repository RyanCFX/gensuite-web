import { useRef, useState, useMemo, type KeyboardEvent } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { FloatingPortal, useFloatingDropdown } from '@/lib/useFloatingPortal'

export interface MultiSearchSelectOption {
  id: string
  label: string
  /** Tasa porcentual opcional (ej. retención/impuesto) para contexto al usuario. */
  rate?: number
}

export interface MultiSearchSelectProps {
  value: string[]
  onChange: (ids: string[]) => void
  options: MultiSearchSelectOption[]
  placeholder?: string
  emptyLabel?: string
  disabled?: boolean
  id?: string
}

/**
 * Multi-selección con buscador, estilo combobox (como SearchSelect) — las opciones elegidas
 * aparecen como tags dentro del mismo control, en vez de un widget siempre expandido.
 */
export function MultiSearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar…',
  emptyLabel = 'Sin opciones configuradas.',
  disabled = false,
  id,
}: MultiSearchSelectProps) {
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { open, style, openDropdown, close, portalRef } = useFloatingDropdown(
    containerRef as React.RefObject<HTMLElement>,
    () => setQuery(''),
  )

  const selected = useMemo(() => options.filter((o) => value.includes(o.id)), [options, value])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  function renderLabel(o: MultiSearchSelectOption) {
    return o.rate != null ? `${o.label} (${o.rate}%)` : o.label
  }

  function toggle(optId: string) {
    onChange(value.includes(optId) ? value.filter((v) => v !== optId) : [...value, optId])
  }

  function remove(optId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    onChange(value.filter((v) => v !== optId))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && query === '' && selected.length > 0) {
      remove(selected[selected.length - 1].id)
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    <div className="search-select" ref={containerRef}>
      <div
        className={`multi-search-select-trigger${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}
        onClick={() => { if (!disabled) { openDropdown(); inputRef.current?.focus() } }}
      >
        {selected.map((o) => (
          <span key={o.id} className="badge badge-info multi-search-select-tag">
            {renderLabel(o)}
            {!disabled && (
              <button type="button" onClick={(e) => remove(o.id, e)} aria-label={`Quitar ${o.label}`}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="multi-search-select-input"
          value={query}
          placeholder={selected.length === 0 ? placeholder : ''}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); if (!open) openDropdown() }}
          onFocus={() => openDropdown()}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <ChevronDown size={14} aria-hidden="true" className={`search-select-chevron${open ? ' open' : ''}`} style={{ position: 'static', marginLeft: 'auto', flexShrink: 0 }} />
      </div>

      <FloatingPortal open={open} style={style} portalRef={portalRef}>
        <div className="search-select-dropdown" role="listbox" style={{ position: 'static', maxHeight: 240 }}>
          {options.length === 0 ? (
            <div className="search-select-empty">{emptyLabel}</div>
          ) : filtered.length === 0 ? (
            <div className="search-select-empty">Sin resultados para "{query}"</div>
          ) : (
            <div className="search-select-list">
              {filtered.map((opt) => {
                const checked = value.includes(opt.id)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className={`search-select-item${checked ? ' search-select-item--active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); toggle(opt.id) }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <input type="checkbox" checked={checked} readOnly style={{ pointerEvents: 'none', width: 14, height: 14, flexShrink: 0 }} />
                    <span className="search-select-item-label">{renderLabel(opt)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </FloatingPortal>
    </div>
  )
}
