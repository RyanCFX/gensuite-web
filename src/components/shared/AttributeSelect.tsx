import { useQuery } from '@tanstack/react-query'
import { listAttributes } from '@/shared/api/catalog'

interface AttributeSelectProps {
  selected: string[]          // array of attribute ids selected
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function AttributeSelect({ selected, onChange, disabled }: AttributeSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['attributes'],
    queryFn: () => listAttributes({ limit: 100 }),
    staleTime: 60_000,
  })

  const attributes = data?.items ?? []

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id))
    else onChange([...selected, id])
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {[80, 60, 70].map((w, i) => (
          <span key={i} className="skeleton-box" style={{ height: 28, width: w }} />
        ))}
      </div>
    )
  }

  if (attributes.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        No hay atributos disponibles.{' '}
        <a href="/catalogo/atributos" style={{ color: 'var(--text-link)' }}>
          Crear atributos
        </a>
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {attributes.map((attr) => {
        const isSelected = selected.includes(attr.id)
        return (
          <button
            key={attr.id}
            type="button"
            onClick={() => !disabled && toggle(attr.id)}
            disabled={disabled}
            style={{
              height: 28,
              padding: '0 12px',
              borderRadius: 'var(--radius-full)',
              border: isSelected
                ? `1.5px solid var(--brand-primary)`
                : '1px solid var(--border-default)',
              background: isSelected ? 'var(--brand-primary-subtle)' : 'var(--surface-page)',
              color: isSelected ? 'var(--brand-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: isSelected ? 600 : 400,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 150ms',
            }}
          >
            {attr.name}
            {!attr.numeric && attr.values && ` (${attr.values.length})`}
          </button>
        )
      })}
    </div>
  )
}
