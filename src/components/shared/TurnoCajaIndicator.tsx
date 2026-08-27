import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock, Lock } from 'lucide-react'
import { getFacturacionConfig } from '@/shared/api/config'
import { listCajas } from '@/shared/api/cajas'
import {
  getTurnoActual,
  abrirTurno,
} from '@/shared/api/pos'
import type { ApiError } from '@/shared/api/types'
import { formatDateTime } from '@/lib/formatters'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { CerrarTurnoModal } from '@/components/shared/CerrarTurnoModal'

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
    staleTime: 5 * 60_000,
  })

  const usaModuloPos = facturacionConfig?.usaModuloPos ?? false

  const { data: turno } = useQuery({
    queryKey: ['turno-actual'],
    queryFn: getTurnoActual,
    enabled: usaModuloPos,
    staleTime: 30_000,
  })

  const { data: cajas } = useQuery({
    queryKey: ['cajas'],
    queryFn: listCajas,
    enabled: usaModuloPos && modalOpen,
    staleTime: 30_000,
  })
  const cajasHabilitadas = (cajas ?? []).filter((c) => !c.disabled)
  const posProfileOptions: SearchSelectOption[] = cajasHabilitadas
    .filter((c) => !posProfileSearch || c.label.toLowerCase().includes(posProfileSearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.label }))

  // Preselecciona la caja por defecto del usuario en cuanto se cargan las opciones.
  useEffect(() => {
    if (!modalOpen || posProfile || !cajas) return
    const userDefault = cajas.find((c) => c.isUserDefault && !c.disabled)
    if (userDefault) setPosProfile(userDefault.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, cajas])

  const abrirMutation = useMutation({
    mutationFn: () => abrirTurno({ openingAmount, posProfile: posProfile || undefined }),
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

  function openModal() {
    setOpeningAmount(0)
    setPosProfile('')
    setModalOpen(true)
  }

  return (
    <>
      {turno ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="badge badge-success"
            title={`Perfil: ${turno.posProfile}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
            }}
          >
            <Clock size={12} /> Turno abierto —{' '}
            {formatDateTime(turno.periodStartDate).split(' ')[1]}
          </span>
          <button
            className="btn btn-ghost btn-size-sm"
            onClick={() => setCierreModalOpen(true)}
          >
            <Lock size={14} /> Cerrar turno
          </button>
        </div>
      ) : (
        <button className="btn btn-secondary btn-size-sm" onClick={openModal}>
          <Clock size={14} /> Abrir turno
        </button>
      )}

      {/* Modal: abrir turno */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
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
              <button
                className="modal-close"
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div
              className="modal-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div className="ff-wrap">
                <label className="ff-label">Caja</label>
                <SearchSelect
                  value={posProfile}
                  onChange={setPosProfile}
                  options={posProfileOptions}
                  onSearch={setPosProfileSearch}
                  selectedLabel={cajasHabilitadas.find((c) => c.id === posProfile)?.label ?? ''}
                  placeholder="Usar la caja default del tenant"
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">
                  Monto de efectivo de apertura
                </label>
                <p className="ff-hint" style={{ marginTop: 4 }}>
                  Efectivo físico con el que se abre el turno. Se asociará
                  automáticamente al método de pago de Caja configurado.
                </p>
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