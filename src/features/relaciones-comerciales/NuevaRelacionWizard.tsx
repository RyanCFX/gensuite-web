import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { Modal } from '@/shared/ui/Modal'
import { Permitido } from '@/components/shared/Permitido'
import { isApiErrorCode } from '@/shared/api/client'
import { buscarEmpresaPorRnc, crearInvitacionRelacion } from '@/shared/api/relaciones'
import type { BuscarEmpresaRelacionResponse, CrearInvitacionRelacionDto, EmpresaDirectorioRelacion, TerminosComercialesDto } from '@/shared/api/types'
import { TerminosComercialesFields } from './TerminosComercialesFields'
import { AvisoAdopcionMaestros } from './shared'

interface NuevaRelacionWizardProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface EmpresaSeleccionada {
  tenantDestinoId: string
  nombreEmpresa: string
  rnc?: string
}

const TERMINOS_VACIOS: TerminosComercialesDto = {}

// RNC dominicano: 9 dígitos, con o sin guiones. Solo valida FORMATO — el dígito verificador lo
// valida el backend y puede rechazar con 400 igual (se muestra ese error tal cual).
function isValidRncFormat(input: string): boolean {
  const trimmed = input.trim()
  if (!/^[\d-]+$/.test(trimmed)) return false
  return trimmed.replace(/-/g, '').length === 9
}

function normalizeRnc(input: string): string {
  return input.replace(/-/g, '').trim()
}

export function NuevaRelacionWizard({ open, onClose, onSuccess }: NuevaRelacionWizardProps) {
  const queryClient = useQueryClient()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [rnc, setRnc] = useState('')
  const [rncError, setRncError] = useState('')
  const [searchResult, setSearchResult] = useState<BuscarEmpresaRelacionResponse | null>(null)
  const [selected, setSelected] = useState<EmpresaSeleccionada | null>(null)
  const [terminos, setTerminos] = useState<TerminosComercialesDto>(TERMINOS_VACIOS)
  const [mensaje, setMensaje] = useState('')

  function resetState() {
    setStep(1)
    setRnc('')
    setRncError('')
    setSearchResult(null)
    setSelected(null)
    setTerminos(TERMINOS_VACIOS)
    setMensaje('')
  }

  function handleClose() {
    resetState()
    onClose()
  }

  const buscarMutation = useMutation({
    mutationFn: (rncBuscado: string) => buscarEmpresaPorRnc(rncBuscado),
    onSuccess: (data) => setSearchResult(data),
    onError: (err) => {
      // 429: nunca mostrar el número de intentos ni el tiempo de espera exacto que mande el backend.
      if ((err as { statusCode?: number })?.statusCode === 429) {
        toast.error('Demasiadas búsquedas, intenta en un momento')
        return
      }
      toast.error((err as { message?: string })?.message ?? 'Error al buscar la empresa')
    },
  })

  const crearMutation = useMutation({
    mutationFn: (dto: CrearInvitacionRelacionDto) => crearInvitacionRelacion(dto),
    onSuccess: () => {
      toast.success('Invitación enviada')
      queryClient.invalidateQueries({ queryKey: ['invitaciones-relacion'] })
      onSuccess()
      handleClose()
    },
    onError: (err) => {
      const statusCode = (err as { statusCode?: number })?.statusCode
      const message = (err as { message?: string })?.message
      if (isApiErrorCode(err, 'RELACION_BLOQUEADA')) {
        toast.error('Esta empresa no está aceptando solicitudes de relación comercial.')
      } else if (isApiErrorCode(err, 'RELACION_YA_EXISTE')) {
        toast.error('Ya existe una relación comercial activa con esta empresa.')
      } else if (isApiErrorCode(err, 'INVITACION_PENDIENTE')) {
        toast.error('Ya hay una invitación pendiente entre ambas empresas.')
      } else if (isApiErrorCode(err, 'TENANT_SIN_CUENTA_SERVICIO')) {
        toast.error(message ?? 'Error al enviar la invitación')
      } else if (statusCode === 404) {
        toast.error('Empresa no encontrada.')
      } else if (statusCode === 400) {
        // El backend no distingue con un `code` entre "es la propia empresa" y "término inválido"
        // — ambos son 400 sin código. Se relaya `message` tal cual (cubre el caso del término,
        // que debe nombrar el campo) y solo se cae al texto sugerido si el backend no mandó nada.
        toast.error(message ?? 'No puede relacionarse con su propia empresa.')
      } else {
        toast.error(message ?? 'Error al enviar la invitación')
      }
    },
  })

  function handleBuscar() {
    setRncError('')
    setSearchResult(null)
    if (!isValidRncFormat(rnc)) {
      setRncError('Ingresa un RNC válido de 9 dígitos (con o sin guiones).')
      return
    }
    buscarMutation.mutate(normalizeRnc(rnc))
  }

  function handleSeleccionar(empresa: EmpresaDirectorioRelacion) {
    setSelected({ tenantDestinoId: empresa.tenantId, nombreEmpresa: empresa.nombre, rnc: empresa.rnc })
    setStep(2)
  }

  function handleEnviar() {
    if (!selected) return
    crearMutation.mutate({
      tenantDestinoId: selected.tenantDestinoId,
      mensaje: mensaje.trim() || undefined,
      terminos,
    })
  }

  const footer = (
    <>
      {step === 1 && (
        <button type="button" className="btn btn-secondary btn-size-sm" onClick={handleClose}>Cancelar</button>
      )}
      {step === 2 && (
        <>
          <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setStep(1)}>Atrás</button>
          <button type="button" className="btn btn-navy btn-size-sm" onClick={() => setStep(3)}>Siguiente</button>
        </>
      )}
      {step === 3 && (
        <>
          <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setStep(2)} disabled={crearMutation.isPending}>Atrás</button>
          <Permitido accion="relaciones.invitacion.crear">
            <button type="button" className="btn btn-navy btn-size-sm" onClick={handleEnviar} disabled={crearMutation.isPending}>
              {crearMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Enviar invitación'}
            </button>
          </Permitido>
        </>
      )}
    </>
  )

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nueva relación comercial"
      subtitle={`Paso ${step} de 3`}
      size="lg"
      footer={footer}
    >
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Permitido
            accion="relaciones.directorio.buscar"
            fallback={<p className="ff-hint">No tienes permiso para buscar empresas en el directorio.</p>}
          >
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="wizard-rnc">RNC de la empresa</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="wizard-rnc"
                  type="text"
                  className={`ff-input${rncError ? ' ff-input-error' : ''}`}
                  placeholder="131234567 o 131-23456-7"
                  value={rnc}
                  onChange={(e) => { setRnc(e.target.value); setRncError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleBuscar() }}
                />
                <button
                  type="button"
                  className="btn btn-navy btn-size-sm"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={handleBuscar}
                  disabled={buscarMutation.isPending}
                >
                  {buscarMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : <Search size={14} />}
                  {' '}Buscar
                </button>
              </div>
              {rncError && <p className="ff-error">{rncError}</p>}
            </div>

            {searchResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResult.enGenSuite ? (
                  searchResult.empresas.length === 0 ? (
                    <p className="ff-hint">No se encontró ninguna empresa con ese RNC.</p>
                  ) : (
                    searchResult.empresas.map((empresa) => (
                      <div key={empresa.tenantId} className="card" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{empresa.nombre}</div>
                            <div className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{empresa.rnc}</div>
                          </div>
                          {empresa.puedeInvitar ? (
                            <Permitido accion="relaciones.invitacion.crear">
                              <button type="button" className="btn btn-navy btn-size-sm" onClick={() => handleSeleccionar(empresa)}>
                                Invitar
                              </button>
                            </Permitido>
                          ) : (
                            <span className="td-muted" style={{ fontSize: 12, maxWidth: 240, textAlign: 'right' }}>
                              {empresa.motivoNoInvitable}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )
                ) : searchResult.padronDgii ? (
                  <p className="ff-hint">
                    Esta empresa existe pero no usa GenSuite todavía — <strong>{searchResult.padronDgii.nombre}</strong>.
                  </p>
                ) : (
                  <p className="ff-hint">No se encontró ninguna empresa con ese RNC.</p>
                )}

                <AvisoAdopcionMaestros maestrosLocales={searchResult.maestrosLocales} />
              </div>
            )}
          </Permitido>
        </div>
      )}

      {step === 2 && selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="inline-alert inline-alert-info">
            Invitando a <strong>{selected.nombreEmpresa}</strong>{selected.rnc ? ` (RNC ${selected.rnc})` : ''}
          </div>

          <div className="ff-wrap">
            <label className="ff-label" htmlFor="wizard-mensaje">Mensaje (opcional)</label>
            <textarea
              id="wizard-mensaje"
              className="ff-textarea"
              rows={3}
              maxLength={500}
              placeholder="Ej. Somos su distribuidor desde 2019, formalicemos el canal."
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
            />
          </div>

          <TerminosComercialesFields value={terminos} onChange={setTerminos} />
        </div>
      )}

      {step === 3 && selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="detail-field">
            <span className="detail-label">Empresa</span>
            <span className="detail-value">{selected.nombreEmpresa}{selected.rnc ? ` — RNC ${selected.rnc}` : ''}</span>
          </div>
          {mensaje.trim() && (
            <div className="detail-field">
              <span className="detail-label">Mensaje</span>
              <span className="detail-value" style={{ fontWeight: 400 }}>{mensaje}</span>
            </div>
          )}
          <AvisoAdopcionMaestros maestrosLocales={searchResult?.maestrosLocales} />
          <p className="ff-hint" style={{ margin: 0 }}>
            Al confirmar se enviará una invitación a esta empresa con los términos comerciales indicados.
          </p>
        </div>
      )}
    </Modal>
  )
}
