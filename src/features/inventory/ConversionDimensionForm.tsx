// Conversión a Ítem Dimensionado — docs/tasks/PROMPT_CONVERSION_ITEM_DIMENSIONADO_FRONTEND.md §4.
// Consume N unidades de un ítem GENÉRICO (sin dimensiones) y produce N unidades de un ítem
// DIMENSIONADO, asignando la combinación elegida en ese momento — permite comprar un artículo sin
// conocer todavía la combinación exacta (año/color/talla/...) y decidirla recién antes de venderlo.
//
// Mismo lugar y mismo nivel que Ajuste de Combinación y Reclasificación de Combinación (§8.5/§8.6
// de PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md) — clona ese patrón de pantalla.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { listItems } from '@/shared/api/catalog'
import { listAlmacenes } from '@/shared/api/config'
import { convertirDimension } from '@/shared/api/inventory'
import type { Item, DimensionesLinea } from '@/shared/api/types'
import { mostrarErrorApi } from '@/lib/apiErrors'
import { usePuede } from '@/shared/permissions/can'
import { useItemsStock, resolveDisponible } from '@/shared/hooks/useItemsStock'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { todayIso } from '@/lib/formatters'

/** Picker de artículo DESTINO restringido a ítems dimensionados (`usaDimensiones: true`) que
 *  además tienen un `itemGenericoOrigen` configurado — solo esos tienen sentido acá (§4.1 punto 1).
 *  `ItemSelect` no expone este filtro combinado, así que se filtra la respuesta acá, igual que
 *  `ItemDimensionadoSelect` de Ajuste/Reclasificación de Combinación. */
function ItemDestinoConversionSelect({
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
    queryKey: ['itemSearch-conversion-destino', query],
    queryFn: () => listItems({ search: query || undefined, disabled: 'false', type: 'product', limit: 20 }),
    staleTime: 30_000,
  })

  const itemsDestino = (data?.items ?? []).filter((i) => i.usaDimensiones === true && !!i.itemGenericoOrigen)

  const options: SearchSelectOption[] = itemsDestino.map((item) => ({
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
        const found = itemsDestino.find((i) => i.id === val)
        if (found) onSelect(found)
      }}
      options={options}
      onSearch={setQuery}
      onOpen={() => refetch()}
      loading={isLoading}
      placeholder="Buscar artículo dimensionado con ítem genérico configurado…"
    />
  )
}

export default function ConversionDimensionForm() {
  const navigate = useNavigate()
  const puedeConvertir = usePuede('inventario.convertir-dimension')

  const [itemDestino, setItemDestino] = useState<Item | null>(null)
  // Override opcional del genérico a consumir (§4.1 punto 2 / §4.2) — por default se resuelve
  // automáticamente en el servidor desde `itemDestino.itemGenericoOrigen`, no se manda `itemOrigen`.
  const [usarOtroOrigen, setUsarOtroOrigen] = useState(false)
  const [itemOrigenOverride, setItemOrigenOverride] = useState<Item | null>(null)
  const [warehouse, setWarehouse] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [qty, setQty] = useState<number | ''>('')
  const [combinacion, setCombinacion] = useState<DimensionesLinea>({})
  const [postingDate, setPostingDate] = useState(todayIso())
  const [remarks, setRemarks] = useState('')
  const [branch, setBranch] = useState('')
  const [resultado, setResultado] = useState<{ itemOrigen: string; itemDestino: string; qty: number } | null>(null)

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes-all'],
    queryFn: () => listAlmacenes(),
    staleTime: 60_000,
  })
  const warehouseOptions: SearchSelectOption[] = (almacenes ?? [])
    .filter((a) => !a.disabled && (!warehouseSearch || a.name.toLowerCase().includes(warehouseSearch.toLowerCase())))
    .map((a) => ({ value: a.id, label: a.name }))

  // El genérico que se va a consumir: el override explícito si el usuario lo activó, si no el
  // configurado en el artículo destino (§3.1/§4.2) — puramente informativo del lado del cliente,
  // la resolución real cuando se omite `itemOrigen` la hace el servidor.
  const itemOrigenCodigo = usarOtroOrigen ? (itemOrigenOverride?.id ?? '') : (itemDestino?.itemGenericoOrigen ?? '')
  const itemOrigenLabel = usarOtroOrigen ? itemOrigenOverride?.itemName : undefined

  // Saldo disponible del genérico en el almacén elegido (§4.1 punto 4) — el genérico no tiene
  // dimensiones, así que es el mismo stock plano por artículo que cualquier otra pantalla, no
  // stock-por-dimensión.
  const stockMap = useItemsStock([itemOrigenCodigo || undefined])
  const disponibleOrigen = itemOrigenCodigo && warehouse ? resolveDisponible(stockMap.get(itemOrigenCodigo), warehouse) : undefined

  const itemDestinoDimensiones = itemDestino?.dimensiones ?? []
  const combinacionLista = combinacionCompleta(itemDestinoDimensiones, combinacion)

  const conversionMutation = useMutation({
    mutationFn: () => convertirDimension({
      ...(usarOtroOrigen && itemOrigenOverride ? { itemOrigen: itemOrigenOverride.id } : {}),
      itemDestino: itemDestino!.id,
      warehouse,
      qty: qty as number,
      dimensiones: combinacion,
      postingDate: postingDate || undefined,
      remarks: remarks || undefined,
      branch: branch || undefined,
    }),
    onSuccess: (data) => {
      setResultado({ itemOrigen: data.itemOrigen, itemDestino: data.itemDestino, qty: data.qty })
      toast.success(`Conversión aplicada — ${data.qty} unidades de "${data.itemOrigen}" convertidas en "${data.itemDestino}".`)
    },
    onError: (err: unknown) => mostrarErrorApi(err, 'Error al convertir la dimensión'),
  })

  function resetForm() {
    setItemDestino(null)
    setUsarOtroOrigen(false)
    setItemOrigenOverride(null)
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
    if (!itemDestino) { toast.error('Selecciona el artículo dimensionado al que se va a convertir'); return }
    // §4.4 — mismo mensaje exacto del spec, por si el catálogo cambió entre que se cargó la
    // pantalla (filtrada a ítems con genérico configurado) y que se envía el formulario.
    if (!usarOtroOrigen && !itemDestino.itemGenericoOrigen) {
      toast.error(
        `El ítem "${itemDestino.id}" no tiene configurado un ítem genérico de origen (Item.custom_item_generico_origen) — indique "itemOrigen" explícitamente, o configure ese campo en el ítem destino antes de convertir.`,
      )
      return
    }
    if (usarOtroOrigen && !itemOrigenOverride) { toast.error('Selecciona el ítem de origen a consumir'); return }
    if (!warehouse) { toast.error('Selecciona un almacén'); return }
    if (!combinacionLista) { toast.error('Completa la combinación completa a asignar en el ítem destino'); return }
    if (qty === '' || qty <= 0) { toast.error('Indica la cantidad a convertir (> 0)'); return }
    conversionMutation.mutate()
  }

  if (!puedeConvertir) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">Sin acceso</p>
            <p className="empty-sub">No tienes permiso para convertir ítems a dimensionados.</p>
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
        title="Conversión a Ítem Dimensionado"
        description='Convierte N unidades de un ítem genérico (sin dimensiones) en N unidades de un ítem dimensionado, asignando la combinación — ej. 10 "Bumper genérico" en "Bumper" (2024, Rojo).'
      />

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Artículo destino y origen</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label ff-required">Artículo destino (dimensionado)</label>
              <ItemDestinoConversionSelect
                value={itemDestino?.id ?? ''}
                selectedLabel={itemDestino?.itemName}
                onSelect={(i) => { setItemDestino(i); setCombinacion({}) }}
                onClear={() => { setItemDestino(null); setCombinacion({}) }}
              />
            </div>

            {itemDestino && (
              <div className="ff-wrap">
                <label className="ff-label">Ítem genérico de origen</label>
                {usarOtroOrigen ? (
                  <ItemSelect
                    value={itemOrigenOverride?.id ?? ''}
                    selectedLabel={itemOrigenOverride?.itemName}
                    onSelect={setItemOrigenOverride}
                    onClear={() => setItemOrigenOverride(null)}
                    excludeDimensioned
                    placeholder="Buscar ítem genérico…"
                  />
                ) : itemDestino.itemGenericoOrigen ? (
                  <div className="ff-input" style={{ color: 'var(--text-secondary)', cursor: 'default', background: 'var(--bg-muted)' }}>
                    {itemDestino.itemGenericoOrigen}
                  </div>
                ) : (
                  <div className="inline-alert inline-alert-error">
                    <Info size={14} />
                    Este artículo no tiene configurado un ítem genérico de origen — configúralo en
                    Catálogo → Artículos antes de convertir, o usa otro ítem de origen abajo.
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-size-sm"
                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  onClick={() => { setUsarOtroOrigen((v) => !v); setItemOrigenOverride(null) }}
                >
                  {usarOtroOrigen ? 'Usar el genérico configurado en el artículo' : 'Usar otro ítem de origen'}
                </button>
              </div>
            )}

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
                  disabled={!itemDestino}
                />
                {disponibleOrigen && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Disponible de "{itemOrigenLabel ?? itemOrigenCodigo}" en este almacén: {disponibleOrigen.disponible}
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

            {itemDestino && itemDestinoDimensiones.length > 0 && (
              <div className="ff-wrap">
                <label className="ff-label ff-required">
                  Combinación a asignar
                  <ArrowRight size={12} style={{ verticalAlign: 'middle', margin: '0 4px' }} />
                </label>
                <CombinacionDimensionSelector
                  itemDimensiones={itemDestinoDimensiones}
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
              !itemDestino ||
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
            Conversión aplicada: <strong>{resultado.qty}</strong> unidades de <strong>{resultado.itemOrigen}</strong> → <strong>{resultado.itemDestino}</strong>.
          </span>
          <button type="button" className="btn btn-ghost btn-size-sm" onClick={resetForm}>Hacer otra conversión</button>
        </div>
      )}
    </div>
  )
}
