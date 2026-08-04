import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createPago, getPagosPendientes } from '@/shared/api/pagos'
import { listSuppliers } from '@/shared/api/suppliers'
import { listMetodosPago } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { CheckCircle2, AlertTriangle, Wallet } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { formatDOP } from '@/lib/formatters'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import { getUser } from '@/shared/api/storage'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'

const SYSTEM_MANAGER_ROLE = 'System Manager'

interface ReferenciaRow {
  invoiceId: string
  grandTotal: number
  outstandingAmount: number
  postingDate: string
  checked: boolean
  allocatedAmount: number
}

export default function RegistrarPagoPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectSupplier = searchParams.get('supplier') ?? ''
  const preselectInvoice = searchParams.get('invoice') ?? ''

  const [supplierId, setSupplierId] = useState(preselectSupplier)
  const [supplierLabel, setSupplierLabel] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [referenceDate, setReferenceDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10))
  const [referencias, setReferencias] = useState<ReferenciaRow[]>([])
  const [advancePayment, setAdvancePayment] = useState(false)
  const [branch, setBranch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [department, setDepartment] = useState('')

  const currentUserEmail = getUser()?.email
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser', currentUserEmail],
    queryFn: () => getUsuario(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 5 * 60_000,
  })

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const isSystemManager = currentUser?.roles?.includes(SYSTEM_MANAGER_ROLE) ?? false
  const { data: myBranches } = useQuery({
    queryKey: ['usuarioSucursales', currentUserEmail],
    queryFn: () => getUsuarioSucursales(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 60_000,
  })
  const { data: allSucursales } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    enabled: isSystemManager,
    staleTime: 60_000,
  })
  const branchOptions = useMemo(
    () => (isSystemManager ? (allSucursales?.items.map((s) => s.name) ?? []) : (myBranches?.branches ?? [])),
    [isSystemManager, allSucursales, myBranches],
  )
  const branchSelectOptions: SearchSelectOption[] = useMemo(() => {
    const q = branchSearch.toLowerCase()
    return branchOptions
      .filter((b) => !q || b.toLowerCase().includes(q))
      .map((b) => ({ value: b, label: b }))
  }, [branchOptions, branchSearch])

  useEffect(() => {
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  // Si solo hay una sucursal disponible, se selecciona sola y el select se bloquea.
  useEffect(() => {
    if (branchOptions.length === 1 && branch !== branchOptions[0]) setBranch(branchOptions[0])
  }, [branchOptions, branch])

  // ── Supplier search ───────────────────────────────────────────────────────

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
    enabled: true,
  })

  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
    sublabel: s.rnc ?? s.cedula,
  }))

  // Si venimos con un proveedor preseleccionado (desde "Facturas Pendientes de
  // Pago"), resolvemos su nombre para mostrarlo en el selector.
  useEffect(() => {
    if (!preselectSupplier) return
    const found = suppliersData?.items.find((s) => s.id === preselectSupplier)
    if (found) setSupplierLabel(found.supplierName)
  }, [preselectSupplier, suppliersData])

  // ── Facturas pendientes del proveedor seleccionado ───────────────────────

  const { data: pendientesData, isLoading: pendientesLoading } = useQuery({
    queryKey: ['pagos-pendientes-form', supplierId],
    queryFn: () => getPagosPendientes({ supplier: supplierId, limit: 50 }),
    enabled: !!supplierId && !advancePayment,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!supplierId || advancePayment) { setReferencias([]); return }
    const facturas = pendientesData?.items ?? []
    setReferencias(
      facturas
        .filter((f) => f.outstandingAmount > 0)
        .map((f) => ({
          invoiceId: f.id,
          grandTotal: f.grandTotal,
          outstandingAmount: f.outstandingAmount,
          postingDate: f.postingDate,
          checked: f.id === preselectInvoice,
          allocatedAmount: f.outstandingAmount,
        })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, pendientesData, advancePayment])

  // ── Métodos de pago ──────────────────────────────────────────────────────

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
  })

  // ── Helpers ──────────────────────────────────────────────────────────────

  function toggleReferencia(invoiceId: string) {
    setReferencias((prev) =>
      prev.map((r) => (r.invoiceId === invoiceId ? { ...r, checked: !r.checked } : r)),
    )
  }

  function setAllocated(invoiceId: string, value: number) {
    setReferencias((prev) =>
      prev.map((r) => (r.invoiceId === invoiceId ? { ...r, allocatedAmount: value } : r)),
    )
  }

  const checkedRefs = referencias.filter((r) => r.checked)
  const totalAllocated = checkedRefs.reduce((s, r) => s + r.allocatedAmount, 0)
  const diff = Math.round((paidAmount - totalAllocated) * 100) / 100

  // Preseleccionar el monto del pago con el total asignado la primera vez que
  // llegan las facturas marcadas (evita que el cajero tenga que calcularlo).
  useEffect(() => {
    if (preselectInvoice && checkedRefs.length > 0 && paidAmount === 0) {
      setPaidAmount(totalAllocated)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referencias])

  // ── Mutation ─────────────────────────────────────────────────────────────

  const pagoMutation = useMutation({
    mutationFn: createPago,
    onSuccess: (pago) => {
      toast.success('Pago registrado — queda en Borrador, revísalo y somételo para aplicarlo')
      queryClient.invalidateQueries({ queryKey: ['aging-proveedores'] })
      queryClient.invalidateQueries({ queryKey: ['pagos-pendientes'] })
      queryClient.invalidateQueries({ queryKey: ['pagos-pendientes-form', supplierId] })
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      navigate(`/pagos/${pago.id}`)
    },
    onError: (err: { message?: string }) => {
      if (isApiErrorCode(err, ERROR_CODES.BRANCH_REQUIRED)) {
        setBranchError(true)
        toast.error(err?.message ?? 'Selecciona una sucursal')
        return
      }
      toast.error(err?.message ?? 'Error al registrar el pago')
    },
  })

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (!paidAmount || paidAmount <= 0) { toast.error('Ingresa un monto válido'); return }
    if (!modeOfPayment) { toast.error('Selecciona un método de pago'); return }
    if (!advancePayment && diff !== 0) {
      toast.error(
        diff > 0
          ? `Quedan ${formatDOP(diff)} sin asignar a ninguna factura`
          : `La asignación excede el monto del pago en ${formatDOP(Math.abs(diff))}`,
      )
      return
    }

    pagoMutation.mutate({
      supplier: supplierId,
      postingDate,
      paidAmount,
      modeOfPayment,
      referenceNo: referenceNo || undefined,
      referenceDate: referenceDate || undefined,
      remarks: remarks || undefined,
      referencias: advancePayment || checkedRefs.length === 0
        ? undefined
        : checkedRefs.map((r) => ({ invoiceId: r.invoiceId, allocatedAmount: r.allocatedAmount })),
      branch: branch || undefined,
      department: department || undefined,
    })
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <PageHeader
        title="Registrar Pago"
        description="Registra un pago realizado a un proveedor"
      />

      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20, alignItems: 'start' }}>

        {/* ════════════════ COLUMNA IZQUIERDA — facturas ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Facturas Pendientes</span>
              {checkedRefs.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {checkedRefs.length} seleccionada{checkedRefs.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {advancePayment ? (
              <div className="card-body" style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Pago anticipado — no se aplicará a ninguna factura.
              </div>
            ) : !supplierId ? (
              <div className="card-body" style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Selecciona un proveedor para ver sus facturas pendientes
              </div>
            ) : pendientesLoading ? (
              <div className="card-body" style={{ textAlign: 'center', padding: '24px 0' }}>
                <span className="spinner spinner-brand spinner-sm" />
              </div>
            ) : referencias.length === 0 ? (
              <div className="card-body" style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Sin facturas pendientes para este proveedor
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Factura</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Pendiente</th>
                        <th style={{ textAlign: 'right', width: 140 }}>Monto a aplicar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referencias.map((ref) => (
                        <tr key={ref.invoiceId} style={{ opacity: ref.checked ? 1 : 0.6 }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={ref.checked}
                              onChange={() => toggleReferencia(ref.invoiceId)}
                              style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                            />
                          </td>
                          <td>
                            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                              {ref.invoiceId}
                            </span>
                            <br />
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ref.postingDate}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13 }}>{formatDOP(ref.grandTotal)}</td>
                          <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: 'var(--error-text)' }}>
                            {formatDOP(ref.outstandingAmount)}
                          </td>
                          <td>
                            <input
                              className="items-input"
                              type="number"
                              min="0.01"
                              step="0.01"
                              style={{ textAlign: 'right' }}
                              value={ref.allocatedAmount || ''}
                              disabled={!ref.checked}
                              onChange={(e) => setAllocated(ref.invoiceId, parseFloat(e.target.value) || 0)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {checkedRefs.length > 0 && (
                  <div style={{
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border-default)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    alignItems: 'flex-end',
                  }}>
                    <div style={{ display: 'flex', gap: 32, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Total asignado</span>
                      <strong>{formatDOP(totalAllocated)}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 32, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Monto del pago</span>
                      <strong>{formatDOP(paidAmount)}</strong>
                    </div>
                    {diff !== 0 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: diff > 0 ? 'var(--warning-text, #b45309)' : 'var(--error-text)',
                        marginTop: 2,
                      }}>
                        <AlertTriangle size={13} />
                        {diff > 0
                          ? `Quedan ${formatDOP(diff)} sin asignar`
                          : `Asignación excede el pago en ${formatDOP(Math.abs(diff))}`}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ════════════════ COLUMNA DERECHA — información del pago ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} style={{ color: 'var(--success-text)' }} aria-hidden="true" />
                Información del Pago
              </span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div className="ff-wrap">
                <label className="ff-label">
                  Proveedor <span className="ff-required">*</span>
                </label>
                <SearchSelect
                  id="supplier"
                  value={supplierId}
                  selectedLabel={supplierLabel}
                  onChange={(id, opt) => { setSupplierId(id === '' ? '' : (opt?.value ?? id)); setSupplierLabel(opt?.label ?? '') }}
                  options={supplierOptions}
                  onSearch={setSupplierQuery}
                  loading={suppliersLoading}
                  placeholder="Buscar proveedor…"
                  error={!supplierId}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="branch">Sucursal</label>
                <SearchSelect
                  id="branch"
                  value={branch}
                  selectedLabel={branch}
                  error={!branch || branchError}
                  onChange={(val) => { setBranch(val); setBranchError(false) }}
                  options={branchSelectOptions}
                  onSearch={setBranchSearch}
                  placeholder="Sin especificar"
                  className="ff-select"
                  disabled={branchOptions.length === 1}
                />
                {branchError && <p className="ff-hint" style={{ color: 'var(--color-danger)' }}>Debes seleccionar una sucursal para continuar</p>}
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="department">Departamento</label>
                <DepartmentSelect id="department" value={department} onChange={setDepartment} />
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={advancePayment}
                  onChange={(e) => setAdvancePayment(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wallet size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  Pago anticipado — no aplicar a ninguna factura (queda como saldo a favor del proveedor)
                </span>
              </label>

              <div className="ff-wrap">
                <label className="ff-label">Fecha <span className="ff-required">*</span></label>
                <input
                  type="date"
                  className="ff-input"
                  value={postingDate}
                  onChange={(e) => setPostingDate(e.target.value)}
                  required
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Monto (RD$) <span className="ff-required">*</span></label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="ff-input"
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Método de Pago <span className="ff-required">*</span></label>
                <select
                  className="ff-select"
                  value={modeOfPayment}
                  onChange={(e) => setModeOfPayment(e.target.value)}
                  required
                >
                  <option value="">Seleccionar método…</option>
                  {metodos?.filter((m) => !m.disabled).map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">No. de Referencia</label>
                <input
                  className="ff-input"
                  placeholder="# cheque, transferencia…"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Fecha de Referencia</label>
                <input
                  type="date"
                  className="ff-input"
                  value={referenceDate}
                  onChange={(e) => setReferenceDate(e.target.value)}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Notas</label>
                <textarea
                  className="ff-textarea"
                  rows={2}
                  placeholder="Observaciones opcionales…"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={pagoMutation.isPending}
          >
            {pagoMutation.isPending
              ? <><span className="spinner spinner-white spinner-sm" /> Registrando…</>
              : 'Registrar Pago'}
          </button>
        </div>

      </form>
    </div>
  )
}
