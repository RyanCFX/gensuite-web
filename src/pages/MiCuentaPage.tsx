// Autoservicio de identidad global — docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §5.3, §7,
// §8.4. Distinto de Configuración → Mi Perfil (/config/perfil, fuera del alcance de este
// documento — sigue siendo el perfil de ERPNext del tenant activo). Acá vive lo que es de la
// PERSONA, no del tenant: nombre/apellido/teléfono (únicas manos que pueden tocarlos, §6.6),
// contraseña, 2FA, y cuentas de Google vinculadas.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Download, Plus, ShieldCheck, Smartphone, Mail, Trash2, KeyRound, User, Link2 } from 'lucide-react'
import {
  getMeProfile, patchMeProfile, changeMyPassword,
  listMyMfaFactors, enrollTotp, confirmTotp, enableEmailMfa, deleteMfaFactor,
  listMyIdentities, unlinkIdentity,
} from '@/shared/api/me'
import { isApiError } from '@/shared/api/auth'
import { useAuthStore } from '@/stores/auth.store'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmModal } from '@/shared/ui/Modal'
import { formatDate } from '@/lib/formatters'
import type { MfaFactor, ApiError } from '@/shared/api/types'

function apiMessage(err: unknown, fallback: string): string {
  return isApiError(err) ? err.message : fallback
}

export default function MiCuentaPage() {
  return (
    <div className="page-container">
      <PageHeader title="Mi cuenta" description="Tu identidad global — un solo login para todas las empresas a las que perteneces." />
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PerfilCard />
        <PasswordCard />
        <MfaCard />
        <IdentitiesCard />
      </div>
    </div>
  )
}

// ─── §7.1 — GET/PATCH /me/profile ────────────────────────────────────────────
function PerfilCard() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['me-profile'], queryFn: getMeProfile })
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [loaded, setLoaded] = useState(false)

  if (data && !loaded) {
    setFirstName(data.firstName)
    setLastName(data.lastName)
    setPhone(data.phone ?? '')
    setLoaded(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => patchMeProfile({ firstName, lastName, phone: phone || undefined }),
    onSuccess: () => {
      toast.success('Perfil actualizado')
      queryClient.invalidateQueries({ queryKey: ['me-profile'] })
    },
    onError: (err) => toast.error(apiMessage(err, 'Error al guardar el perfil')),
  })

  if (isLoading) return <div className="skeleton-box" style={{ height: 220 }} />

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={16} /> Perfil
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="ff-wrap">
          <label className="ff-label">Correo electrónico</label>
          <input className="ff-input" value={data?.email ?? ''} disabled />
        </div>
        <div className="form-row">
          <div className="ff-wrap">
            <label className="ff-label ff-required">Nombre</label>
            <input className="ff-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Apellido</label>
            <input className="ff-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Teléfono</label>
          <input className="ff-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="809-555-0100" />
        </div>
        <p className="ff-hint">
          Este cambio se aplica en todas las empresas a las que perteneces — no hace falta repetirlo por tenant.
        </p>
        {data && data.tenants.length > 0 && (
          <div className="ff-wrap">
            <label className="ff-label">Empresas</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.tenants.map((t) => (
                <div key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                  <span className="badge badge-neutral" style={{ fontSize: 10 }}>{t.status}</span>
                  {t.isDefault && <span className="badge badge-info" style={{ fontSize: 10 }}>Por defecto</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px' }}>
        <button className="btn btn-primary" disabled={saveMutation.isPending || !firstName.trim()} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

// ─── §7.2 — POST /me/password (revoca todas las sesiones, incluida la actual) ──────────────
function PasswordCard() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => changeMyPassword({ currentPassword, newPassword }),
    onSuccess: async (result) => {
      toast.success(result.message)
      // §7.2 — revoca TODAS las sesiones (incluida la actual). No intentar seguir usándola.
      await logout()
      navigate('/login', { replace: true })
    },
    onError: (err) => toast.error(apiMessage(err, 'Error al cambiar la contraseña')),
  })

  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={16} /> Contraseña
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="ff-wrap">
          <label className="ff-label ff-required">Contraseña actual</label>
          <input type="password" className="ff-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="form-row">
          <div className="ff-wrap">
            <label className="ff-label ff-required">Nueva contraseña</label>
            <input type="password" className="ff-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Confirmar</label>
            <input type="password" className="ff-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <p className="ff-hint">Al cambiarla, se cierran todas tus sesiones activas (incluida esta) — tendrás que volver a iniciar sesión.</p>
      </div>
      <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px' }}>
        <button className="btn btn-primary" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </div>
    </div>
  )
}

// ─── §5.3 — 2FA ───────────────────────────────────────────────────────────────
function MfaCard() {
  const queryClient = useQueryClient()
  const { data: factors, isLoading } = useQuery({ queryKey: ['my-mfa-factors'], queryFn: listMyMfaFactors })
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [toDelete, setToDelete] = useState<MfaFactor | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-mfa-factors'] })

  const emailMutation = useMutation({
    mutationFn: () => enableEmailMfa(),
    onSuccess: () => { toast.success('2FA por correo activado'); invalidate() },
    onError: (err) => toast.error(apiMessage(err, 'Error al activar 2FA por correo')),
  })

  const deleteMutation = useMutation({
    mutationFn: (factorId: string) => deleteMfaFactor(factorId),
    onSuccess: () => { toast.success('Factor eliminado'); invalidate(); setToDelete(null) },
    onError: (err) => toast.error(apiMessage(err, 'Error al eliminar el factor')),
  })

  const hasEmailFactor = (factors ?? []).some((f) => f.type === 'email')

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={16} /> Verificación en dos pasos (2FA)
        </span>
        <button className="btn btn-navy btn-size-sm" onClick={() => setEnrollOpen(true)}>
          <Plus size={14} /> Agregar autenticador
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isLoading ? (
          <div className="skeleton-box" style={{ height: 80 }} />
        ) : (factors ?? []).length === 0 ? (
          <p className="ff-hint" style={{ margin: 0 }}>No tienes ningún factor de 2FA configurado — tu cuenta solo pide contraseña al iniciar sesión.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Etiqueta</th>
                <th>Estado</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {(factors ?? []).map((f) => (
                <tr key={f.id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {f.type === 'totp' ? <Smartphone size={14} /> : <Mail size={14} />}
                    {f.type === 'totp' ? 'Autenticador' : 'Correo'}
                  </td>
                  <td>{f.label ?? '—'}</td>
                  <td>
                    {f.confirmed ? <span className="badge badge-success">Confirmado</span> : <span className="badge badge-warning">Pendiente de confirmar</span>}
                    {f.isPreferred && <span className="badge badge-info" style={{ marginLeft: 6 }}>Por defecto</span>}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-size-icon-sm" onClick={() => setToDelete(f)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!hasEmailFactor && (
          <button className="btn btn-secondary btn-size-sm" style={{ alignSelf: 'flex-start' }} disabled={emailMutation.isPending} onClick={() => emailMutation.mutate()}>
            <Mail size={14} /> {emailMutation.isPending ? 'Activando…' : 'Activar 2FA por correo'}
          </button>
        )}
      </div>

      {enrollOpen && <TotpEnrollModal onClose={() => { setEnrollOpen(false); invalidate() }} />}

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
        title="¿Eliminar este factor de 2FA?"
        description={toDelete?.isPreferred && (factors ?? []).length === 1 ? 'Es tu único factor activo — al eliminarlo, tu cuenta queda sin 2FA.' : 'Ya no se pedirá este factor al iniciar sesión.'}
        confirmLabel="Eliminar"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

// §5.3.2/§5.3.3 — alta de TOTP en 2 pasos: QR+secreto, luego confirmar con un código real.
// `recoveryCodes` viene UNA sola vez en la confirmación — la pantalla exige un checkbox
// explícito antes de poder cerrar, nunca un toast/modal que se cierre solo.
function TotpEnrollModal({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState('')
  const [enrolled, setEnrolled] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [savedConfirmed, setSavedConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enrollMutation = useMutation({
    mutationFn: () => enrollTotp(label || undefined),
    onSuccess: (result) => setEnrolled(result),
    onError: (err: ApiError) => setError(apiMessage(err, 'Error al iniciar el alta de TOTP')),
  })

  const confirmMutation = useMutation({
    mutationFn: () => confirmTotp({ code: code.trim() }),
    onSuccess: (result) => setRecoveryCodes(result.recoveryCodes),
    onError: (err: ApiError) => setError(apiMessage(err, 'Código inválido')),
  })

  function copyAll() {
    if (!recoveryCodes) return
    navigator.clipboard.writeText(recoveryCodes.join('\n'))
    toast.success('Códigos copiados')
  }

  function downloadAll() {
    if (!recoveryCodes) return
    const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'codigos-recuperacion-gensuite.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Pantalla final: no se cierra por click afuera ni por Escape hasta confirmar que se guardaron.
  if (recoveryCodes) {
    return (
      <div className="modal-overlay">
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title">Guarda tus códigos de recuperación</h2>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="inline-alert inline-alert-warn">
              Esta es la ÚNICA vez que se muestran estos códigos — no se pueden volver a pedir. Si pierdes tu
              teléfono Y estos códigos, no hay forma de recuperar el acceso a tu cuenta.
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--surface-sunken)',
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 16,
            }}>
              {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-size-sm" onClick={copyAll}><Copy size={14} /> Copiar todos</button>
              <button type="button" className="btn btn-secondary btn-size-sm" onClick={downloadAll}><Download size={14} /> Descargar .txt</button>
            </div>
            <label className="ff-check-wrap" style={{ marginTop: 8 }}>
              <input type="checkbox" className="ff-check" checked={savedConfirmed} onChange={(e) => setSavedConfirmed(e.target.checked)} />
              Ya guardé estos códigos en un lugar seguro
            </label>
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" disabled={!savedConfirmed} onClick={onClose}>Listo</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Agregar autenticador</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div className="auth-server-error" role="alert">{error}</div>}

          {!enrolled ? (
            <>
              <div className="ff-wrap">
                <label className="ff-label">Etiqueta (opcional)</label>
                <input className="ff-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mi iPhone" />
              </div>
              <button type="button" className="btn btn-primary" disabled={enrollMutation.isPending} onClick={() => enrollMutation.mutate()}>
                {enrollMutation.isPending ? 'Generando…' : 'Generar código QR'}
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <QRCodeSVG value={enrolled.otpauthUrl} size={160} level="M" />
              </div>
              <p className="ff-hint" style={{ margin: 0, textAlign: 'center' }}>
                Escanea con Google Authenticator, Microsoft Authenticator o cualquier app compatible.
              </p>
              <div className="ff-wrap">
                <label className="ff-label">O ingresa este código manualmente</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="ff-input" value={enrolled.secret} disabled style={{ fontFamily: 'var(--font-mono)' }} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-size-sm"
                    onClick={() => { navigator.clipboard.writeText(enrolled.secret); toast.success('Copiado') }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Código de 6 dígitos</label>
                <input className="ff-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={confirmMutation.isPending || code.trim().length < 6}
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending ? 'Confirmando…' : 'Confirmar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── §8.4 — Cuentas de Google vinculadas ────────────────────────────────────
function IdentitiesCard() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['my-identities'], queryFn: listMyIdentities })
  const [toUnlink, setToUnlink] = useState<string | null>(null)

  const unlinkMutation = useMutation({
    mutationFn: (identityId: string) => unlinkIdentity(identityId),
    onSuccess: () => {
      toast.success('Cuenta desvinculada')
      queryClient.invalidateQueries({ queryKey: ['my-identities'] })
      setToUnlink(null)
    },
    onError: (err) => toast.error(apiMessage(err, 'Error al desvincular la cuenta')),
  })

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={16} /> Cuentas vinculadas
        </span>
      </div>
      <div className="card-body">
        {isLoading ? (
          <div className="skeleton-box" style={{ height: 60 }} />
        ) : (data ?? []).length === 0 ? (
          <p className="ff-hint" style={{ margin: 0 }}>
            No tienes ninguna cuenta de Google vinculada — se vincula sola la primera vez que uses
            "Continuar con Google" en el login, si el correo coincide con el de esta cuenta.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data ?? []).map((id) => (
              <div key={id.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Google — {id.emailAtLink} <span className="td-muted">(vinculada el {formatDate(id.linkedAt)})</span></span>
                <button className="btn btn-ghost btn-size-sm" onClick={() => setToUnlink(id.id)}>Desvincular</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!toUnlink}
        onClose={() => setToUnlink(null)}
        onConfirm={() => toUnlink && unlinkMutation.mutate(toUnlink)}
        title="¿Desvincular esta cuenta de Google?"
        description="Ya no podrás usar 'Continuar con Google' con este correo — se re-vincularía sola si lo usas de nuevo."
        confirmLabel="Desvincular"
        loading={unlinkMutation.isPending}
      />
    </div>
  )
}
