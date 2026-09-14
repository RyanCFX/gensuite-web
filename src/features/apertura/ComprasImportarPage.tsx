// Carga masiva (lote) de saldos de apertura de compra — espejo exacto de VentasImportarPage (§9.2).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { importarAperturaCompras } from '@/shared/api/apertura'
import { listSuppliers } from '@/shared/api/suppliers'
import type { ImportarAperturaComprasResultadoFila } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { formatMoney } from '@/lib/formatters'
import { today, usePreflightGate } from './lib'

const MAX_FILAS = 200

interface Row {
  key: number
  supplierId: string
  supplierLabel: string
  numeroFacturaProveedor: string
  fechaFactura: string
  montoPendiente: string
  ncfProveedor: string
  reportarEnDgii: boolean
  resultado?: ImportarAperturaComprasResultadoFila
}

let keySeq = 0
function emptyRow(): Row {
  return { key: keySeq++, supplierId: '', supplierLabel: '', numeroFacturaProveedor: '', fechaFactura: today(), montoPendiente: '', ncfProveedor: '', reportarEnDgii: false }
}

export default function ComprasImportarPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { listo } = usePreflightGate()
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()])
  const [supplierQuery, setSupplierQuery] = useState('')
  const [summary, setSummary] = useState<{ total: number; creadas: number; fallidas: number; montoTotalMigrado: number } | null>(null)

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['aperturaSupplierSearch', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
  })
  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({ value: s.id, label: s.supplierName }))

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, resultado: undefined } : r)))
  }

  const importMutation = useMutation({
    mutationFn: (filas: Row[]) => importarAperturaCompras({
      filas: filas.map((r) => ({
        supplier: r.supplierId,
        numeroFacturaProveedor: r.numeroFacturaProveedor.trim(),
        fechaFactura: r.fechaFactura,
        montoPendiente: Number(r.montoPendiente),
        ncfProveedor: r.ncfProveedor || undefined,
        reportarEnDgii: r.reportarEnDgii,
      })),
    }),
    onSuccess: (res, filas) => {
      setSummary({ total: res.total, creadas: res.creadas, fallidas: res.fallidas, montoTotalMigrado: res.montoTotalMigrado })
      setRows((prev) => {
        const submittedKeys = filas.map((f) => f.key)
        const resultByIndex = new Map(res.resultados.map((r) => [r.fila - 1, r]))
        return prev.map((row) => {
          const idx = submittedKeys.indexOf(row.key)
          if (idx === -1) return row
          return { ...row, resultado: resultByIndex.get(idx) }
        })
      })
      queryClient.invalidateQueries({ queryKey: ['apertura-compras'] })
      if (res.fallidas === 0) toast.success(`${res.creadas} facturas cargadas — ${formatMoney(res.montoTotalMigrado)} migrados`)
      else toast.error(`${res.creadas} de ${res.total} cargadas — revisa las filas marcadas en rojo`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al procesar el lote'),
  })

  function handleSubmitAll() {
    const filas = rows.filter((r) => !r.resultado?.ok && (r.supplierId || r.numeroFacturaProveedor || r.montoPendiente))
    if (filas.length === 0) { toast.error('Agrega al menos una fila'); return }
    if (filas.length > MAX_FILAS) { toast.error(`Máximo ${MAX_FILAS} filas por lote — dividí en varios envíos`); return }
    const invalid = filas.find((r) => !r.supplierId || !r.numeroFacturaProveedor.trim() || !r.fechaFactura || !r.montoPendiente || Number(r.montoPendiente) <= 0)
    if (invalid) { toast.error('Completa proveedor, N° de factura, fecha y monto pendiente (> 0) en todas las filas'); return }
    importMutation.mutate(filas)
  }

  function handleRetryFailed() {
    const fallidas = rows.filter((r) => r.resultado && !r.resultado.ok)
    if (fallidas.length === 0) return
    importMutation.mutate(fallidas)
  }

  const puedeReintentar = rows.some((r) => r.resultado && !r.resultado.ok)
  const creadasKeys = new Set(rows.filter((r) => r.resultado?.ok).map((r) => r.key))

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/apertura/compras')}><ArrowLeft size={14} /> Compras — Apertura</a>

      <PageHeader
        title="Carga masiva de compras"
        description="Hasta 200 filas por envío. Para campos avanzados (moneda, sucursal, tipo de comprobante, descripción) usa el formulario individual."
      />

      {!listo && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          Tu empresa todavía no está lista para migrar saldos — revisa el Diagnóstico antes de continuar.
        </div>
      )}

      {summary && (
        <div className={`inline-alert ${summary.fallidas === 0 ? 'inline-alert-success' : 'inline-alert-error'}`} style={{ marginBottom: 16 }}>
          {summary.creadas} de {summary.total} cargadas — {formatMoney(summary.montoTotalMigrado)} migrados
          {summary.fallidas > 0 ? ` — ${summary.fallidas} fallidas (revisa las filas en rojo)` : ''}
        </div>
      )}

      <div className="card navy-table-card" style={{ marginBottom: 16 }}>
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Proveedor</th>
                <th style={{ minWidth: 160 }}>N° Factura</th>
                <th style={{ minWidth: 140 }}>Fecha</th>
                <th style={{ minWidth: 140 }}>Monto pendiente</th>
                <th style={{ minWidth: 160 }}>NCF proveedor</th>
                <th style={{ width: 90 }}>Reportar DGII</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ok = row.resultado?.ok
                const isFailed = row.resultado && !row.resultado.ok
                return (
                  <tr key={row.key} style={isFailed ? { background: 'var(--danger-surface, rgba(220,38,38,0.06))' } : ok ? { opacity: 0.6 } : undefined}>
                    <td>
                      <SearchSelect
                        value={row.supplierId}
                        selectedLabel={row.supplierLabel}
                        onChange={(id, opt) => updateRow(row.key, { supplierId: id, supplierLabel: opt?.label ?? '' })}
                        options={supplierOptions}
                        onSearch={setSupplierQuery}
                        loading={suppliersLoading}
                        placeholder="Proveedor…"
                        disabled={ok}
                      />
                    </td>
                    <td><input className="items-input" value={row.numeroFacturaProveedor} disabled={ok} onChange={(e) => updateRow(row.key, { numeroFacturaProveedor: e.target.value })} /></td>
                    <td><DatePicker className="items-input" value={row.fechaFactura} onChange={(v) => updateRow(row.key, { fechaFactura: v })} max={today()} disabled={ok} /></td>
                    <td><input className="items-input" type="number" min="0.01" step="0.01" value={row.montoPendiente} disabled={ok} onChange={(e) => updateRow(row.key, { montoPendiente: e.target.value })} /></td>
                    <td><input className="items-input" value={row.ncfProveedor} disabled={ok} onChange={(e) => updateRow(row.key, { ncfProveedor: e.target.value })} placeholder="Opcional" /></td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" disabled={!row.ncfProveedor || ok} checked={row.reportarEnDgii} onChange={(e) => updateRow(row.key, { reportarEnDgii: e.target.checked })} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!ok && (
                        <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 12 }}>
          <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setRows((prev) => [...prev, emptyRow()])} disabled={rows.length >= MAX_FILAS}>
            <Plus size={14} /> Agregar fila
          </button>
        </div>
      </div>

      {rows.some((r) => r.resultado) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Resultado por fila</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.filter((r) => r.resultado).map((r) => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                {r.resultado!.ok
                  ? <CheckCircle2 size={14} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
                  : <XCircle size={14} style={{ color: 'var(--danger-text, #b91c1c)', flexShrink: 0 }} />}
                <strong>{r.numeroFacturaProveedor}</strong>
                {r.resultado!.ok ? <span>— {r.resultado!.id}</span> : <span style={{ color: 'var(--danger-text, #b91c1c)' }}>— {r.resultado!.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="doc-actions-bar">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/apertura/compras')}>Cancelar</button>
        {puedeReintentar && (
          <button type="button" className="btn btn-secondary" onClick={handleRetryFailed} disabled={importMutation.isPending}>
            Reintentar solo las fallidas
          </button>
        )}
        <button type="button" className="btn btn-navy" onClick={handleSubmitAll} disabled={importMutation.isPending || creadasKeys.size === rows.length}>
          {importMutation.isPending ? 'Procesando…' : 'Cargar lote'}
        </button>
      </div>
    </div>
  )
}
