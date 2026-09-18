// Formulario de mapeo de artículos — docs/tasks/relaciones_comerciales/FASE_07_MAPEO_CATALOGO_FRONTEND.md
//
// Reutilizado en dos contextos (Fase 07 §2 y Fase 11 §2): confirmar el mapeo antes de "Aceptar"
// una transacción, y emparejar líneas al "Enlazar" un documento propio ya sometido. El contrato
// con el backend es el mismo (`ResultadoMapeo` + `DecisionMapeoDto[]`) — solo cambia el título que
// pone el padre alrededor de este componente.
import { useState } from 'react'
import { Search, Plus, Check } from 'lucide-react'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { Badge } from '@/shared/ui/Badge'
import { Modal } from '@/shared/ui/Modal'
import { useQuery } from '@tanstack/react-query'
import { listCategories } from '@/shared/api/catalog'
import type { DecisionMapeoDto, EstadoLineaMapeo, Item, LineaMapeo, ResultadoMapeo, CrearArticuloDesdeSocioDto } from '@/shared/api/types'
import { formatDOP, formatNumber } from '@/lib/formatters'

const ESTADO_BADGE: Record<EstadoLineaMapeo, { label: string; variant: 'success' | 'warning' | 'neutral' | 'error' }> = {
  confirmada: { label: 'Confirmada', variant: 'success' },
  sugerida: { label: 'Sugerida', variant: 'warning' },
  sin_sugerencia: { label: 'Sin sugerencia', variant: 'neutral' },
  ambigua: { label: 'Ambigua', variant: 'error' },
}

interface FilaSeleccion {
  itemCode: string
  itemName: string
  uom?: string
}

export interface MapeoFormProps {
  resultado: ResultadoMapeo
  onConfirmarLineas: (decisiones: DecisionMapeoDto[], sincronizarBarcodes: boolean) => void
  confirmando?: boolean
  onCrearArticulo?: (dto: CrearArticuloDesdeSocioDto) => void
  creandoArticulo?: boolean
  /** `relaciones.mapeo.guardar` — sin este permiso, la pantalla solo puede ver el estado. */
  puedeGuardar: boolean
  /** `relaciones.mapeo.crear-articulo` */
  puedeCrearArticulo: boolean
  /** `relaciones.mapeo.sincronizar-barcodes` */
  puedeSincronizarBarcodes: boolean
}

export function MapeoForm({
  resultado, onConfirmarLineas, confirmando, onCrearArticulo, creandoArticulo,
  puedeGuardar, puedeCrearArticulo, puedeSincronizarBarcodes,
}: MapeoFormProps) {
  const [seleccion, setSeleccion] = useState<Record<number, FilaSeleccion>>({})
  const [factorPorLinea, setFactorPorLinea] = useState<Record<number, string>>({})
  const [sincronizarBarcodes, setSincronizarBarcodes] = useState(false)
  const [crearArticuloIndice, setCrearArticuloIndice] = useState<number | null>(null)

  function elegir(linea: LineaMapeo, sel: FilaSeleccion) {
    setSeleccion((s) => ({ ...s, [linea.indice]: sel }))
  }

  function confirmarLinea(linea: LineaMapeo) {
    const sel = seleccion[linea.indice]
    const itemCodeLocal = sel?.itemCode ?? linea.sugerencia?.itemCode
    if (!itemCodeLocal) return
    const uomElegido = sel?.uom
    const necesitaFactor = !!uomElegido && !!linea.origen.uom && uomElegido !== linea.origen.uom
    const factor = factorPorLinea[linea.indice]
    onConfirmarLineas(
      [{
        indiceLinea: linea.indice,
        itemCodeLocal,
        ...(necesitaFactor ? { uomLocal: uomElegido, factorConversion: factor ? Number(factor) : 1 } : {}),
      }],
      sincronizarBarcodes,
    )
  }

  function confirmarTodasLasSugerencias() {
    const decisiones: DecisionMapeoDto[] = resultado.lineas
      .filter((l) => l.estado === 'sugerida' && l.sugerencia)
      .map((l) => ({ indiceLinea: l.indice, itemCodeLocal: l.sugerencia!.itemCode }))
    if (decisiones.length === 0) return
    onConfirmarLineas(decisiones, sincronizarBarcodes)
  }

  const haySugeridasPendientes = resultado.lineas.some((l) => l.estado === 'sugerida')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {resultado.resumen.confirmadas} confirmada(s) · {resultado.resumen.sugeridas} sugerida(s) ·{' '}
            {resultado.resumen.sinSugerencia} sin sugerencia · {resultado.resumen.ambiguas} ambigua(s)
          </span>
        </div>
        {puedeGuardar && haySugeridasPendientes && (
          <button type="button" className="btn btn-secondary btn-size-sm" onClick={confirmarTodasLasSugerencias} disabled={confirmando}>
            <Check size={14} />
            Confirmar todas las sugerencias
          </button>
        )}
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Artículo del socio</th>
                <th>Mi artículo</th>
                <th>Estado</th>
                <th>Advertencias</th>
                {puedeGuardar && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {resultado.lineas.map((linea) => {
                const badge = ESTADO_BADGE[linea.estado]
                const sel = seleccion[linea.indice]
                const localActual = sel ?? (linea.local ? { itemCode: linea.local.itemCode, itemName: linea.local.itemName, uom: linea.local.uom } : undefined)
                const mostrarFactor = !!localActual?.uom && !!linea.origen.uom && localActual.uom !== linea.origen.uom
                return (
                  <tr key={linea.indice}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{linea.origen.itemName}</div>
                      <div className="td-muted" style={{ fontSize: 12 }}>
                        {linea.origen.itemCode}
                        {linea.origen.barcodes && linea.origen.barcodes.length > 0 && <> · {linea.origen.barcodes.join(', ')}</>}
                      </div>
                      <div className="td-muted" style={{ fontSize: 12 }}>
                        {formatNumber(linea.origen.cantidad)} {linea.origen.uom} · {formatDOP(linea.origen.precioUnitario)}
                      </div>
                    </td>
                    <td style={{ minWidth: 240 }}>
                      {linea.estado === 'ambigua' && !sel && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                          {linea.candidatos?.map((c) => (
                            <button
                              key={c.itemCode}
                              type="button"
                              className="btn btn-ghost btn-size-xs"
                              style={{ justifyContent: 'flex-start' }}
                              onClick={() => elegir(linea, { itemCode: c.itemCode, itemName: c.itemName })}
                            >
                              {c.itemName} <span className="td-muted">({c.itemCode})</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {linea.estado === 'sugerida' && !sel && linea.sugerencia && (
                        <div style={{ marginBottom: 8, fontSize: 13 }}>
                          Sugerido: <strong>{linea.sugerencia.itemName}</strong>{' '}
                          <span className="td-muted">({linea.sugerencia.itemCode})</span>
                        </div>
                      )}
                      {linea.estado === 'confirmada' && linea.local && (
                        <div style={{ fontSize: 13 }}>
                          <strong>{linea.local.itemName}</strong> <span className="td-muted">({linea.local.itemCode})</span>
                        </div>
                      )}
                      {linea.estado !== 'confirmada' && (
                        <ItemSelect
                          value={sel?.itemCode ?? ''}
                          selectedLabel={sel?.itemName}
                          onSelect={(item: Item) => elegir(linea, { itemCode: item.id, itemName: item.itemName, uom: item.stockUom })}
                          onClear={() => setSeleccion((s) => { const n = { ...s }; delete n[linea.indice]; return n })}
                          placeholder="Buscar otro artículo…"
                        />
                      )}
                      {mostrarFactor && (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span className="td-muted">Factor {linea.origen.uom} → {localActual?.uom}:</span>
                          <input
                            type="number"
                            className="input-sm"
                            style={{ width: 70 }}
                            step="0.0001"
                            min="0"
                            value={factorPorLinea[linea.indice] ?? ''}
                            onChange={(e) => setFactorPorLinea((f) => ({ ...f, [linea.indice]: e.target.value }))}
                            placeholder="1"
                          />
                        </div>
                      )}
                    </td>
                    <td><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    <td>
                      {linea.advertencias.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--warning-text, #92600a)', fontSize: 12 }}>
                          {linea.advertencias.map((a, i) => <li key={i}>{a}</li>)}
                        </ul>
                      )}
                    </td>
                    {puedeGuardar && (
                      <td>
                        {linea.estado !== 'confirmada' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button
                              type="button"
                              className="btn btn-navy btn-size-xs"
                              disabled={confirmando || (!sel && !linea.sugerencia)}
                              onClick={() => confirmarLinea(linea)}
                            >
                              Usar este
                            </button>
                            {puedeCrearArticulo && onCrearArticulo && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-size-xs"
                                disabled={creandoArticulo}
                                onClick={() => setCrearArticuloIndice(linea.indice)}
                              >
                                <Plus size={12} /> Crear artículo desde el socio
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {puedeGuardar && puedeSincronizarBarcodes && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={sincronizarBarcodes}
            onChange={(e) => setSincronizarBarcodes(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong>Sincronizar códigos de barra.</strong> Los códigos de barra del socio se agregarán a
            sus artículos, para reconocerlos automáticamente la próxima vez.
          </span>
        </label>
      )}

      {crearArticuloIndice !== null && onCrearArticulo && (
        <CrearArticuloModal
          indiceLinea={crearArticuloIndice}
          linea={resultado.lineas.find((l) => l.indice === crearArticuloIndice)!}
          onClose={() => setCrearArticuloIndice(null)}
          onCreate={(dto) => { onCrearArticulo(dto); setCrearArticuloIndice(null) }}
          loading={creandoArticulo}
        />
      )}
    </div>
  )
}

function CrearArticuloModal({
  indiceLinea, linea, onClose, onCreate, loading,
}: {
  indiceLinea: number
  linea: LineaMapeo
  onClose: () => void
  onCreate: (dto: CrearArticuloDesdeSocioDto) => void
  loading?: boolean
}) {
  const [itemGroup, setItemGroup] = useState('')
  const [isStockItem, setIsStockItem] = useState(true)
  const [itemCode, setItemCode] = useState('')
  const [crearPrecioCompra, setCrearPrecioCompra] = useState(false)

  const { data: categorias } = useQuery({
    queryKey: ['categorias-all-relaciones'],
    queryFn: () => listCategories({ limit: 100 }),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Crear artículo desde el socio"
      subtitle={`${linea.origen.itemName} (${linea.origen.itemCode})`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button
            className="btn btn-navy"
            disabled={loading || !itemGroup}
            onClick={() => onCreate({ indiceLinea, itemGroup, isStockItem, itemCode: itemCode || null, crearPrecioCompra })}
          >
            {loading ? <span className="spinner spinner-white spinner-sm" /> : <><Search size={14} />Crear</>}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="form-field">
          <label>Categoría</label>
          <select className="input" value={itemGroup} onChange={(e) => setItemGroup(e.target.value)}>
            <option value="">Seleccionar…</option>
            {categorias?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Código (opcional — se genera uno si se deja vacío)</label>
          <input className="input" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={isStockItem} onChange={(e) => setIsStockItem(e.target.checked)} />
          Es artículo de inventario (controla stock)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={crearPrecioCompra} onChange={(e) => setCrearPrecioCompra(e.target.checked)} />
          Crear precio de compra con el precio unitario del socio
        </label>
      </div>
    </Modal>
  )
}
