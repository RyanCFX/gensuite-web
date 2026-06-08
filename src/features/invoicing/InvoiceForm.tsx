import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createInvoice } from '@/shared/api/invoices'
import { listCustomers } from '@/shared/api/customers'
import { client } from '@/shared/api/client'
import type { CreateInvoiceDto, Customer, SemaforoEntry } from '@/shared/api/types'
import { ENDPOINTS } from '@/shared/api/endpoints'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { NCF_TYPES } from '@/lib/constants'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

type NcfType = 'B01' | 'B02' | 'B14' | 'B15' | 'B16'

interface LineItem {
  itemCode: string
  description: string
  qty: number
  rate: number
  amount: number
  uom: string
}

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultDueDate() {
  return format(addDays(new Date(), 30), 'yyyy-MM-dd')
}

const ITBIS_RATE = 0.18

function calcAmount(qty: number, rate: number) {
  return Math.round(qty * rate * 100) / 100
}

export default function InvoiceForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [postingDate, setPostingDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState(defaultDueDate())
  const [ncfType, setNcfType] = useState<NcfType>('B02')
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  const [semaforo, setSemaforo] = useState<SemaforoEntry | null>(null)
  const [loadingSemaforo, setLoadingSemaforo] = useState(false)

  const { data: customersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
    enabled: true,
  })

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  useEffect(() => {
    if (!selectedCustomer) {
      setSemaforo(null)
      return
    }
    setLoadingSemaforo(true)
    client
      .get<{ success: true; data: SemaforoEntry[] }>(ENDPOINTS.cobros.semaforo, {
        params: { customer: selectedCustomer.id },
      })
      .then((res) => {
        const entry = res.data.data.find((s) => s.customer === selectedCustomer.id) ?? null
        setSemaforo(entry)
      })
      .catch(() => setSemaforo(null))
      .finally(() => setLoadingSemaforo(false))
  }, [selectedCustomer])

  useEffect(() => {
    if (!selectedCustomer) return
    if (selectedCustomer.isGovernment) {
      setNcfType('B15')
    } else if (selectedCustomer.rnc) {
      setNcfType('B01')
    } else {
      setNcfType('B02')
    }
  }, [selectedCustomer])

  const createMutation = useMutation({
    mutationFn: (dto: CreateInvoiceDto) => createInvoice(dto),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Factura creada como borrador')
      navigate(`/facturacion/facturas/${invoice.id}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al crear la factura')
    },
  })

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, ...patch }
        if ('qty' in patch || 'rate' in patch) {
          updated.amount = calcAmount(updated.qty, updated.rate)
        }
        return updated
      })
    )
  }

  function addRow() {
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, amount: 0, uom: 'Unidad' }])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const itbis = Math.round(subtotal * ITBIS_RATE * 100) / 100
  const total = subtotal + itbis

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!customerId) {
      toast.error('Selecciona un cliente')
      return
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un artículo')
      return
    }
    if (ncfType === 'B01' && !selectedCustomer?.rnc) {
      toast.error('El cliente necesita RNC para comprobante B01 (Crédito Fiscal)')
      return
    }

    const dto: CreateInvoiceDto = {
      customer: customerId,
      postingDate,
      dueDate,
      ncfType,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        uom: i.uom,
      })),
      notes: notes || undefined,
    }

    createMutation.mutate(dto)
  }

  const semaforoStatusClass: Record<string, string> = {
    verde: 'semaforo-verde',
    amarillo: 'semaforo-amarillo',
    rojo: 'semaforo-rojo',
  }
  const semaforoLabel: Record<string, string> = {
    verde: 'Crédito OK',
    amarillo: 'Crédito en alerta',
    rojo: 'Límite excedido',
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/facturacion/facturas')}>
            <ArrowLeft size={14} /> Facturas
          </a>
          <h1 className="page-title">Nueva Factura</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Información General</h2>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                <label className="ff-label ff-required" htmlFor="customer">Cliente</label>
                <SearchSelect
                  id="customer"
                  value={customerId}
                  onChange={(id, _opt) => {
                    setCustomerId(id)
                    if (!id) {
                      setSelectedCustomer(null)
                      setSemaforo(null)
                    } else {
                      const match = customersData?.items.find((c) => c.id === id) ?? null
                      setSelectedCustomer(match)
                    }
                  }}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={loadingCustomers}
                  placeholder="Buscar cliente…"
                  error={!customerId}
                />
                {selectedCustomer && (
                  <div style={{ marginTop: 6 }}>
                    {loadingSemaforo ? (
                      <div className="skeleton-box" style={{ width: 120, height: 20 }} />
                    ) : semaforo ? (
                      <div className={`semaforo ${semaforoStatusClass[semaforo.status] ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span className="semaforo-dot" />
                        {semaforoLabel[semaforo.status] ?? semaforo.status}
                        {` — ${semaforo.usagePct.toFixed(0)}% del límite`}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="postingDate">Fecha</label>
                <input
                  id="postingDate"
                  type="date"
                  className="ff-input"
                  value={postingDate}
                  onChange={(e) => setPostingDate(e.target.value)}
                  required
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="dueDate">Fecha vencimiento</label>
                <input
                  id="dueDate"
                  type="date"
                  className="ff-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="ncfType">Tipo NCF</label>
                <select
                  id="ncfType"
                  className="ff-select"
                  value={ncfType}
                  onChange={(e) => setNcfType(e.target.value as NcfType)}
                >
                  {NCF_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {ncfType === 'B01' && !selectedCustomer?.rnc && (
                  <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                    B01 requiere RNC del cliente
                  </p>
                )}
              </div>
            </div>

            {semaforo?.status === 'rojo' && (
              <div className="inline-alert inline-alert-warn" style={{ marginTop: 12 }}>
                El cliente ha excedido su límite de crédito ({semaforo.usagePct.toFixed(1)}% utilizado).
                Considera revisar el saldo pendiente antes de emitir esta factura.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Artículos</h2>
          </div>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 56 }}>UDM</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                      No hay artículos. Agrega uno con el botón de abajo.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <input className="items-input" value={item.itemCode} onChange={(e) => updateItem(index, { itemCode: e.target.value })} placeholder="ITEM-001" />
                      </td>
                      <td>
                        <input className="items-input" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Descripción" />
                      </td>
                      <td>
                        <input className="items-input" type="number" min="0" step="1" value={item.qty} onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
                      </td>
                      <td>
                        <input className="items-input" type="number" min="0" step="0.01" value={item.rate} onChange={(e) => updateItem(index, { rate: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                      <td>
                        <input className="items-input" value={item.uom} onChange={(e) => updateItem(index, { uom: e.target.value })} placeholder="Unidad" />
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeRow(index)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}>
                <Plus size={14} /> Agregar artículo
              </button>
            </div>
            <div className="items-total-row">
              <div className="items-total-line">
                <span>Subtotal</span>
                <span>{formatDOP(subtotal)}</span>
              </div>
              <div className="items-total-line">
                <span>ITBIS (18%)</span>
                <span>{formatDOP(itbis)}</span>
              </div>
              <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                <span>Total</span>
                <span>{formatDOP(total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Notas</h2>
          </div>
          <div className="card-body">
            <textarea
              className="ff-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones, términos de pago, instrucciones especiales..."
              rows={3}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/facturacion/facturas')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={15} />}
            Guardar Borrador
          </button>
        </div>
      </form>
    </div>
  )
}
