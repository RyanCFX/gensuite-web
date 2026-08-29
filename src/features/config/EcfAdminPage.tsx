// Panel de administración de Facturación Electrónica (e-CF) — provisioning autoservicio del
// administrador del propio tenant contra Aura. Wizard de 4 pasos:
//   1. Conectar la API Key de Aura   2. Crear el emisor (RNC)
//   3. Subir el certificado de firma  4. Registrar el webhook
//
// Todos los endpoints (/config/ecf/admin/*) exigen el rol "System Manager" en el tenant, validado
// en vivo contra ERPNext → 403 si no lo tiene. El ítem de menú ya se oculta para esos usuarios;
// este componente además degrada con gracia si el backend responde 403.
//
// CONSTANCIA: construido contra la API; las pruebas de integración end-to-end quedan pendientes —
// ningún tenant real tiene todavía una cuenta de Aura conectada ni un certificado cargado. Crear
// el Project en el panel de Aura y conseguir el .p12 firmado son pasos manuales fuera del sistema.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronDown, Eye, EyeOff, Info, Lock, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Select, SelectItem } from '@/components/ui/select'
import { getEcfConfig } from '@/shared/api/config'
import {
  connectEcfApiKey, createEcfClient, uploadEcfCertificate, registerEcfWebhook,
} from '@/shared/api/ecf'
import type { ApiError, EcfMode } from '@/shared/api/types'
import { useAuthStore } from '@/stores/auth.store'
import { formatDate } from '@/lib/formatters'

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
    toast.error('No tienes el rol "System Manager" en este tenant.')
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
      n={1} title="Conectar la API Key de Aura" done={done} locked={locked}
      hint="El operador ya creó el Project y generó la API Key en el panel de Aura. Aquí solo se pega para que el BFF la valide y la guarde cifrada — nunca se vuelve a mostrar."
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
              placeholder="aura_test_xxxxx_yyyyy"
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

function CreateClientStep({
  done, locked, defaultCompany, existing,
}: {
  done: boolean
  locked: boolean
  defaultCompany: string
  existing?: { company: string; rnc: string; certificateExpiresAt?: string | null; certificationStage?: string | null }
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    rnc: '', legalName: '', tradeName: '', address: '',
    municipality: '', province: '', email: '', economicActivity: '',
  })
  const [phones, setPhones] = useState<string[]>([''])

  // La Company de ERPNext viene de GET /config/ecf y debe coincidir EXACTAMENTE — se envía
  // automáticamente, el usuario no la edita.
  const company = defaultCompany

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => createEcfClient({
      company: company.trim(),
      rnc: form.rnc.trim(),
      legalName: form.legalName.trim(),
      tradeName: form.tradeName.trim() || undefined,
      address: form.address.trim(),
      municipality: form.municipality.trim() || undefined,
      province: form.province.trim() || undefined,
      email: form.email.trim() || undefined,
      economicActivity: form.economicActivity.trim() || undefined,
      phones: phones.map((p) => p.trim()).filter(Boolean).slice(0, 3),
    }),
    onSuccess: () => {
      toast.success('Emisor (RNC) creado en Aura')
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error('Ya existe un emisor conectado para esta compañía.')
        qc.invalidateQueries({ queryKey: ['ecf-config'] })
        return
      }
      handleMutationError(err)
    },
  })

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
      </StepCard>
    )
  }

  const canSubmit = company.trim() && form.rnc.trim() && form.legalName.trim() && form.address.trim()

  return (
    <StepCard
      n={2} title="Crear el emisor (RNC)" done={done} locked={locked}
      hint="Crea el «Client» en Aura — el RNC bajo el cual se emiten los comprobantes."
    >
      {company
        ? (
            <p className="ff-hint" style={{ margin: 0 }}>
              El emisor se registra para la empresa <strong>{company}</strong>.
            </p>
          )
        : (
            <div className="inline-alert inline-alert-warn">
              <Info size={15} style={{ flexShrink: 0 }} />
              <span>No hay una empresa configurada para e-CF. Configúrala antes de crear el emisor.</span>
            </div>
          )}
      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label">RNC <span className="ff-required">*</span></label>
          <input className="ff-input" value={form.rnc} onChange={set('rnc')} placeholder="101012345" />
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Razón social <span className="ff-required">*</span></label>
          <input className="ff-input" value={form.legalName} onChange={set('legalName')} />
        </div>
      </div>
      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label">Nombre comercial</label>
          <input className="ff-input" value={form.tradeName} onChange={set('tradeName')} />
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Correo</label>
          <input className="ff-input" value={form.email} onChange={set('email')} />
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
        <label className="ff-label">Actividad económica</label>
        <input className="ff-input" value={form.economicActivity} onChange={set('economicActivity')} />
      </div>
      <div className="ff-wrap">
        <label className="ff-label">Teléfonos <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(máx. 3)</span></label>
        {phones.map((p, i) => (
          <input
            key={i}
            className="ff-input"
            style={{ marginBottom: 6 }}
            value={p}
            onChange={(e) => setPhones((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
            placeholder="8095551234"
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
    </StepCard>
  )
}

// ─── Step 3 — Certificado ─────────────────────────────────────────────────────

function CertificateStep({
  done, locked, company, expiresAt,
}: { done: boolean; locked: boolean; company?: string; expiresAt?: string | null }) {
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const p12Base64 = await fileToBase64(file!)
      return uploadEcfCertificate({ p12Base64, password }, company || undefined)
    },
    onSuccess: (res) => {
      toast.success(`Certificado cargado — vence el ${formatDate(res.certificateExpiresAt)}`)
      setFile(null)
      setPassword('')
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: handleMutationError,
  })

  return (
    <StepCard
      n={3} title="Subir el certificado de firma" done={done} locked={locked}
      hint="Certificado PKCS#12 (.p12 / .pfx) firmado, obtenido en el panel de Aura. Se convierte a base64 en el navegador antes de enviarse."
    >
      {done && expiresAt && (
        <div className={`inline-alert ${expiresSoon(expiresAt) ? 'inline-alert-warn' : 'inline-alert-info'}`}>
          <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>
            Certificado vigente — vence el <strong>{formatDate(expiresAt)}</strong>.
            {expiresSoon(expiresAt) && ' Falta poco para vencer; renuévalo pronto.'}
          </span>
        </div>
      )}
      <div className="ff-wrap">
        <label className="ff-label">Archivo del certificado</label>
        <input type="file" accept=".p12,.pfx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="ff-wrap">
        <label className="ff-label">Contraseña del certificado</label>
        <input className="ff-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <button className="btn btn-primary btn-size-sm" onClick={() => mutation.mutate()} disabled={!file || !password || mutation.isPending}>
          {mutation.isPending ? 'Subiendo…' : done ? 'Reemplazar certificado' : 'Subir certificado'}
        </button>
      </div>
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
      hint="Le dice a Aura a qué URL avisar cuando cambie el estado de un comprobante. La ruta receptora del BFF llega en la próxima fase — por ahora solo se verifica que la llamada no falle."
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
  const isSystemManager = useAuthStore((s) => s.user?.roles?.includes('System Manager') ?? false)
  const { data, isLoading } = useQuery({ queryKey: ['ecf-config'], queryFn: getEcfConfig })

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader overline="Facturación Electrónica" title="Avanzado" />
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <span className="empty-icon" aria-hidden="true" style={{ fontSize: 24 }}>🔒</span>
          <p className="empty-title">No tienes acceso a esta sección</p>
          <p className="empty-sub">La administración de Facturación Electrónica requiere el rol «System Manager» en este tenant.</p>
        </div>
      </div>
    )
  }

  const prov = data?.provisioning
  const cliente = prov?.clientes?.[0]

  const step1Done = !!(prov?.hasApiKeyTest || prov?.hasApiKeyLive)
  const step2Done = (prov?.clientes?.length ?? 0) > 0
  const step3Done = !!cliente?.certificateExpiresAt
  const activeMode: EcfMode | null = prov?.activeMode ?? null

  return (
    <div className="page-container">
      <PageHeader
        overline="Facturación Electrónica"
        title="Avanzado"
        description="Conexión de este tenant con Aura — provisioning de Facturación Electrónica"
        action={<Link className="btn btn-ghost btn-size-sm" to="/config/ecf"><ShieldCheck size={14} /> Ir a Administración</Link>}
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="inline-alert inline-alert-info" style={{ alignItems: 'flex-start' }}>
          <Info size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Pantalla de <strong>setup único</strong>, más técnica que la configuración general. Requiere que el
            operador ya tenga el RNC certificado y el archivo <code>.p12</code> firmado (proceso que se hace en el
            panel de Aura, no aquí). <strong>Las pruebas end-to-end siguen pendientes</strong>: ningún tenant real
            tiene todavía una cuenta de Aura conectada.
          </span>
        </div>

        {isLoading ? (
          <span className="skeleton-box" style={{ height: 320, display: 'block' }} />
        ) : (
          <>
            <ConnectApiKeyStep done={step1Done} locked={false} />
            <CreateClientStep
              done={step2Done}
              locked={!step1Done}
              defaultCompany={data?.company ?? ''}
              existing={cliente}
            />
            <CertificateStep
              done={step3Done}
              locked={!step2Done}
              company={data?.company ?? undefined}
              expiresAt={cliente?.certificateExpiresAt}
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
