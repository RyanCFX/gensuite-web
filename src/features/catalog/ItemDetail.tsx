import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getItem, toggleItem, listItemVariants, generateVariants, createVariant, getAttribute, updateItemPrices } from '@/shared/api/catalog'
import { listWarehouses } from '@/shared/api/inventory'
import { listZonas } from '@/shared/api/zonas'
import { listUbicaciones, getItemUbicaciones, assignItemUbicacion, unassignItemUbicacion, moverStockUbicacion } from '@/shared/api/ubicaciones'
import { formatDOP } from '@/lib/formatters'
import { ToggleLeft, ToggleRight, Package, ArrowLeft, X, MapPin, Trash2, Info, DollarSign, ArrowRightLeft, Pencil } from 'lucide-react'
import type { Item, GenerateVariantsResult, ItemAttribute, ApiError, UpdateItemPricesDto, ItemPricesResult } from '@/shared/api/types'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

// ─── Update Prices Modal ──────────────────────────────────────────────────────

function costPlusPreview(purchasePrice: string, margin: string): number | undefined {
  const cost = parseFloat(purchasePrice)
  const marginPct = parseFloat(margin)
  if (!Number.isFinite(cost) || !Number.isFinite(marginPct) || marginPct >= 100) return undefined
  return Math.round((cost / (1 - marginPct / 100)) * 100) / 100
}

function UpdatePricesModal({
  item,
  onClose,
  onSuccess,
}: {
  item: Item
  onClose: () => void
  onSuccess: (updated: ItemPricesResult) => void
}) {
  const [purchasePrice, setPurchasePrice] = useState(item.valuationRate?.toString() ?? '')
  const [standardRate, setStandardRate] = useState(item.standardRate?.toString() ?? '')
  const [priceMode, setPriceMode] = useState<'manual' | 'cost_plus'>(item.priceMode ?? 'manual')
  const [priceA, setPriceA] = useState(item.prices?.A?.toString() ?? '')
  const [priceB, setPriceB] = useState(item.prices?.B?.toString() ?? '')
  const [priceC, setPriceC] = useState(item.prices?.C?.toString() ?? '')
  const [marginA, setMarginA] = useState(item.marginA?.toString() ?? '')
  const [marginB, setMarginB] = useState(item.marginB?.toString() ?? '')
  const [marginC, setMarginC] = useState(item.marginC?.toString() ?? '')

  const isCostPlus = priceMode === 'cost_plus'

  const mutation = useMutation({
    mutationFn: (data: UpdateItemPricesDto) => updateItemPrices(item.id, data),
    onSuccess: (result) => {
      toast.success('Precios actualizados')
      onSuccess(result)
      onClose()
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al actualizar los precios')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = (v: string) => (v.trim() === '' ? undefined : parseFloat(v))

    // Solo se manda lo que realmente cambió respecto al valor original.
    const data: UpdateItemPricesDto = {}
    const pp = num(purchasePrice)
    if (pp !== undefined && pp !== item.valuationRate) data.purchasePrice = pp
    const sr = num(standardRate)
    if (sr !== undefined && sr !== item.standardRate) data.standardRate = sr
    if (priceMode !== (item.priceMode ?? 'manual')) data.priceMode = priceMode

    if (isCostPlus) {
      const ma = num(marginA)
      if (ma !== undefined && ma !== item.marginA) data.marginA = ma
      const mb = num(marginB)
      if (mb !== undefined && mb !== item.marginB) data.marginB = mb
      const mc = num(marginC)
      if (mc !== undefined && mc !== item.marginC) data.marginC = mc
    } else {
      const pa = num(priceA)
      if (pa !== undefined && pa !== item.prices?.A) data.priceA = pa
      const pb = num(priceB)
      if (pb !== undefined && pb !== item.prices?.B) data.priceB = pb
      const pc = num(priceC)
      if (pc !== undefined && pc !== item.prices?.C) data.priceC = pc
    }

    if (Object.keys(data).length === 0) {
      onClose()
      return
    }
    mutation.mutate(data)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Actualizar Precios</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isCostPlus && (
              <div className="inline-alert inline-alert-warn">
                En modo "Sobre Costo" los precios A/B/C se calculan automáticamente a partir del
                precio de compra y los márgenes de abajo — no se pueden fijar directamente. La
                vista previa es solo referencial; los valores finales son los que devuelva el
                servidor al guardar.
              </div>
            )}
            <div className="ff-wrap">
              <label className="ff-label">Precio de Compra</label>
              <input
                className="ff-input"
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Precio de Venta (base)</label>
              <input
                className="ff-input"
                type="number"
                min="0"
                step="0.01"
                value={standardRate}
                onChange={(e) => setStandardRate(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Modo de Precio</label>
              <Select value={priceMode} onValueChange={(val) => setPriceMode(val as 'manual' | 'cost_plus')}>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="cost_plus">Sobre Costo</SelectItem>
              </Select>
            </div>

            {isCostPlus ? (
              <div className="form-row form-row-3">
                {([
                  { label: 'Margen A — Máximo', value: marginA, setValue: setMarginA },
                  { label: 'Margen B — Promedio', value: marginB, setValue: setMarginB },
                  { label: 'Margen C — Mínimo', value: marginC, setValue: setMarginC },
                ] as const).map(({ label, value, setValue }) => {
                  const preview = costPlusPreview(purchasePrice, value)
                  return (
                    <div className="ff-wrap" key={label}>
                      <label className="ff-label">{label}</label>
                      <input
                        className="ff-input"
                        type="number"
                        min="0"
                        max="99"
                        step="0.1"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="0"
                      />
                      <p className="ff-hint">{preview != null ? `≈ ${formatDOP(preview)}` : '—'}</p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="form-row form-row-3">
                <div className="ff-wrap">
                  <label className="ff-label">Precio A — Máximo</label>
                  <input
                    className="ff-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceA}
                    onChange={(e) => setPriceA(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Precio B — Promedio</label>
                  <input
                    className="ff-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceB}
                    onChange={(e) => setPriceB(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Precio C — Mínimo</label>
                  <input
                    className="ff-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceC}
                    onChange={(e) => setPriceC(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Generate Confirm Modal ───────────────────────────────────────────────────

function GenerateConfirmModal({
  item,
  onConfirm,
  onClose,
}: {
  item: Item
  onConfirm: () => void
  onClose: () => void
}) {
  const attributeIds = (item.attributes ?? []).map((a) => a.attribute)

  // Load each attribute to count values
  const attributeQueries = attributeIds.map((attrId) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['attribute', attrId],
      queryFn: () => getAttribute(attrId),
      staleTime: 5 * 60_000,
    })
  )

  const allLoaded = attributeQueries.every((q) => q.data)
  const totalCombinations = allLoaded
    ? attributeQueries.reduce((acc, q) => {
        const attr = q.data as ItemAttribute
        if (attr.numeric && attr.fromRange != null && attr.toRange != null && attr.increment) {
          const count = Math.floor((attr.toRange - attr.fromRange) / attr.increment) + 1
          return acc * count
        }
        return acc * (attr.values?.length ?? 1)
      }, 1)
    : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Generar variantes</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {totalCombinations != null
              ? `Se crearán hasta ${totalCombinations} variante(s) automáticamente. Las combinaciones que ya existan serán saltadas.`
              : 'Se generarán todas las combinaciones de atributos para este template.'}
          </p>
          {item.attributes && item.attributes.length === 0 && (
            <div className="inline-alert inline-alert-warn" style={{ marginTop: 12 }}>
              Este template no tiene atributos definidos. Edita el artículo para agregar atributos.
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onConfirm}>Generar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Variant Modal ─────────────────────────────────────────────────────

function CreateVariantModal({
  item,
  itemId,
  onClose,
  onSuccess,
}: {
  item: Item
  itemId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const attributeIds = (item.attributes ?? []).map((a) => a.attribute)

  const attributeQueries = attributeIds.map((attrId) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['attribute', attrId],
      queryFn: () => getAttribute(attrId),
      staleTime: 5 * 60_000,
    })
  )

  const [standardRate, setStandardRate] = useState(0)
  const [attrValues, setAttrValues] = useState<Record<string, string>>({})
  const [attrSearches, setAttrSearches] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const attributes = attributeIds.map((attrId) => ({
        attribute: attrId,
        attributeValue: attrValues[attrId] ?? '',
      }))
      await createVariant(itemId, { standardRate, attributes })
      toast.success('Variante creada correctamente')
      onSuccess()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? 'Error al crear la variante')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Agregar variante</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {attributeIds.map((attrId, i) => {
              const attrData = attributeQueries[i]?.data
              const attrSearch = attrSearches[attrId] ?? ''
              const attrOptions: SearchSelectOption[] = (attrData?.values ?? [])
                .filter((val) => !attrSearch || val.value.toLowerCase().includes(attrSearch.toLowerCase()))
                .map((val) => ({ value: val.value, label: val.value }))
              return (
                <div key={attrId} className="ff-wrap">
                  <label className="ff-label">
                    {attrData?.name ?? attrId} <span className="ff-required">*</span>
                  </label>
                  {attrData?.numeric ? (
                    <input
                      type="number"
                      className="ff-input"
                      value={attrValues[attrId] ?? ''}
                      onChange={(e) => setAttrValues((v) => ({ ...v, [attrId]: e.target.value }))}
                      required
                    />
                  ) : (
                    <SearchSelect
                      value={attrValues[attrId] ?? ''}
                      onChange={(val) => setAttrValues((v) => ({ ...v, [attrId]: val }))}
                      options={attrOptions}
                      onSearch={(q) => setAttrSearches((s) => ({ ...s, [attrId]: q }))}
                      selectedLabel={attrValues[attrId] ?? ''}
                      placeholder="Seleccionar…"
                    />
                  )}
                </div>
              )
            })}
            <div className="ff-wrap">
              <label className="ff-label">Precio de Venta <span className="ff-required">*</span></label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="ff-input"
                value={standardRate}
                onChange={(e) => setStandardRate(Number(e.target.value))}
                required
              />
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Crear variante'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Variants Panel ───────────────────────────────────────────────────────────

function VariantsPanel({ itemId, item }: { itemId: string; item: Item }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [showCreateVariant, setShowCreateVariant] = useState(false)
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)
  const [generateResult, setGenerateResult] = useState<GenerateVariantsResult | null>(null)
  const [generating, setGenerating] = useState(false)

  const { data: variants, isLoading } = useQuery({
    queryKey: ['item-variants', itemId],
    queryFn: () => listItemVariants(itemId),
    enabled: Boolean(itemId),
  })

  async function handleGenerate() {
    setGenerating(true)
    setShowGenerateConfirm(false)
    try {
      const result = await generateVariants(itemId)
      setGenerateResult(result)
      qc.invalidateQueries({ queryKey: ['item-variants', itemId] })
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? 'Error al generar variantes')
    } finally {
      setGenerating(false)
    }
  }

  const attrCols = item.attributes ?? []

  return (
    <div className="card" id="variants">
      <div className="card-header">
        <div>
          <span className="card-title">Variantes</span>
          {variants && (
            <span className="card-meta" style={{ marginLeft: 8 }}>{variants.length} variante(s)</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost btn-size-sm"
            onClick={() => setShowCreateVariant(true)}
          >
            + Agregar variante
          </button>
          <button
            className="btn btn-primary btn-size-sm"
            onClick={() => setShowGenerateConfirm(true)}
            disabled={generating}
          >
            {generating ? '…' : '⚡ Generar todas'}
          </button>
        </div>
      </div>

      {generateResult && (
        <div className="card-body" style={{ paddingBottom: 0 }}>
          {generateResult.created === 0 && generateResult.skipped > 0 ? (
            <div className="inline-alert inline-alert-info">
              Todas las variantes ya existen ({generateResult.skipped} saltadas)
            </div>
          ) : (
            <div className="inline-alert inline-alert-success">
              ✓ {generateResult.created} variantes creadas
              {generateResult.skipped > 0 && `, ${generateResult.skipped} ya existían`}
            </div>
          )}
        </div>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              {attrCols.map((a) => <th key={a.attribute}>{a.attribute}</th>)}
              <th style={{ textAlign: 'right' }}>Precio</th>
              <th style={{ textAlign: 'right' }}>Stock</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 + attrCols.length }).map((__, j) => (
                      <td key={j}>
                        <span className="skeleton-box" style={{ height: 13, width: '80%', display: 'block' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : (variants ?? []).length === 0
                ? (
                    <tr>
                      <td colSpan={4 + attrCols.length}>
                        <div className="empty-state">
                          <p className="empty-title">Sin variantes</p>
                          <p className="empty-sub">Genera todas las variantes automáticamente o añade una manual.</p>
                        </div>
                      </td>
                    </tr>
                  )
                : (variants ?? []).map((v) => (
                    <tr
                      key={v.id}
                      className="table-row-clickable"
                      onClick={() => navigate(`/inventario/articulos/${v.id}`)}
                    >
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v.id}</td>
                      <td style={{ fontWeight: 500 }}>{v.itemName}</td>
                      {attrCols.map((a) => {
                        const av = (v.attributes ?? []).find((va) => va.attribute === a.attribute)
                        return <td key={a.attribute}>{av?.attributeValue ?? '—'}</td>
                      })}
                      <td style={{ textAlign: 'right' }}>
                        {v.standardRate > 0
                          ? formatDOP(v.standardRate)
                          : <span className="td-muted">RD$0</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>{v.currentStock ?? 0}</td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>

      {showGenerateConfirm && (
        <GenerateConfirmModal
          item={item}
          onConfirm={handleGenerate}
          onClose={() => setShowGenerateConfirm(false)}
        />
      )}

      {showCreateVariant && (
        <CreateVariantModal
          item={item}
          itemId={itemId}
          onClose={() => setShowCreateVariant(false)}
          onSuccess={() => {
            setShowCreateVariant(false)
            qc.invalidateQueries({ queryKey: ['item-variants', itemId] })
          }}
        />
      )}
    </div>
  )
}

// ─── Asignar Ubicación Modal ──────────────────────────────────────────────────

function AssignUbicacionModal({
  itemCode,
  warehouse,
  onClose,
  onSuccess,
}: {
  itemCode: string
  warehouse: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [zonaId, setZonaId] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [esPrincipal, setEsPrincipal] = useState(false)
  const [notas, setNotas] = useState('')

  const { data: zonasData } = useQuery({
    queryKey: ['zonas', warehouse],
    queryFn: () => listZonas({ warehouse, limit: 100 }),
  })
  const zonas = zonasData?.items ?? []

  const { data: ubicacionesData } = useQuery({
    queryKey: ['ubicaciones', zonaId],
    queryFn: () => listUbicaciones({ zona: zonaId }),
    enabled: !!zonaId,
  })
  const ubicaciones = ubicacionesData?.items ?? []

  const [zonaSearch, setZonaSearch] = useState('')
  const zonaOptions: SearchSelectOption[] = zonas
    .filter((z) => !zonaSearch || z.zonaName.toLowerCase().includes(zonaSearch.toLowerCase()))
    .map((z) => ({ value: z.id, label: z.zonaName }))

  const [ubicacionSearch, setUbicacionSearch] = useState('')
  const ubicacionOptions: SearchSelectOption[] = ubicaciones
    .filter((u) => !ubicacionSearch || u.ubicacionName.toLowerCase().includes(ubicacionSearch.toLowerCase()))
    .map((u) => ({ value: u.id, label: u.ubicacionName }))

  const assignMutation = useMutation({
    mutationFn: () => assignItemUbicacion({ itemCode, warehouse, ubicacionId, esPrincipal, notas: notas || undefined }),
    onSuccess: () => {
      toast.success('Ubicación asignada')
      onSuccess()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al asignar la ubicación'),
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Asignar ubicación</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Zona</label>
            <SearchSelect
              value={zonaId}
              onChange={(val) => { setZonaId(val); setUbicacionId('') }}
              options={zonaOptions}
              onSearch={setZonaSearch}
              selectedLabel={zonas.find((z) => z.id === zonaId)?.zonaName ?? ''}
              placeholder="Seleccionar zona…"
            />
            {zonasData && zonas.length === 0 && (
              <p className="ff-hint">Este almacén no tiene zonas todavía. Créalas en Inventario → Zonas y Ubicaciones.</p>
            )}
          </div>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Ubicación / Rack</label>
            <SearchSelect
              value={ubicacionId}
              onChange={setUbicacionId}
              options={ubicacionOptions}
              onSearch={setUbicacionSearch}
              selectedLabel={ubicaciones.find((u) => u.id === ubicacionId)?.ubicacionName ?? ''}
              placeholder="Seleccionar ubicación…"
              disabled={!zonaId}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={esPrincipal} onChange={(e) => setEsPrincipal(e.target.checked)} />
            Marcar como principal
          </label>
          <div className="ff-wrap">
            <label className="ff-label">Notas</label>
            <textarea className="ff-textarea" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={() => assignMutation.mutate()}
            disabled={!ubicacionId || assignMutation.isPending}
          >
            {assignMutation.isPending ? 'Guardando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mover Stock Modal ─────────────────────────────────────────────────────────

function MoverUbicacionModal({
  itemCode,
  warehouse,
  origen,
  onClose,
  onSuccess,
}: {
  itemCode: string
  warehouse: string
  origen: { id: string; label: string }
  onClose: () => void
  onSuccess: () => void
}) {
  const [zonaId, setZonaId] = useState('')
  const [ubicacionDestino, setUbicacionDestino] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [notas, setNotas] = useState('')

  const { data: zonasData } = useQuery({
    queryKey: ['zonas', warehouse],
    queryFn: () => listZonas({ warehouse, limit: 100 }),
  })
  const zonas = zonasData?.items ?? []

  const { data: ubicacionesData } = useQuery({
    queryKey: ['ubicaciones', zonaId],
    queryFn: () => listUbicaciones({ zona: zonaId }),
    enabled: !!zonaId,
  })
  const ubicaciones = (ubicacionesData?.items ?? []).filter((u) => u.id !== origen.id)

  const [zonaSearch, setZonaSearch] = useState('')
  const zonaOptions: SearchSelectOption[] = zonas
    .filter((z) => !zonaSearch || z.zonaName.toLowerCase().includes(zonaSearch.toLowerCase()))
    .map((z) => ({ value: z.id, label: z.zonaName }))

  const [ubicacionSearch, setUbicacionSearch] = useState('')
  const ubicacionOptions: SearchSelectOption[] = ubicaciones
    .filter((u) => !ubicacionSearch || u.ubicacionName.toLowerCase().includes(ubicacionSearch.toLowerCase()))
    .map((u) => ({ value: u.id, label: u.ubicacionName }))

  const moverMutation = useMutation({
    mutationFn: () => moverStockUbicacion({ itemCode, cantidad, ubicacionOrigen: origen.id, ubicacionDestino, notas: notas || undefined }),
    onSuccess: () => {
      toast.success('Stock movido correctamente')
      onSuccess()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al mover el stock'),
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Mover stock</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="ff-wrap">
            <label className="ff-label">Ubicación origen</label>
            <input className="ff-input" value={origen.label} disabled />
          </div>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Zona destino</label>
            <SearchSelect
              value={zonaId}
              onChange={(val) => { setZonaId(val); setUbicacionDestino('') }}
              options={zonaOptions}
              onSearch={setZonaSearch}
              selectedLabel={zonas.find((z) => z.id === zonaId)?.zonaName ?? ''}
              placeholder="Seleccionar zona…"
            />
          </div>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Ubicación destino</label>
            <SearchSelect
              value={ubicacionDestino}
              onChange={setUbicacionDestino}
              options={ubicacionOptions}
              onSearch={setUbicacionSearch}
              selectedLabel={ubicaciones.find((u) => u.id === ubicacionDestino)?.ubicacionName ?? ''}
              placeholder="Seleccionar ubicación…"
              disabled={!zonaId}
            />
          </div>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Cantidad</label>
            <input
              className="ff-input"
              type="number"
              min="0.01"
              step="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Notas</label>
            <textarea className="ff-textarea" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={() => moverMutation.mutate()}
            disabled={!ubicacionDestino || cantidad <= 0 || moverMutation.isPending}
          >
            {moverMutation.isPending ? 'Moviendo…' : 'Mover'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel de Ubicaciones ─────────────────────────────────────────────────────

function UbicacionesPanel({ itemCode }: { itemCode: string }) {
  const queryClient = useQueryClient()
  const [warehouse, setWarehouse] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  const [moverTarget, setMoverTarget] = useState<{ id: string; label: string } | null>(null)

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })
  const [warehouseSearch, setWarehouseSearch] = useState('')

  // Selecciona el primer almacén disponible por defecto
  const activeWarehouse = warehouse || warehouses?.[0]?.id || ''
  const warehouseOptions: SearchSelectOption[] = (warehouses ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  const { data, isLoading } = useQuery({
    queryKey: ['item-ubicaciones', itemCode, activeWarehouse],
    queryFn: () => getItemUbicaciones(itemCode, activeWarehouse),
    enabled: !!activeWarehouse,
  })

  const asignaciones = data?.items ?? []

  const unassignMutation = useMutation({
    mutationFn: (id: string) => unassignItemUbicacion(id),
    onSuccess: () => {
      toast.success('Ubicación removida')
      queryClient.invalidateQueries({ queryKey: ['item-ubicaciones', itemCode, activeWarehouse] })
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al remover la ubicación'),
  })

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={15} style={{ color: 'var(--text-secondary)' }} /> Ubicaciones
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(warehouses?.length ?? 0) > 1 && (
            <div style={{ width: 200 }}>
              <SearchSelect
                value={activeWarehouse}
                onChange={setWarehouse}
                options={warehouseOptions}
                onSearch={setWarehouseSearch}
                selectedLabel={warehouses?.find((w) => w.id === activeWarehouse)?.name ?? ''}
                placeholder="Seleccionar almacén"
              />
            </div>
          )}
          <button className="btn btn-primary btn-size-sm" onClick={() => setShowAssign(true)} disabled={!activeWarehouse}>
            + Asignar ubicación
          </button>
        </div>
      </div>

      {data?.note && (
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="inline-alert inline-alert-info">
            <Info size={16} />
            Esta función requiere actualizar la app localizacion_rd en el servidor. Contacta al equipo técnico.
          </div>
        </div>
      )}

      <div className="card-body">
        {isLoading ? (
          <span className="skeleton-box" style={{ height: 60, display: 'block' }} />
        ) : asignaciones.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Sin ubicaciones asignadas en este almacén.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {asignaciones.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                }}
              >
                <MapPin size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>
                    {a.zonaName ?? '—'} / {a.ubicacionName ?? a.ubicacionId}
                  </span>
                  {a.notas && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>{a.notas}</span>}
                </div>
                {a.esPrincipal && <span className="badge badge-success">Principal</span>}
                <button
                  className="btn btn-ghost btn-size-icon-sm"
                  onClick={() => setMoverTarget({ id: a.ubicacionId, label: `${a.zonaName ?? '—'} / ${a.ubicacionName ?? a.ubicacionId}` })}
                  title="Mover stock"
                >
                  <ArrowRightLeft size={13} />
                </button>
                <button
                  className="btn btn-ghost btn-size-icon-sm"
                  style={{ color: 'var(--icon-muted)' }}
                  onClick={() => unassignMutation.mutate(a.id)}
                  disabled={unassignMutation.isPending}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAssign && activeWarehouse && (
        <AssignUbicacionModal
          itemCode={itemCode}
          warehouse={activeWarehouse}
          onClose={() => setShowAssign(false)}
          onSuccess={() => {
            setShowAssign(false)
            queryClient.invalidateQueries({ queryKey: ['item-ubicaciones', itemCode, activeWarehouse] })
          }}
        />
      )}

      {moverTarget && activeWarehouse && (
        <MoverUbicacionModal
          itemCode={itemCode}
          warehouse={activeWarehouse}
          origen={moverTarget}
          onClose={() => setMoverTarget(null)}
          onSuccess={() => {
            setMoverTarget(null)
            queryClient.invalidateQueries({ queryKey: ['item-ubicaciones', itemCode, activeWarehouse] })
          }}
        />
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['item', id],
    queryFn: () => getItem(id!),
    enabled: Boolean(id),
  })

  const [showPricesModal, setShowPricesModal] = useState(false)

  const toggleMutation = useMutation({
    mutationFn: () => toggleItem(id!),
    onSuccess: (updated) => {
      toast.success(updated.disabled ? 'Artículo desactivado' : 'Artículo activado')
      queryClient.invalidateQueries({ queryKey: ['item', id] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
    onError: () => {
      toast.error('Error al cambiar el estado del artículo')
    },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 200, height: 28, marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 192, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (isError || !item) {
    return (
      <div className="page-container">
        <p style={{ color: 'var(--color-error)' }}>Error al cargar el artículo</p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/inventario/articulos')}>
          Volver
        </button>
      </div>
    )
  }

  const stock = item.currentStock ?? 0
  let stockStatus: 'in-stock' | 'low-stock' | 'out-stock'
  if (stock <= 0) stockStatus = 'out-stock'
  else if (stock <= 10) stockStatus = 'low-stock'
  else stockStatus = 'in-stock'

  const stockColor = {
    'in-stock': 'var(--color-success)',
    'low-stock': 'var(--color-warning)',
    'out-stock': 'var(--color-error)',
  }[stockStatus]

  const stockLabel = {
    'in-stock': 'En Stock',
    'low-stock': 'Stock Bajo',
    'out-stock': 'Sin Stock',
  }[stockStatus]

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/inventario/articulos')}>
            <ArrowLeft size={14} /> Artículos
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={20} style={{ color: 'var(--text-secondary)' }} />
            {item.itemName}
            {item.disabled
              ? <span className="badge badge-neutral">Inactivo</span>
              : <span className="badge badge-success">Activo</span>}
            <span className="badge badge-neutral">{item.type === 'product' ? 'Producto' : 'Servicio'}</span>
            {item.hasVariants && <span className="badge badge-info">Template</span>}
            {item.variantOf && <span className="badge badge-neutral">Variante</span>}
          </h1>
          <p className="page-sub" style={{ fontFamily: 'monospace' }}>{item.id}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/inventario/articulos/${item.id}/editar`)}>
            <Pencil size={15} /> Editar
          </button>
          {!item.hasVariants && (
            <button className="btn btn-secondary" onClick={() => setShowPricesModal(true)}>
              <DollarSign size={15} /> Actualizar Precios
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
          >
            {item.disabled
              ? <><ToggleRight size={15} /> Activar</>
              : <><ToggleLeft size={15} /> Desactivar</>}
          </button>
        </div>
      </div>

      {/* Variant-of banner */}
      {item.variantOf && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          Variante de:{' '}
          <a
            style={{ fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => navigate(`/inventario/articulos/${item.variantOf}`)}
          >
            {item.variantOf}
          </a>
        </div>
      )}

      {item.type === 'product' && !item.hasVariants && (
        <div className="stats-row" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">Stock Actual</span>
            </div>
            <div className="stat-value" style={{ color: stockColor, fontSize: 40 }}>{stock}</div>
            <div className="stat-footer">
              <span style={{ color: stockColor, fontWeight: 500, fontSize: 13 }}>{stockLabel}</span>
            </div>
          </div>

           {!!item.standardRate && (
            <div className="stat-card">
              <div className="stat-card-top">
                <span className="stat-label">Precio de Venta</span>
              </div>
              <div className="stat-value" style={{ fontSize: 28 }}>{formatDOP(item.standardRate)}</div>
              {item.autoDiscount && (
                <div className="stat-footer">
                  <span className="badge badge-discount" style={{ fontSize: 11 }}>
                    {item.autoDiscount.discountType === 'Discount Percentage'
                      ? `${item.autoDiscount.discountPercentage ?? 0}% OFF (auto)`
                      : `${formatDOP(item.autoDiscount.discountAmount ?? 0)} OFF (auto)`}
                  </span>
                </div>
              )}
              {item.salesPriceDate && (
                <div className="stat-footer">
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    última actualización: {new Date(item.salesPriceDate).toLocaleDateString('es-DO')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {item.type === 'service' && !item.hasVariants && !!item.standardRate && (
        <div className="stats-row" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">Precio de Venta</span>
            </div>
            <div className="stat-value" style={{ fontSize: 28 }}>{formatDOP(item.standardRate)}</div>
            {item.salesPriceDate && (
              <div className="stat-footer">
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                  última actualización: {new Date(item.salesPriceDate).toLocaleDateString('es-DO')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {!item.hasVariants && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Compra</h2></div>
          <div className="card-body">
            <div className="fields-grid fields-grid-3">
              {item.valuationRate != null && (
                <div className="detail-field">
                  <span className="detail-label">Costo de Valoración</span>
                  <span className="detail-value">{formatDOP(item.valuationRate)}</span>
                  {item.purchasePriceDate && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      actualizado: {new Date(item.purchasePriceDate).toLocaleDateString('es-DO')}
                    </span>
                  )}
                </div>
              )}
              <div className="detail-field">
                <span className="detail-label">Impuesto de Compra</span>
                <span className="detail-value">
                  {item.purchaseTaxTemplate ?? '—'}
                  {item.purchaseTaxPct != null && item.purchaseTaxPct > 0 && (
                    <span style={{ color: 'var(--color-brand)', fontWeight: 600 }}> ({item.purchaseTaxPct}%)</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!item.hasVariants && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Venta</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="fields-grid fields-grid-3">
              <div className="detail-field">
                <span className="detail-label">Modo de precio</span>
                <span className="detail-value">{item.priceMode === 'cost_plus' ? 'Sobre costo' : 'Manual'}</span>
              </div>
              {item.allowsDiscount != null && (
                <div className="detail-field">
                  <span className="detail-label">Descuento</span>
                  <span className="detail-value">{item.allowsDiscount ? `Hasta ${item.maxDiscountPct ?? 0}%` : 'No permitido'}</span>
                </div>
              )}
              <div className="detail-field">
                <span className="detail-label">Impuesto de Venta</span>
                <span className="detail-value">
                  {item.salesTaxTemplate ?? '—'}
                  {item.salesTaxPct != null && item.salesTaxPct > 0 && (
                    <span style={{ color: 'var(--color-brand)', fontWeight: 600 }}> ({item.salesTaxPct}%)</span>
                  )}
                </span>
              </div>
            </div>

            {(item.priceMode === 'cost_plus'
              ? (item.marginA != null || item.marginB != null || item.marginC != null) && item.valuationRate != null && item.valuationRate > 0
              : (item.prices?.A != null || item.prices?.B != null || item.prices?.C != null)
            ) && (
              <div className="stats-row">
                {item.priceMode === 'cost_plus' ? (
                  <>
                    {item.marginA != null && item.valuationRate != null && item.valuationRate > 0 && (
                      <div className="stat-card">
                        <div className="stat-card-top">
                          <span className="stat-label">Margen A</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: 22 }}>
                          {formatDOP(Math.round(item.valuationRate / (1 - item.marginA / 100) * 100) / 100)}
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>sin impuesto</span>
                        </div>
                        {item.salesTaxPct != null && item.salesTaxPct > 0 && (
                          <div className="stat-value" style={{ fontSize: 22, color: 'var(--color-brand)' }}>
                            {formatDOP(Math.round(item.valuationRate / (1 - item.marginA / 100) * (1 + item.salesTaxPct / 100) * 100) / 100)}
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>con impuesto</span>
                          </div>
                        )}
                        <div className="stat-footer">
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>({item.marginA}%)</span>
                        </div>
                      </div>
                    )}
                    {item.marginB != null && item.valuationRate != null && item.valuationRate > 0 && (
                      <div className="stat-card">
                        <div className="stat-card-top">
                          <span className="stat-label">Margen B</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: 22 }}>
                          {formatDOP(Math.round(item.valuationRate / (1 - item.marginB / 100) * 100) / 100)}
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>sin impuesto</span>
                        </div>
                        {item.salesTaxPct != null && item.salesTaxPct > 0 && (
                          <div className="stat-value" style={{ fontSize: 22, color: 'var(--color-brand)' }}>
                            {formatDOP(Math.round(item.valuationRate / (1 - item.marginB / 100) * (1 + item.salesTaxPct / 100) * 100) / 100)}
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>con impuesto</span>
                          </div>
                        )}
                        <div className="stat-footer">
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>({item.marginB}%)</span>
                        </div>
                      </div>
                    )}
                    {item.marginC != null && item.valuationRate != null && item.valuationRate > 0 && (
                      <div className="stat-card">
                        <div className="stat-card-top">
                          <span className="stat-label">Margen C</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: 22 }}>
                          {formatDOP(Math.round(item.valuationRate / (1 - item.marginC / 100) * 100) / 100)}
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>sin impuesto</span>
                        </div>
                        {item.salesTaxPct != null && item.salesTaxPct > 0 && (
                          <div className="stat-value" style={{ fontSize: 22, color: 'var(--color-brand)' }}>
                            {formatDOP(Math.round(item.valuationRate / (1 - item.marginC / 100) * (1 + item.salesTaxPct / 100) * 100) / 100)}
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>con impuesto</span>
                          </div>
                        )}
                        <div className="stat-footer">
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>({item.marginC}%)</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {item.prices?.A != null && (
                      <div className="stat-card">
                        <div className="stat-card-top">
                          <span className="stat-label">Precio A</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: 22, color: 'var(--text-secondary)' }}>
                          {formatDOP(item.prices?.A)}
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>sin impuesto</span>
                        </div>
                        {item.salesTaxPct != null && item.salesTaxPct > 0 && (
                          <div className="stat-value" style={{ fontSize: 22, color: 'var(--color-brand)' }}>
                            {formatDOP(Math.round(item.prices?.A * (1 + item.salesTaxPct / 100) * 100) / 100)}
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>con impuesto</span>
                          </div>
                        )}
                        <div className="stat-footer">
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Máximo</span>
                        </div>
                      </div>
                    )}
                    {item.prices?.B != null && (
                      <div className="stat-card">
                        <div className="stat-card-top">
                          <span className="stat-label">Precio B</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: 22 }}>
                          {formatDOP(item.prices?.B)}
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>sin impuesto</span>
                        </div>
                        {item.salesTaxPct != null && item.salesTaxPct > 0 && (
                          <div className="stat-value" style={{ fontSize: 22, color: 'var(--color-brand)' }}>
                            {formatDOP(Math.round(item.prices?.B * (1 + item.salesTaxPct / 100) * 100) / 100)}
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>con impuesto</span>
                          </div>
                        )}
                        <div className="stat-footer">
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Promedio</span>
                        </div>
                      </div>
                    )}
                    {item.prices?.C != null && (
                      <div className="stat-card">
                        <div className="stat-card-top">
                          <span className="stat-label">Precio C</span>
                        </div>
                        <div className="stat-value" style={{ fontSize: 22, color: 'var(--text-secondary)' }}>
                          {formatDOP(item.prices?.C)}
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>sin impuesto</span>
                        </div>
                        {item.salesTaxPct != null && item.salesTaxPct > 0 && (
                          <div className="stat-value" style={{ fontSize: 22, color: 'var(--color-brand)' }}>
                            {formatDOP(Math.round(item.prices?.C * (1 + item.salesTaxPct / 100) * 100) / 100)}
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>con impuesto</span>
                          </div>
                        )}
                        <div className="stat-footer">
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Mínimo</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {item.type === 'product' && !item.hasVariants && !item.variantOf && (
        <UbicacionesPanel itemCode={item.id} />
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Detalles</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Código</span>
              <span className="detail-value" style={{ fontFamily: 'monospace' }}>{item.id}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Nombre</span>
              <span className="detail-value">{item.itemName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo</span>
              <span className="detail-value">{item.type === 'product' ? 'Producto' : 'Servicio'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Categoría</span>
              <span className="detail-value">
                {item.subcategoryName
                  ? `${item.categoryName ?? item.category} > ${item.subcategoryName}`
                  : item.categoryName ?? item.category ?? '—'}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Marca</span>
              <span className="detail-value">{item.brandName ?? item.brand ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Descripción</span>
              <span className="detail-value">{item.internalDescription ?? '—'}</span>
            </div>
          </div>

          {/* Template attributes list */}
          {item.hasVariants && (item.attributes ?? []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <span className="ff-label" style={{ display: 'block', marginBottom: 6 }}>Atributos de variantes</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(item.attributes ?? []).map((a) => (
                  <span key={a.attribute} className="badge badge-info">{a.attribute}</span>
                ))}
              </div>
            </div>
          )}

          {/* Variant attribute values */}
          {item.variantOf && (item.attributes ?? []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <span className="ff-label" style={{ display: 'block', marginBottom: 6 }}>Atributos</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(item.attributes ?? []).map((a) => (
                  <span key={a.attribute} style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{a.attribute}:</span>{' '}
                    <strong>{a.attributeValue ?? '—'}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Variants panel — only for templates */}
      {item.hasVariants && (
        <div style={{ marginTop: 20 }}>
          <VariantsPanel itemId={id!} item={item} />
        </div>
      )}

      {showPricesModal && (
        <UpdatePricesModal
          item={item}
          onClose={() => setShowPricesModal(false)}
          onSuccess={(result) => {
            queryClient.setQueryData(['item', id], (old: Item | undefined) =>
              old
                ? {
                    ...old,
                    valuationRate: result.purchasePrice,
                    standardRate: result.standardRate,
                    priceMode: result.priceMode,
                    prices: result.prices,
                  }
                : old,
            )
            queryClient.invalidateQueries({ queryKey: ['items'] })
          }}
        />
      )}
    </div>
  )
}
