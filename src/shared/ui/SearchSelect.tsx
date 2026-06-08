import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { useDebounce } from '@/lib/useDebounce'
import { FloatingPortal, useFloatingDropdown } from '@/lib/useFloatingPortal'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchSelectOption {
  value: string       // ID sent to the API
  label: string       // Main display text
  sublabel?: string   // Secondary text (e.g. RNC, NCF)
}

export interface SearchSelectProps {
  /** Current selected value (id string) */
  value: string
  /** Called with the id when user selects an option, '' when cleared */
  onChange: (value: string, option: SearchSelectOption | null) => void
  /** Search results to display in the dropdown */
  options: SearchSelectOption[]
  /** Called with debounced search query when user types */
  onSearch: (query: string) => void
  /** Debounce delay in ms (default 300) */
  debounceMs?: number
  /** Loading state — shows spinner in dropdown */
  loading?: boolean
  placeholder?: string
  error?: boolean
  disabled?: boolean
  /** Label shown on the input when an option is selected */
  selectedLabel?: string
  className?: string
  id?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SearchSelect({
  value,
  onChange,
  options,
  onSearch,
  debounceMs = 300,
  loading = false,
  placeholder = 'Buscar…',
  error = false,
  disabled = false,
  selectedLabel,
  className = '',
  id,
}: SearchSelectProps) {
  const [inputValue, setInputValue] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Portal-based floating dropdown — bypasses overflow:hidden on parent containers
  const { open, style, openDropdown, close, portalRef } = useFloatingDropdown(
    containerRef as React.RefObject<HTMLElement>,
    () => { if (value) setInputValue('') },
  )

  // Debounce the search query
  const debouncedQuery = useDebounce(inputValue, debounceMs)
  useEffect(() => {
    if (open) onSearch(debouncedQuery)
  }, [debouncedQuery, open, onSearch])

  // Reset focused index when options change
  useEffect(() => { setFocusedIdx(-1) }, [options])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIdx < 0 || !listRef.current) return
    const item = listRef.current.querySelectorAll<HTMLElement>('.search-select-item')[focusedIdx]
    item?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx])

  const displayValue = open
    ? inputValue
    : value && selectedLabel
      ? selectedLabel
      : value && !selectedLabel
        ? options.find((o) => o.value === value)?.label ?? ''
        : ''

  const handleFocus = () => {
    openDropdown()
    onSearch('')
    // Select all text so user can immediately type a new search
    inputRef.current?.select()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (!open) openDropdown()
  }

  const handleSelect = useCallback((opt: SearchSelectOption) => {
    onChange(opt.value, opt)
    setInputValue('')
    close()
    setFocusedIdx(-1)
  }, [onChange, close])

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('', null)
    setInputValue('')
    close()
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        openDropdown()
        onSearch('')
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIdx((i) => Math.min(i + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIdx((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (focusedIdx >= 0 && options[focusedIdx]) {
          handleSelect(options[focusedIdx])
        } else if (options.length === 1) {
          handleSelect(options[0])
        }
        break
      case 'Escape':
        close()
        if (value) setInputValue('')
        break
      case 'Tab':
        close()
        break
    }
  }

  const isSelected = Boolean(value)
  const inputCls = [
    'search-select-input',
    isSelected && !open ? 'search-select-input--selected' : '',
    error ? 'search-select-input--error' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className="search-select" ref={containerRef}>
      <div className="search-select-input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={inputCls}
          value={displayValue}
          placeholder={isSelected ? '' : placeholder}
          disabled={disabled}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {/* Clear button when something is selected */}
        {isSelected && !disabled && (
          <button
            type="button"
            className="search-select-clear"
            onClick={handleClear}
            aria-label="Limpiar selección"
            tabIndex={-1}
          >
            <X size={11} aria-hidden="true" />
          </button>
        )}

        {/* Chevron when nothing selected */}
        {!isSelected && (
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`search-select-chevron${open ? ' open' : ''}`}
          />
        )}
      </div>

      <FloatingPortal open={open} style={style} portalRef={portalRef}>
        <div className="search-select-dropdown" role="listbox" ref={listRef}
          style={{ position: 'static', maxHeight: 220 }}>
          {loading ? (
            <div className="search-select-loading">
              <span className="spinner spinner-brand spinner-sm" aria-hidden="true" />
              Buscando…
            </div>
          ) : options.length === 0 ? (
            <div className="search-select-empty">
              {inputValue ? 'Sin resultados para tu búsqueda' : 'Escribe para buscar…'}
            </div>
          ) : (
            <div className="search-select-list">
              {options.map((opt, idx) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={[
                    'search-select-item',
                    opt.value === value ? 'search-select-item--active' : '',
                    idx === focusedIdx ? 'focused' : '',
                  ].filter(Boolean).join(' ')}
                  onMouseDown={(e) => {
                    e.preventDefault() // prevent blur before click registers
                    handleSelect(opt)
                  }}
                  onMouseEnter={() => setFocusedIdx(idx)}
                >
                  <span className="search-select-item-label">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="search-select-item-sub">{opt.sublabel}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </FloatingPortal>
    </div>
  )
}
