// Diagnóstico y Preparación — puerta de entrada obligatoria del módulo de Migración de Saldos.
// docs/tasks/PROMPT_APERTURA_FRONTEND.md §3.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, AlertTriangle, Wrench, ArrowRight } from 'lucide-react'
import { getAperturaPreflight, prepararApertura } from '@/shared/api/apertura'
import { usePuede } from '@/shared/permissions/can'
import { ocultarErp } from '@/lib/ocultarErp'
import { PageHeader } from '@/components/shared/PageHeader'
import { Select, SelectItem } from '@/components/ui/select'
import { opcionesAnio, anioDesdeDefault, anioActual, rangoAnioToFechas } from './lib'

export default function DiagnosticoPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedePreparar = usePuede('apertura.preparar.ejecutar')

  const [desdeAnio, setDesdeAnio] = useState(anioDesdeDefault())
  const [hastaAnio, setHastaAnio] = useState(anioActual())
  const rango = rangoAnioToFechas(desdeAnio, hastaAnio)

  const { data: preflight, isLoading, isFetching } = useQuery({
    queryKey: ['apertura-preflight', rango.desde, rango.hasta],
    queryFn: () => getAperturaPreflight(rango),
  })

  const prepararMutation = useMutation({
    mutationFn: () => prepararApertura(rango),
    onSuccess: (res) => {
      const partes: string[] = []
      if (res.ejerciciosFiscales.creados.length > 0) {
        partes.push(`Ejercicios fiscales creados: ${res.ejerciciosFiscales.creados.join(', ')}.`)
      }
      if (res.cuentaApertura.creada) {
        partes.push(`Cuenta de apertura creada: ${res.cuentaApertura.cuenta}.`)
      }
      toast.success(partes.length > 0 ? partes.join(' ') : 'Tu empresa ya estaba preparada — sin cambios.')
      queryClient.invalidateQueries({ queryKey: ['apertura-preflight'] })
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al preparar la migración'),
  })

  const anios = opcionesAnio()

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Migración de Saldos — Diagnóstico</>}
        description="Verifica que tu empresa esté lista antes de cargar facturas de apertura (saldos pendientes del sistema anterior)."
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Rango a migrar</h2></div>
        <div className="card-body" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="ff-wrap" style={{ minWidth: 160 }}>
            <label className="ff-label">¿Desde qué año necesitás migrar?</label>
            <Select value={String(desdeAnio)} onValueChange={(v) => setDesdeAnio(Number(v))} clearable={false}>
              {anios.filter((y) => y <= hastaAnio).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </Select>
          </div>
          <div className="ff-wrap" style={{ minWidth: 160 }}>
            <label className="ff-label">¿Hasta qué año?</label>
            <Select value={String(hastaAnio)} onValueChange={(v) => setHastaAnio(Number(v))} clearable={false}>
              {anios.filter((y) => y >= desdeAnio).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </Select>
          </div>
          {isFetching && <span className="td-muted" style={{ fontSize: 13 }}>Actualizando…</span>}
        </div>
      </div>

      {isLoading ? (
        <span className="skeleton-box" style={{ height: 140, width: '100%', display: 'block', marginBottom: 16 }} />
      ) : preflight ? (
        <>
          {preflight.listo ? (
            <div className="inline-alert inline-alert-success" style={{ marginBottom: 16 }}>
              <CheckCircle2 size={16} />
              Listo para migrar — puedes cargar facturas de venta y compra.
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger-border, var(--border-default))' }}>
              <div className="card-header">
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} style={{ color: 'var(--warning-text, #b45309)' }} />
                  Tu empresa no está lista para migrar
                </h2>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {preflight.bloqueantes.map((b, i) => <li key={i} style={{ fontSize: 13.5 }}>{ocultarErp(b)}</li>)}
                </ul>
                {puedePreparar ? (
                  <button
                    className="btn btn-navy"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => prepararMutation.mutate()}
                    disabled={prepararMutation.isPending}
                  >
                    <Wrench size={14} />
                    {prepararMutation.isPending ? 'Preparando…' : 'Preparar empresa'}
                  </button>
                ) : (
                  <p className="ff-hint">
                    Solo el Administrador de tu empresa puede preparar la migración (crear un Ejercicio Fiscal
                    exige el rol System Manager). Contactá al Administrador para que ejecute esta preparación
                    una única vez.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="form-row form-row-3">
            <div className="card">
              <div className="card-header"><h2 className="card-title">Ejercicios Fiscales</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div><span className="td-muted">Requeridos:</span> {preflight.ejerciciosFiscales.requeridos.join(', ') || '—'}</div>
                <div><span className="td-muted">Existentes:</span> {preflight.ejerciciosFiscales.existentes.join(', ') || '—'}</div>
                <div><span className="td-muted">Faltantes:</span> {preflight.ejerciciosFiscales.faltantes.join(', ') || 'Ninguno'}</div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h2 className="card-title">Cuenta de Apertura</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div>
                  <span className={`badge ${preflight.cuentaApertura.existe ? 'badge-submitted' : 'badge-cancelled'}`}>
                    {preflight.cuentaApertura.existe ? 'Existe' : 'No existe'}
                  </span>
                </div>
                <div>{preflight.cuentaApertura.cuenta ?? `Se sugerirá: ${preflight.cuentaApertura.numeroSugerido}`}</div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h2 className="card-title">Series de Numeración</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div>
                  <span className={`badge ${preflight.serieNumeracion.existe ? 'badge-submitted' : 'badge-cancelled'}`}>
                    {preflight.serieNumeracion.existe ? 'Disponibles' : 'No disponibles'}
                  </span>
                </div>
                <div>Ventas: <code>{preflight.serieNumeracion.ventas}</code></div>
                <div>Compras: <code>{preflight.serieNumeracion.compras}</code></div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/apertura/ventas')}>
              Ir a Ventas <ArrowRight size={14} />
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/apertura/compras')}>
              Ir a Compras <ArrowRight size={14} />
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/apertura/inventario')}>
              Ir a Inventario <ArrowRight size={14} />
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/apertura/resumen')}>
              Ver Cuadre <ArrowRight size={14} />
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
