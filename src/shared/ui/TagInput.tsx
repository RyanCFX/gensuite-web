import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TagInputProps {
  /** Valor como string separado por comas (ej. "60, 90, 120") */
  value: string
  /** Recibe el string separado por comas actualizado */
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  id?: string
  disabled?: boolean
}

const SPLIT_RE = /[,;\s]+/

// ─── Component ────────────────────────────────────────────────────────────────

export function TagInput({ value, onChange, placeholder = '', className = '', id, disabled = false }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const tags = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const emit = (next: string[]) => onChange(next.join(', '))

  const commitDraft = () => {
    const t = draft.trim()
    if (!t) return
    emit([...tags, t])
    setDraft('')
  }

  const removeTag = (idx: number) => emit(tags.filter((_, i) => i !== idx))

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // Pega "60, 90, 120" (o escribe con comas/espacios) → agrega todos los números
    if (SPLIT_RE.test(raw)) {
      const valid = raw
        .split(SPLIT_RE)
        .map((p) => p.trim())
        .filter((p) => /^\d+$/.test(p))
      if (valid.length > 0) emit([...tags, ...valid])
      setDraft('')
      return
    }
    // Solo dígitos mientras se escribe
    setDraft(raw.replace(/\D/g, ''))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
      removeTag(tags.length - 1)
    } else if (e.key === 'Tab' && draft) {
      commitDraft()
    }
  }

  return (
    <div
      id={id}
      className={['tag-input', disabled ? 'tag-input--disabled' : '', className].filter(Boolean).join(' ')}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((t, i) => (
        <span key={`${t}-${i}`} className="tag-input-chip">
          {t}
          {!disabled && (
            <button
              type="button"
              className="tag-input-chip-remove"
              aria-label={`Quitar ${t}`}
              onClick={(e) => {
                e.stopPropagation()
                removeTag(i)
              }}
            >
              <X size={10} aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="tag-input-field"
        value={draft}
        placeholder={tags.length === 0 ? placeholder : ''}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        autoComplete="off"
      />
    </div>
  )
}
