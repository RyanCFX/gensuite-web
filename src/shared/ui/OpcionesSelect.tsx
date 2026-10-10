import { useState } from 'react'
import { FilterField } from './FilterField'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'
import { useOpciones } from '@/shared/hooks/useOpciones'
import { esErrorDePermiso } from '@/shared/hooks/useFiltroQuery'

// Select alimentado por GET /opciones/:recurso (listas mínimas value/label + extras).
// Así un formulario/filtro NO exige acceso a la pantalla de administración de la entidad.
//  - Formulario: ante 403 RECURSO_NO_PERMITIDO queda deshabilitado con "No tiene acceso a esta lista".
//  - Filtro de tabla (`hideOnForbidden`): ante 403 no hay alerta y el control no se renderiza.

// Recursos cuyo label NO es igual al value (id): para mostrar el valor ya guardado hay que resolverlo.
const RESOLVER_LABEL_POR_IDS = new Set(['clientes', 'proveedores', 'usuarios', 'aseguradoras', 'cuentas-bancarias', 'departamentos', 'centros-costo', 'articulos', 'almacenes', 'almacenes-todos'])

export interface OpcionesSelectProps {
  /** Clave sin prefijo (`sucursales`, `clientes`…). */
  recurso: string
  value: string
  onChange: (value: string, option: SearchSelectOption | null) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
  /** Label del valor ya guardado (el documento lo trae) — se muestra aunque no esté en la lista. */
  selectedLabel?: string
  className?: string
  id?: string
  debounceMs?: number
  limit?: number
  headerContent?: React.ReactNode
  onEnterWithoutMatch?: (query: string) => void
  /** Filtros de tablas: ante un 403 no hay alerta y el control no se renderiza. */
  hideOnForbidden?: boolean
  /** Con `filterLabel` el select se envuelve en un `FilterField` (y se oculta junto con él). */
  filterLabel?: string
  filterStyle?: React.CSSProperties
  /** Caracteres mínimos antes de consultar (artículos/clientes: 2). Con 0 consulta al abrir. */
  minChars?: number
  /** Excluye opciones por value (ej. "destino ≠ origen"). */
  excludeValues?: string[]
}

export function OpcionesSelect({
  recurso,
  value,
  onChange,
  placeholder = 'Buscar…',
  disabled = false,
  error = false,
  selectedLabel,
  className = '',
  id,
  debounceMs,
  limit,
  headerContent,
  onEnterWithoutMatch,
  hideOnForbidden = false,
  filterLabel,
  filterStyle,
  minChars = 0,
  excludeValues,
}: OpcionesSelectProps) {
  const [q, setQ] = useState('')
  // Los selects de formulario piden su lista recién cuando el usuario los abre (un formulario puede
  // tener varios y casi nunca se usan todos). Los filtros de tabla (`hideOnForbidden`) la piden al
  // montar para poder ocultarse si no hay acceso; el resultado se cachea por recurso+búsqueda.
  const [abierto, setAbierto] = useState(hideOnForbidden)
  const [picked, setPicked] = useState<{ value: string; label: string } | null>(null)
  const { data, isLoading, error: loadError, forbidden } = useOpciones(recurso, {
    q: q.trim().length >= minChars ? q : '',
    limit,
    enabled: !disabled && abierto && (minChars === 0 || q.trim().length >= minChars),
    silent403: hideOnForbidden,
  })
  // Valor guardado sin label conocido (documento en edición): se resuelve con `?ids=` en vez de
  // depender de que esté en la primera página de resultados.
  const necesitaLabel = !!value && !selectedLabel && picked?.value !== value && RESOLVER_LABEL_POR_IDS.has(recurso)
  const { data: resueltas } = useOpciones(recurso, { ids: [value], enabled: necesitaLabel && !disabled, silent403: hideOnForbidden })

  if (hideOnForbidden && esErrorDePermiso(loadError)) return null

  const options: SearchSelectOption[] = (data ?? [])
    .filter((o) => !excludeValues?.includes(o.value))
    .map((o) => ({ value: o.value, label: o.label, sublabel: o.tax_id, raw: o as unknown as Record<string, unknown> }))

  function handleChange(v: string, opt: SearchSelectOption | null) {
    setPicked(opt ? { value: opt.value, label: opt.label } : null)
    onChange(v, opt)
  }
  // Label del valor actual: el que el llamador ya conoce (documento guardado) → el recién elegido →
  // el propio value (nunca dejar el campo en blanco aunque el valor no esté en la primera página).
  const labelActual = !value ? '' : selectedLabel || (picked?.value === value ? picked.label : '') || options.find((o) => o.value === value)?.label || resueltas?.find((o) => o.value === value)?.label || value

  const select = forbidden ? (
    <div title="No tiene acceso a esta lista">
      <SearchSelect
        value={value}
        onChange={handleChange}
        options={[]}
        onSearch={() => {}}
        placeholder="No tiene acceso a esta lista"
        error={error}
        disabled
        selectedLabel={labelActual}
        className={className}
        id={id}
      />
    </div>
  ) : (
    <SearchSelect
      value={value}
      onChange={handleChange}
      options={options}
      onSearch={setQ}
      onOpen={() => setAbierto(true)}
      loading={isLoading}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      selectedLabel={labelActual}
      className={className}
      id={id}
      debounceMs={debounceMs}
      headerContent={headerContent}
      onEnterWithoutMatch={onEnterWithoutMatch}
    />
  )
  return filterLabel ? <FilterField label={filterLabel} style={filterStyle}>{select}</FilterField> : select
}
