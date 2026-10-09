// Panel de administración de Facturación Electrónica (e-CF) — provisioning autoservicio del
// administrador del propio tenant contra Vega. Wizard de 4 pasos:
//   1. Conectar la API Key de Vega   2. Crear el emisor (RNC)
//   3. Subir el certificado de firma  4. Registrar el webhook
//
// Todos los endpoints (/config/ecf/admin/*) exigen el rol "System Manager" en el tenant, validado
// en vivo contra ERPNext → 403 si no lo tiene. El ítem de menú ya se oculta para esos usuarios;
// este componente además degrada con gracia si el backend responde 403.
//
// CONSTANCIA: construido contra la API; las pruebas de integración end-to-end quedan pendientes —
// ningún tenant real tiene todavía una cuenta de Vega conectada ni un certificado cargado. Crear
// el Project en el panel de Vega y conseguir el .p12 firmado son pasos manuales fuera del sistema.

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronDown, Eye, EyeOff, Info, Loader2, Lock, ShieldCheck, Unlink } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { EcfTabs } from '@/shared/ui/EcfTabs'
import { Select, SelectItem } from '@/components/ui/select'
import { ConfirmModal } from '@/shared/ui/Modal'
import { getEcfConfig, getEmpresa } from '@/shared/api/config'
import {
  connectEcfApiKey, createEcfClient, uploadEcfCertificate, registerEcfWebhook,
  getEcfClientByRnc, linkEcfClient, unlinkEcfClient,
} from '@/shared/api/ecf'
import type { ApiError, EcfClient, EcfClientByRncResult, EcfMode } from '@/shared/api/types'
import { validateRNCDetailed, validateCedulaDetailed } from '@/lib/validators/dgii'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import { formatDate, normalizarTelefonoDo } from '@/lib/formatters'
import { PhoneInput } from '@/shared/ui/PhoneInput'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function handleMutationError(err: ApiError) {
  if (err?.statusCode === 403) {
    toast.error('No tienes el rol "System Manager" en esta empresa.')
    return
  }
  toast.error(err?.message ?? 'Ocurrió un error')
}

function expiresSoon(dateStr: string): boolean {
  const d = new Date(dateStr)
  const in30 = new Date()
  in30.setDate(in30.getDate() + 30)
  return d <= in30
}

// ─── Step wrapper ─────────────────────────────────────────────────────────────

interface StepCardProps {
  n: number
  title: string
  hint?: string
  done: boolean
  locked: boolean
  recommended?: boolean
  children: React.ReactNode
}

function StepCard({ n, title, hint, done, locked, recommended, children }: StepCardProps) {
  // null = sin interacción del usuario → se muestra abierto si es el primer paso accionable.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null)
  const open = openOverride ?? (!done && !locked)

  return (
    <div className="card" style={{ opacity: locked ? 0.55 : 1 }}>
      <button
        type="button"
        className="card-header"
        style={{ width: '100%', background: 'none', border: 'none', cursor: locked ? 'default' : 'pointer', textAlign: 'left' }}
        onClick={() => !locked && setOpenOverride(!open)}
        disabled={locked}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden="true"
            style={{
              width: 24, height: 24, borderRadius: '50%', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              background: done ? 'var(--success-bg)' : 'var(--surface-sunken)',
              color: done ? 'var(--success-text)' : 'var(--text-secondary)',
              border: `1px solid ${done ? 'var(--success-border)' : 'var(--border-default)'}`,
            }}
          >
            {done ? <Check size={13} /> : locked ? <Lock size={12} /> : n}
          </span>
          <span className="card-title">{title}</span>
          {recommended && <span className="badge badge-neutral">Recomendado</span>}
          {done && <span className="badge badge-success">Completado</span>}
        </span>
        {!locked && (
          <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
        )}
      </button>
      {open && !locked && (
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {hint && <p className="ff-hint" style={{ margin: 0 }}>{hint}</p>}
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Step 1 — API Key ─────────────────────────────────────────────────────────

function ConnectApiKeyStep({ done, locked }: { done: boolean; locked: boolean }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<EcfMode>('test')
  const [apiKey, setApiKey] = useState('')
  const [show, setShow] = useState(false)

  const mutation = useMutation({
    mutationFn: () => connectEcfApiKey({ mode, apiKey: apiKey.trim() }),
    onSuccess: () => {
      toast.success(`API Key de ${mode === 'live' ? 'Producción' : 'Prueba'} conectada`)
      setApiKey('')
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: handleMutationError,
  })

  return (
    <StepCard
      n={1} title="Conectar la API Key de Vega" done={done} locked={locked}
      hint="El operador ya creó el Project y generó la API Key en el panel de Vega. Aquí solo se pega para que el BFF la valide y la guarde cifrada — nunca se vuelve a mostrar."
    >
      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label">Ambiente</label>
          <Select value={mode} onValueChange={(v) => setMode(v as EcfMode)}>
            <SelectItem value="test">Prueba</SelectItem>
            <SelectItem value="live">Producción</SelectItem>
          </Select>
        </div>
        <div className="ff-wrap" style={{ flex: 2 }}>
          <label className="ff-label">API Key</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="ff-input"
              type={show ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="vega_test_xxxxx_yyyyy"
              autoComplete="off"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-ghost btn-size-icon" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar' : 'Mostrar'}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
      </div>
      <div>
        <button className="btn btn-primary btn-size-sm" onClick={() => mutation.mutate()} disabled={!apiKey.trim() || mutation.isPending}>
          {mutation.isPending ? 'Validando…' : done ? 'Reemplazar API Key' : 'Conectar'}
        </button>
      </div>
    </StepCard>
  )
}

// ─── Step 2 — Emisor (RNC) ────────────────────────────────────────────────────
// Flujo: solo el input de RNC/cédula. Con 9 dígitos se valida el RNC y se consulta en
// Vega (GET /clients/by-rnc/:rnc): si existe se vincula directo —sin elegir de una
// lista—; si no existe se piden los demás datos para crearlo. Con 11 dígitos se valida
// la cédula (persona física).

const RNC_LOOKUP_DEBOUNCE_MS = 800
const RNC_ERROR_DELAY_MS = 3000

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '').slice(0, 11)
}

function VegaClientCard({ c }: { c: EcfClient }) {
  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--font-body)' }}>{c.rnc}</strong>
        <span>{c.legalName}</span>
        {c.activeEnv && <span className="badge badge-neutral">{c.activeEnv}</span>}
      </span>
      <span style={{ color: 'var(--text-tertiary)' }}>
        Etapa de certificación: {c.certificationStage ?? '—'}
      </span>
      {c.hasCertificate ? (
        <span className="badge badge-success" style={{ alignSelf: 'flex-start' }}>
          Certificado ✔{c.certificateExpiresAt ? ` — vence el ${formatDate(String(c.certificateExpiresAt))}` : ''}
        </span>
      ) : (
        <span className="badge badge-neutral" style={{ alignSelf: 'flex-start' }}>Sin certificado — lo subirás en el paso 3</span>
      )}
    </div>
  )
}

function EmisorLookup({
  company, companyRnc, onLookupChange,
}: {
  company: string
  companyRnc?: string | null
  onLookupChange?: (r: EcfClientByRncResult | null) => void
}) {
  const qc = useQueryClient()
  const [doc, setDoc] = useState(() => onlyDigits(companyRnc ?? ''))
  const [touched, setTouched] = useState(false)
  const [conflict, setConflict] = useState<{ id: string; rnc: string; legalName: string } | null>(null)
  const [rncErrorVisible, setRncErrorVisible] = useState(false)
  const [lookupArmed, setLookupArmed] = useState(false)

  // Prellena con el RNC de la empresa si lo tiene configurado.
  useEffect(() => {
    if (!touched && companyRnc && !doc) setDoc(onlyDigits(companyRnc))
  }, [companyRnc, touched, doc])

  const digits = doc
  const isNine = digits.length === 9
  const isEleven = digits.length === 11
  const rncValid = isNine ? validateRNCDetailed(digits).valid : false
  const cedulaCheck = isEleven ? validateCedulaDetailed(digits) : null

  // Un RNC de 9 dígitos inválido no muestra error de inmediato — podría ser una cédula
  // en curso (11 dígitos). Solo se muestra si pasan 3s sin escribir más o si sale del campo.
  useEffect(() => {
    if (!(digits.length === 9 && !rncValid)) {
      setRncErrorVisible(false)
      return
    }
    const t = setTimeout(() => setRncErrorVisible(true), RNC_ERROR_DELAY_MS)
    return () => clearTimeout(t)
  }, [digits, rncValid])

  // Espera un poco antes de consultar en Vega por si sigue escribiendo la cédula.
  useEffect(() => {
    setLookupArmed(false)
    if (!(digits.length === 9 && rncValid)) return
    const t = setTimeout(() => setLookupArmed(true), RNC_LOOKUP_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [digits, rncValid])

  // El conflicto es del RNC anterior — se limpia al seguir escribiendo.
  useEffect(() => {
    setConflict(null)
  }, [digits])

  const lookupQuery = useQuery({
    queryKey: ['ecf-client-by-rnc', digits],
    queryFn: () => getEcfClientByRnc(digits),
    enabled: lookupArmed && digits.length === 9 && rncValid,
    staleTime: 60_000,
  })
  const lookup = lookupArmed && digits.length === 9 && rncValid ? lookupQuery.data ?? null : null

  useEffect(() => {
    onLookupChange?.(lookup)
  }, [lookup, onLookupChange])

  const linkMutation = useMutation({
    mutationFn: (vegaClientId: string) => linkEcfClient({ company: company.trim(), vegaClientId }),
    onSuccess: () => {
      toast.success('Emisor vinculado a la compañía')
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: handleMutationError,
  })

  const lookupError = lookupQuery.error as ApiError | null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!company && (
        <div className="inline-alert inline-alert-warn">
          <Info size={15} style={{ flexShrink: 0 }} />
          <span>No hay una empresa configurada para e-CF. Configúrala antes de crear o vincular el emisor.</span>
        </div>
      )}
      <div className="ff-wrap">
        <label className="ff-label" htmlFor="ecf-emisor-doc">
          RNC o cédula del emisor <span className="ff-required">*</span>
        </label>
        <input
          id="ecf-emisor-doc"
          className={`ff-input${(rncErrorVisible || (cedulaCheck && !cedulaCheck.valid)) ? ' ff-input-error' : ''}`}
          value={doc}
          inputMode="numeric"
          maxLength={11}
          placeholder="101012345 (RNC) u 00112345678 (cédula)"
          onChange={(e) => { setTouched(true); setDoc(onlyDigits(e.target.value)) }}
          onBlur={() => { if (digits.length === 9 && !rncValid) setRncErrorVisible(true) }}
        />
        {rncErrorVisible ? (
          <p className="ff-hint" style={{ color: 'var(--color-error)' }}>
            {validateRNCDetailed(digits).reason ?? 'RNC no válido.'} Si es persona física, continúa con los 11 dígitos de la cédula.
          </p>
        ) : cedulaCheck && !cedulaCheck.valid ? (
          <p className="ff-hint" style={{ color: 'var(--color-error)' }}>Cédula no válida: {cedulaCheck.reason}</p>
        ) : (
          <p className="ff-hint">9 dígitos = RNC · 11 dígitos = cédula (persona física).</p>
        )}
      </div>

      {isNine && rncValid && lookupQuery.isLoading && (
        <p className="ff-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Consultando en Vega…
        </p>
      )}

      {isNine && rncValid && lookup?.exists && lookup.client && (
        <>
          <VegaClientCard c={lookup.client} />
          <div>
            <button
              className="btn btn-primary btn-size-sm"
              onClick={() => linkMutation.mutate(lookup.client!.id)}
              disabled={!company.trim() || linkMutation.isPending}
            >
              {linkMutation.isPending ? 'Vinculando…' : 'Vincular este emisor'}
            </button>
          </div>
        </>
      )}

      {isNine && rncValid && lookup && !lookup.exists && (
        <>
          <div className="inline-alert inline-alert-info" style={{ alignItems: 'flex-start' }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Aún no tienes cliente en Vega, créalo.</span>
          </div>
          {conflict ? (
            <ConflictLinkPrompt
              conflict={conflict}
              company={company}
              onLinked={() => { setConflict(null); qc.invalidateQueries({ queryKey: ['ecf-config'] }) }}
              onDismiss={() => setConflict(null)}
            />
          ) : (
            <CreateClientForm company={company} rnc={digits} onConflict={setConflict} />
          )}
        </>
      )}

      {isNine && rncValid && lookupError && (
        <>
          <div className="inline-alert inline-alert-warn" style={{ alignItems: 'flex-start' }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>No se pudo consultar en Vega ({lookupError.message ?? 'error de conexión'}). Puedes completar los datos para crearlo de todos modos.</span>
          </div>
          {conflict ? (
            <ConflictLinkPrompt
              conflict={conflict}
              company={company}
              onLinked={() => { setConflict(null); qc.invalidateQueries({ queryKey: ['ecf-config'] }) }}
              onDismiss={() => setConflict(null)}
            />
          ) : (
            <CreateClientForm company={company} rnc={digits} onConflict={setConflict} />
          )}
        </>
      )}

      {isEleven && cedulaCheck?.valid && (
        <>
          <p className="ff-hint" style={{ margin: 0 }}>
            Persona física — completa los datos para crear el emisor con esta cédula.
          </p>
          {conflict ? (
            <ConflictLinkPrompt
              conflict={conflict}
              company={company}
              onLinked={() => { setConflict(null); qc.invalidateQueries({ queryKey: ['ecf-config'] }) }}
              onDismiss={() => setConflict(null)}
            />
          ) : (
            <CreateClientForm company={company} rnc={digits} onConflict={setConflict} />
          )}
        </>
      )}
    </div>
  )
}

function CreateClientForm({
  company, rnc, onConflict,
}: {
  company: string
  /** RNC/cédula ya validado en el paso — viene del input de arriba, no se edita aquí. */
  rnc: string
  onConflict: (info: { id: string; rnc: string; legalName: string }) => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    legalName: '', tradeName: '', address: '',
    municipality: '', province: '', email: '', economicActivity: '',
  })
  const [phones, setPhones] = useState<string[]>([''])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => createEcfClient({
      company: company.trim(),
      rnc,
      legalName: form.legalName.trim(),
      tradeName: form.tradeName.trim() || undefined,
      address: form.address.trim(),
      municipality: form.municipality.trim() || undefined,
      province: form.province.trim() || undefined,
      email: form.email.trim() || undefined,
      economicActivity: form.economicActivity.trim() || undefined,
      phones: phones.map((p) => normalizarTelefonoDo(p)).filter(Boolean).slice(0, 3),
    }),
    onSuccess: () => {
      toast.success('Emisor (RNC) creado en Vega')
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        const existingClientId = err.details?.existingClientId as string | undefined
        if (existingClientId) {
          onConflict({ id: existingClientId, rnc, legalName: form.legalName.trim() })
          return
        }
        toast.error(err?.message ?? 'Ya existe un emisor conectado para esta compañía.')
        qc.invalidateQueries({ queryKey: ['ecf-config'] })
        return
      }
      handleMutationError(err)
    },
  })

  const canSubmit = company.trim() && rnc && form.legalName.trim() && form.address.trim()

  return (
    <>
      <p className="ff-hint" style={{ margin: 0 }}>
        El emisor se registra para la empresa <strong>{company || '—'}</strong> con RNC/cédula{' '}
        <strong style={{ fontFamily: 'var(--font-body)' }}>{rnc}</strong>.
      </p>
      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label">Razón social <span className="ff-required">*</span></label>
          <input className="ff-input" value={form.legalName} onChange={set('legalName')} />
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Nombre comercial</label>
          <input className="ff-input" value={form.tradeName} onChange={set('tradeName')} />
        </div>
      </div>
      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label">Correo</label>
          <input className="ff-input" value={form.email} onChange={set('email')} />
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Actividad económica</label>
          <input className="ff-input" value={form.economicActivity} onChange={set('economicActivity')} />
        </div>
      </div>
      <div className="ff-wrap">
        <label className="ff-label">Dirección <span className="ff-required">*</span></label>
        <input className="ff-input" value={form.address} onChange={set('address')} placeholder="Calle Principal #1, Santo Domingo" />
      </div>
      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label">Municipio</label>
          <input className="ff-input" value={form.municipality} onChange={set('municipality')} />
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Provincia</label>
          <input className="ff-input" value={form.province} onChange={set('province')} />
        </div>
      </div>
      <div className="ff-wrap">
        <label className="ff-label">Teléfonos <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(máx. 3)</span></label>
        {phones.map((p, i) => (
          <PhoneInput
            key={i}
            style={{ marginBottom: 6 }}
            value={p}
            onChange={(v) => setPhones((prev) => prev.map((x, j) => (j === i ? v : x)))}
          />
        ))}
        {phones.length < 3 && (
          <button type="button" className="btn btn-ghost btn-size-xs" onClick={() => setPhones((p) => [...p, ''])}>
            + Agregar teléfono
          </button>
        )}
      </div>
      <div>
        <button className="btn btn-primary btn-size-sm" onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending ? 'Creando…' : 'Crear emisor'}
        </button>
      </div>
    </>
  )
}

// Se muestra cuando POST /clients devuelve 409 con `details.existingClientId` — el RNC ya
// existe en Vega y se ofrece vincularlo en vez de reintentar la creación.
function ConflictLinkPrompt({
  conflict, company, onLinked, onDismiss,
}: {
  conflict: { id: string; rnc: string; legalName: string }
  company: string
  onLinked: () => void
  onDismiss: () => void
}) {
  const linkMutation = useMutation({
    mutationFn: () => linkEcfClient({ company: company.trim(), vegaClientId: conflict.id }),
    onSuccess: () => {
      toast.success('Emisor vinculado a la compañía')
      onLinked()
    },
    onError: handleMutationError,
  })

  return (
    <div className="inline-alert inline-alert-warn" style={{ alignItems: 'flex-start' }}>
      <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span>
          Este RNC (<strong>{conflict.rnc}</strong>) ya existe en Vega
          {conflict.legalName ? <> como «{conflict.legalName}»</> : null}.
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-size-sm" onClick={() => linkMutation.mutate()} disabled={linkMutation.isPending}>
            {linkMutation.isPending ? 'Vinculando…' : 'Vincular ese emisor'}
          </button>
          <button className="btn btn-ghost btn-size-sm" onClick={onDismiss} disabled={linkMutation.isPending}>
            Volver al formulario
          </button>
        </span>
      </span>
    </div>
  )
}

// "Desvincular" — DELETE /config/ecf/admin/clients/{company}. Rompe el puente local (Company ↔
// Client de Vega) sin tocar nada en Vega — se usa cuando el vegaClientId guardado quedó apuntando
// a un Client que ya no existe allá ("Cliente no encontrado" al intentar emitir un e-CF).
function UnlinkClientButton({ company, rnc }: { company: string; rnc: string }) {
  const qc = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => unlinkEcfClient(company),
    onSuccess: (res) => {
      toast.success(res.message)
      setConfirmOpen(false)
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
      qc.invalidateQueries({ queryKey: ['ecf-clients'] })
    },
    onError: (err: ApiError) => {
      setConfirmOpen(false)
      // 404 = ya estaba desvinculado (doble-click, estado desincronizado) — no-op benigno,
      // simplemente refrescar para que la UI se corrija sola.
      if (err?.statusCode === 404) {
        qc.invalidateQueries({ queryKey: ['ecf-config'] })
        qc.invalidateQueries({ queryKey: ['ecf-clients'] })
        return
      }
      handleMutationError(err)
    },
  })

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-size-sm"
        style={{ color: 'var(--warning-text)' }}
        onClick={() => setConfirmOpen(true)}
      >
        <Unlink size={14} /> Desvincular
      </button>
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => mutation.mutate()}
        title={`Desvincular emisor de ${company}`}
        description={
          `Esto va a desconectar el emisor (RNC ${rnc}) de esta compañía en el sistema. ` +
          'No se borra nada en Vega — el Client sigue existiendo allá si todavía es válido. ' +
          'Úsalo cuando el sistema no puede emitir comprobantes porque la conexión con Vega quedó rota ' +
          '(por ejemplo, si el mensaje de error menciona "Cliente no encontrado"). Después de desvincular ' +
          'vas a poder volver a conectar el emisor correcto.'
        }
        confirmLabel="Desvincular"
        variant="danger"
        loading={mutation.isPending}
      />
    </>
  )
}

function CreateClientStep({
  done, locked, defaultCompany, companyRnc, existing, onLookupChange,
}: {
  done: boolean
  locked: boolean
  defaultCompany: string
  companyRnc?: string | null
  existing?: { company: string; rnc: string; certificateExpiresAt?: string | null; certificationStage?: string | null }
  onLookupChange?: (r: EcfClientByRncResult | null) => void
}) {
  // La Company de ERPNext viene de GET /config/ecf y debe coincidir EXACTAMENTE — se envía
  // automáticamente, el usuario no la edita.
  const company = defaultCompany

  if (done && existing) {
    return (
      <StepCard n={2} title="Crear el emisor (RNC)" done locked={locked}>
        <table className="data-table">
          <tbody>
            <tr><td style={{ fontWeight: 500 }}>Compañía</td><td>{existing.company}</td></tr>
            <tr><td style={{ fontWeight: 500 }}>RNC</td><td>{existing.rnc}</td></tr>
            <tr><td style={{ fontWeight: 500 }}>Etapa de certificación</td><td>{existing.certificationStage ?? '—'}</td></tr>
          </tbody>
        </table>
        <p className="ff-hint" style={{ margin: 0 }}>El emisor ya está conectado. No se puede crear un segundo emisor para la misma compañía.</p>
        <div>
          <UnlinkClientButton company={existing.company} rnc={existing.rnc} />
        </div>
      </StepCard>
    )
  }

  return (
    <StepCard
      n={2} title="Crear el emisor (RNC)" done={done} locked={locked}
      hint="Escribe el RNC del emisor — se valida y se consulta en Vega. Si ya existe allá, lo vinculas directo; si no, completas sus datos para crearlo."
    >
      <EmisorLookup company={company} companyRnc={companyRnc} onLookupChange={onLookupChange} />
    </StepCard>
  )
}

// ─── Step 3 — Certificado ─────────────────────────────────────────────────────

function CertificateStep({
  done, locked, company, expiresAt, vegaSourced,
}: {
  done: boolean
  locked: boolean
  company?: string
  expiresAt?: string | null
  /** El certificado se conoce por el by-rnc de Vega (aún no reflejado en el provisioning). */
  vegaSourced?: boolean
}) {
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [replaceOpen, setReplaceOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const p12Base64 = await fileToBase64(file!)
      return uploadEcfCertificate({ p12Base64, password }, company || undefined)
    },
    onSuccess: (res) => {
      toast.success(`Certificado cargado — vence el ${formatDate(res.certificateExpiresAt)}`)
      setFile(null)
      setPassword('')
      setReplaceOpen(false)
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: handleMutationError,
  })

  // Si Vega ya trae el certificado (by-rnc) o ya está cargado, solo se muestra la info —
  // no se pide subirlo. Reemplazar sigue disponible bajo demanda.
  const hasCert = done || vegaSourced
  const showForm = !hasCert || replaceOpen

  return (
    <StepCard
      n={3} title="Subir el certificado de firma" done={done} locked={locked}
      hint={showForm ? 'Certificado PKCS#12 (.p12 / .pfx) firmado, obtenido en el panel de Vega. Se convierte a base64 en el navegador antes de enviarse.' : undefined}
    >
      {hasCert && (
        <div className={`inline-alert ${expiresAt && expiresSoon(expiresAt) ? 'inline-alert-warn' : 'inline-alert-info'}`}>
          <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>
            {expiresAt ? (
              <>
                Certificado vigente — vence el <strong>{formatDate(expiresAt)}</strong>.
                {expiresSoon(expiresAt) && ' Falta poco para vencer; renuévalo pronto.'}
              </>
            ) : (
              'Vega ya tiene un certificado para este emisor — no necesitas subirlo.'
            )}
          </span>
        </div>
      )}
      {showForm ? (
        <>
          <div className="ff-wrap">
            <label className="ff-label">Archivo del certificado</label>
            <input type="file" accept=".p12,.pfx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Contraseña del certificado</label>
            <input className="ff-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-size-sm" onClick={() => mutation.mutate()} disabled={!file || !password || mutation.isPending}>
              {mutation.isPending ? 'Subiendo…' : done ? 'Reemplazar certificado' : 'Subir certificado'}
            </button>
            {hasCert && (
              <button className="btn btn-ghost btn-size-sm" onClick={() => { setReplaceOpen(false); setFile(null); setPassword('') }}>
                Cancelar
              </button>
            )}
          </div>
        </>
      ) : (
        <div>
          <button className="btn btn-ghost btn-size-sm" onClick={() => setReplaceOpen(true)}>
            Subir un certificado diferente
          </button>
        </div>
      )}
    </StepCard>
  )
}

// ─── Step 4 — Webhook ─────────────────────────────────────────────────────────

function WebhookStep({ locked, activeMode }: { locked: boolean; activeMode: EcfMode | null }) {
  const [registered, setRegistered] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () => registerEcfWebhook({ mode: activeMode ?? undefined }),
    onSuccess: (res) => {
      setRegistered(res.url)
      toast.success('Webhook registrado ✓')
    },
    onError: handleMutationError,
  })

  return (
    <StepCard
      n={4} title="Registrar el webhook" done={!!registered} locked={locked} recommended
      hint="Le dice a Vega a qué URL avisar cuando cambie el estado de un comprobante. La ruta receptora del BFF llega en la próxima fase — por ahora solo se verifica que la llamada no falle."
    >
      {registered && (
        <div className="inline-alert inline-alert-success">
          <Check size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>Webhook registrado: <code>{registered}</code></span>
        </div>
      )}
      <div>
        <button className="btn btn-primary btn-size-sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Registrando…' : 'Registrar webhook'}
        </button>
      </div>
    </StepCard>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EcfAdminPage() {
  const isSystemManager = useIsSystemManager()
  const { data, isLoading } = useQuery({ queryKey: ['ecf-config'], queryFn: getEcfConfig })
  const { data: empresa } = useQuery({ queryKey: ['empresa'], queryFn: getEmpresa, enabled: isSystemManager })
  // Resultado del by-rnc del paso 2 — para no pedir el certificado en el paso 3 si Vega ya
  // lo tiene. Solo vale mientras el paso 2 no esté completado (después manda el provisioning).
  const [vegaLookup, setVegaLookup] = useState<EcfClientByRncResult | null>(null)

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader overline="Facturación Electrónica" title="Avanzado" />
        <EcfTabs />
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <span className="empty-icon" aria-hidden="true" style={{ fontSize: 24 }}>🔒</span>
          <p className="empty-title">No tienes acceso a esta sección</p>
          <p className="empty-sub">La administración de Facturación Electrónica requiere el rol «System Manager» en esta empresa.</p>
        </div>
      </div>
    )
  }

  const prov = data?.provisioning
  const cliente = prov?.clientes?.[0]

  const step1Done = !!(prov?.hasApiKeyTest || prov?.hasApiKeyLive)
  const step2Done = (prov?.clientes?.length ?? 0) > 0
  const lookupCert = !step2Done ? vegaLookup?.client : undefined
  const step3Done = !!cliente?.certificateExpiresAt || !!lookupCert?.hasCertificate
  const activeMode: EcfMode | null = prov?.activeMode ?? null

  return (
    <div className="page-container">
      <PageHeader
        overline="Facturación Electrónica"
        title={<><span className="page-title-dot" />Avanzado</>}
        description="Conexión de esta empresa con Vega — provisioning de Facturación Electrónica"
        action={
          <>
            <RecargarButton label="Actualizar" />
            <Link className="btn btn-ghost btn-size-sm" to="/config/ecf"><ShieldCheck size={14} /> Ir a Administración</Link>
          </>
        }
      />
      <EcfTabs />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {isLoading ? (
          <span className="skeleton-box" style={{ height: 320, display: 'block' }} />
        ) : (
          <>
            <ConnectApiKeyStep done={step1Done} locked={false} />
            <CreateClientStep
              done={step2Done}
              locked={!step1Done}
              defaultCompany={data?.company ?? ''}
              companyRnc={empresa?.rnc}
              existing={cliente}
              onLookupChange={setVegaLookup}
            />
            <CertificateStep
              done={step3Done}
              locked={!step2Done}
              company={data?.company ?? undefined}
              expiresAt={cliente?.certificateExpiresAt ?? lookupCert?.certificateExpiresAt ?? null}
              vegaSourced={!cliente?.certificateExpiresAt && !!lookupCert?.hasCertificate}
            />
            <WebhookStep locked={!step3Done} activeMode={activeMode} />

            {step1Done && step2Done && step3Done && (
              <div className="inline-alert inline-alert-success">
                <Check size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span>
                  Provisioning completo. Ya puedes activar el toggle <strong>Habilitar facturación electrónica</strong>{' '}
                  en <Link to="/config/ecf">Facturación Electrónica → Administración</Link>.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
