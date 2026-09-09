import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  confirmarPreaprobacion,
  createDespacho,
  getPreaprobacion,
  recalcularPreaprobacion,
  updatePreaprobacion,
} from '@/shared/api/farmacia'
import { useAuthStore } from '@/stores/auth.store'
import { Permitido } from '@/components/shared/Permitido'
import { usePuede } from '@/shared/permissions/can'
import { formatDOP, formatDate, round2 } from '@/lib/formatters'
import { ArrowLeft, RefreshCw, CheckCircle2, Truck, Loader2 } from 'lucide-react'

const ESTADO_BADGE: Record<string, string> = {
  Borrador: 'badge-draft',
  Confirmada: 'badge-submitted',
  Despachado: 'badge-info',
}

export default function PreaprobacionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const esDependiente = useAuthStore((s) => s.user?.roles?.includes('Dependiente')) ?? false
  const puedeEditar = usePuede('farmacia.preaprobaciones.editar')

  const { data: preaprobacion, isLoading } = useQuery({
    queryKey: ['farmacia-preaprobacion', id],
    queryFn: () => getPreaprobacion(id!),
    enabled: !!id,
  })

  // Edición local de montoAprobadoArs/lineaBloqueada por línea — se reinicializa cada vez que
  // llega una respuesta fresca del servidor (después de Recalcular o de guardar), nunca se
  // calcula nada de esto en el cliente (docs/FARMACIA_ARS_FRONTEND.md §9).
  const [editValues, setEditValues] = useState<Record<string, { montoAprobadoArs: number; lineaBloqueada: boolean }>>({})
  useEffect(() => {
    if (!preaprobacion) return
    setEditValues(
      Object.fromEntries(
        preaprobacion.detalle.map((d) => [d.id, { montoAprobadoArs: d.montoAprobadoArs, lineaBloqueada: d.lineaBloqueada }]),
      ),
    )
  }, [preaprobacion])

  const updateLineMutation = useMutation({
    mutationFn: (payload: { lineId: string; montoAprobadoArs: number; lineaBloqueada: boolean }) =>
      updatePreaprobacion(id!, {
        detalle: [{ id: payload.lineId, montoAprobadoArs: payload.montoAprobadoArs, lineaBloqueada: payload.lineaBloqueada }],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['farmacia-preaprobacion', id] }),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al guardar la línea'),
  })

  const recalcularMutation = useMutation({
    mutationFn: () => recalcularPreaprobacion(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['farmacia-preaprobacion', id] })
      toast.success('Recalculado')
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al recalcular'),
  })

  const confirmarMutation = useMutation({
    mutationFn: () => confirmarPreaprobacion(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['farmacia-preaprobacion', id] })
      toast.success('Preaprobación confirmada')
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al confirmar'),
  })

  const despacharMutation = useMutation({
    mutationFn: () => createDespacho({ preaprobacion: id! }),
    onSuccess: (despacho) => {
      toast.success('Despacho creado correctamente')
      navigate(`/farmacia/despachos/${despacho.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al despachar'),
  })

  if (isLoading || !preaprobacion) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 220, height: 24, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 280, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  const esBorrador = preaprobacion.estado === 'Borrador'
  const diferenciaOk = preaprobacion.diferencia === 0

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/farmacia/preaprobaciones')}>
            <ArrowLeft size={14} /> Preaprobaciones ARS
          </a>
          <h1 className="page-title">
            {preaprobacion.id}{' '}
            <span className={`badge ${ESTADO_BADGE[preaprobacion.estado] ?? 'badge-neutral'}`}>{preaprobacion.estado}</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {esBorrador && (
            <Permitido accion="farmacia.preaprobaciones.recalcular">
              <button className="btn btn-secondary" onClick={() => recalcularMutation.mutate()} disabled={recalcularMutation.isPending}>
                {recalcularMutation.isPending ? <Loader2 size={15} className="spinner" /> : <RefreshCw size={15} />}
                Recalcular
              </button>
            </Permitido>
          )}
          {esBorrador && (
            <Permitido accion="farmacia.preaprobaciones.confirmar">
              <button
                className="btn btn-primary"
                onClick={() => confirmarMutation.mutate()}
                disabled={!diferenciaOk || confirmarMutation.isPending}
                title={diferenciaOk ? undefined : 'La diferencia debe ser 0 antes de confirmar'}
              >
                {confirmarMutation.isPending ? <Loader2 size={15} className="spinner" /> : <CheckCircle2 size={15} />}
                Confirmar
              </button>
            </Permitido>
          )}
          {preaprobacion.estado === 'Confirmada' && (
            <Permitido accion="farmacia.despachos.crear">
              <button className="btn btn-primary" onClick={() => despacharMutation.mutate()} disabled={despacharMutation.isPending}>
                {despacharMutation.isPending ? <Loader2 size={15} className="spinner" /> : <Truck size={15} />}
                Despachar
              </button>
            </Permitido>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Información General</h2>
        </div>
        <div className="card-body">
          <div className="form-row form-row-3">
            <div className="ff-wrap">
              <label className="ff-label">ARS</label>
              <p>{preaprobacion.aseguradoraName ?? preaprobacion.aseguradora}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Paciente</label>
              <p>{preaprobacion.clienteName ?? preaprobacion.cliente}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">N.º de autorización</label>
              <p>{preaprobacion.numeroAprobacion}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Carnet de afiliado</label>
              <p>{preaprobacion.carnetAfiliado}</p>
            </div>
            {preaprobacion.fechaAprobacion && (
              <div className="ff-wrap">
                <label className="ff-label">Fecha de aprobación</label>
                <p>{formatDate(preaprobacion.fechaAprobacion)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Cobertura</h2>
        </div>
        <div className="card-body">
          <div className="form-row form-row-3">
            <div className="ff-wrap">
              <label className="ff-label">Total receta</label>
              <p style={{ fontWeight: 600 }}>{formatDOP(preaprobacion.montoTotalReceta)}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Valor cobertura ARS</label>
              <p style={{ fontWeight: 600 }}>{formatDOP(preaprobacion.valorCoberturaArs)}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Distribuido</label>
              <p style={{ fontWeight: 600 }}>{formatDOP(preaprobacion.montoDistribuido)}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Diferencia</label>
              <p style={{ fontWeight: 700, color: diferenciaOk ? 'var(--text-success, green)' : 'var(--text-danger, red)' }}>
                {formatDOP(preaprobacion.diferencia)}
              </p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">% Cobertura</label>
              <p style={{ fontWeight: 600 }}>{round2(preaprobacion.porcientoCobertura * 100)}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Medicamentos</h2>
        </div>
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Medicamento</th>
                <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                <th style={{ textAlign: 'right', width: 120 }}>Precio Línea</th>
                <th style={{ textAlign: 'right', width: 140 }}>Monto ARS</th>
                <th style={{ textAlign: 'right', width: 120 }}>A cargo paciente</th>
                {esBorrador && <th style={{ width: 90 }}>Bloqueada</th>}
              </tr>
            </thead>
            <tbody>
              {preaprobacion.detalle.map((linea) => {
                const edit = editValues[linea.id] ?? { montoAprobadoArs: linea.montoAprobadoArs, lineaBloqueada: linea.lineaBloqueada }
                // El permiso general de PUT (.editar) habilita la línea; el permlevel de ERPNext
                // sobre monto_aprobado_ars exige además el rol Dependiente (docs/FARMACIA_ARS_FRONTEND.md §3.1.2).
                const puedeEditarMonto = esBorrador && puedeEditar && esDependiente
                return (
                  <tr key={linea.id}>
                    <td style={{ minWidth: 200 }}>{linea.itemName ?? linea.item}</td>
                    <td style={{ textAlign: 'right' }}>{linea.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(linea.precioUnitario)}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(linea.precioLinea)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {puedeEditarMonto ? (
                        <input
                          className="items-input"
                          type="number"
                          min="0"
                          max={linea.precioLinea}
                          step="0.01"
                          value={round2(edit.montoAprobadoArs)}
                          onChange={(e) =>
                            setEditValues((prev) => ({ ...prev, [linea.id]: { ...edit, montoAprobadoArs: parseFloat(e.target.value) || 0 } }))
                          }
                          onBlur={() => {
                            if (edit.montoAprobadoArs === linea.montoAprobadoArs && edit.lineaBloqueada === linea.lineaBloqueada) return
                            updateLineMutation.mutate({ lineId: linea.id, montoAprobadoArs: edit.montoAprobadoArs, lineaBloqueada: edit.lineaBloqueada })
                          }}
                          style={{ textAlign: 'right' }}
                          title={esDependiente ? undefined : 'Solo el rol Dependiente puede editar este monto'}
                        />
                      ) : (
                        formatDOP(linea.montoAprobadoArs)
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(linea.montoPaciente)}</td>
                    {esBorrador && (
                      <td>
                        <input
                          type="checkbox"
                          disabled={!puedeEditarMonto}
                          checked={edit.lineaBloqueada}
                          onChange={(e) => {
                            const next = { ...edit, lineaBloqueada: e.target.checked }
                            setEditValues((prev) => ({ ...prev, [linea.id]: next }))
                            updateLineMutation.mutate({ lineId: linea.id, montoAprobadoArs: next.montoAprobadoArs, lineaBloqueada: next.lineaBloqueada })
                          }}
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {preaprobacion.estado === 'Despachado' && (
        <p className="ff-hint" style={{ marginTop: 12 }}>
          Esta preaprobación ya tiene un despacho creado — consúltalo desde la pantalla de Despachos ARS.
        </p>
      )}
    </div>
  )
}
