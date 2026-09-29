import { useState, useEffect, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listCreditNotes,
  createCreditNote,
  submitCreditNote,
  downloadCreditNotePdf,
} from '@/shared/api/notes'
import { listInvoices, getInvoice } from '@/shared/api/invoices'
import { getCatalogosFiscales } from '@/shared/api/config'
import { getEcfTipos } from '@/shared/api/ecf'
import { listCustomers, getCustomer } from '@/shared/api/customers'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { listSucursales } from '@/shared/api/sucursales'
import { listDepartamentos } from '@/shared/api/departamentos'
import type { Invoice, CreateCreditNoteDto, ApiError, CreditNoteAppliedTo, EcfModificationCode } from '@/shared/api/types'
import { ECF_MODIFICATION_CODES, ecfTipoElectronicoHabilitado } from '@/lib/dgii'
import { Select, SelectItem } from '@/components/ui/select'
import { Plus, Loader2, ArrowRightLeft, ChevronDown, ChevronRight, Download, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { ConfirmModal } from '@/shared/ui/Modal'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { esClienteEmisorNoEncontrado } from '@/lib/ecfErrors'
import { formatDate, formatMoney } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { ApplyCreditNoteModal } from './CreditNoteActionModals'

const LIST_COLUMNS = [
  { key: 'expand', width: 28 },
  { key: 'id', width: 100 },
  { key: 'ncf', width: 120 },
  { key: 'ncfAfectado', width: 120 },
  { key: 'facturaOriginal', width: 120 },
  { key: 'cliente', width: 180 },
  { key: 'fecha', width: 100 },
  { key: 'total', width: 120 },
  { key: 'estado', width: 110 },
  { key: 'reembolso', width: 200 },
  { key: 'actions', width: 60 },
]

const ITEMS_COLUMNS = [
  { key: 'codigo', width: 160 },
  { key: 'articulo', width: 220 },
  { key: 'cantidad', width: 96 },
  { key: 'precio', width: 120 },
  { key: 'importe', width: 120 },
  { key: 'actions', width: 40 },
]

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
  /** Heredada automáticamente de la factura original — no hay selector de moneda en este
   *  formulario (docs/tasks/64_multimoneda_completo.md §3.4). */
  currency?: string
  conversionRate?: number
}

interface NoteLineItem {
  itemCode: string
  description?: string
  qty: number
  rate: number
  uom?: string
  /** `name` (id de fila) de la línea "Sales Invoice Item" original — hoy `GET /invoices/:id` no lo
   *  expone (verificado contra el servicio real, ver invoices.service.ts::mapToResponse — mismo
   *  gap que Purchase Invoices), así que esto queda `undefined` en la práctica. Se deja cableado
   *  para que, el día que el backend lo agregue, `lineaOriginal` viaje solo sin tocar este
   *  formulario de nuevo (§7.5). */
  name?: string
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
  const { widths: listColWidths, startResize: listStartResize } = useResizableColumns(LIST_COLUMNS)
  const { widths: itemsColWidths, startResize: itemsStartResize } = useResizableColumns(ITEMS_COLUMNS)

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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })

  // B04 (Nota de Crédito) → typeId 34. Si el tenant lo tiene habilitado como e-CF, el código de
  // modificación DGII es obligatorio al crear la nota.
  const { data: ecfTipos } = useQuery({ queryKey: ['ecf-tipos'], queryFn: getEcfTipos, staleTime: 60 * 60_000 })
  const ncEsEcf = ecfTipoElectronicoHabilitado(ecfTipos, '34')

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
  const [modificationCode, setModificationCode] = useState<EcfModificationCode | ''>('')
  const [noteItems, setNoteItems] = useState<NoteLineItem[]>([])

  // ── Aplicar a factura / convertir a saldo a favor ─────────────────────────
  const [applyTarget, setApplyTarget] = useState<CreditNoteRow | null>(null)

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
      setNoteItems(selectedInvoiceDetail.items.map((i) => ({ itemCode: i.itemCode, description: i.description, qty: i.qty, rate: i.rate, uom: i.uom, name: i.id })))
      // La factura preseleccionada por ?originalInvoice= puede no estar en la lista de 20 —
      // completa la tarjeta de resumen desde el detalle.
      setSelectedInvoice((prev) => prev ?? selectedInvoiceDetail)
    }
  }, [selectedInvoiceDetail, selectedInvoiceId])

  // Atajo desde el detalle de una factura con e-CF aceptado ("Emitir Nota de Crédito").
  useEffect(() => {
    const preId = searchParams.get('originalInvoice')
    if (!preId) return
    setModalOpen(true)
    setSelectedInvoiceId(preId)
  }, [searchParams])

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-submitted', invoiceQuery],
    queryFn: () => listInvoices({ status: 'submitted', search: invoiceQuery || undefined, limit: 20, sinNotaCredito: true }),
    enabled: modalOpen,
  })

  const submittedInvoices = invoicesData?.items ?? []

  const invoiceOptions: SearchSelectOption[] = submittedInvoices.map((inv) => ({
    value: inv.id,
    label: inv.customerName ?? inv.id,
    sublabel: (inv.ncf ?? inv.id) + ' — ' + formatDate(inv.postingDate),
  }))
  const notes = (Array.isArray(notesData) ? notesData : []) as unknown as CreditNoteRow[]

  const activeMoreFiltersCount = [
    ncfType, createdAtFrom, createdAtTo, postingDateFrom, postingDateTo,
    grandTotalMin, grandTotalMax, refundedAmountMin, refundedAmountMax,
  ].filter((v) => v !== '').length

  function clearMoreFilters() {
    setNcfType('')
    setCreatedAtFrom('')
    setCreatedAtTo('')
    setPostingDateFrom('')
    setPostingDateTo('')
    setGrandTotalMin('')
    setGrandTotalMax('')
    setRefundedAmountMin('')
    setRefundedAmountMax('')
  }

  // Artículos de la factura original que aún no están en la nota (para poder re-agregarlos tras quitarlos)
  const availableToAdd = (selectedInvoiceDetail?.items ?? []).filter(
    (i) => !noteItems.some((n) => n.itemCode === i.itemCode),
  )

  // Cuántas líneas de la factura original comparten el mismo itemCode — si hay más de una, el
  // servidor exige `lineaOriginal` para desambiguar (§7.5); acá solo lo detectamos para avisar en
  // la UI, nunca para bloquear la selección (mismo criterio que Devoluciones de Compra).
  const invoiceItemCountByCode = new Map<string, number>()
  for (const i of selectedInvoiceDetail?.items ?? []) {
    invoiceItemCountByCode.set(i.itemCode, (invoiceItemCountByCode.get(i.itemCode) ?? 0) + 1)
  }
  const [addItemSearch, setAddItemSearch] = useState('')
  const addItemOptions: SearchSelectOption[] = availableToAdd
    .filter((i) => !addItemSearch || i.itemCode.toLowerCase().includes(addItemSearch.toLowerCase()) || i.description?.toLowerCase().includes(addItemSearch.toLowerCase()))
    .map((i) => ({ value: i.itemCode, label: i.itemCode, sublabel: i.description ?? undefined }))

  const downloadPdfMutation = useMutation({
    mutationFn: (id: string) => downloadCreditNotePdf(id, `nota-credito-${id}.pdf`),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const createMutation = useMutation({
    // Se combinan crear+someter en un solo mutationFn (en vez de llamar submitCreditNote() dentro
    // de onSuccess) porque un error lanzado en onSuccess de TanStack Query NO dispara onError —
    // quedaría como una promesa rechazada sin manejar y la nota creada-pero-no-sometida no
    // mostraría ningún error al usuario (bug encontrado durante las pruebas E2E de doc 72).
    mutationFn: async (dto: CreateCreditNoteDto) => {
      const note = (await createCreditNote(dto)) as unknown as CreditNoteRow
      await submitCreditNote(note.id)
      return note
    },
    onSuccess: () => {
      toast.success('Nota de crédito creada y sometida (NCF B04 asignado)')
      handleCloseModal()
    },
    onError: (err: ApiError) => {
      const msg = err?.message ?? 'Error al crear la nota de crédito'
      if (esClienteEmisorNoEncontrado(msg)) {
        toast.error(msg, {
          duration: 10000,
          action: { label: 'Ir a administración de e-CF', onClick: () => navigate('/config/ecf/admin') },
        })
        return
      }
      toast.error(msg)
    },
    onSettled: () => {
      // También cuando falla el submit: la nota ya quedó creada (en Borrador) y debe verse en la
      // lista aunque no se haya podido someter.
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
    },
  })

  function handleCloseModal() {
    setModalOpen(false)
    setSelectedInvoice(null)
    setSelectedInvoiceId('')
    setInvoiceQuery('')
    setReason('')
    setModificationCode('')
    setNoteItems([])
  }

  const crearIsDirty = useDirtyCheck({ selectedInvoiceId, reason, modificationCode, noteItems }, modalOpen)
  const crearClose = useConfirmClose(crearIsDirty, handleCloseModal)


  function openApplyModal(note: CreditNoteRow) {
    setApplyTarget(note)
  }

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
    if (ncEsEcf && !modificationCode) { toast.error('Selecciona el código de modificación DGII'); return }

    const dto: CreateCreditNoteDto = {
      originalInvoice: selectedInvoice.id,
      postingDate: new Date().toISOString().slice(0, 10),
      reason,
      items: noteItems.map((i) => ({
        itemCode: i.itemCode,
        qty: i.qty,
        rate: i.rate,
        // Siempre que tengamos el `name` de la línea original lo mandamos — es inofensivo incluso
        // cuando el itemCode no es ambiguo, y es obligatorio cuando sí lo es (§7.5).
        ...(i.name ? { lineaOriginal: i.name } : {}),
      })),
      modificationCode: modificationCode || undefined,
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Notas de Crédito</h1>
          <p className="page-sub">Gestiona devoluciones y ajustes (NCF B04)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
          <button className="btn btn-navy" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Nueva Nota de Crédito
          </button>
        </div>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Cliente" style={{ width: 260 }}>
                <SearchSelect
                  value={customerId}
                  selectedLabel={customerLabel}
                  onChange={(val, opt) => { setCustomerId(val); setCustomerLabel(opt?.label ?? '') }}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={customersLoading}
                  placeholder="Filtrar por cliente…"
                />
              </FilterField>
              <FilterField label="Sucursal" style={{ width: 200 }}>
                <SearchSelect
                  value={branch}
                  onChange={setBranch}
                  options={branchOptions}
                  onSearch={setBranchSearch}
                  selectedLabel={sucursales?.items.find((s) => s.id === branch)?.name ?? ''}
                  placeholder="Todas las sucursales"
                />
              </FilterField>
              <FilterField label="Departamento" style={{ width: 200 }}>
                <SearchSelect
                  value={department}
                  onChange={setDepartment}
                  options={departmentOptions}
                  onSearch={setDepartmentSearch}
                  selectedLabel={departamentos?.items.find((d) => d.id === department)?.name ?? ''}
                  placeholder="Todos los departamentos"
                />
              </FilterField>
              <FilterField label="NCF">
                <input
                  className="ff-input ff-input-sm"
                  style={{ width: 160 }}
                  placeholder="Buscar NCF…"
                  value={ncf}
                  onChange={(e) => setNcf(e.target.value)}
                />
              </FilterField>

              <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setMoreFiltersOpen(true)}>
                <SlidersHorizontal size={13} />
                Más filtros
                {activeMoreFiltersCount > 0 && (
                  <span className="badge badge-brand" style={{ marginLeft: 2 }}>{activeMoreFiltersCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
      <div className="table-scroll">
        <table className="data-table navy-table items-table-resizable">
          <colgroup>
            {LIST_COLUMNS.map((c) => <col key={c.key} style={{ width: listColWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <th />
              <SortableTh
                label="#"
                sortKey="id"
                orderBy={orderBy}
                onSort={sort}
                resizeHandle={<span className="col-resize-handle" onMouseDown={listStartResize('id')} />}
              />
              <th>
                NCF
                <span className="col-resize-handle" onMouseDown={listStartResize('ncf')} />
              </th>
              <th>
                NCF Afectado
                <span className="col-resize-handle" onMouseDown={listStartResize('ncfAfectado')} />
              </th>
              <th>
                Factura Original
                <span className="col-resize-handle" onMouseDown={listStartResize('facturaOriginal')} />
              </th>
              <SortableTh
                label="Cliente"
                sortKey="customerName"
                orderBy={orderBy}
                onSort={sort}
                resizeHandle={<span className="col-resize-handle" onMouseDown={listStartResize('cliente')} />}
              />
              <SortableTh
                label="Fecha"
                sortKey="postingDate"
                orderBy={orderBy}
                onSort={sort}
                resizeHandle={<span className="col-resize-handle" onMouseDown={listStartResize('fecha')} />}
              />
              <SortableTh
                label="Total"
                sortKey="grandTotal"
                orderBy={orderBy}
                onSort={sort}
                align="right"
                resizeHandle={<span className="col-resize-handle" onMouseDown={listStartResize('total')} />}
              />
              <SortableTh
                label="Estado"
                sortKey="status"
                orderBy={orderBy}
                onSort={sort}
                resizeHandle={<span className="col-resize-handle" onMouseDown={listStartResize('estado')} />}
              />
              <th>
                Reembolso
                <span className="col-resize-handle" onMouseDown={listStartResize('reembolso')} />
              </th>
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
                    <button className="btn btn-navy btn-size-sm" onClick={() => setModalOpen(true)}>
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
                <tr
                  onClick={() => navigate(`/notas-credito/${encodeURIComponent(note.id)}`)}
                  style={{ cursor: 'pointer' }}
                  title="Ver detalle"
                >
                  <td>
                    {hasAppliedTo && (
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        onClick={(e) => { e.stopPropagation(); setExpandedNoteId(isExpanded ? null : note.id) }}
                        title="Ver facturas aplicadas"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </td>
                  <td className="td-muted" style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{note.id}</td>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                    {note.ncf ?? <span className="td-dim">Pendiente</span>}
                  </td>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                    {note.ncfAfectado ?? <span className="td-dim">—</span>}
                  </td>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{note.returnAgainst}</td>
                  <td>{note.customerName ?? '—'}</td>
                  <td>{formatDate(note.postingDate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(Math.abs(note.grandTotal ?? 0), note.currency)}</td>
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
                          <span className="badge badge-success">Reembolsada: {formatMoney(note.refundedAmount ?? 0, note.currency)}</span>
                        )}
                        {canAct && (
                          <>
                            <button
                              className="btn btn-secondary btn-size-sm"
                              onClick={(e) => { e.stopPropagation(); openApplyModal(note) }}
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
                        onClick={(e) => { e.stopPropagation(); downloadPdfMutation.mutate(note.id) }}
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
                              style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={(e) => { e.stopPropagation(); navigate(`/facturas/${a.invoiceId}`) }}
                            >
                              {a.invoiceId}
                            </button>
                            <span>— {formatMoney(a.amount, note.currency)}</span>
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
      </div>

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de notas de crédito"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">Tipo NCF</label>
          <SearchSelect
            value={ncfType}
            onChange={setNcfType}
            options={ncfTypeOptions}
            onSearch={setNcfTypeSearch}
            selectedLabel={catalogos?.ncfTypes?.find((t) => t.value === ncfType)?.label ?? ''}
            placeholder="Todos los tipos NCF"
          />
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Fecha de creación</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={createdAtFrom} onChange={setCreatedAtFrom} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={createdAtTo} onChange={setCreatedAtTo} clearable />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Fecha de emisión</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={postingDateFrom} onChange={setPostingDateFrom} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={postingDateTo} onChange={setPostingDateTo} clearable />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Total</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Total mín."
              value={grandTotalMin}
              onChange={(e) => setGrandTotalMin(e.target.value)}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Total máx."
              value={grandTotalMax}
              onChange={(e) => setGrandTotalMax(e.target.value)}
            />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Monto reembolsado</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Reemb. mín."
              value={refundedAmountMin}
              onChange={(e) => setRefundedAmountMin(e.target.value)}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Reemb. máx."
              value={refundedAmountMax}
              onChange={(e) => setRefundedAmountMax(e.target.value)}
            />
          </div>
        </div>
      </Drawer>

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
                        {selectedInvoice.ncf ?? selectedInvoice.id} — {formatDate(selectedInvoice.postingDate)} — {formatMoney(selectedInvoice.grandTotal, selectedInvoice.currency)}
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

                {ncEsEcf && (
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">
                      Código de modificación (DGII)
                      <FieldTooltip>Requerido para notas de crédito electrónicas — declara ante la DGII qué corrige esta nota.</FieldTooltip>
                    </label>
                    <Select
                      value={modificationCode ? String(modificationCode) : ''}
                      onValueChange={(v) => setModificationCode(v ? (Number(v) as EcfModificationCode) : '')}
                      placeholder="Selecciona el código…"
                    >
                      {ECF_MODIFICATION_CODES.map((c) => (
                        <SelectItem key={c.code} value={String(c.code)}>{c.label}</SelectItem>
                      ))}
                    </Select>
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
                    <label className="ff-label" style={{ margin: 0 }}>Artículos a devolver</label>
                    {selectedInvoice && availableToAdd.length > 0 && (
                      <div style={{ width: 240, maxWidth: '100%' }}>
                        <SearchSelect
                          value=""
                          onChange={(val) => {
                            const item = selectedInvoiceDetail?.items.find((i) => i.itemCode === val)
                            if (item) setNoteItems((prev) => [...prev, { itemCode: item.itemCode, description: item.description, qty: item.qty, rate: item.rate, uom: item.uom, name: item.id }])
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
                      <table className="items-table items-table-resizable">
                        <colgroup>
                          {ITEMS_COLUMNS.map((c) => <col key={c.key} style={{ width: itemsColWidths[c.key] }} />)}
                        </colgroup>
                        <thead>
                          <tr>
                            <th>
                              Código
                              <span className="col-resize-handle" onMouseDown={itemsStartResize('codigo')} />
                            </th>
                            <th>
                              Artículo
                              <span className="col-resize-handle" onMouseDown={itemsStartResize('articulo')} />
                            </th>
                            <th style={{ textAlign: 'right' }}>
                              Cant.
                              <span className="col-resize-handle" onMouseDown={itemsStartResize('cantidad')} />
                            </th>
                            <th style={{ textAlign: 'right' }}>
                              Precio
                              <span className="col-resize-handle" onMouseDown={itemsStartResize('precio')} />
                            </th>
                            <th style={{ textAlign: 'right' }}>
                              Importe
                              <span className="col-resize-handle" onMouseDown={itemsStartResize('importe')} />
                            </th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {noteItems.map((item, index) => {
                            const ambiguous = (invoiceItemCountByCode.get(item.itemCode) ?? 0) > 1
                            return (
                            <tr key={index}>
                              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  {item.itemCode}
                                  {ambiguous && !item.name && (
                                    <span title="Este artículo aparece en más de una línea de la factura original — identifíquelo con cuidado antes de acreditarlo.">
                                      <AlertTriangle size={12} style={{ color: 'var(--warning-text)' }} />
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td>{item.description ?? <span className="td-muted">—</span>}</td>
                              <td>
                                <QtyInput
                                  className="items-input"
                                  value={item.qty}
                                  uom={item.uom}
                                  onChange={(v) => updateNoteItem(index, { qty: v })}
                                  style={{ textAlign: 'right' }}
                                />
                              </td>
                              <td style={{ textAlign: 'right' }}>{formatMoney(item.rate, selectedInvoice?.currency)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(item.qty * item.rate, selectedInvoice?.currency)}</td>
                              <td>
                                <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeNoteItem(index)}>✕</button>
                              </td>
                            </tr>
                          )})}
                        </tbody>
                      </table>
                      <div className="items-total-row">
                        <div className="items-total-line" style={{ fontWeight: 700 }}>
                          <span>Total crédito</span>
                          <span>{formatMoney(noteItems.reduce((s, i) => s + i.qty * i.rate, 0), selectedInvoice?.currency)}</span>
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


      {applyTarget && (
        <ApplyCreditNoteModal note={applyTarget} onClose={() => setApplyTarget(null)} />
      )}
    </div>
  )
}
