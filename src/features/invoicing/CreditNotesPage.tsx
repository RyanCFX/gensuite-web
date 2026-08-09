import { useState, useEffect, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listCreditNotes,
  createCreditNote,
  submitCreditNote,
  refundCreditNote,
  aplicarCreditNoteAFactura,
  removerCreditNoteAplicada,
  getCreditNoteSaldoFavor,
  downloadCreditNotePdf,
} from '@/shared/api/notes'
import { listInvoices, getInvoice } from '@/shared/api/invoices'
import { listMetodosPago, getCatalogosFiscales } from '@/shared/api/config'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
import { listCustomers, getCustomer } from '@/shared/api/customers'
import { listSucursales } from '@/shared/api/sucursales'
import { listDepartamentos } from '@/shared/api/departamentos'
import type { Invoice, CreateCreditNoteDto, ApiError, CreditNoteAppliedTo } from '@/shared/api/types'
import { Plus, Loader2, Wallet, ArrowRightLeft, ChevronDown, ChevronRight, Download } from 'lucide-react'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { formatDate, formatDOP } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'

interface NoteItem {
  itemCode: string
  qty: number
  rate: number
}

interface CreditNoteRow {
  id: string
  /** Factura contra la que se emitió esta nota — el campo real de la API es `returnAgainst`, no `originalInvoice` */
  returnAgainst: string
  invoiceName?: string
  customerName?: string
  postingDate?: string
  /** Solo viene presente tras someter la nota — en Draft llega vacío/undefined */
  ncf?: string
  /** NCF de la factura original corregida — distinto de `ncf`, que es el propio de la nota */
  ncfAfectado?: string | null
  /** Viene negativo desde la API (es una factura de signo invertido) — usar Math.abs() para mostrarlo/aplicarlo como monto */
  grandTotal?: number
  status: string
  reason?: string
  items: NoteItem[]
  /** true si ya fue reembolsada en efectivo/transferencia; false = sigue como saldo a favor pendiente */
  refunded?: boolean
  /** Los siguientes solo vienen presentes para notas ya Sometidas */
  refundedAmount?: number
  appliedAmount?: number
  availableAmount?: number
  appliedTo?: CreditNoteAppliedTo[]
}

interface NoteLineItem {
  itemCode: string
  qty: number
  rate: number
}

// El backend devuelve el status en minúscula. Una vez Sometida, `status` deja de ser "submitted"
// y pasa a ser el resumen de uso (available/partially_used/fully_used).
const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
  available: 'badge-success',
  partially_used: 'badge-warning',
  fully_used: 'badge-neutral',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
  available: 'Disponible',
  partially_used: 'Parcialmente usada',
  fully_used: 'Agotada',
}

export default function CreditNotesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const { orderBy, sort } = useSortState()

  // ── Filtro por cliente (preseleccionado si viene ?customer= desde Clientes) ──
  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '')
  const [customerLabel, setCustomerLabel] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [createdAtFrom, setCreatedAtFrom] = useState('')
  const [createdAtTo, setCreatedAtTo] = useState('')
  const [postingDateFrom, setPostingDateFrom] = useState('')
  const [postingDateTo, setPostingDateTo] = useState('')
  const [ncf, setNcf] = useState('')
  const [ncfType, setNcfType] = useState('')
  const [grandTotalMin, setGrandTotalMin] = useState('')
  const [grandTotalMax, setGrandTotalMax] = useState('')
  const [refundedAmountMin, setRefundedAmountMin] = useState('')
  const [refundedAmountMax, setRefundedAmountMax] = useState('')

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [ncfTypeSearch, setNcfTypeSearch] = useState('')
  const ncfTypeOptions: SearchSelectOption[] = (catalogos?.ncfTypes ?? [])
    .filter((t) => !ncfTypeSearch || t.label.toLowerCase().includes(ncfTypeSearch.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })

  const { data: departamentos } = useQuery({
    queryKey: ['departamentos-all'],
    queryFn: () => listDepartamentos({ limit: 100 }),
  })

  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = (sucursales?.items ?? [])
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.id, label: s.name }))

  const [departmentSearch, setDepartmentSearch] = useState('')
  const departmentOptions: SearchSelectOption[] = (departamentos?.items ?? [])
    .filter((d) => !departmentSearch || d.name.toLowerCase().includes(departmentSearch.toLowerCase()))
    .map((d) => ({ value: d.id, label: d.name }))

  const { data: preselectedCustomer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomer(customerId),
    enabled: !!customerId && !customerLabel,
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el label del cliente preseleccionado (?customer= en la URL)
    if (preselectedCustomer) setCustomerLabel(preselectedCustomer.customerName)
  }, [preselectedCustomer])

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [reason, setReason] = useState('')
  const [noteItems, setNoteItems] = useState<NoteLineItem[]>([])
  const [refundTarget, setRefundTarget] = useState<CreditNoteRow | null>(null)
  const [refundAmount, setRefundAmount] = useState(0)
  const [refundModeOfPayment, setRefundModeOfPayment] = useState('')
  const [refundBankAccount, setRefundBankAccount] = useState('')

  // ── Aplicar a factura / convertir a saldo a favor ─────────────────────────
  const [applyTarget, setApplyTarget] = useState<CreditNoteRow | null>(null)
  const [applyInvoiceId, setApplyInvoiceId] = useState('')
  const [applyInvoiceLabel, setApplyInvoiceLabel] = useState('')
  const [applyInvoiceQuery, setApplyInvoiceQuery] = useState('')
  const [applyAmount, setApplyAmount] = useState(0)

  const { data: notesData, isLoading } = useQuery({
    queryKey: [
      'credit-notes', orderBy, customerId, branch, department,
      createdAtFrom, createdAtTo, postingDateFrom, postingDateTo,
      ncf, ncfType, grandTotalMin, grandTotalMax, refundedAmountMin, refundedAmountMax,
    ],
    queryFn: () => listCreditNotes({
      orderBy: orderBy || undefined,
      customer: customerId || undefined,
      branch: branch || undefined,
      department: department || undefined,
      createdAtFrom: createdAtFrom || undefined,
      createdAtTo: createdAtTo || undefined,
      postingDateFrom: postingDateFrom || undefined,
      postingDateTo: postingDateTo || undefined,
      ncf: ncf || undefined,
      ncfType: ncfType || undefined,
      grandTotalMin: grandTotalMin ? Number(grandTotalMin) : undefined,
      grandTotalMax: grandTotalMax ? Number(grandTotalMax) : undefined,
      refundedAmountMin: refundedAmountMin ? Number(refundedAmountMin) : undefined,
      refundedAmountMax: refundedAmountMax ? Number(refundedAmountMax) : undefined,
    }),
  })

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    enabled: !!refundTarget,
    staleTime: 5 * 60_000,
  })
  const [refundModeOfPaymentSearch, setRefundModeOfPaymentSearch] = useState('')
  const refundModeOfPaymentOptions: SearchSelectOption[] = (metodos ?? [])
    .filter((m) => !m.disabled)
    .filter((m) => !refundModeOfPaymentSearch || m.name.toLowerCase().includes(refundModeOfPaymentSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))

  const refundMetodoSeleccionado = (metodos ?? []).find((m) => m.name === refundModeOfPayment)
  const refundRequiresBankAccount = refundMetodoSeleccionado?.requiresBankAccount && !refundMetodoSeleccionado.defaultBankAccount

  const { data: refundCuentasBancarias } = useQuery({
    queryKey: ['cuentas-bancarias-activas'],
    queryFn: () => listCuentasBancarias({ estado: 'Activa', limit: 100 }),
    enabled: !!refundRequiresBankAccount,
  })
  const [refundBankAccountSearch, setRefundBankAccountSearch] = useState('')
  const refundBankAccountOptions: SearchSelectOption[] = (refundCuentasBancarias?.items ?? [])
    .filter((c) => !refundBankAccountSearch || c.accountName.toLowerCase().includes(refundBankAccountSearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.accountName, sublabel: c.bank }))

  // El listado de facturas (GET /invoices) no incluye `items[]` — solo el detalle (GET /invoices/:id) lo tiene.
  // Se necesita el detalle completo para poder poblar/editar los artículos a devolver.
  const { data: selectedInvoiceDetail } = useQuery({
    queryKey: ['invoice', selectedInvoiceId],
    queryFn: () => getInvoice(selectedInvoiceId),
    enabled: !!selectedInvoiceId,
  })

  useEffect(() => {
    if (selectedInvoiceDetail && selectedInvoiceDetail.id === selectedInvoiceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- precarga los artículos al llegar el detalle de la factura seleccionada
      setNoteItems(selectedInvoiceDetail.items.map((i) => ({ itemCode: i.itemCode, qty: i.qty, rate: i.rate })))
    }
  }, [selectedInvoiceDetail, selectedInvoiceId])

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-submitted', invoiceQuery],
    queryFn: () => listInvoices({ status: 'submitted', search: invoiceQuery || undefined, limit: 20 }),
    enabled: modalOpen,
  })

  const submittedInvoices = invoicesData?.items ?? []

  const invoiceOptions: SearchSelectOption[] = submittedInvoices.map((inv) => ({
    value: inv.id,
    label: inv.customerName ?? inv.id,
    sublabel: (inv.ncf ?? inv.id) + ' — ' + formatDate(inv.postingDate),
  }))
  const notes = (Array.isArray(notesData) ? notesData : []) as unknown as CreditNoteRow[]

  // Artículos de la factura original que aún no están en la nota (para poder re-agregarlos tras quitarlos)
  const availableToAdd = (selectedInvoiceDetail?.items ?? []).filter(
    (i) => !noteItems.some((n) => n.itemCode === i.itemCode),
  )
  const [addItemSearch, setAddItemSearch] = useState('')
  const addItemOptions: SearchSelectOption[] = availableToAdd
    .filter((i) => !addItemSearch || i.itemCode.toLowerCase().includes(addItemSearch.toLowerCase()) || i.description?.toLowerCase().includes(addItemSearch.toLowerCase()))
    .map((i) => ({ value: i.itemCode, label: i.itemCode, sublabel: i.description ?? undefined }))

  const downloadPdfMutation = useMutation({
    mutationFn: (id: string) => downloadCreditNotePdf(id, `nota-credito-${id}.pdf`),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const createMutation = useMutation({
    mutationFn: (dto: CreateCreditNoteDto) => createCreditNote(dto) as unknown as Promise<CreditNoteRow>,
    onSuccess: async (note: CreditNoteRow) => {
      await submitCreditNote(note.id)
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      toast.success('Nota de crédito creada y sometida (NCF B04 asignado)')
      handleCloseModal()
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al crear la nota de crédito')
    },
  })

  function handleCloseModal() {
    setModalOpen(false)
    setSelectedInvoice(null)
    setSelectedInvoiceId('')
    setInvoiceQuery('')
    setReason('')
    setNoteItems([])
  }

  const crearIsDirty = useDirtyCheck({ selectedInvoiceId, reason, noteItems }, modalOpen)
  const crearClose = useConfirmClose(crearIsDirty, handleCloseModal)

  const refundMutation = useMutation({
    mutationFn: () => refundCreditNote(refundTarget!.id, {
      modeOfPayment: refundModeOfPayment,
      amount: refundAmount,
      bankAccount: refundBankAccount || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      toast.success('Nota de crédito reembolsada')
      closeRefundModal()
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al reembolsar la nota de crédito')
    },
  })

  function openRefundModal(note: CreditNoteRow) {
    setRefundTarget(note)
    setRefundAmount(Math.abs(note.grandTotal ?? 0))
    setRefundModeOfPayment('')
    setRefundBankAccount('')
  }

  // La nota de crédito no expone el `customer` directamente — lo obtenemos de su factura original.
  const { data: applyOriginalInvoice } = useQuery({
    queryKey: ['invoice', applyTarget?.returnAgainst],
    queryFn: () => getInvoice(applyTarget!.returnAgainst),
    enabled: !!applyTarget,
  })

  // Facturas destino válidas: en Draft (sin paymentStatus aún) o Sometidas con saldo pendiente
  // (unpaid/partial) — no tiene sentido ofrecer una factura ya paid como destino.
  const { data: applyInvoicesData, isLoading: applyInvoicesLoading } = useQuery({
    queryKey: ['invoices-for-credit-apply', applyOriginalInvoice?.customer, applyInvoiceQuery],
    queryFn: async () => {
      const customer = applyOriginalInvoice!.customer
      const search = applyInvoiceQuery || undefined
      const [draft, pending] = await Promise.all([
        listInvoices({ customer, search, status: 'draft', limit: 20 }),
        listInvoices({ customer, search, status: 'submitted', paymentStatus: ['unpaid', 'partly_paid'], limit: 20 }),
      ])
      const seen = new Set<string>()
      const items = [...draft.items, ...pending.items].filter((inv) => {
        if (seen.has(inv.id)) return false
        seen.add(inv.id)
        return true
      })
      return { items, meta: draft.meta }
    },
    enabled: !!applyTarget && !!applyOriginalInvoice?.customer,
  })

  const applyInvoiceOptions: SearchSelectOption[] = (applyInvoicesData?.items ?? []).map((inv) => ({
    value: inv.id,
    label: inv.ncf ?? inv.id,
    sublabel: `${formatDate(inv.postingDate)} — ${formatDOP(inv.grandTotal)} (${inv.status})`,
  }))

  // Para saber si applyTarget ya está aplicada a la factura seleccionada (evita el 409 del backend)
  const { data: applyCreditNoteSaldo } = useQuery({
    queryKey: ['credit-note-saldo-favor', applyOriginalInvoice?.customer],
    queryFn: () => getCreditNoteSaldoFavor(applyOriginalInvoice!.customer),
    enabled: !!applyTarget && !!applyOriginalInvoice?.customer,
  })

  const applyTargetEntry = applyCreditNoteSaldo?.entries.find((e) => e.creditNoteId === applyTarget?.id)
  const alreadyAppliedToSelected = applyInvoiceId
    ? applyTargetEntry?.appliedTo.find((a) => a.invoiceId === applyInvoiceId)
    : undefined
  const canUndoApply = alreadyAppliedToSelected?.status === 'pending'

  const applyMutation = useMutation({
    mutationFn: () => aplicarCreditNoteAFactura(applyTarget!.id, {
      invoiceId: applyInvoiceId,
      amount: applyAmount || undefined,
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', result.id] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Aplicado a la factura correctamente')
      navigate(`/facturas/${result.id}`)
      closeApplyModal()
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 400) {
        toast.error('Selecciona una factura destino para aplicar la nota de crédito')
        return
      }
      if (err?.statusCode === 409) {
        toast.error(err.message)
        queryClient.invalidateQueries({ queryKey: ['credit-note-saldo-favor', applyOriginalInvoice?.customer] })
        return
      }
      toast.error(err?.message ?? 'Error al aplicar la nota de crédito')
    },
  })

  const removeApplyMutation = useMutation({
    mutationFn: () => removerCreditNoteAplicada(applyTarget!.id, applyInvoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['credit-note-saldo-favor', applyOriginalInvoice?.customer] })
      queryClient.invalidateQueries({ queryKey: ['invoice', applyInvoiceId] })
      toast.success('Aplicación deshecha — ya puedes volver a aplicar con un nuevo monto')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al deshacer la aplicación — solo es posible mientras la factura siga en Borrador')
    },
  })

  function openApplyModal(note: CreditNoteRow) {
    setApplyTarget(note)
    setApplyInvoiceId('')
    setApplyInvoiceLabel('')
    setApplyInvoiceQuery('')
    setApplyAmount(Math.abs(note.grandTotal ?? 0))
  }

  function closeApplyModal() {
    setApplyTarget(null)
    setApplyInvoiceId('')
    setApplyInvoiceLabel('')
    setApplyInvoiceQuery('')
    setApplyAmount(0)
  }

  const applyAmountValid = applyAmount > 0
  const canConfirmApply = applyAmountValid && !!applyInvoiceId && !alreadyAppliedToSelected

  const aplicarIsDirty = useDirtyCheck({ applyInvoiceId, applyAmount }, !!applyTarget)
  const aplicarClose = useConfirmClose(aplicarIsDirty, closeApplyModal)

  function closeRefundModal() {
    setRefundTarget(null)
    setRefundAmount(0)
    setRefundModeOfPayment('')
    setRefundBankAccount('')
  }

  const refundAmountValid = refundAmount > 0 && refundAmount <= Math.abs(refundTarget?.grandTotal ?? 0)
  const canConfirmRefund = refundAmountValid && !!refundModeOfPayment && (!refundRequiresBankAccount || !!refundBankAccount)

  const reembolsoIsDirty = useDirtyCheck({ refundAmount, refundModeOfPayment, refundBankAccount }, !!refundTarget)
  const reembolsoClose = useConfirmClose(reembolsoIsDirty, closeRefundModal)

  function updateNoteItem(index: number, patch: Partial<NoteLineItem>) {
    setNoteItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeNoteItem(index: number) {
    setNoteItems((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedInvoice) { toast.error('Selecciona una factura'); return }
    if (!reason.trim()) { toast.error('Indica el motivo de la nota de crédito'); return }
    if (noteItems.length === 0) { toast.error('Agrega al menos un artículo'); return }

    const dto: CreateCreditNoteDto = {
      originalInvoice: selectedInvoice.id,
      postingDate: new Date().toISOString().slice(0, 10),
      reason,
      items: noteItems.map((i) => ({ itemCode: i.itemCode, qty: i.qty, rate: i.rate })),
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notas de Crédito</h1>
          <p className="page-sub">Gestiona devoluciones y ajustes (NCF B04)</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Nueva Nota de Crédito
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ width: 260 }}>
            <SearchSelect
              value={customerId}
              selectedLabel={customerLabel}
              onChange={(val, opt) => { setCustomerId(val); setCustomerLabel(opt?.label ?? '') }}
              options={customerOptions}
              onSearch={setCustomerQuery}
              loading={customersLoading}
              placeholder="Filtrar por cliente…"
            />
          </div>
          <div style={{ width: 200 }}>
            <SearchSelect
              value={branch}
              onChange={setBranch}
              options={branchOptions}
              onSearch={setBranchSearch}
              selectedLabel={sucursales?.items.find((s) => s.id === branch)?.name ?? ''}
              placeholder="Todas las sucursales"
            />
          </div>
          <div style={{ width: 200 }}>
            <SearchSelect
              value={department}
              onChange={setDepartment}
              options={departmentOptions}
              onSearch={setDepartmentSearch}
              selectedLabel={departamentos?.items.find((d) => d.id === department)?.name ?? ''}
              placeholder="Todos los departamentos"
            />
          </div>
        </div>
        <div className="filter-bar-left" style={{ marginTop: 8 }}>
          <input
            className="ff-input ff-input-sm"
            style={{ width: 160 }}
            placeholder="Buscar NCF…"
            value={ncf}
            onChange={(e) => setNcf(e.target.value)}
          />
          <div style={{ width: 200 }}>
            <SearchSelect
              value={ncfType}
              onChange={setNcfType}
              options={ncfTypeOptions}
              onSearch={setNcfTypeSearch}
              selectedLabel={catalogos?.ncfTypes?.find((t) => t.value === ncfType)?.label ?? ''}
              placeholder="Todos los tipos NCF"
            />
          </div>
          <DatePicker
            className="ff-input ff-input-sm"
            value={createdAtFrom}
            onChange={setCreatedAtFrom}
            style={{ width: 144 }}
            clearable
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <DatePicker
            className="ff-input ff-input-sm"
            value={createdAtTo}
            onChange={setCreatedAtTo}
            style={{ width: 144 }}
            clearable
          />
          <DatePicker
            className="ff-input ff-input-sm"
            value={postingDateFrom}
            onChange={setPostingDateFrom}
            style={{ width: 144 }}
            clearable
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <DatePicker
            className="ff-input ff-input-sm"
            value={postingDateTo}
            onChange={setPostingDateTo}
            style={{ width: 144 }}
            clearable
          />
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Total mín."
            value={grandTotalMin}
            onChange={(e) => setGrandTotalMin(e.target.value)}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Total máx."
            value={grandTotalMax}
            onChange={(e) => setGrandTotalMax(e.target.value)}
          />
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Reemb. mín."
            value={refundedAmountMin}
            onChange={(e) => setRefundedAmountMin(e.target.value)}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Reemb. máx."
            value={refundedAmountMax}
            onChange={(e) => setRefundedAmountMax(e.target.value)}
          />
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={sort} />
              <th>NCF</th>
              <th>NCF Afectado</th>
              <th>Factura Original</th>
              <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Total" sortKey="grandTotal" orderBy={orderBy} onSort={sort} align="right" />
              <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              <th>Reembolso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 11 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : notes.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <div className="empty-state">
                    <div className="empty-title">Sin notas de crédito</div>
                    <p className="empty-sub">Crea una nota de crédito para procesar una devolución.</p>
                    <button className="btn btn-primary btn-size-sm" onClick={() => setModalOpen(true)}>
                      <Plus size={14} /> Nueva Nota de Crédito
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              notes.map((note) => {
                const statusLower = (note.status ?? '').toLowerCase()
                // Estos campos solo vienen presentes una vez Sometida la nota.
                const isSubmittedWithUsageInfo = note.availableAmount !== undefined
                const hasAppliedTo = (note.appliedTo?.length ?? 0) > 0
                const isExpanded = expandedNoteId === note.id
                const canAct = isSubmittedWithUsageInfo && (note.availableAmount ?? 0) > 0
                return (
                <Fragment key={note.id}>
                <tr>
                  <td>
                    {hasAppliedTo && (
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                        title="Ver facturas aplicadas"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </td>
                  <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{note.id}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {note.ncf ?? <span className="td-dim">Pendiente</span>}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {note.ncfAfectado ?? <span className="td-dim">—</span>}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{note.returnAgainst}</td>
                  <td>{note.customerName ?? '—'}</td>
                  <td>{formatDate(note.postingDate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(Math.abs(note.grandTotal ?? 0))}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[statusLower] ?? 'badge-neutral'}`}>
                      {STATUS_LABEL[statusLower] ?? note.status}
                    </span>
                  </td>
                  <td>
                    {!isSubmittedWithUsageInfo ? (
                      <span className="td-dim">—</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {note.refunded && (
                          <span className="badge badge-success">Reembolsada: {formatDOP(note.refundedAmount ?? 0)}</span>
                        )}
                        {canAct && (
                          <>
                            <button
                              className="btn btn-ghost btn-size-sm"
                              onClick={() => openRefundModal(note)}
                            >
                              <Wallet size={13} /> Reembolsar
                            </button>
                            <button
                              className="btn btn-ghost btn-size-sm"
                              onClick={() => openApplyModal(note)}
                            >
                              <ArrowRightLeft size={13} /> Aplicar a factura
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {statusLower !== 'draft' && statusLower !== 'cancelled' && (
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        title="Descargar PDF"
                        onClick={() => downloadPdfMutation.mutate(note.id)}
                        disabled={downloadPdfMutation.isPending && downloadPdfMutation.variables === note.id}
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </td>
                </tr>
                {isExpanded && hasAppliedTo && (
                  <tr>
                    <td />
                    <td colSpan={7} style={{ padding: '0 0 12px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {note.appliedTo!.map((a) => (
                          <div key={a.invoiceId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <button
                              style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => navigate(`/facturas/${a.invoiceId}`)}
                            >
                              {a.invoiceId}
                            </button>
                            <span>— {formatDOP(a.amount)}</span>
                            <span className={`badge ${a.status === 'reconciled' ? 'badge-success' : 'badge-warning'}`}>
                              {a.status === 'reconciled' ? 'Reconciliada' : 'Pendiente'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={crearClose.requestClose}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-head">
              <h2 className="modal-title">Nueva Nota de Crédito</h2>
              <button className="modal-close" type="button" onClick={crearClose.requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label">Factura original (sometida)</label>
                  <SearchSelect
                    id="invoice"
                    value={selectedInvoiceId}
                    onChange={(id) => {
                      setSelectedInvoiceId(id)
                      setNoteItems([])
                      setSelectedInvoice(id ? (submittedInvoices.find((i) => i.id === id) ?? null) : null)
                    }}
                    options={invoiceOptions}
                    onSearch={setInvoiceQuery}
                    loading={invoicesLoading}
                    placeholder="Buscar factura por cliente…"
                    error={!selectedInvoiceId}
                  />
                  {selectedInvoice && (
                    <div style={{ marginTop: 4, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-sunken)', fontSize: 13 }}>
                      <span style={{ fontWeight: 500 }}>{selectedInvoice.customerName}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginLeft: 8 }}>
                        {selectedInvoice.ncf ?? selectedInvoice.id} — {formatDate(selectedInvoice.postingDate)} — {formatDOP(selectedInvoice.grandTotal)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="reason">Motivo</label>
                  <input
                    id="reason"
                    className="ff-input"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ej: Devolución por producto defectuoso"
                    required
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="ff-label" style={{ margin: 0 }}>Artículos a devolver</label>
                    {selectedInvoice && availableToAdd.length > 0 && (
                      <div style={{ width: 240 }}>
                        <SearchSelect
                          value=""
                          onChange={(val) => {
                            const item = selectedInvoiceDetail?.items.find((i) => i.itemCode === val)
                            if (item) setNoteItems((prev) => [...prev, { itemCode: item.itemCode, qty: item.qty, rate: item.rate }])
                          }}
                          options={addItemOptions}
                          onSearch={setAddItemSearch}
                          selectedLabel=""
                          placeholder="+ Agregar artículo…"
                        />
                      </div>
                    )}
                  </div>
                  {noteItems.length === 0 ? (
                    <p className="ff-hint">
                      {!selectedInvoice
                        ? 'Selecciona primero la factura original para poder elegir sus artículos.'
                        : selectedInvoiceDetail?.id !== selectedInvoiceId
                          ? 'Cargando artículos de la factura…'
                          : 'Agrega al menos un artículo de la factura usando el selector de arriba.'}
                    </p>
                  ) : (
                    <div className="items-table-wrap" style={{ marginTop: 4 }}>
                      <table className="items-table">
                        <thead>
                          <tr>
                            <th>Código</th>
                            <th style={{ textAlign: 'right', width: 96 }}>Cant.</th>
                            <th style={{ textAlign: 'right', width: 120 }}>Precio</th>
                            <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                            <th style={{ width: 40 }} />
                          </tr>
                        </thead>
                        <tbody>
                          {noteItems.map((item, index) => (
                            <tr key={index}>
                              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode}</td>
                              <td>
                                <input
                                  className="items-input"
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={item.qty}
                                  onChange={(e) => updateNoteItem(index, { qty: parseFloat(e.target.value) || 0 })}
                                  style={{ textAlign: 'right' }}
                                />
                              </td>
                              <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.qty * item.rate)}</td>
                              <td>
                                <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeNoteItem(index)}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="items-total-row">
                        <div className="items-total-line" style={{ fontWeight: 700 }}>
                          <span>Total crédito</span>
                          <span>{formatDOP(noteItems.reduce((s, i) => s + i.qty * i.rate, 0))}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={crearClose.requestClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                  Crear y Someter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={crearClose.confirming}
        onClose={crearClose.cancelDiscard}
        onConfirm={crearClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {refundTarget && (
        <div className="modal-overlay" onClick={reembolsoClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Wallet size={16} /> Reembolsar nota de crédito
              </h2>
              <button className="modal-close" onClick={reembolsoClose.requestClose}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {refundTarget.id} — Total disponible: {formatDOP(Math.abs(refundTarget.grandTotal ?? 0))}
              </p>
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="refundAmount">Monto a reembolsar</label>
                <input
                  id="refundAmount"
                  className={`ff-input${!refundAmountValid ? ' items-input-error' : ''}`}
                  type="number"
                  min="0.01"
                  max={Math.abs(refundTarget.grandTotal ?? 0)}
                  step="0.01"
                  value={refundAmount || ''}
                  onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                />
                {!refundAmountValid && (
                  <p className="ff-hint" style={{ color: 'red' }}>El monto debe ser mayor a 0 y no exceder {formatDOP(Math.abs(refundTarget.grandTotal ?? 0))}</p>
                )}
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="refundModeOfPayment">Método de pago</label>
                <SearchSelect
                  id="refundModeOfPayment"
                  value={refundModeOfPayment}
                  onChange={(val) => { setRefundModeOfPayment(val); setRefundBankAccount('') }}
                  options={refundModeOfPaymentOptions}
                  onSearch={setRefundModeOfPaymentSearch}
                  selectedLabel={refundModeOfPayment}
                  placeholder="Seleccionar…"
                />
              </div>

              {refundMetodoSeleccionado?.requiresBankAccount && (
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="refundBankAccount">
                    Cuenta Bancaria {refundRequiresBankAccount && <span className="ff-required">*</span>}
                  </label>
                  <SearchSelect
                    id="refundBankAccount"
                    value={refundBankAccount}
                    onChange={setRefundBankAccount}
                    options={refundBankAccountOptions}
                    onSearch={setRefundBankAccountSearch}
                    selectedLabel={refundCuentasBancarias?.items.find((c) => c.id === refundBankAccount)?.accountName ?? ''}
                    placeholder={refundMetodoSeleccionado.defaultBankAccount ? 'Usar cuenta por defecto…' : 'Seleccionar cuenta bancaria…'}
                    error={!!refundRequiresBankAccount && !refundBankAccount}
                  />
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={reembolsoClose.requestClose}>Volver</button>
              <button
                className="btn btn-primary"
                onClick={() => refundMutation.mutate()}
                disabled={!canConfirmRefund || refundMutation.isPending}
              >
                {refundMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                <Wallet size={14} /> Confirmar reembolso
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={reembolsoClose.confirming}
        onClose={reembolsoClose.cancelDiscard}
        onConfirm={reembolsoClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {applyTarget && (
        <div className="modal-overlay" onClick={aplicarClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowRightLeft size={16} /> Aplicar nota de crédito
              </h2>
              <button className="modal-close" onClick={aplicarClose.requestClose}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {applyTarget.id} — Total de la nota: {formatDOP(Math.abs(applyTarget.grandTotal ?? 0))}
              </p>

              <div className="ff-wrap">
                <label className="ff-label ff-required">Factura destino</label>
                <SearchSelect
                  value={applyInvoiceId}
                  selectedLabel={applyInvoiceLabel}
                  onChange={(val, opt) => {
                    setApplyInvoiceId(val)
                    setApplyInvoiceLabel(opt?.label ?? '')
                  }}
                  options={applyInvoiceOptions}
                  onSearch={setApplyInvoiceQuery}
                  loading={applyInvoicesLoading}
                  placeholder="Buscar factura del cliente…"
                  error={!applyInvoiceId}
                />
                <p className="ff-hint">
                  Se aplicará directamente a la factura seleccionada.
                </p>
                {!applyInvoiceId && (
                  <p className="ff-hint" style={{ color: 'red' }}>Selecciona una factura destino</p>
                )}
              </div>

              {alreadyAppliedToSelected ? (
                <div className="inline-alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wallet size={16} />
                  <span>
                    Esta nota ya está aplicada a esta factura por {formatDOP(alreadyAppliedToSelected.amount)}
                    {' '}
                    <span className={`badge ${alreadyAppliedToSelected.status === 'reconciled' ? 'badge-success' : 'badge-warning'}`}>
                      {alreadyAppliedToSelected.status === 'reconciled' ? 'Reconciliada' : 'Pendiente'}
                    </span>
                    {alreadyAppliedToSelected.status === 'pending'
                      ? '. Para cambiar el monto, deshaz la aplicación y vuelve a aplicarla.'
                      : '. Ya fue reconciliada contra la factura sometida — no se puede deshacer.'}
                  </span>
                </div>
              ) : (
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="applyAmount">Monto a aplicar</label>
                  <input
                    id="applyAmount"
                    className={`ff-input${!applyAmountValid ? ' items-input-error' : ''}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={applyAmount || ''}
                    onChange={(e) => setApplyAmount(parseFloat(e.target.value) || 0)}
                  />
                  <p className="ff-hint">
                    Prellenado con el total de la nota — si excede el saldo restante realmente disponible (ya sea porque hay reembolsos o conversiones previas), el sistema te lo indicará.
                  </p>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={aplicarClose.requestClose}>Cancelar</button>
              {alreadyAppliedToSelected ? (
                <button
                  className="btn btn-danger"
                  onClick={() => removeApplyMutation.mutate()}
                  disabled={!canUndoApply || removeApplyMutation.isPending}
                  title={canUndoApply ? undefined : 'Ya reconciliada — no se puede deshacer'}
                >
                  {removeApplyMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                  Deshacer aplicación
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => applyMutation.mutate()}
                  disabled={!canConfirmApply || applyMutation.isPending}
                >
                  {applyMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                  Aplicar a factura
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={aplicarClose.confirming}
        onClose={aplicarClose.cancelDiscard}
        onConfirm={aplicarClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </div>
  )
}
