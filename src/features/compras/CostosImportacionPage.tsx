import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import { listCostosImportacion, createCostoImportacion, listTiposDocumentoCostoImportacion } from '@/shared/api/costos-importacion'
import { listPurchaseReceipts } from '@/shared/api/purchase-receipt'
import { listCompras } from '@/shared/api/compras-gastos'
import type { CreateLandedCostVoucherDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'

const PAGE_SIZE = 20

const DISTRIBUTE_OPTIONS = ['Qty', 'Amount', 'Distribute Manually'] as const

type ReceiptDocumentType = 'Purchase Receipt' | 'Purchase Invoice' | 'Stock Entry' | 'Subcontracting Receipt'

interface FormValues {
  postingDate: string
  purchaseReceipts: { receiptDocumentType: ReceiptDocumentType; receiptDocument: string }[]
  taxes: { description: string; amount: number; expenseAccount: string }[]
  distributeChargesBasedOn: 'Qty' | 'Amount' | 'Distribute Manually'
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Solo documentos sometidos tienen sentido para prorratear costos de importación.
// Stock Entry se queda en texto libre: no hay endpoint de listado en este frontend.
function ReceiptDocumentCell({
  control, idx,
}: {
  control: ReturnType<typeof useForm<FormValues>>['control']
  idx: number
}) {
  const receiptDocumentType = useWatch({ control, name: `purchaseReceipts.${idx}.receiptDocumentType` })
  const [search, setSearch] = useState('')

  const { data: receiptsData, isLoading: receiptsLoading } = useQuery({
    queryKey: ['purchase-receipts-search', search],
    queryFn: () => listPurchaseReceipts({ search: search || undefined, status: 'submitted', limit: 15 }),
    enabled: receiptDocumentType === 'Purchase Receipt',
  })
  const receiptOptions: SearchSelectOption[] = (receiptsData?.items ?? []).map((r) => ({
    value: r.id,
    label: r.id,
    sublabel: r.supplierName,
  }))

  const { data: comprasData, isLoading: comprasLoading } = useQuery({
    queryKey: ['compras-search', search],
    queryFn: () => listCompras({ search: search || undefined, status: 'submitted', limit: 15 }),
    enabled: receiptDocumentType === 'Purchase Invoice',
  })
  const compraOptions: SearchSelectOption[] = (comprasData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.id,
    sublabel: c.supplierName,
  }))

  if (receiptDocumentType === 'Stock Entry' || receiptDocumentType === 'Subcontracting Receipt') {
    return (
      <Controller
        control={control}
        name={`purchaseReceipts.${idx}.receiptDocument` as const}
        rules={{ required: true }}
        render={({ field }) => (
          <input
            className="ff-input"
            placeholder={receiptDocumentType === 'Stock Entry' ? 'Ej. STE-2026-00001' : 'Ej. SCR-2026-00001'}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    )
  }

  const isReceipt = receiptDocumentType === 'Purchase Receipt'

  return (
    <Controller
      control={control}
      name={`purchaseReceipts.${idx}.receiptDocument` as const}
      rules={{ required: true }}
      render={({ field }) => (
        <SearchSelect
          value={field.value}
          onChange={(val) => field.onChange(val)}
          options={isReceipt ? receiptOptions : compraOptions}
          onSearch={setSearch}
          loading={isReceipt ? receiptsLoading : comprasLoading}
          selectedLabel={field.value}
          placeholder={isReceipt ? 'Buscar recepción sometida…' : 'Buscar factura sometida…'}
        />
      )}
    />
  )
}

function defaultValues(): FormValues {
  return {
    postingDate: todayISO(),
    purchaseReceipts: [{ receiptDocumentType: 'Purchase Receipt', receiptDocument: '' }],
    taxes: [{ description: '', amount: 0, expenseAccount: '' }],
    distributeChargesBasedOn: 'Amount',
  }
}

export default function CostosImportacionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)

  const offset = (page - 1) * PAGE_SIZE

  const { data: tiposDocumento } = useQuery({
    queryKey: ['costos-importacion-tipos-documento'],
    queryFn: listTiposDocumentoCostoImportacion,
    staleTime: 60 * 60_000,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['costos-importacion', { status, offset }],
    queryFn: () =>
      listCostosImportacion({
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  const filteredItems = (data?.items ?? []).filter((c) =>
    search ? c.id.toLowerCase().includes(search.toLowerCase()) : true,
  )

  const {
    control, register, handleSubmit, reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ defaultValues: defaultValues() })

  const receiptsArray = useFieldArray({ control, name: 'purchaseReceipts' })
  const taxesArray = useFieldArray({ control, name: 'taxes' })

  function closeCreate() {
    setShowCreate(false)
  }

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeCreate)

  const createMutation = useMutation({
    mutationFn: (dto: CreateLandedCostVoucherDto) => createCostoImportacion(dto),
    onSuccess: (created) => {
      toast.success('Costo de importación creado')
      queryClient.invalidateQueries({ queryKey: ['costos-importacion'] })
      setShowCreate(false)
      reset(defaultValues())
      // Navegar al detalle: el detalle recarga vía getCostoImportacion y muestra
      // los items ya prorrateados generados automáticamente por ERPNext.
      navigate(`/compras/costos-importacion/${created.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el costo de importación'),
  })

  function onSubmit(values: FormValues) {
    const dto: CreateLandedCostVoucherDto = {
      postingDate: values.postingDate,
      purchaseReceipts: values.purchaseReceipts
        .filter((r) => r.receiptDocument.trim())
        .map((r) => ({ receiptDocumentType: r.receiptDocumentType, receiptDocument: r.receiptDocument.trim() })),
      taxes: values.taxes
        .filter((t) => t.description.trim())
        .map((t) => ({
          description: t.description.trim(),
          amount: Number(t.amount) || 0,
          expenseAccount: t.expenseAccount || undefined,
        })),
      distributeChargesBasedOn: values.distributeChargesBasedOn,
    }
    createMutation.mutate(dto)
  }

  function openCreate() {
    reset(defaultValues())
    setShowCreate(true)
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Costos de Importación"
        description="Prorratea cargos e impuestos de importación sobre los artículos recibidos"
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nuevo Costo de Importación
          </button>
        }
      />

      <div>
        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input-wrap">
              <Search size={14} className="search-input-icon" />
              <input
                className="search-input"
                placeholder="Buscar por número…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <Select
              value={status}
              onValueChange={(val) => { setStatus(val); setPage(1) }}
            >
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="submitted">Sometido</SelectItem>
              <SelectItem value="cancelled">Anulado</SelectItem>
            </Select>
          </div>
        </div>

        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'right' }}>Total Impuestos/Cargos</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar los costos de importación
                          </td>
                        </tr>
                      )
                    : filteredItems.length === 0
                      ? (
                          <tr>
                            <td colSpan={5}>
                              <div className="empty-state">
                                <div className="empty-icon">
                                  <Plus size={20} />
                                </div>
                                <p className="empty-title">Sin costos de importación</p>
                                <p className="empty-sub">No hay costos de importación registrados.</p>
                                <button className="btn btn-primary btn-size-sm" onClick={openCreate}>
                                  <Plus size={14} />Nuevo Costo de Importación
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : filteredItems.map((c) => (
                          <tr key={c.id} className="table-row-clickable" onClick={() => navigate(`/compras/costos-importacion/${c.id}`)}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.id}</td>
                            <td>{formatDate(c.postingDate)}</td>
                            <td style={{ textAlign: 'right' }}>{c.totalTaxesAndCharges != null ? formatDOP(c.totalTaxesAndCharges) : '—'}</td>
                            <td><StatusBadge status={c.status} /></td>
                            <td>
                              <button
                                className="btn btn-ghost btn-size-xs"
                                onClick={(e) => { e.stopPropagation(); navigate(`/compras/costos-importacion/${c.id}`) }}
                              >
                                Ver
                              </button>
                            </td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>

          {data && data.meta.total > PAGE_SIZE && (
            <div className="pagination">
              <span className="pagination-info">
                Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
              </span>
              <div className="pagination-controls">
                <button
                  className="btn btn-ghost btn-size-icon-sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                  {page} / {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-size-icon-sm"
                  disabled={!data.meta.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nuevo Costo de Importación</h2>
              <button className="modal-close" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="ff-group">
                  <label className="ff-label">Fecha</label>
                  <Controller
                    name="postingDate"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <DatePicker value={field.value ?? ''} onChange={field.onChange} className="ff-input" />
                    )}
                  />
                  {errors.postingDate && <span className="ff-error">La fecha es requerida</span>}
                </div>

                {/* Purchase Receipts */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="card-title">Documentos de Recepción</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-size-xs"
                      onClick={() => receiptsArray.append({ receiptDocumentType: 'Purchase Receipt', receiptDocument: '' })}
                    >
                      <Plus size={12} />Agregar
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tipo de Documento</th>
                          <th>ID del Documento</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiptsArray.fields.map((field, idx) => (
                          <tr key={field.id}>
                            <td>
                              <Controller
                                control={control}
                                name={`purchaseReceipts.${idx}.receiptDocumentType` as const}
                                render={({ field: f }) => (
                                  <Select value={f.value} onValueChange={f.onChange}>
                                    {(tiposDocumento ?? []).map((t) => (
                                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                  </Select>
                                )}
                              />
                            </td>
                            <td>
                              <ReceiptDocumentCell control={control} idx={idx} />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost btn-size-icon-sm"
                                disabled={receiptsArray.fields.length === 1}
                                onClick={() => receiptsArray.remove(idx)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Taxes/Charges */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="card-title">Impuestos y Cargos</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-size-xs"
                      onClick={() => taxesArray.append({ description: '', amount: 0, expenseAccount: '' })}
                    >
                      <Plus size={12} />Agregar
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Descripción</th>
                          <th style={{ textAlign: 'right' }}>Monto</th>
                          <th>Cuenta de Gasto</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxesArray.fields.map((field, idx) => (
                          <tr key={field.id}>
                            <td>
                              <input
                                className="ff-input"
                                placeholder="Ej. Flete, Seguro, Aranceles"
                                {...register(`taxes.${idx}.description` as const, { required: true })}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                className="ff-input"
                                style={{ textAlign: 'right' }}
                                {...register(`taxes.${idx}.amount` as const, { valueAsNumber: true, required: true })}
                              />
                            </td>
                            <td>
                              <Controller
                                control={control}
                                name={`taxes.${idx}.expenseAccount` as const}
                                render={({ field: f }) => (
                                  <AccountSelect
                                    value={f.value ?? ''}
                                    onChange={f.onChange}
                                    rootType="Expense"
                                    placeholder="Cuenta de gasto (opcional)"
                                  />
                                )}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost btn-size-icon-sm"
                                disabled={taxesArray.fields.length === 1}
                                onClick={() => taxesArray.remove(idx)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="ff-group">
                  <label className="ff-label">Distribuir Cargos Según</label>
                  <Controller
                    control={control}
                    name="distributeChargesBasedOn"
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={f.onChange}>
                        {DISTRIBUTE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" disabled={createMutation.isPending} onClick={requestClose}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </div>
  )
}
