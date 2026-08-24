import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { createDeposito, getDepositosPendientes, listTiposDocumento } from '@/shared/api/tesoreria'
import type { CreateDepositoDto, CuentaBancaria, TesoreriaLinea, TesoreriaLiquidacion } from '@/shared/api/types'
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
import { formatDOP } from '@/lib/formatters'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DepositoForm() {
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

  const [tieneOrigen, setTieneOrigen] = useState(false)
  const [origenTipo, setOrigenTipo] = useState<'Customer' | 'Supplier' | ''>('')
  const [origenId, setOrigenId] = useState('')
  const [origenNombreAuto, setOrigenNombreAuto] = useState('')
  const [origenNombre, setOrigenNombre] = useState('')

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

  const { data: tiposData } = useQuery({
    queryKey: ['tesoreria-tipos-documento-form-deposito'],
    queryFn: () => listTiposDocumento({ enabled: true, limit: 100 }),
  })
  const tipos = [...(tiposData?.items ?? [])].sort((a, b) => {
    const aDeb = a.transactionType === 'Débito' ? 0 : 1
    const bDeb = b.transactionType === 'Débito' ? 0 : 1
    return aDeb - bDeb
  })
  const tipoDocumentoObj = tipos.find((t) => t.code === tipoDocumentoCode)

  function handleToggleOrigen(next: boolean) {
    setTieneOrigen(next)
    if (!next) {
      setOrigenTipo('')
      setOrigenId('')
      setOrigenNombreAuto('')
      setLiquidaciones([])
      setCuentaPartyOverride('')
    } else {
      setDistribucion([])
    }
  }

  // Reasignar la cuenta del origen deja de tener sentido en cuanto hay facturas marcadas para
  // liquidar — ERPNext exige que sea idéntica a la cuenta con la que se contabilizó cada factura.
  function handleLiquidacionesChange(next: TesoreriaLiquidacion[]) {
    setLiquidaciones(next)
    if (next.length > 0) setCuentaPartyOverride('')
  }

  // Al cambiar el tipo de tercero, resetear cualquier selección de origen ya hecha.
  function handleOrigenTipoChange(t: 'Customer' | 'Supplier') {
    setOrigenTipo(t)
    setOrigenId('')
    setOrigenNombreAuto('')
  }

  const { data: pendientes, isLoading: pendientesLoading } = useQuery({
    queryKey: ['tesoreria-depositos-pendientes', origenId, origenTipo],
    queryFn: () => getDepositosPendientes(origenId, origenTipo as 'Customer' | 'Supplier'),
    enabled: tieneOrigen && !!origenTipo && !!origenId,
  })

  const { data: sucursalesData } = useQuery({ queryKey: ['sucursales-all'], queryFn: () => listSucursales({ limit: 100 }) })
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const rncDetail = useMemo(() => (rnc ? validateRNCDetailed(rnc) : null), [rnc])

  const totalDeducciones = deducciones.reduce((s, l) => s + (l.monto || 0), 0)
  const montoNeto = Math.round((monto - totalDeducciones) * 100) / 100

  const createMutation = useMutation({
    mutationFn: createDeposito,
    onSuccess: (deposito) => {
      toast.success('Depósito creado — queda en Borrador, revísalo y somételo para aplicarlo')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-depositos'] })
      navigate(`/tesoreria/depositos/${deposito.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el depósito'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!fecha || !tipoDocumentoCode || !cuentaBancaria || !monto) {
      toast.error('Completa fecha, tipo de documento, cuenta bancaria y monto')
      return
    }
    if (tieneOrigen && (!origenTipo || !origenId)) {
      toast.error('Selecciona el origen (cliente o proveedor)')
      return
    }
    if (!tieneOrigen && distribucion.length > 0 && !sumaCoincide(distribucion, monto)) {
      toast.error('La distribución debe sumar exactamente el monto total')
      return
    }
    if (tipoDocumentoObj?.requiresNcf && !ncf) { toast.error('Este tipo de documento requiere el NCF del tercero'); return }
    if (tipoDocumentoObj?.requiresFiscalClass && !claseFiscal) { toast.error('Este tipo de documento requiere la clasificación fiscal 606'); return }
    if (tipoDocumentoObj?.requiresRnc) {
      if (!rnc) { toast.error('Este tipo de documento requiere el RNC del tercero'); return }
      if (rncDetail && !rncDetail.valid) { toast.error(`RNC inválido: ${rncDetail.reason}`); return }
    }

    const dto: CreateDepositoDto = {
      fecha,
      tipoDocumento: tipoDocumentoCode,
      cuentaBancaria,
      descripcion: descripcion || undefined,
      monto,
      origen: tieneOrigen && origenTipo && origenId ? { tipo: origenTipo, id: origenId } : undefined,
      origenNombre: origenNombre || undefined,
      referencias: {
        numeroReferencia: numeroReferencia || undefined,
        comprobante: comprobante || undefined,
        ncf: ncf || undefined,
        claseFiscal: claseFiscal || undefined,
        rnc: rnc || undefined,
      },
      liquidaciones: tieneOrigen && liquidaciones.length > 0 ? liquidaciones : undefined,
      deducciones: deducciones.length > 0 ? deducciones : undefined,
      distribucion: !tieneOrigen && distribucion.length > 0 ? distribucion : undefined,
      nota: nota || undefined,
      branch: branch || undefined,
      department: department || undefined,
      cuentaBancoOverride: cuentaBancoOverride || undefined,
      cuentaPartyOverride: tieneOrigen && cuentaPartyOverride ? cuentaPartyOverride : undefined,
    }

    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/tesoreria/depositos')}>
        <ArrowLeft size={14} /> Depósitos
      </a>

      <PageHeader title="Nuevo Depósito" description="Depósito bancario, cobro de cliente, liquidación de tarjeta o reembolso de proveedor" />

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
                <label className="ff-label ff-required">Monto Bruto</label>
                <input
                  className="ff-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={monto || ''}
                  onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
                />
                <p className="ff-hint">Monto total que se acredita a la contrapartida — igual al nominal de la transacción.</p>
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
            <h2 className="card-title">Origen</h2>
            <label className="ff-check-wrap" style={{ margin: 0, whiteSpace: 'nowrap' }}>
              <input type="checkbox" className="ff-check" checked={tieneOrigen} onChange={(e) => handleToggleOrigen(e.target.checked)} />
              ¿Tiene origen (cliente o proveedor)?
            </label>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tieneOrigen ? (
              <>
                <PartySelect
                  tipo={origenTipo}
                  onTipoChange={handleOrigenTipoChange}
                  id={origenId}
                  onIdChange={(id, nombre) => { setOrigenId(id); setOrigenNombreAuto(nombre ?? '') }}
                  tipoLabel="tipo de origen"
                />
                <div className="ff-wrap">
                  <label className="ff-label">Nombre libre (opcional)</label>
                  <input
                    className="ff-input"
                    placeholder={origenNombreAuto || 'Igual al nombre registrado'}
                    value={origenNombre}
                    onChange={(e) => setOrigenNombre(e.target.value)}
                  />
                </div>
                <div>
                  <label className="ff-label">Facturas a liquidar</label>
                  <LiquidacionFacturasTable
                    pendientes={pendientes ?? []}
                    isLoading={pendientesLoading}
                    monto={monto}
                    onChange={handleLiquidacionesChange}
                    permiteExceder
                    disabledMessage={!origenId ? 'Selecciona un cliente o proveedor para ver sus facturas pendientes' : undefined}
                    emptyMessage="Sin facturas pendientes"
                  />
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
              helpText={
                tieneOrigen
                  ? 'Estas deducciones reducen el saldo disponible para aplicar a facturas, no el monto que entra al banco (que siempre es el monto bruto).'
                  : 'Estas deducciones se restan del monto que efectivamente entra al banco.'
              }
            />
            {!tieneOrigen && deducciones.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                Monto neto que entrará al banco: <strong>{formatDOP(montoNeto)}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Referencias</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 180 }}>
                <label className="ff-label">Número de Referencia</label>
                <input className="ff-input" value={numeroReferencia} onChange={(e) => setNumeroReferencia(e.target.value)} />
              </div>
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
              label: 'Cuenta del origen',
              value: cuentaPartyOverride,
              onChange: setCuentaPartyOverride,
              rootType: origenTipo === 'Supplier' ? 'Liability' : origenTipo === 'Customer' ? 'Asset' : undefined,
              disabled: !tieneOrigen || liquidaciones.length > 0,
              disabledReason: !tieneOrigen
                ? 'Selecciona un origen (cliente o proveedor) para poder reasignar su cuenta.'
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
                <SearchSelect value={branch} onChange={(v) => setBranch(v)} options={branchOptions} onSearch={setBranchSearch} placeholder="Opcional" />
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
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/tesoreria/depositos')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Guardando…' : 'Crear Depósito'}
          </button>
        </div>
      </form>
    </div>
  )
}
