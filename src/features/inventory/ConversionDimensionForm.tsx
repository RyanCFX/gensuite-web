// Conversión de combinación (mismo ítem) — docs/tasks/PROMPT_CONVERSION_DIMENSION_FRONTEND.md §7.
// Convierte N unidades del stock SIN combinación de un artículo a una combinación puntual del
// MISMO artículo — permite preparar stock con anticipación sin esperar a que el top-up automático
// de la venta lo haga. No hay dos artículos en este flujo (§1.2): un solo `itemCode` en todo el
// formulario (nada de "origen"/"destino").
//
// Mismo lugar y mismo nivel que Ajuste de Combinación y Reclasificación de Combinación (§8.5/§8.6
// de PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md) — clona ese patrón de pantalla.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { listItems, getItem } from '@/shared/api/catalog'
import { listAlmacenes } from '@/shared/api/config'
import { convertirDimension, getStockPorDimension } from '@/shared/api/inventory'
import type { Item, DimensionesLinea } from '@/shared/api/types'
import { mostrarErrorApi } from '@/lib/apiErrors'
import { usePuede } from '@/shared/permissions/can'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { todayIso } from '@/lib/formatters'

/** Picker de artículo restringido a ítems que declaran dimensiones (`usaDimensiones: true`) Y
 *  tienen `permiteCompraSinDimension: true` — solo esos participan del flujo (§7.3 paso 1).
 *  `ItemSelect` no expone ese filtro combinado, así que se filtra la respuesta acá, igual que
 *  `ItemDimensionadoSelect` de Ajuste/Reclasificación de Combinación. */
function ItemConversionSelect({
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
    queryKey: ['itemSearch-conversion', query],
    queryFn: () => listItems({ search: query || undefined, disabled: 'false', type: 'product', limit: 20 }),
    staleTime: 30_000,
  })

  const itemsElegibles = (data?.items ?? []).filter((i) => i.usaDimensiones === true && i.permiteCompraSinDimension === true)

  const options: SearchSelectOption[] = itemsElegibles.map((item) => ({
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
        const found = itemsElegibles.find((i) => i.id === val)
        if (found) onSelect(found)
      }}
      options={options}
      onSearch={setQuery}
      onOpen={() => refetch()}
      loading={isLoading}
      placeholder="Buscar artículo con compra sin dimensión…"
    />
  )
}

export default function ConversionDimensionForm() {
  const navigate = useNavigate()
  const puedeConvertir = usePuede('inventario.convertir-dimension')

  const [item, setItem] = useState<Item | null>(null)
  const [warehouse, setWarehouse] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [qty, setQty] = useState<number | ''>('')
  const [combinacion, setCombinacion] = useState<DimensionesLinea>({})
  const [postingDate, setPostingDate] = useState(todayIso())
  const [remarks, setRemarks] = useState('')
  const [branch, setBranch] = useState('')
  const [resultado, setResultado] = useState<{ itemCode: string; warehouse: string; qty: number } | null>(null)

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes-all'],
    queryFn: () => listAlmacenes(),
    staleTime: 60_000,
  })
  const warehouseOptions: SearchSelectOption[] = (almacenes ?? [])
    .filter((a) => !a.disabled && (!warehouseSearch || a.name.toLowerCase().includes(warehouseSearch.toLowerCase())))
    .map((a) => ({ value: a.id, label: a.name }))

  // Stock sin combinación disponible en el almacén elegido (§7.3 paso 2) — campo `sinEspecificar`
  // de stock-por-dimensión. Informativo: la autoridad real es el servidor (§7.5).
  const { data: stockSinCombinacion } = useQuery({
    queryKey: ['stock-sin-combinacion', item?.id, warehouse],
    queryFn: () => getStockPorDimension(item!.id, { warehouse }),
    enabled: !!item && !!warehouse,
    staleTime: 30_000,
  })
  const sinEspecificar = stockSinCombinacion?.data.sinEspecificar

  const itemDimensiones = item?.dimensiones ?? []
  const combinacionLista = combinacionCompleta(itemDimensiones, combinacion)

  async function handleSelectItem(seleccionado: Item) {
    setItem(seleccionado)
    setCombinacion({})
    // El picker puede no traer `dimensiones`/`permiteCompraSinDimension` — solo el detalle los
    // garantiza. Si faltan, se completan para habilitar la combinación.
    if (!seleccionado.dimensiones || seleccionado.dimensiones.length === 0) {
      try {
        const detail = await getItem(seleccionado.id)
        if (detail?.usaDimensiones && detail.dimensiones?.length) {
          setItem((prev) => prev?.id === seleccionado.id
            ? { ...prev, usaDimensiones: true, dimensiones: detail.dimensiones, permiteCompraSinDimension: detail.permiteCompraSinDimension }
            : prev)
        }
      } catch {
        // Sin detalle la línea sigue editable; el servidor valida al someter (§7.5).
      }
    }
  }

  function handleClearItem() {
    setItem(null)
    setCombinacion({})
  }

  const conversionMutation = useMutation({
    mutationFn: () => convertirDimension({
      itemCode: item!.id,
      warehouse,
      qty: qty as number,
      dimensiones: combinacion,
      postingDate: postingDate || undefined,
      remarks: remarks || undefined,
      branch: branch || undefined,
    }),
    onSuccess: (data) => {
      setResultado({ itemCode: data.itemCode, warehouse: data.warehouse, qty: data.qty })
      toast.success(`Se convirtieron ${data.qty} unidades de ${data.itemCode} a la combinación elegida en ${data.warehouse}.`)
    },
    onError: (err: unknown) => mostrarErrorApi(err, 'Error al convertir la combinación'),
  })

  function resetForm() {
    setItem(null)
    setWarehouse('')
    setQty('')
    setCombinacion({})
    setPostingDate(todayIso())
    setRemarks('')
    setBranch('')
    setResultado(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item) { toast.error('Selecciona el artículo a convertir'); return }
    // §7.5 — el filtro del selector ya debería impedirlo, pero el catálogo pudo cambiar; el
    // mensaje exacto del servidor se muestra tal cual si igual llega.
    if (!item.permiteCompraSinDimension) {
      toast.error(`El ítem "${item.id}" no tiene activo "permite compra sin dimensión" (Item.custom_permite_compra_sin_dimension) — no participa del flujo de conversión.`)
      return
    }
    if (!warehouse) { toast.error('Selecciona un almacén'); return }
    if (!combinacionLista) { toast.error('Completa la combinación a asignar'); return }
    if (qty === '' || qty <= 0) { toast.error('Indica la cantidad a convertir (> 0)'); return }
    conversionMutation.mutate()
  }

  if (!puedeConvertir) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">Sin acceso</p>
            <p className="empty-sub">No tienes permiso para convertir combinaciones.</p>
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
        title="Conversión de combinación"
        description="Convierte N unidades del stock sin combinación de un artículo a una combinación puntual del mismo artículo — ej. 10 “Bumper” sin año/color en “Bumper” (2024, Rojo)."
      />

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Artículo y combinación</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label ff-required">Artículo</label>
              <ItemConversionSelect
                value={item?.id ?? ''}
                selectedLabel={item?.itemName}
                onSelect={handleSelectItem}
                onClear={handleClearItem}
              />
            </div>

            <div className="form-row form-row-3">
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
                {sinEspecificar !== undefined && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Stock disponible sin combinación en este almacén: {sinEspecificar} unidades
                  </span>
                )}
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Cantidad a convertir</label>
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
            </div>

            {item && itemDimensiones.length > 0 && (
              <div className="ff-wrap">
                <label className="ff-label ff-required">
                  Combinación a asignar
                  <ArrowRight size={12} style={{ verticalAlign: 'middle', margin: '0 4px' }} />
                </label>
                <CombinacionDimensionSelector
                  itemDimensiones={itemDimensiones}
                  value={combinacion}
                  onChange={setCombinacion}
                />
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Datos del movimiento</h2></div>
          <div className="card-body">
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label">Fecha</label>
                <DatePicker value={postingDate} onChange={setPostingDate} />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Sucursal</label>
                <input className="ff-input" placeholder="Opcional" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Notas</label>
                <input
                  className="ff-input"
                  placeholder="Opcional — si se omite, el servidor genera una nota automática"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button
            type="submit"
            className="btn btn-navy"
            disabled={
              conversionMutation.isPending ||
              !item ||
              !warehouse ||
              !combinacionLista ||
              qty === '' ||
              (qty as number) <= 0
            }
          >
            {conversionMutation.isPending ? 'Convirtiendo…' : 'Convertir'}
          </button>
        </div>
      </form>

      {resultado && (
        <div className="inline-alert inline-alert-success" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            Conversión aplicada: <strong>{resultado.qty}</strong> unidades de <strong>{resultado.itemCode}</strong> → combinación elegida en <strong>{resultado.warehouse}</strong>.
          </span>
          <button type="button" className="btn btn-ghost btn-size-sm" onClick={resetForm}>Hacer otra conversión</button>
        </div>
      )}
    </div>
  )
}
