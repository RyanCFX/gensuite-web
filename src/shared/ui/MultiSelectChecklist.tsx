import { X, Search } from 'lucide-react'

export interface MultiSelectOption {
  id: string
  label: string
  /** Tasa porcentual opcional (ej. retención/impuesto) para contexto al usuario. */
  rate?: number
}

/** Checklist con chips + buscador para campos multi-selección (retenciones, templates de impuesto). */
export function MultiSelectChecklist({
  value,
  onChange,
  options,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  emptyLabel = 'No hay opciones configuradas.',
}: {
  value: string[]
  onChange: (ids: string[]) => void
  options: MultiSelectOption[]
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  emptyLabel?: string
}) {
  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options
  const selected = options.filter((o) => value.includes(o.id))

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id))
  }

  function renderLabel(o: MultiSelectOption) {
    return o.rate != null ? `${o.label} (${o.rate}%)` : o.label
  }

  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selected.map((o) => (
            <span
              key={o.id}
              className="badge badge-info"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {renderLabel(o)}
              <button
                type="button"
                onClick={() => toggle(o.id, false)}
                aria-label={`Quitar ${o.label}`}
                style={{
                  display: 'inline-flex',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 8 }}>
        <Search size={13} style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-tertiary)', pointerEvents: 'none',
        }} />
        <input
          type="text"
          className="ff-input"
          style={{ paddingLeft: 28 }}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        maxHeight: 160,
        overflowY: 'auto',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 6,
      }}>
        {options.length === 0
          ? <p className="ff-hint" style={{ margin: 4 }}>{emptyLabel}</p>
          : filtered.length === 0
            ? <p className="ff-hint" style={{ margin: 4 }}>Sin resultados para "{search}".</p>
            : filtered.map((o) => {
              const checked = value.includes(o.id)
              return (
                <label
                  key={o.id}
                  className="ff-check-wrap"
                  style={{
                    fontSize: 13,
                    padding: '5px 6px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: checked ? 'var(--surface-sunken)' : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={checked}
                    onChange={(e) => toggle(o.id, e.target.checked)}
                  />
                  {renderLabel(o)}
                </label>
              )
            })}
      </div>
    </div>
  )
}
