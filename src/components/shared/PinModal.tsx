import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { verifyAdminPin } from '@/shared/api/auth'
import { listUsuarios } from '@/shared/api/usuarios'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import type { AdminPinAccion } from '@/shared/api/types'
import { SearchSelect, type SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Loader2, Shield, CheckCircle, ScanLine, X } from 'lucide-react'
import { toast } from 'sonner'

const PIN_LENGTH = 6

interface PinModalProps {
  open: boolean
  onClose: () => void
  onAuthorized: (userId: string) => void
  /** Qué se está autorizando (ver ADMIN_PIN_ACTIONS en el backend) — determina qué rol se le
   *  exige al dueño del PIN. Un valor no reconocido por el backend responde 400. Omite esto y
   *  pasa `onSubmitInline` cuando el backend verifica el PIN dentro del mismo request que se
   *  reintenta (ej. `pinOverride`), en vez de por separado contra /auth/verify-admin-pin. */
  accion?: AdminPinAccion
  /** Alternativa a `accion`/POST-aparte: recibe el pin + identidad y debe reintentar la operación
   *  original con eso embebido (ej. `pinOverride` en el body de POST/PUT). Resuelve si quedó
   *  autorizada; lanza/rechaza si el backend la rechazó por PIN inválido o sin permisos — el modal
   *  muestra el mismo mensaje genérico y deja reintentar sin perder el formulario. */
  onSubmitInline?: (pin: string, identidad: { usuario?: string; codigoTarjeta?: string }) => Promise<void>
  title?: string
  description?: string
}

export function PinModal({ open, onClose, onAuthorized, accion, onSubmitInline, title, description }: PinModalProps) {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [usuario, setUsuario] = useState('')
  const [usuarioLabel, setUsuarioLabel] = useState('')
  const [usuarioQuery, setUsuarioQuery] = useState('')
  const [codigoTarjeta, setCodigoTarjeta] = useState('')
  const [authorizedUser, setAuthorizedUser] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Mientras el modal está abierto y no hay foco en un input (el hook ignora INPUT/TEXTAREA),
  // una lectura de carnet/QR resuelve la identificación sin que el usuario escriba su email.
  useBarcodeScanner({
    enabled: open && !authorizedUser,
    onBarcode: (code) => { setCodigoTarjeta(code); setUsuario(''); setUsuarioLabel('') },
  })

  // Solo miembros activos pueden autorizar — no tiene sentido ofrecer uno revocado/suspendido.
  const { data: usuariosData } = useQuery({
    queryKey: ['usuarios-pin-modal'],
    queryFn: () => listUsuarios({ limit: 100, status: 'accepted' }),
    enabled: open,
    staleTime: 60_000,
  })
  const usuarioOptions: SearchSelectOption[] = (usuariosData?.items ?? [])
    .filter((u) => !usuarioQuery || u.fullName.toLowerCase().includes(usuarioQuery.toLowerCase()) || u.email.toLowerCase().includes(usuarioQuery.toLowerCase()))
    .map((u) => ({ value: u.email, label: u.fullName, sublabel: u.email }))

  const verifyMutation = useMutation({
    mutationFn: async ({ pin, identidad }: { pin: string; identidad: { usuario?: string; codigoTarjeta?: string } }) => {
      if (onSubmitInline) {
        await onSubmitInline(pin, identidad)
        return null
      }
      return verifyAdminPin({ pin, accion: accion!, ...identidad })
    },
    onSuccess: (res) => {
      const userId = res?.userId ?? 'Administrador'
      setAuthorizedUser(userId)
      toast.success(onSubmitInline ? 'Autorizado' : `Autorizado por ${userId}`)
      setTimeout(() => { onAuthorized(userId); reset() }, 800)
    },
    onError: () => {
      // Intencional: el backend no distingue si falló el PIN, el usuario o el permiso — no
      // construir un mensaje más específico que este.
      toast.error('PIN inválido o sin permisos para esta acción')
      setDigits(Array(PIN_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    },
  })

  function reset() {
    setDigits(Array(PIN_LENGTH).fill(''))
    setUsuario('')
    setUsuarioLabel('')
    setCodigoTarjeta('')
    setAuthorizedUser(null)
  }

  /** `identidad` se pasa explícito en vez de leerlo de `usuario`/`codigoTarjeta` — el estado recién
   *  actualizado (ej. justo tras elegir un autorizador en el select) no está disponible todavía en
   *  el closure de esta misma vuelta de evento. */
  function submitIfReady(pin: string, identidad: { usuario?: string; codigoTarjeta?: string }) {
    if (pin.length !== PIN_LENGTH) return
    if (!identidad.codigoTarjeta && !identidad.usuario?.trim()) {
      toast.error('Selecciona el autorizador o escanea tu carnet para continuar')
      return
    }
    verifyMutation.mutate({ pin, identidad })
  }

  // Cubre el caso de escanear el carnet DESPUÉS de completar el PIN (el 6to dígito solo dispara
  // la verificación si en ese momento ya hay usuario/codigoTarjeta) — el caso de elegir el
  // autorizador después se cubre en el onChange del select, no aquí.
  useEffect(() => {
    if (codigoTarjeta) submitIfReady(digits.join(''), { codigoTarjeta })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoTarjeta])

  function handleDigitChange(idx: number, value: string) {
    if (!/^\d?$/.test(value)) return
    const newDigits = [...digits]
    newDigits[idx] = value
    setDigits(newDigits)
    if (value && idx < PIN_LENGTH - 1) inputRefs.current[idx + 1]?.focus()
    if (idx === PIN_LENGTH - 1 && value) submitIfReady(newDigits.join(''), codigoTarjeta ? { codigoTarjeta } : { usuario })
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) inputRefs.current[idx - 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
    const newDigits = text.split('').concat(Array(PIN_LENGTH).fill('')).slice(0, PIN_LENGTH)
    setDigits(newDigits)
    if (text.length === PIN_LENGTH) submitIfReady(text, codigoTarjeta ? { codigoTarjeta } : { usuario })
    else inputRefs.current[text.length]?.focus()
  }

  useEffect(() => { if (open) { reset(); setTimeout(() => inputRefs.current[0]?.focus(), 100) } }, [open])
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <div className="modal-body" style={{ padding: 32 }}>
          {authorizedUser ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <CheckCircle size={40} style={{ color: 'var(--color-success)' }} />
              <p style={{ fontWeight: 600 }}>Autorizado</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{authorizedUser}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <Shield size={36} style={{ color: 'var(--color-brand)' }} />
              <div>
                <p style={{ fontWeight: 600, fontSize: 15 }}>{title ?? 'Autorización requerida'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{description ?? 'Ingresa el PIN de un administrador para continuar'}</p>
              </div>

              <div style={{ width: '100%', textAlign: 'left' }}>
                {codigoTarjeta ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '8px 12px', borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-elevated)', border: '1px solid var(--border-default)',
                  }}>
                    <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ScanLine size={14} /> Carnet: <strong>{codigoTarjeta}</strong>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-sm"
                      style={{ padding: 4 }}
                      onClick={() => setCodigoTarjeta('')}
                      title="Escribir email en su lugar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="ff-label" style={{ fontSize: 12 }}>Autorizador</label>
                    <SearchSelect
                      value={usuario}
                      onChange={(value, option) => {
                        setUsuario(value)
                        setUsuarioLabel(option?.label ?? '')
                        submitIfReady(digits.join(''), { usuario: value })
                      }}
                      options={usuarioOptions}
                      onSearch={setUsuarioQuery}
                      selectedLabel={usuarioLabel}
                      placeholder="Busca por nombre o email…"
                      disabled={verifyMutation.isPending}
                    />
                    <p className="ff-hint" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ScanLine size={12} /> o escanea el carnet del autorizador
                    </p>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }} onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    style={{
                      width: 38, height: 48, textAlign: 'center', fontSize: 20,
                      border: '2px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-elevated)', outline: 'none',
                    }}
                    disabled={verifyMutation.isPending}
                  />
                ))}
              </div>
              {verifyMutation.isPending && <Loader2 size={20} className="spin" />}
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
