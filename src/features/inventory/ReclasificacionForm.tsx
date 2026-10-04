// Reclasificación de Combinación — docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §8.6.
// Corrige una combinación mal elegida en el MISMO almacén, sin mover valuación (ej. "se marcó
// Honda/2000 y era Honda/2001") — no confundir con Transferencias (traslado entre almacenes).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, AlertTriangle, ArrowRight } from 'lucide-react'
import { lookupItems } from '@/shared/api/catalog'
import { getStockPorDimension, reclasificarDimension } from '@/shared/api/inventory'
import type { Item, GetStockPorDimensionParams, DimensionesLinea } from '@/shared/api/types'
import { mostrarErrorApi } from '@/lib/apiErrors'
import { usePuede } from '@/shared/permissions/can'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { esRecursoNoPermitido, useOpcionesArray } from '@/shared/hooks/useOpciones'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mismo criterio que en AjusteDimensionForm: `ItemSelect` no filtra por `usaDimensiones`, así
 *  que se filtra la respuesta acá en vez de tocar el componente compartido. */
function ItemDimensionadoSelect({
  value,
  selectedLabel,
  onSelect,
  onClear,
}: {
  value: string
  selectedLabel?: string
  onSelect: (item: Item) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [abierto, setAbierto] = useState(false)

  const { data, isLoading, error: itemsError } = useQuery({
    enabled: abierto,
    retry: false,
    queryKey: ['itemSearch-dimensionado', query],
    queryFn: () => lookupItems({ search: query || undefined, disabled: 'false', type: 'product', limit: 20 }),
    staleTime: 30_000,
  })
  const sinAcceso = esRecursoNoPermitido(itemsError)

  const itemsDimensionados = (data?.items ?? []).filter((i) => i.usaDimensiones === true)

  const options: SearchSelectOption[] = itemsDimensionados.map((item) => ({
    value: item.id,
    label: item.itemName,
    sublabel: item.id !== item.itemName ? item.id : undefined,
  }))

  return (
    <SearchSelect
      value={value}
      selectedLabel={selectedLabel}
      onChange={(val) => {
        if (!val) { onClear(); return }
        const found = itemsDimensionados.find((i) => i.id === val)
        if (found) onSelect(found)
      }}
      options={options}
      onSearch={setQuery}
      onOpen={() => setAbierto(true)}
      loading={isLoading}
      placeholder={sinAcceso ? 'No tiene acceso a esta lista' : "Buscar artículo con dimensiones de inventario…"}
      disabled={sinAcceso}
    />
  )
}

function combinacionesIguales(a: DimensionesLinea, b: DimensionesLinea): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}

export default function ReclasificacionForm() {
  const navigate = useNavigate()
  const puedeReclasificar = usePuede('inventario.reclasificar')

  const [item, setItem] = useState<Item | null>(null)
  const [warehouse, setWarehouse] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [desde, setDesde] = useState<DimensionesLinea>({})
  const [hacia, setHacia] = useState<DimensionesLinea>({})
  const [qty, setQty] = useState<number | ''>('')
  const [postingDate, setPostingDate] = useState(today())
  const [remarks, setRemarks] = useState('')
  const [branch, setBranch] = useState('')
  const [resultado, setResultado] = useState<{ qty: number } | null>(null)

  const { data: almacenes } = useOpcionesArray('almacenes', { limit: 100})
  const warehouseOptions: SearchSelectOption[] = (almacenes ?? [])
    .filter((a) => !a.disabled && (!warehouseSearch || a.name.toLowerCase().includes(warehouseSearch.toLowerCase())))
    .map((a) => ({ value: a.id, label: a.name }))

  const itemDimensiones = item?.dimensiones ?? []
  const desdeCompleta = combinacionCompleta(itemDimensiones, desde)
  const haciaCompleta = combinacionCompleta(itemDimensiones, hacia)
  const sonIguales = desdeCompleta && haciaCompleta && combinacionesIguales(desde, hacia)

  // Saldo actual de la combinación "desde" — mismo criterio de §8.3 que en el Ajuste: filtros
  // dinámicos por dimensión, clave = codigo de la dimensión.
  const stockParams: GetStockPorDimensionParams | null = (item && warehouse && desdeCompleta)
    ? { warehouse, ...desde }
    : null

  const { data: stockActual, isLoading: loadingStock } = useQuery({
    queryKey: ['stock-por-dimension', item?.id, warehouse, 'desde', JSON.stringify(desde)],
    queryFn: () => getStockPorDimension(item!.id, stockParams!),
    enabled: !!stockParams,
  })

  const saldoActual = stockActual?.data.items.reduce((sum, row) => sum + row.disponible, 0) ?? 0

  const reclasificarMutation = useMutation({
    mutationFn: () => reclasificarDimension({
      itemCode: item!.id,
      warehouse,
      desde,
      hacia,
      qty: qty as number,
      postingDate: postingDate || undefined,
      remarks: remarks || undefined,
      branch: branch || undefined,
    }),
    onSuccess: (data) => {
      setResultado({ qty: data.qty })
      toast.success(`Reclasificación aplicada — ${data.qty} unidades movidas a la nueva dimensión.`)
    },
    onError: (err: unknown) => mostrarErrorApi(err, 'Error al reclasificar la dimensión'),
  })

  function resetForm() {
    setItem(null)
    setWarehouse('')
    setDesde({})
    setHacia({})
    setQty('')
    setPostingDate(today())
    setRemarks('')
    setBranch('')
    setResultado(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item) { toast.error('Selecciona un artículo'); return }
    if (!warehouse) { toast.error('Selecciona un almacén'); return }
    if (!desdeCompleta) { toast.error('Completa la dimensión actual ("desde")'); return }
    if (!haciaCompleta) { toast.error('Completa la dimensión nueva ("hacia")'); return }
    if (sonIguales) { toast.error('"desde" y "hacia" son la misma dimensión — no hay nada que reclasificar.'); return }
    if (qty === '' || qty <= 0) { toast.error('Indica la cantidad a reclasificar (> 0)'); return }
    reclasificarMutation.mutate()
  }

  if (!puedeReclasificar) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">Sin acceso</p>
            <p className="empty-sub">No tienes permiso para reclasificar dimensiones de inventario.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Volver
      </a>

      <PageHeader
        title="Reclasificación de Dimensión"
        description='Corrige una dimensión mal elegida en el mismo almacén, sin mover valuación — ej. "se marcó Honda/2000 y era Honda/2001". No traslada entre almacenes distintos (eso es Transferencias).'
      />

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Artículo y almacén</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Artículo</label>
                <ItemDimensionadoSelect
                  value={item?.id ?? ''}
                  selectedLabel={item?.itemName}
                  onSelect={(i) => { setItem(i); setDesde({}); setHacia({}) }}
                  onClear={() => { setItem(null); setDesde({}); setHacia({}) }}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Almacén (origen y destino)</label>
                <SearchSelect
                  value={warehouse}
                  onChange={setWarehouse}
                  options={warehouseOptions}
                  onSearch={setWarehouseSearch}
                  selectedLabel={warehouseOptions.find((w) => w.value === warehouse)?.label ?? ''}
                  placeholder="Almacén"
                  disabled={!item}
                />
              </div>
            </div>

            {item && itemDimensiones.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
                Este artículo no declara dimensiones de inventario.
              </p>
            )}
          </div>
        </div>

        {item && itemDimensiones.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h2 className="card-title">Dimensión actual y nueva</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="ff-wrap" style={{ flex: 1, minWidth: 260 }}>
                  <label className="ff-label ff-required">Dimensión actual (desde)</label>
                  <CombinacionDimensionSelector
                    itemDimensiones={itemDimensiones}
                    value={desde}
                    onChange={setDesde}
                  />
                </div>
                <ArrowRight size={18} style={{ marginTop: 32, color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <div className="ff-wrap" style={{ flex: 1, minWidth: 260 }}>
                  <label className="ff-label ff-required">Dimensión nueva (hacia)</label>
                  <CombinacionDimensionSelector
                    itemDimensiones={itemDimensiones}
                    value={hacia}
                    onChange={setHacia}
                  />
                </div>
              </div>

              {sonIguales && (
                <div className="inline-alert inline-alert-warn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} />
                  <span>"desde" y "hacia" son la misma dimensión — no hay nada que reclasificar.</span>
                </div>
              )}

              {stockParams && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Disponible en la dimensión actual, en "{warehouse}"</span>
                  <span className="stat-value" style={{ fontSize: 24 }}>{loadingStock ? '…' : saldoActual}</span>
                </div>
              )}

              <div className="form-row form-row-3">
                <div className="ff-wrap">
                  <label className="ff-label ff-required">Cantidad a reclasificar</label>
                  <input
                    className="ff-input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={qty}
                    onChange={(e) => setQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Fecha</label>
                  <DatePicker value={postingDate} onChange={setPostingDate} />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <input className="ff-input" placeholder="Opcional" value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
                <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                  <label className="ff-label">Notas</label>
                  <input
                    className="ff-input"
                    placeholder="Opcional"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button
            type="submit"
            className="btn btn-navy"
            disabled={
              reclasificarMutation.isPending ||
              !desdeCompleta ||
              !haciaCompleta ||
              sonIguales ||
              !warehouse ||
              qty === '' ||
              (typeof qty === 'number' && qty <= 0)
            }
          >
            {reclasificarMutation.isPending ? 'Reclasificando…' : 'Reclasificar'}
          </button>
        </div>
      </form>

      {resultado && (
        <div className="inline-alert inline-alert-success" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Reclasificación aplicada: <strong>{resultado.qty}</strong> unidades movidas a la nueva dimensión.</span>
          <button type="button" className="btn btn-ghost btn-size-sm" onClick={resetForm}>Hacer otra reclasificación</button>
        </div>
      )}
    </div>
  )
}
