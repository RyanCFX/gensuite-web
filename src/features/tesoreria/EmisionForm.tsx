import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import {
  createEmision,
  getEmisionesPendientes,
  getSiguienteCheque,
  listTiposDocumento,
} from '@/shared/api/tesoreria'
import type { CreateEmisionDto, CuentaBancaria, TesoreriaLinea, TesoreriaLiquidacion, TipoDocumentoBancario } from '@/shared/api/types'
import { CuentaBancariaSelect } from './components/CuentaBancariaSelect'
import { PartySelect } from './components/PartySelect'
import { DistribucionCuentasEditor, sumaCoincide } from './components/DistribucionCuentasEditor'
import { LiquidacionFacturasTable } from './components/LiquidacionFacturasTable'
import { CuentaContableOverrideSection } from './components/CuentaContableOverrideSection'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { listSucursales } from '@/shared/api/sucursales'
import { validateRNCDetailed, formatRNC } from '@/lib/validators/dgii'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function EmisionForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [fecha, setFecha] = useState(today())
  const [tipoDocumentoCode, setTipoDocumentoCode] = useState('')
  const [cuentaBancaria, setCuentaBancaria] = useState('')
  const [cuentaBancariaObj, setCuentaBancariaObj] = useState<CuentaBancaria | undefined>()
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState<number>(0)

  const [cuentaBancoOverride, setCuentaBancoOverride] = useState('')
  const [cuentaPartyOverride, setCuentaPartyOverride] = useState('')

  const [tieneBeneficiario, setTieneBeneficiario] = useState(false)
  const [beneficiarioTipo, setBeneficiarioTipo] = useState<'Customer' | 'Supplier' | ''>('')
  const [beneficiarioId, setBeneficiarioId] = useState('')
  const [beneficiarioNombreAuto, setBeneficiarioNombreAuto] = useState('')
  const [beneficiarioNombre, setBeneficiarioNombre] = useState('')

  const [numeroCheque, setNumeroCheque] = useState('')
  const numeroChequeTocado = useRef(false)
  const [numeroReferencia, setNumeroReferencia] = useState('')
  const [comprobante, setComprobante] = useState('')
  const [ncf, setNcf] = useState('')
  const [claseFiscal, setClaseFiscal] = useState('')
  const [rnc, setRnc] = useState('')

  const [liquidaciones, setLiquidaciones] = useState<TesoreriaLiquidacion[]>([])
  const [deducciones, setDeducciones] = useState<TesoreriaLinea[]>([])
  const [distribucion, setDistribucion] = useState<TesoreriaLinea[]>([])

  const [nota, setNota] = useState('')
  const [branch, setBranch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [department, setDepartment] = useState('')

  // ── Catálogo de tipos de documento ──────────────────────────────────────
  const { data: tiposData } = useQuery({
    queryKey: ['tesoreria-tipos-documento-form'],
    queryFn: () => listTiposDocumento({ enabled: true, limit: 100 }),
  })
  const tipos = tiposData?.items ?? []
  const tipoDocumentoObj: TipoDocumentoBancario | undefined = tipos.find((t) => t.code === tipoDocumentoCode)
  const esCheque = tipoDocumentoObj?.nature === 'Cheque'

  // Si el tipo de documento exige beneficiario, el toggle queda forzado — se deriva en el render
  // en vez de sincronizarlo con un efecto, para no encadenar un re-render extra.
  const tieneBeneficiarioEfectivo = tieneBeneficiario || !!tipoDocumentoObj?.requiresParty

  // Al desactivar beneficiario, limpiar su estado (y viceversa) — nunca mandar ambos caminos.
  function handleToggleBeneficiario(next: boolean) {
    setTieneBeneficiario(next)
    if (!next) {
      setBeneficiarioTipo('')
      setBeneficiarioId('')
      setBeneficiarioNombreAuto('')
      setLiquidaciones([])
      setCuentaPartyOverride('')
    } else {
      setDistribucion([])
    }
  }

  // Reasignar la cuenta del beneficiario deja de tener sentido en cuanto hay facturas marcadas
  // para liquidar — ERPNext exige que sea idéntica a la cuenta con la que se contabilizó cada
  // factura, así que aquí se limpia en vez de dejar un valor que el backend va a rechazar.
  function handleLiquidacionesChange(next: TesoreriaLiquidacion[]) {
    setLiquidaciones(next)
    if (next.length > 0) setCuentaPartyOverride('')
  }

  // ── Sugerencia de número de cheque ──────────────────────────────────────
  const { data: siguienteCheque } = useQuery({
    queryKey: ['tesoreria-siguiente-cheque', cuentaBancaria],
    queryFn: () => getSiguienteCheque(cuentaBancaria),
    enabled: !!cuentaBancaria && esCheque,
  })
  useEffect(() => {
    if (esCheque && siguienteCheque?.siguienteSugerido && !numeroChequeTocado.current && !numeroCheque) {
      setNumeroCheque(siguienteCheque.siguienteSugerido)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siguienteCheque, esCheque])

  // ── Facturas pendientes (solo Supplier — no hay endpoint de pendientes para Customer) ──
  const { data: pendientes, isLoading: pendientesLoading } = useQuery({
    queryKey: ['tesoreria-emisiones-pendientes', beneficiarioId],
    queryFn: () => getEmisionesPendientes(beneficiarioId),
    enabled: tieneBeneficiarioEfectivo && beneficiarioTipo === 'Supplier' && !!beneficiarioId,
  })

  // ── Sucursales (branch) ──────────────────────────────────────────────────
  const { data: sucursalesData } = useQuery({ queryKey: ['sucursales-all'], queryFn: () => listSucursales({ limit: 100 }) })
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const rncDetail = useMemo(() => (rnc ? validateRNCDetailed(rnc) : null), [rnc])

  const createMutation = useMutation({
    mutationFn: createEmision,
    onSuccess: (emision) => {
      toast.success('Emisión creada — queda en Borrador, revísala y sométela para aplicarla')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-emisiones'] })
      navigate(`/tesoreria/emisiones/${emision.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la emisión'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!fecha || !tipoDocumentoCode || !cuentaBancaria || !monto) {
      toast.error('Completa fecha, tipo de documento, cuenta bancaria y monto')
      return
    }
    if (tieneBeneficiarioEfectivo && (!beneficiarioTipo || !beneficiarioId)) {
      toast.error('Selecciona el beneficiario')
      return
    }
    if (!tieneBeneficiarioEfectivo && distribucion.length > 0 && !sumaCoincide(distribucion, monto)) {
      toast.error('La distribución debe sumar exactamente el monto total')
      return
    }
    if (tipoDocumentoObj?.requiresNcf && !ncf) {
      toast.error('Este tipo de documento requiere el NCF del tercero')
      return
    }
    if (tipoDocumentoObj?.requiresFiscalClass && !claseFiscal) {
      toast.error('Este tipo de documento requiere la clasificación fiscal 606')
      return
    }
    if (tipoDocumentoObj?.requiresRnc) {
      if (!rnc) { toast.error('Este tipo de documento requiere el RNC del tercero'); return }
      if (rncDetail && !rncDetail.valid) { toast.error(`RNC inválido: ${rncDetail.reason}`); return }
    }

    const dto: CreateEmisionDto = {
      fecha,
      tipoDocumento: tipoDocumentoCode,
      cuentaBancaria,
      descripcion: descripcion || undefined,
      monto,
      beneficiario: tieneBeneficiarioEfectivo && beneficiarioTipo && beneficiarioId
        ? { tipo: beneficiarioTipo, id: beneficiarioId }
        : undefined,
      beneficiarioNombre: beneficiarioNombre || undefined,
      referencias: {
        numeroCheque: numeroCheque || undefined,
        numeroReferencia: numeroReferencia || undefined,
        comprobante: comprobante || undefined,
        ncf: ncf || undefined,
        claseFiscal: claseFiscal || undefined,
        rnc: rnc || undefined,
      },
      liquidaciones: tieneBeneficiarioEfectivo && liquidaciones.length > 0 ? liquidaciones : undefined,
      deducciones: deducciones.length > 0 ? deducciones : undefined,
      distribucion: !tieneBeneficiarioEfectivo && distribucion.length > 0 ? distribucion : undefined,
      nota: nota || undefined,
      branch: branch || undefined,
      department: department || undefined,
      cuentaBancoOverride: cuentaBancoOverride || undefined,
      cuentaPartyOverride: tieneBeneficiarioEfectivo && cuentaPartyOverride ? cuentaPartyOverride : undefined,
    }

    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/tesoreria/emisiones')}>
        <ArrowLeft size={14} /> Emisiones
      </a>

      <PageHeader title="Nueva Emisión" description="Cheque, transferencia saliente, pago a proveedor o ajuste bancario" />

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Datos generales</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 160 }}>
                <label className="ff-label ff-required">Fecha</label>
                <DatePicker className="ff-input" value={fecha} onChange={setFecha} />
              </div>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 200 }}>
                <label className="ff-label ff-required">Tipo de Documento</label>
                <SearchSelect
                  value={tipoDocumentoCode}
                  onChange={(v) => setTipoDocumentoCode(v)}
                  options={tipos.map((t) => ({ value: t.code, label: `${t.code} — ${t.description}` }))}
                  onSearch={() => {}}
                  placeholder="Selecciona un tipo…"
                />
              </div>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 200 }}>
                <label className="ff-label ff-required">Cuenta Bancaria</label>
                <CuentaBancariaSelect value={cuentaBancaria} onChange={(id, cuenta) => { setCuentaBancaria(id); setCuentaBancariaObj(cuenta) }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 160 }}>
                <label className="ff-label ff-required">Monto</label>
                <input
                  className="ff-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={monto || ''}
                  onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="ff-wrap" style={{ flex: 2, minWidth: 240 }}>
                <label className="ff-label">Descripción</label>
                <input className="ff-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title">Beneficiario</h2>
            <label className="ff-check-wrap" style={{ margin: 0, whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                className="ff-check"
                checked={tieneBeneficiarioEfectivo}
                disabled={!!tipoDocumentoObj?.requiresParty}
                onChange={(e) => handleToggleBeneficiario(e.target.checked)}
              />
              ¿Tiene beneficiario?
            </label>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tipoDocumentoObj?.requiresParty && (
              <p className="ff-hint">Este tipo de documento exige beneficiario — no se puede desactivar.</p>
            )}
            {tieneBeneficiarioEfectivo ? (
              <>
                <PartySelect
                  tipo={beneficiarioTipo}
                  onTipoChange={setBeneficiarioTipo}
                  id={beneficiarioId}
                  onIdChange={(id, nombre) => { setBeneficiarioId(id); setBeneficiarioNombreAuto(nombre ?? '') }}
                  tipoLabel="tipo de beneficiario"
                />
                <div className="ff-wrap">
                  <label className="ff-label">Nombre a imprimir en el cheque (opcional)</label>
                  <input
                    className="ff-input"
                    placeholder={beneficiarioNombreAuto || 'Igual al nombre registrado'}
                    value={beneficiarioNombre}
                    onChange={(e) => setBeneficiarioNombre(e.target.value)}
                  />
                  <p className="ff-hint">Úsalo cuando el pago se hace a la orden de un tercero distinto.</p>
                </div>

                <div>
                  <label className="ff-label">Facturas a liquidar</label>
                  {beneficiarioTipo === 'Customer' ? (
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                      No hay liquidación de facturas disponible para un beneficiario Cliente en
                      Emisiones — el monto completo queda como pago sin aplicar.
                    </p>
                  ) : (
                    <LiquidacionFacturasTable
                      pendientes={pendientes ?? []}
                      isLoading={pendientesLoading}
                      monto={monto}
                      onChange={handleLiquidacionesChange}
                      permiteExceder
                      disabledMessage={!beneficiarioId ? 'Selecciona un proveedor para ver sus facturas pendientes' : undefined}
                      emptyMessage="Sin facturas pendientes para este proveedor"
                    />
                  )}
                </div>
              </>
            ) : (
              <DistribucionCuentasEditor
                value={distribucion}
                onChange={setDistribucion}
                monto={monto}
                sumaExacta
                label="Distribución en cuentas contables"
                helpText={
                  tipoDocumentoObj?.defaultOffsetAccount
                    ? `Si no distribuyes manualmente, se usará "${tipoDocumentoObj.defaultOffsetAccount}" como contrapartida.`
                    : 'La suma de las líneas debe igualar el monto total.'
                }
              />
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Deducciones</h2></div>
          <div className="card-body">
            <DistribucionCuentasEditor
              value={deducciones}
              onChange={setDeducciones}
              monto={monto}
              sumaExacta={false}
              label="Comisiones / retenciones"
              helpText="Reducen lo que efectivamente se liquida/contabiliza en la contrapartida principal."
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Referencias</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {esCheque ? (
                <div className="ff-wrap" style={{ flex: 1, minWidth: 180 }}>
                  <label className="ff-label">Número de Cheque</label>
                  <input
                    className="ff-input"
                    value={numeroCheque}
                    onChange={(e) => { numeroChequeTocado.current = true; setNumeroCheque(e.target.value) }}
                  />
                  {siguienteCheque?.ultimoCheque && (
                    <p className="ff-hint">Último usado: {siguienteCheque.ultimoCheque} — sugerencia editable, no es una reserva.</p>
                  )}
                </div>
              ) : (
                <div className="ff-wrap" style={{ flex: 1, minWidth: 180 }}>
                  <label className="ff-label">Número de Referencia</label>
                  <input className="ff-input" value={numeroReferencia} onChange={(e) => setNumeroReferencia(e.target.value)} />
                </div>
              )}
              <div className="ff-wrap" style={{ flex: 1, minWidth: 180 }}>
                <label className="ff-label">Comprobante</label>
                <input className="ff-input" value={comprobante} onChange={(e) => setComprobante(e.target.value)} />
              </div>
            </div>

            {(tipoDocumentoObj?.requiresNcf || tipoDocumentoObj?.requiresFiscalClass || tipoDocumentoObj?.requiresRnc) && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {tipoDocumentoObj?.requiresNcf && (
                  <div className="ff-wrap" style={{ flex: 1, minWidth: 160 }}>
                    <label className="ff-label ff-required">NCF del tercero</label>
                    <input className="ff-input" placeholder={tipoDocumentoObj.ncfPrefix} value={ncf} onChange={(e) => setNcf(e.target.value)} />
                  </div>
                )}
                {tipoDocumentoObj?.requiresFiscalClass && (
                  <div className="ff-wrap" style={{ flex: 1, minWidth: 160 }}>
                    <label className="ff-label ff-required">Clasificación Fiscal 606</label>
                    <input className="ff-input" value={claseFiscal} onChange={(e) => setClaseFiscal(e.target.value)} />
                  </div>
                )}
                {tipoDocumentoObj?.requiresRnc && (
                  <div className="ff-wrap" style={{ flex: 1, minWidth: 160 }}>
                    <label className="ff-label ff-required">RNC del tercero</label>
                    <input
                      className={`ff-input${rncDetail && !rncDetail.valid ? ' ff-input-error' : ''}`}
                      value={rnc}
                      onChange={(e) => setRnc(formatRNC(e.target.value))}
                    />
                    {rncDetail && !rncDetail.valid && (
                      <p className="ff-error" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={12} /> {rncDetail.reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <CuentaContableOverrideSection
          rows={[
            {
              key: 'banco',
              label: 'Cuenta del banco',
              value: cuentaBancoOverride,
              onChange: setCuentaBancoOverride,
              cuentaHeredada: cuentaBancariaObj?.account,
              rootType: 'Asset',
            },
            {
              key: 'party',
              label: 'Cuenta del beneficiario',
              value: cuentaPartyOverride,
              onChange: setCuentaPartyOverride,
              rootType: beneficiarioTipo === 'Supplier' ? 'Liability' : beneficiarioTipo === 'Customer' ? 'Asset' : undefined,
              disabled: !tieneBeneficiarioEfectivo || liquidaciones.length > 0,
              disabledReason: !tieneBeneficiarioEfectivo
                ? 'Selecciona un beneficiario para poder reasignar su cuenta.'
                : liquidaciones.length > 0
                  ? 'No se puede reasignar mientras haya facturas marcadas para liquidar — la cuenta debe coincidir con la de cada factura liquidada.'
                  : undefined,
            },
          ]}
        />

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Otros</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 200 }}>
                <label className="ff-label">Sucursal</label>
                <SearchSelect
                  value={branch}
                  onChange={(v) => setBranch(v)}
                  options={branchOptions}
                  onSearch={setBranchSearch}
                  placeholder="Opcional"
                />
              </div>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 200 }}>
                <label className="ff-label">Departamento</label>
                <DepartmentSelect value={department} onChange={setDepartment} placeholder="Opcional" />
              </div>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Nota</label>
              <textarea className="ff-input" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/tesoreria/emisiones')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Guardando…' : 'Crear Emisión'}
          </button>
        </div>
      </form>
    </div>
  )
}
