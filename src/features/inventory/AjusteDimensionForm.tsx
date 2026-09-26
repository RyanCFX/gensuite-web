// Ajuste de Combinación — docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §8.5.
// Reemplaza al Conteo/Ajuste de Inventario estándar (Stock Reconciliation) para un artículo con
// dimensiones — ese endpoint estándar rechaza de plano los artículos dimensionados (§11), así que
// esta es la ÚNICA forma de corregir el saldo de una combinación puntual.
//
// `cantidadFinal` es el saldo FINAL deseado de la combinación, no la diferencia — el servidor
// calcula la diferencia. Por eso el formulario pide primero el saldo actual (§8.3, filtrando por
// la combinación exacta) y muestra en vivo cuánto se va a agregar/restar antes de someter.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { listItems } from '@/shared/api/catalog'
import { listAlmacenes, getCuentasEmpresa } from '@/shared/api/config'
import { getStockPorDimension, ajustarDimension } from '@/shared/api/inventory'
import type { Item, GetStockPorDimensionParams, DimensionesLinea } from '@/shared/api/types'
import { mostrarErrorApi } from '@/lib/apiErrors'
import { usePuede } from '@/shared/permissions/can'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Picker de artículo restringido a artículos con dimensiones de inventario (`usaDimensiones ===
 *  true`) — `ItemSelect` no expone un filtro por este campo, así que se filtra la respuesta acá
 *  en vez de tocar el componente compartido (§ constraints de esta tarea). */
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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['itemSearch-dimensionado', query],
    queryFn: () => listItems({ search: query || undefined, disabled: 'false', type: 'product', limit: 20 }),
    staleTime: 30_000,
  })

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
      onOpen={() => refetch()}
      loading={isLoading}
      placeholder="Buscar artículo con dimensiones de inventario…"
    />
  )
}

export default function AjusteDimensionForm() {
  const navigate = useNavigate()
  const puedeAjustar = usePuede('inventario.ajustar')

  const [item, setItem] = useState<Item | null>(null)
  const [warehouse, setWarehouse] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [combinacion, setCombinacion] = useState<DimensionesLinea>({})
  const [cantidadFinal, setCantidadFinal] = useState<number | ''>('')
  const [postingDate, setPostingDate] = useState(today())
  const [remarks, setRemarks] = useState('')
  const [branch, setBranch] = useState('')
  const [resultado, setResultado] = useState<{ tipo: string; qty: number } | null>(null)

  // §8.5 — misma cuenta de ajuste de inventario que Carga Inicial de Inventario (Company.
  // stock_adjustment_account). Se verifica de antemano para avisar antes de que el usuario llene
  // todo el formulario y recién ahí se entere del rechazo del servidor.
  const { data: cuentasEmpresa, isLoading: loadingCuentas } = useQuery({
    queryKey: ['cuentas-empresa'],
    queryFn: getCuentasEmpresa,
    staleTime: 60_000,
  })
  const cuentaAjusteConfigurada = !!cuentasEmpresa?.stockAdjustmentAccount

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes-all'],
    queryFn: () => listAlmacenes(),
    staleTime: 60_000,
  })
  const warehouseOptions: SearchSelectOption[] = (almacenes ?? [])
    .filter((a) => !a.disabled && (!warehouseSearch || a.name.toLowerCase().includes(warehouseSearch.toLowerCase())))
    .map((a) => ({ value: a.id, label: a.name }))

  const itemDimensiones = item?.dimensiones ?? []
  const combinacionLista = combinacionCompleta(itemDimensiones, combinacion)

  // Saldo ACTUAL de la combinación exacta elegida — armado como filtros dinámicos por dimensión
  // (§8.3): la clave de cada filtro es el `codigo` de la dimensión, que ya es exactamente la
  // clave que usa `combinacion` (DimensionesLinea = Record<codigo, idValor>).
  const stockParams: GetStockPorDimensionParams | null = (item && warehouse && combinacionLista)
    ? { warehouse, ...combinacion }
    : null

  const { data: stockActual, isLoading: loadingStock } = useQuery({
    queryKey: ['stock-por-dimension', item?.id, warehouse, JSON.stringify(combinacion)],
    queryFn: () => getStockPorDimension(item!.id, stockParams!),
    enabled: !!stockParams,
  })

  const saldoActual = stockActual?.data.items.reduce((sum, row) => sum + row.disponible, 0) ?? 0
  const hayCombinacionYSaldo = !!stockParams && !loadingStock
  const diferencia = typeof cantidadFinal === 'number' ? cantidadFinal - saldoActual : 0
  const esNoOp = hayCombinacionYSaldo && typeof cantidadFinal === 'number' && diferencia === 0

  const ajusteMutation = useMutation({
    mutationFn: () => ajustarDimension({
      itemCode: item!.id,
      warehouse,
      dimensiones: combinacion,
      cantidadFinal: cantidadFinal as number,
      postingDate: postingDate || undefined,
      remarks: remarks || undefined,
      branch: branch || undefined,
    }),
    onSuccess: (data) => {
      setResultado({ tipo: data.tipo, qty: data.qty })
      toast.success(`Ajuste aplicado — ${data.tipo === 'Material Receipt' ? 'se agregaron' : 'se restaron'} ${data.qty} unidades.`)
    },
    onError: (err: unknown) => mostrarErrorApi(err, 'Error al ajustar la combinación'),
  })

  function resetForm() {
    setItem(null)
    setWarehouse('')
    setCombinacion({})
    setCantidadFinal('')
    setPostingDate(today())
    setRemarks('')
    setBranch('')
    setResultado(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item) { toast.error('Selecciona un artículo'); return }
    if (!warehouse) { toast.error('Selecciona un almacén'); return }
    if (!combinacionLista) { toast.error('Completa la combinación a ajustar — todas las dimensiones del artículo'); return }
    if (cantidadFinal === '' || cantidadFinal < 0) { toast.error('Indica la cantidad final deseada (≥ 0)'); return }
    if (esNoOp) { toast.error(`La combinación ya tiene ${saldoActual} unidades en "${warehouse}" — no hay diferencia que ajustar.`); return }
    ajusteMutation.mutate()
  }

  if (!puedeAjustar) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">Sin acceso</p>
            <p className="empty-sub">No tienes permiso para ajustar combinaciones de inventario.</p>
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
        title="Ajuste de Combinación"
        description="Corrige el saldo de UNA combinación puntual de un artículo con dimensiones de inventario (ej. marca/año) — reemplaza al Conteo estándar, que no funciona con estos artículos."
      />

      {!loadingCuentas && !cuentaAjusteConfigurada && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} />
          No hay una cuenta de ajuste de inventario configurada (Company.stock_adjustment_account) —{' '}
          <a onClick={() => navigate('/config/empresa')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            configúrela en Empresa
          </a>{' '}
          antes de ajustar una combinación. El servidor rechazará este formulario.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Artículo y combinación</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Artículo</label>
                <ItemDimensionadoSelect
                  value={item?.id ?? ''}
                  selectedLabel={item?.itemName}
                  onSelect={(i) => { setItem(i); setCombinacion({}) }}
                  onClear={() => { setItem(null); setCombinacion({}) }}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Almacén</label>
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

            {item && itemDimensiones.length > 0 && (
              <div className="ff-wrap">
                <label className="ff-label ff-required">Combinación a ajustar</label>
                <CombinacionDimensionSelector
                  itemDimensiones={itemDimensiones}
                  value={combinacion}
                  onChange={setCombinacion}
                />
              </div>
            )}
          </div>
        </div>

        {stockParams && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h2 className="card-title">Saldo actual y ajuste</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Saldo actual de esta combinación en "{warehouse}"</span>
                <span className="stat-value" style={{ fontSize: 24 }}>{loadingStock ? '…' : saldoActual}</span>
              </div>

              <div className="form-row form-row-3">
                <div className="ff-wrap">
                  <label className="ff-label ff-required">Cantidad final deseada</label>
                  <input
                    className="ff-input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={cantidadFinal}
                    onChange={(e) => setCantidadFinal(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Cantidad final deseada de esta combinación, no la diferencia.
                  </span>
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
                    placeholder="Opcional — si se omite, el servidor genera una nota automática"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>
              </div>

              {hayCombinacionYSaldo && typeof cantidadFinal === 'number' && (
                esNoOp ? (
                  <div className="inline-alert inline-alert-warn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} />
                    <span>La combinación ya tiene {saldoActual} unidades en "{warehouse}" — no hay diferencia que ajustar.</span>
                  </div>
                ) : (
                  <div className="inline-alert inline-alert-info">
                    {diferencia > 0
                      ? `Esto va a agregar ${diferencia} unidades.`
                      : `Esto va a restar ${Math.abs(diferencia)} unidades.`}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button
            type="submit"
            className="btn btn-navy"
            disabled={
              ajusteMutation.isPending ||
              (!loadingCuentas && !cuentaAjusteConfigurada) ||
              !combinacionLista ||
              !warehouse ||
              cantidadFinal === '' ||
              esNoOp
            }
          >
            {ajusteMutation.isPending ? 'Ajustando…' : 'Aplicar ajuste'}
          </button>
        </div>
      </form>

      {resultado && (
        <div className="inline-alert inline-alert-success" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            Ajuste aplicado: <strong>{resultado.tipo}</strong> por <strong>{resultado.qty}</strong> unidades.
          </span>
          <button type="button" className="btn btn-ghost btn-size-sm" onClick={resetForm}>Hacer otro ajuste</button>
        </div>
      )}
    </div>
  )
}
