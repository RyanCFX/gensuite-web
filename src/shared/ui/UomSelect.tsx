/**
 * UomSelect
 * ---------
 * Select de Unidad de Medida con dos modos:
 *
 * Sin itemCode → select nativo con todas las UOMs de /config/uom.
 *
 * Con itemCode → muestra las UOMs del artículo (stockUom + uoms[])
 *   obtenidas de GET /catalog/items/:id.
 *   Si solo hay 1 UOM, se muestra como texto no editable.
 *   Si hay más de 1, dropdown con portal + "Más opciones".
 */

import { useRef, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Plus } from 'lucide-react'
import { listUOMs } from '@/shared/api/config'
import { getItem } from '@/shared/api/catalog'
import { useFloatingDropdown, FloatingPortal } from '@/lib/useFloatingPortal'

interface UomSelectProps {
  value: string
  /** conversionFactor = cuántas unidades de stockUom equivale 1 de la UOM seleccionada.
   *  Es 1 cuando se selecciona stockUom o una UOM sin conversión configurada. */
  onChange: (value: string, conversionFactor: number) => void
  /** Cuando se provee, muestra primero las UOMs del artículo */
  itemCode?: string
  className?: string
  disabled?: boolean
  error?: boolean
}

// ─── Modo simple: select nativo (usado en ItemForm) ───────────────────────────

function SimpleUomSelect({ value, onChange, className = 'ff-select', disabled, error }: Omit<UomSelectProps, 'itemCode'>) {
  const { data: uoms, isLoading } = useQuery({
    queryKey: ['uoms'],
    queryFn: listUOMs,
    staleTime: 5 * 60_000,
  })

  if (isLoading || !uoms?.length) {
    return (
      <input
        className={className.replace('ff-select', 'ff-input')}
        value={value}
        onChange={(e) => onChange(e.target.value, 1)}
        placeholder="Unidad"
        disabled={disabled}
      />
    )
  }

  return (
    <select
      className={`${className}${error ? ' ff-input-error' : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value, 1)}
      disabled={disabled}
    >
      <option value="">—</option>
      {uoms.map((u) => (
        <option key={u.name} value={u.name}>{u.name}</option>
      ))}
    </select>
  )
}

// ─── Modo artículo: dropdown portal con UOMs del artículo + "Más opciones" ────

function ItemUomSelect({ value, onChange, itemCode, className = 'items-input', disabled, error }: UomSelectProps & { itemCode: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { open, style, toggle, close, portalRef } = useFloatingDropdown(triggerRef)
  const [showAll, setShowAll] = useState(false)

  // UOMs del artículo específico
  const { data: itemData } = useQuery({
    queryKey: ['item', itemCode],
    queryFn: () => getItem(itemCode),
    enabled: !!itemCode,
    staleTime: 60_000,
  })

  // Todas las UOMs de config — se cargan cuando el usuario pide "más opciones"
  const { data: allUoms, isLoading: loadingAll } = useQuery({
    queryKey: ['uoms'],
    queryFn: listUOMs,
    enabled: showAll,
    staleTime: 5 * 60_000,
  })

  // Combina stockUom + uoms del artículo en un Set sin duplicados
  const itemUoms = useMemo(() => {
    if (!itemData) return []
    const set = new Set<string>()
    if (itemData.stockUom) set.add(itemData.stockUom)
    itemData.uoms?.forEach((u) => set.add(u.uom))
    return [...set].filter(Boolean)
  }, [itemData])

  // UOMs de config que NO están ya en las del artículo
  const extraUoms = useMemo(
    () => (allUoms ?? []).filter((u) => !itemUoms.includes(u.name)),
    [allUoms, itemUoms],
  )

  function select(v: string) {
    // Calcular factor de conversión: 1 si es stockUom o sin conversión
    let factor = 1
    if (itemData) {
      if (v === itemData.stockUom) {
        factor = 1
      } else {
        const entry = itemData.uoms?.find((u) => u.uom === v)
        factor = entry?.conversionFactor ?? 1
      }
    }
    onChange(v, factor)
    close()
    setShowAll(false)
  }

  if (itemUoms.length === 1 && itemData) {
    return <span className={className} style={{ color: 'var(--text-primary)', lineHeight: '32px' }}>{itemUoms[0]}</span>
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        className={`${className}${error ? ' items-input-error' : ''}`}
        onClick={toggle}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || <span style={{ color: 'var(--text-tertiary)' }}>UDM</span>}
        </span>
        <ChevronDown size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
      </button>

      <FloatingPortal open={open} style={style} portalRef={portalRef}>
        <div className="select-content" style={{ minWidth: 180, maxHeight: 280, overflowY: 'auto' }}>

          {/* UOMs del artículo */}
          {itemUoms.length > 0 && (
            <>
              <div style={{
                padding: '4px 10px 2px',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-tertiary)',
              }}>
                Del artículo
              </div>
              {itemUoms.map((uom) => (
                <button
                  key={uom}
                  type="button"
                  className="select-item"
                  data-selected={uom === value ? '' : undefined}
                  onClick={() => select(uom)}
                >
                  {uom}
                </button>
              ))}
              <div style={{ margin: '4px 0', borderTop: '1px solid var(--border-default)' }} />
            </>
          )}

          {/* Botón "Más opciones" / lista expandida */}
          {!showAll ? (
            <button
              type="button"
              className="select-item"
              style={{ color: 'var(--color-brand)', fontSize: 12 }}
              onClick={(e) => { e.stopPropagation(); setShowAll(true) }}
            >
              <Plus size={12} style={{ marginRight: 4 }} />
              Más opciones
            </button>
          ) : loadingAll ? (
            <div className="search-select-loading">
              <span className="spinner spinner-brand spinner-sm" aria-hidden="true" />
              Cargando…
            </div>
          ) : extraUoms.length === 0 ? (
            <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
              Sin más unidades disponibles
            </div>
          ) : (
            <>
              <div style={{
                padding: '4px 10px 2px',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-tertiary)',
              }}>
                Todas las unidades
              </div>
              {extraUoms.map((u) => (
                <button
                  key={u.name}
                  type="button"
                  className="select-item"
                  data-selected={u.name === value ? '' : undefined}
                  onClick={() => select(u.name)}
                >
                  {u.name}
                </button>
              ))}
            </>
          )}
        </div>
      </FloatingPortal>
    </div>
  )
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function UomSelect({ itemCode, ...props }: UomSelectProps) {
  if (itemCode) {
    return <ItemUomSelect {...props} itemCode={itemCode} error={props.error} />
  }
  return <SimpleUomSelect {...props} error={props.error} />
}
