import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock } from 'lucide-react'
import { getFacturacionConfig } from '@/shared/api/config'
import {
  getTurnoActual,
  abrirTurno,
} from '@/shared/api/pos'
import type { ApiError } from '@/shared/api/types'
import { conSilencio403 } from '@/shared/api/client'
import { formatDateTime } from '@/lib/formatters'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { CerrarTurnoModal } from '@/components/shared/CerrarTurnoModal'
import { useOpcionesArray } from '@/shared/hooks/useOpciones'

export function TurnoCajaIndicator() {
  const queryClient = useQueryClient()

  // ── Apertura de turno ─────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [openingAmount, setOpeningAmount] = useState(0)
  const [posProfile, setPosProfile] = useState('')
  const [posProfileSearch, setPosProfileSearch] = useState('')

  // ── Cierre de turno (turno propio) ──────────────────────────────────────────
  const [cierreModalOpen, setCierreModalOpen] = useState(false)

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
  })

  const usaModuloPos = facturacionConfig?.usaModuloPos ?? false

  const { data: turno, error: turnoError } = useQuery({
    queryKey: ['turno-actual'],
    // 403 = el usuario no tiene acceso a los turnos de caja: no es un error a mostrar (se
    // silencia el toast del interceptor vía `silent403`), simplemente no se ofrece abrir turno.
    queryFn: () => conSilencio403(() => getTurnoActual()),
    enabled: usaModuloPos,
    staleTime: 2 * 60_000,
    retry: (failureCount, err) =>
      (err as unknown as { statusCode?: number } | null)?.statusCode === 403 ? false : failureCount < 1,
    meta: { global: true },
  })

  const { data: cajas } = useOpcionesArray('cajas-pos', { limit: 100, enabled: usaModuloPos && modalOpen})
  const cajasHabilitadas = (cajas ?? []).filter((c) => !c.disabled)
  const posProfileOptions: SearchSelectOption[] = cajasHabilitadas
    .filter((c) => !posProfileSearch || c.label.toLowerCase().includes(posProfileSearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.label }))

  // Caja por defecto del usuario: si tiene una configurada (y habilitada), se preselecciona y el
  // select queda bloqueado — no se puede abrir turno en otra caja.
  const lockedCaja = cajasHabilitadas.find((c) => c.isUserDefault) ?? null

  // Preselecciona la caja por defecto del usuario en cuanto se cargan las opciones.
  useEffect(() => {
    if (!modalOpen || posProfile || !cajas) return
    const userDefault = cajas.find((c) => c.isUserDefault && !c.disabled)
    if (userDefault) setPosProfile(userDefault.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, cajas])

  const abrirMutation = useMutation({
    mutationFn: () => abrirTurno({ openingAmount, posProfile: (lockedCaja?.id ?? posProfile) || undefined }),
    onSuccess: () => {
      toast.success('Turno de caja abierto')
      queryClient.invalidateQueries({ queryKey: ['turno-actual'] })
      setModalOpen(false)
      setOpeningAmount(0)
      setPosProfile('')
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al abrir el turno')
    },
  })

  if (!usaModuloPos) return null

  // Sin acceso a turnos (403 en GET /pos/turnos/actual): sin alerta y sin botón "Abrir turno".
  if ((turnoError as unknown as { statusCode?: number } | null)?.statusCode === 403) return null

  function openModal() {
    setOpeningAmount(0)
    setPosProfile('')
    setModalOpen(true)
  }

  return (
    <>
      {turno ? (
        <button
          className="badge"
          title={`Perfil: ${turno.posProfile} — clic para cerrar turno`}
          onClick={() => setCierreModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            height: 32,
            padding: '0 10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            fontFamily: 'inherit',
            background: 'color-mix(in srgb, #208591 12%, transparent)',
            color: '#208591',
            borderColor: 'color-mix(in srgb, #208591 35%, transparent)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <Clock size={12} /> Turno abierto —{' '}
          {formatDateTime(turno.periodStartDate).split(' ')[1]}
        </button>
      ) : (
        <button className="btn btn-secondary btn-size-sm" onClick={openModal}>
          <Clock size={14} /> Abrir turno
        </button>
      )}

      {/* Modal: abrir turno — no se cierra con click afuera (sin alerta): la única forma de
        salir sin abrir turno es el botón Cancelar. */}
      {modalOpen && (
        <div className="modal-overlay">
          <div
            className="modal-box modal-box-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2
                className="modal-title"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Clock size={16} /> Abrir turno de caja
              </h2>
            </div>
            <div
              className="modal-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div className="ff-wrap">
                <label className="ff-label">Caja</label>
                <SearchSelect
                  value={lockedCaja ? lockedCaja.id : posProfile}
                  onChange={setPosProfile}
                  options={posProfileOptions}
                  onSearch={setPosProfileSearch}
                  selectedLabel={(lockedCaja ?? cajasHabilitadas.find((c) => c.id === posProfile))?.label ?? ''}
                  placeholder="Usar la caja default de la empresa"
                  disabled={!!lockedCaja}
                />
                {lockedCaja && (
                  <p className="ff-hint" style={{ marginTop: 4 }}>
                    Caja por defecto de tu usuario — el select está bloqueado.
                  </p>
                )}
              </div>
              <div className="ff-wrap">
                <label className="ff-label">
                  Monto de efectivo de apertura
                  <FieldTooltip>
                    Efectivo físico con el que se abre el turno. Se asociará
                    automáticamente al método de pago de Caja configurado.
                  </FieldTooltip>
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="ff-input"
                  value={openingAmount}
                  onChange={(e) =>
                    setOpeningAmount(Number(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-secondary"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => abrirMutation.mutate()}
                disabled={openingAmount <= 0 || abrirMutation.isPending}
              >
                {abrirMutation.isPending ? 'Abriendo…' : 'Abrir turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cerrar turno (turno propio o ajeno — reutilizable) */}
      <CerrarTurnoModal
        open={cierreModalOpen}
        openingEntryId={turno?.openingEntryId ?? null}
        turnoLabel="Estás cerrando tu turno de caja."
        onClose={() => setCierreModalOpen(false)}
        onClosed={() => queryClient.invalidateQueries({ queryKey: ['turno-actual'] })}
      />
    </>
  )
}
