import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { verifyAdminPin } from '@/shared/api/auth'
import { Loader2, Shield, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface PinModalProps {
  open: boolean
  onClose: () => void
  onAuthorized: (userId: string) => void
  title?: string
  description?: string
}

export function PinModal({ open, onClose, onAuthorized, title, description }: PinModalProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', ''])
  const [authorizedUser, setAuthorizedUser] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const verifyMutation = useMutation({
    mutationFn: (pin: string) => verifyAdminPin(pin),
    onSuccess: (res) => {
      const userId = (res as any)?.userId ?? 'Administrador'
      setAuthorizedUser(userId)
      toast.success(`Autorizado por ${userId}`)
      setTimeout(() => { onAuthorized(userId); reset() }, 800)
    },
    onError: () => {
      toast.error('PIN inválido')
      setDigits(['', '', '', ''])
      inputRefs.current[0]?.focus()
    },
  })

  function reset() {
    setDigits(['', '', '', ''])
    setAuthorizedUser(null)
  }

  function handleDigitChange(idx: number, value: string) {
    if (!/^\d?$/.test(value)) return
    const newDigits = [...digits]
    newDigits[idx] = value
    setDigits(newDigits)
    if (value && idx < 3) inputRefs.current[idx + 1]?.focus()
    if (idx === 3 && value) {
      const pin = newDigits.join('')
      if (pin.length === 4) verifyMutation.mutate(pin)
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) inputRefs.current[idx - 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    const newDigits = text.split('').concat(['', '', '', '']).slice(0, 4)
    setDigits(newDigits)
    if (text.length === 4) verifyMutation.mutate(text)
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
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{description ?? 'Ingresa el PIN de administrador para continuar'}</p>
              </div>
              <div style={{ display: 'flex', gap: 12 }} onPaste={handlePaste}>
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
                      width: 48, height: 56, textAlign: 'center', fontSize: 22,
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
