import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { createTransferenciaInterna, listTiposDocumento } from '@/shared/api/tesoreria'
import type { CreateTransferenciaInternaDto, CuentaBancaria, TesoreriaLinea } from '@/shared/api/types'
import { CuentaBancariaSelect } from './components/CuentaBancariaSelect'
import { DistribucionCuentasEditor } from './components/DistribucionCuentasEditor'
import { CuentaContableOverrideSection } from './components/CuentaContableOverrideSection'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import { formatDOP } from '@/lib/formatters'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TransferenciaInternaForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [fecha, setFecha] = useState(today())
  const [tipoDocumentoCode, setTipoDocumentoCode] = useState('')
  const [cuentaOrigen, setCuentaOrigen] = useState('')
  const [cuentaOrigenObj, setCuentaOrigenObj] = useState<CuentaBancaria | undefined>()
  const [cuentaDestino, setCuentaDestino] = useState('')
  const [cuentaDestinoObj, setCuentaDestinoObj] = useState<CuentaBancaria | undefined>()
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState<number>(0)
  const [numeroReferencia, setNumeroReferencia] = useState('')
  const [deducciones, setDeducciones] = useState<TesoreriaLinea[]>([])
  const [nota, setNota] = useState('')

  const [cuentaBancoOrigenOverride, setCuentaBancoOrigenOverride] = useState('')
  const [cuentaBancoDestinoOverride, setCuentaBancoDestinoOverride] = useState('')

  // tipoDocumento es opcional acá — nunca hay ambigüedad de contrapartida, solo categoriza el listado.
  const { data: tiposData } = useQuery({
    queryKey: ['tesoreria-tipos-documento-form-transferencia'],
    queryFn: () => listTiposDocumento({ enabled: true, nature: 'Transferencia interna', limit: 100 }),
  })
  const tipos = tiposData?.items ?? []

  const totalDeducciones = deducciones.reduce((s, l) => s + (l.monto || 0), 0)
  const montoLlega = Math.round((monto - totalDeducciones) * 100) / 100

  const isDirty = useDirtyCheck(
    {
      fecha,
      tipoDocumentoCode,
      cuentaOrigen,
      cuentaDestino,
      descripcion,
      monto,
      numeroReferencia,
      deducciones,
      nota,
      cuentaBancoOrigenOverride,
      cuentaBancoDestinoOverride,
    },
    true,
  )
  useBeforeUnloadWarning(isDirty)

  const createMutation = useMutation({
    mutationFn: createTransferenciaInterna,
    onSuccess: (transferencia) => {
      toast.success('Transferencia creada — queda en Borrador, revísala y sométela para aplicarla')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-transferencias-internas'] })
      navigate(`/tesoreria/transferencias/${transferencia.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la transferencia'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fecha || !cuentaOrigen || !cuentaDestino || !monto) {
      toast.error('Completa fecha, cuenta origen, cuenta destino y monto')
      return
    }
    if (cuentaOrigen === cuentaDestino) {
      toast.error('La cuenta origen y la cuenta destino deben ser diferentes')
      return
    }
    // Distinto de la validación anterior: dos cuentas BANCARIAS distintas pueden terminar
    // apuntando a la misma cuenta CONTABLE (ya sea la heredada o una reasignada), y ese asiento
    // no significaría nada — débito y crédito se cancelarían en la misma cuenta.
    const cuentaContableOrigenEfectiva = cuentaBancoOrigenOverride || cuentaOrigenObj?.account
    const cuentaContableDestinoEfectiva = cuentaBancoDestinoOverride || cuentaDestinoObj?.account
    if (cuentaContableOrigenEfectiva && cuentaContableDestinoEfectiva && cuentaContableOrigenEfectiva === cuentaContableDestinoEfectiva) {
      toast.error('La cuenta contable de origen y la de destino quedarían iguales — ese asiento no significaría nada. Reasigna una de las dos.')
      return
    }

    const dto: CreateTransferenciaInternaDto = {
      fecha,
      tipoDocumento: tipoDocumentoCode || undefined,
      cuentaOrigen,
      cuentaDestino,
      descripcion: descripcion || undefined,
      monto,
      referencias: numeroReferencia ? { numeroReferencia } : undefined,
      deducciones: deducciones.length > 0 ? deducciones : undefined,
      nota: nota || undefined,
      cuentaBancoOrigenOverride: cuentaBancoOrigenOverride || undefined,
      cuentaBancoDestinoOverride: cuentaBancoDestinoOverride || undefined,
    }

    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/tesoreria/transferencias')}>
        <ArrowLeft size={14} /> Transferencias Internas
      </a>

      <PageHeader title="Nueva Transferencia Interna" description="Mover dinero entre dos cuentas bancarias propias de la empresa" />

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
                <label className="ff-label">Tipo de Documento (opcional)</label>
                <SearchSelect
                  value={tipoDocumentoCode}
                  onChange={(v) => setTipoDocumentoCode(v)}
                  options={tipos.map((t) => ({ value: t.code, label: `${t.code} — ${t.description}` }))}
                  onSearch={() => {}}
                  placeholder="Solo para categorizar el listado"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 220 }}>
                <label className="ff-label ff-required">Cuenta Origen</label>
                <CuentaBancariaSelect
                  value={cuentaOrigen}
                  onChange={(id, cuenta) => { setCuentaOrigen(id); setCuentaOrigenObj(cuenta) }}
                  excludeId={cuentaDestino || undefined}
                />
              </div>
              <ArrowRight size={18} style={{ marginBottom: 10, color: 'var(--text-tertiary)' }} />
              <div className="ff-wrap" style={{ flex: 1, minWidth: 220 }}>
                <label className="ff-label ff-required">Cuenta Destino</label>
                <CuentaBancariaSelect
                  value={cuentaDestino}
                  onChange={(id, cuenta) => { setCuentaDestino(id); setCuentaDestinoObj(cuenta) }}
                  excludeId={cuentaOrigen || undefined}
                />
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
                <p className="ff-hint">Monto que sale de la cuenta origen.</p>
              </div>
              <div className="ff-wrap" style={{ flex: 2, minWidth: 240 }}>
                <label className="ff-label">Descripción</label>
                <input className="ff-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Comisiones Interbancarias</h2></div>
          <div className="card-body">
            <DistribucionCuentasEditor
              value={deducciones}
              onChange={setDeducciones}
              monto={monto}
              sumaExacta={false}
              label="Deducciones"
              helpText="Reducen lo que efectivamente llega a la cuenta destino respecto a lo que sale de la cuenta origen."
            />
            {monto > 0 && (
              <p style={{ fontSize: 13, marginTop: 10 }}>
                Sale de origen: <strong>{formatDOP(monto)}</strong>
                {totalDeducciones > 0 && <> — Comisión: <strong>{formatDOP(totalDeducciones)}</strong></>}
                {' '}— Llega a destino: <strong>{formatDOP(montoLlega)}</strong>
              </p>
            )}
          </div>
        </div>

        <CuentaContableOverrideSection
          rows={[
            {
              key: 'origen',
              label: 'Cuenta de la pata origen',
              value: cuentaBancoOrigenOverride,
              onChange: setCuentaBancoOrigenOverride,
              cuentaHeredada: cuentaOrigenObj?.account,
              rootType: 'Asset',
            },
            {
              key: 'destino',
              label: 'Cuenta de la pata destino',
              value: cuentaBancoDestinoOverride,
              onChange: setCuentaBancoDestinoOverride,
              cuentaHeredada: cuentaDestinoObj?.account,
              rootType: 'Asset',
            },
          ]}
        />

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Otros</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label">Número de Referencia</label>
              <input className="ff-input" value={numeroReferencia} onChange={(e) => setNumeroReferencia(e.target.value)} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Nota</label>
              <textarea className="ff-input" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/tesoreria/transferencias')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Guardando…' : 'Crear Transferencia'}
          </button>
        </div>
      </form>
    </div>
  )
}
