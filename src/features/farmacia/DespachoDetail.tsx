import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { downloadDespachoPdf, getDespacho, getPreaprobacion } from '@/shared/api/farmacia'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft } from 'lucide-react'
import { PdfFormatButton } from '@/components/shared/PdfFormatButton'
import { Permitido } from '@/components/shared/Permitido'
import type { DespachoEstado, FormatoImpresion } from '@/shared/api/types'

const ESTADO_BADGE: Record<DespachoEstado, string> = {
  Confirmado: 'badge-draft',
  Cobrado: 'badge-submitted',
  Facturado: 'badge-info',
}

export default function DespachoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [descargando, setDescargando] = useState(false)

  const { data: despacho, isLoading } = useQuery({
    queryKey: ['farmacia-despacho', id],
    queryFn: () => getDespacho(id!),
    enabled: !!id,
  })

  // La respuesta de GET /farmacia/despachos/:id no está documentada en openapi.json — si no
  // trae ya resueltos aseguradora/cliente/numeroAprobacion/carnetAfiliado, se completan pidiendo
  // la preaprobación origen (siempre existe, es requerida al crear el despacho).
  const necesitaEnriquecer = !!despacho && (!despacho.aseguradoraName || !despacho.clienteName || !despacho.numeroAprobacion)
  const { data: preaprobacion } = useQuery({
    queryKey: ['farmacia-preaprobacion', despacho?.preaprobacion],
    queryFn: () => getPreaprobacion(despacho!.preaprobacion),
    enabled: necesitaEnriquecer,
  })

  if (isLoading || !despacho) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 220, height: 24, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 220, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  async function handleDescargarPdf(formato: FormatoImpresion) {
    if (!id || formato === 'pos') return
    setDescargando(true)
    try {
      await downloadDespachoPdf(id, formato)
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Error al descargar el PDF')
    } finally {
      setDescargando(false)
    }
  }

  const aseguradoraLabel = despacho.aseguradoraName ?? despacho.aseguradora ?? preaprobacion?.aseguradoraName ?? preaprobacion?.aseguradora
  const clienteLabel = despacho.clienteName ?? despacho.cliente ?? preaprobacion?.clienteName ?? preaprobacion?.cliente
  const numeroAprobacion = despacho.numeroAprobacion ?? preaprobacion?.numeroAprobacion
  const carnetAfiliado = despacho.carnetAfiliado ?? preaprobacion?.carnetAfiliado

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/farmacia/despachos')}>
            <ArrowLeft size={14} /> Despachos ARS
          </a>
          <h1 className="page-title">
            {despacho.id}{' '}
            <span className={`badge ${ESTADO_BADGE[despacho.estado] ?? 'badge-neutral'}`}>{despacho.estado}</span>
          </h1>
        </div>
        {despacho.estado !== 'Confirmado' && (
          <Permitido accion="farmacia.despachos.imprimir">
            <PdfFormatButton
              onSelect={handleDescargarPdf}
              loading={descargando}
              formatosPermitidos={['a4', 'carta', 'a6']}
            />
          </Permitido>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Información General</h2>
        </div>
        <div className="card-body">
          <div className="form-row form-row-3">
            <div className="ff-wrap">
              <label className="ff-label">ARS</label>
              <p>{aseguradoraLabel ?? '—'}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Paciente</label>
              <p>{clienteLabel ?? '—'}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">N.º de autorización</label>
              <p>{numeroAprobacion ?? '—'}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Carnet de afiliado</label>
              <p>{carnetAfiliado ?? '—'}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Preaprobación origen</label>
              <a className="link" onClick={() => navigate(`/farmacia/preaprobaciones/${despacho.preaprobacion}`)} style={{ cursor: 'pointer' }}>
                {despacho.preaprobacion}
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Montos</h2>
        </div>
        <div className="card-body">
          <div className="form-row form-row-3">
            <div className="ff-wrap">
              <label className="ff-label">Monto ARS</label>
              <p style={{ fontWeight: 600 }}>{formatDOP(despacho.montoArs)}</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Monto a cargo del paciente</label>
              <p style={{ fontWeight: 600 }}>{formatDOP(despacho.montoPaciente)}</p>
            </div>
          </div>
          <p className="ff-hint">
            Estos montos se heredaron de la preaprobación en el momento de crear el despacho y no se
            recalculan aunque la preaprobación cambie después.
          </p>
        </div>
      </div>

      {despacho.estado === 'Confirmado' && (
        <p className="ff-hint" style={{ marginTop: 12 }}>
          Este despacho está esperando cobro — cóbralo desde la Cola de Cobro.
        </p>
      )}
      {despacho.lote && (
        <p className="ff-hint" style={{ marginTop: 12 }}>
          Vinculado al lote de facturación <strong>{despacho.lote}</strong>.
        </p>
      )}
    </div>
  )
}
