import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getCuenta, createCuenta, updateCuenta } from '@/shared/api/cuentas'
import type { CreateCuentaDto, UpdateCuentaDto } from '@/shared/api/types'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

const ACCOUNT_TYPES = [
  'Bank',
  'Cash',
  'Credit Card',
  'Chargeable',
  'Stock',
  'Fixed Asset',
  'Tax',
  'Payable',
  'Receivable',
  'Equity',
  'Expense Account',
  'Expense Included In Asset Valuation',
  'Expense Included In Valuation',
  'Income Account',
  'Temporary',
] as const

const CURRENCIES = ['DOP', 'USD', 'EUR'] as const

const ROOT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'] as const

const ROOT_TYPE_LABELS: Record<(typeof ROOT_TYPES)[number], string> = {
  Asset: 'Activo',
  Liability: 'Pasivo',
  Equity: 'Patrimonio',
  Income: 'Ingreso',
  Expense: 'Gasto',
}

interface FormState {
  accountName: string
  accountNumber: string
  parentAccount: string
  accountType: string
  currency: string
  isGroup: boolean
  disabled: boolean
  isRootAccount: boolean
  rootType: string
}

const EMPTY_FORM: FormState = {
  accountName: '',
  accountNumber: '',
  parentAccount: '',
  accountType: '',
  currency: 'DOP',
  isGroup: false,
  disabled: false,
  isRootAccount: false,
  rootType: '',
}

export default function CuentaForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const { data: cuenta, isLoading } = useQuery({
    queryKey: ['cuenta', id],
    queryFn: () => getCuenta(decodeURIComponent(id!)),
    enabled: isEdit,
  })

  // Detect if account has GL movements (locked fields)
  const hasMovements = isEdit && cuenta ? (cuenta.debit + cuenta.credit) > 0 : false

  useEffect(() => {
    if (cuenta) {
      setForm({
        accountName: cuenta.accountName,
        accountNumber: cuenta.accountNumber ?? '',
        parentAccount: cuenta.parentAccount ?? '',
        accountType: cuenta.accountType ?? '',
        currency: cuenta.currency,
        isGroup: cuenta.isGroup,
        disabled: cuenta.disabled,
      })
    }
  }, [cuenta])

  const createMutation = useMutation({
    mutationFn: (data: CreateCuentaDto) => createCuenta(data),
    onSuccess: (data) => {
      toast.success('Cuenta creada correctamente')
      queryClient.invalidateQueries({ queryKey: ['cuentas'] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-tree'] })
      navigate(`/cuentas/${encodeURIComponent(data.id)}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al crear la cuenta')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCuentaDto) => updateCuenta(decodeURIComponent(id!), data),
    onSuccess: () => {
      toast.success('Cuenta actualizada correctamente')
      queryClient.invalidateQueries({ queryKey: ['cuentas'] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-tree'] })
      queryClient.invalidateQueries({ queryKey: ['cuenta', id] })
      navigate(`/cuentas/${id}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al actualizar la cuenta')
    },
  })

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormState, string>> = {}
    if (!form.accountName.trim()) newErrors.accountName = 'El nombre es requerido'
    if (!isEdit) {
      if (form.isRootAccount) {
        if (!form.rootType) newErrors.rootType = 'El tipo raíz es requerido'
      } else if (!form.parentAccount) {
        newErrors.parentAccount = 'La cuenta padre es requerida'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    if (isEdit) {
      const payload: UpdateCuentaDto = {
        accountName: form.accountName,
        accountNumber: form.accountNumber || undefined,
        disabled: form.disabled,
      }
      if (!hasMovements) {
        payload.accountType = form.accountType || undefined
        payload.parentAccount = form.parentAccount || undefined
        payload.currency = form.currency
      }
      updateMutation.mutate(payload)
    } else {
      const payload: CreateCuentaDto = form.isRootAccount
        ? {
            accountName: form.accountName,
            rootType: form.rootType as CreateCuentaDto['rootType'],
            accountNumber: form.accountNumber || undefined,
            accountType: form.accountType || undefined,
            currency: form.currency,
            isGroup: true,
          }
        : {
            accountName: form.accountName,
            parentAccount: form.parentAccount,
            accountNumber: form.accountNumber || undefined,
            accountType: form.accountType || undefined,
            currency: form.currency,
            isGroup: form.isGroup,
          }
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  if (isEdit && isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 160, height: 16, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: 240, height: 28, marginBottom: 24 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 320, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <button className="page-back-link" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Volver
          </button>
          <h1 className="page-title">{isEdit ? 'Editar Cuenta' : 'Nueva Cuenta'}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>

        {/* Warning when account has movements */}
        {hasMovements && (
          <div className="inline-alert inline-alert-warn">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            Esta cuenta tiene movimientos contables. Solo puedes modificar el nombre, número y estado.
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Información de la Cuenta</h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Nombre */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="accountName">
                Nombre de la Cuenta <span className="ff-required">*</span>
              </label>
              <input
                id="accountName"
                className={`ff-input${errors.accountName ? ' ff-input-error' : ''}`}
                placeholder="Ej: Caja General"
                value={form.accountName}
                onChange={(e) => setField('accountName', e.target.value)}
              />
              {errors.accountName && <p className="ff-error">{errors.accountName}</p>}
            </div>

            {/* Número */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="accountNumber">
                Número de Cuenta
              </label>
              <input
                id="accountNumber"
                className="ff-input"
                placeholder="Ej: 1101"
                value={form.accountNumber}
                onChange={(e) => setField('accountNumber', e.target.value)}
              />
            </div>

            {/* Crear cuenta raíz — solo al crear */}
            {!isEdit && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={form.isRootAccount}
                  onChange={(e) => setField('isRootAccount', e.target.checked)}
                />
                Crear cuenta raíz (sin cuenta padre)
              </label>
            )}

            {/* Cuenta Padre */}
            {!form.isRootAccount && (
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="parentAccount">
                  Cuenta Padre {!isEdit && <span className="ff-required">*</span>}
                </label>
                <AccountSelect
                  id="parentAccount"
                  value={form.parentAccount}
                  onChange={(val) => setField('parentAccount', val)}
                  ledgerOnly={false}
                  placeholder="Seleccionar cuenta padre…"
                  error={Boolean(errors.parentAccount)}
                  disabled={hasMovements}
                />
                {errors.parentAccount && <p className="ff-error">{errors.parentAccount}</p>}
              </div>
            )}

            {/* Tipo Raíz — solo al crear cuenta raíz */}
            {!isEdit && form.isRootAccount && (
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="rootType">
                  Tipo Raíz <span className="ff-required">*</span>
                </label>
                <select
                  id="rootType"
                  className={`ff-select${errors.rootType ? ' ff-input-error' : ''}`}
                  value={form.rootType}
                  onChange={(e) => setField('rootType', e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {ROOT_TYPES.map((rt) => (
                    <option key={rt} value={rt}>{ROOT_TYPE_LABELS[rt]}</option>
                  ))}
                </select>
                {errors.rootType && <p className="ff-error">{errors.rootType}</p>}
              </div>
            )}

            {/* Tipo de Cuenta */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="accountType">
                Tipo de Cuenta
              </label>
              <select
                id="accountType"
                className="ff-select"
                value={form.accountType}
                onChange={(e) => setField('accountType', e.target.value)}
                disabled={hasMovements}
              >
                <option value="">— Sin tipo específico —</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Moneda */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="currency">
                Moneda
              </label>
              <select
                id="currency"
                className="ff-select"
                value={form.currency}
                onChange={(e) => setField('currency', e.target.value)}
                disabled={hasMovements}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Es cuenta grupo — only on create, no aplica si es cuenta raíz (siempre es grupo) */}
            {!isEdit && !form.isRootAccount && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={form.isGroup}
                  onChange={(e) => setField('isGroup', e.target.checked)}
                />
                Es cuenta grupo (no acepta transacciones directas)
              </label>
            )}

            {/* Deshabilitada — only on edit */}
            {isEdit && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={form.disabled}
                  onChange={(e) => setField('disabled', e.target.checked)}
                />
                Deshabilitada
              </label>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending
              ? <><span className="spinner spinner-white spinner-sm" /> Guardando…</>
              : isEdit ? 'Guardar Cambios' : 'Crear Cuenta'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
