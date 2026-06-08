# Validadores DGII para el Frontend

## `src/lib/validators/dgii.ts`

```typescript
/**
 * Valida un RNC (Registro Nacional de Contribuyentes) dominicano.
 * 9 dígitos. Algoritmo DGII con módulo 11.
 */
export function validateRNC(value: string): boolean {
  const clean = value.replace(/[-\s]/g, '')
  if (!/^\d{9}$/.test(clean)) return false

  const weights = [7, 9, 8, 6, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + parseInt(clean[i]) * w, 0)
  const remainder = sum % 11

  let check: number
  if (remainder === 0 || remainder === 10) check = 2
  else if (remainder === 1) check = 1
  else check = 11 - remainder

  return check === parseInt(clean[8])
}

/**
 * Valida una cédula dominicana (JCE).
 * 11 dígitos. Algoritmo módulo 10 con pesos alternos [1,2].
 */
export function validateCedula(value: string): boolean {
  const clean = value.replace(/[-\s]/g, '')
  if (!/^\d{11}$/.test(clean)) return false

  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2]
  let sum = 0
  for (let i = 0; i < 10; i++) {
    let prod = parseInt(clean[i]) * weights[i]
    if (prod >= 10) prod = Math.floor(prod / 10) + (prod % 10)
    sum += prod
  }
  const check = (10 - (sum % 10)) % 10
  return check === parseInt(clean[10])
}

/**
 * Valida el formato de un NCF (Número de Comprobante Fiscal).
 * Formato: [B|E] + 10 dígitos
 */
export function validateNCFFormat(value: string): boolean {
  return /^[BE]\d{10}$/.test(value)
}

/**
 * Formatea un RNC para mostrar (con guiones, solo visual)
 * 130123456 → 1-30-12345-6
 */
export function formatRNC(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 9)
  if (clean.length <= 1) return clean
  if (clean.length <= 3) return `${clean[0]}-${clean.slice(1)}`
  if (clean.length <= 8) return `${clean[0]}-${clean.slice(1, 3)}-${clean.slice(3)}`
  return `${clean[0]}-${clean.slice(1, 3)}-${clean.slice(3, 8)}-${clean[8]}`
}

/**
 * Formatea una cédula para mostrar (con guiones, solo visual)
 * 00100100100 → 001-0010010-0
 */
export function formatCedula(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 11)
  if (clean.length <= 3) return clean
  if (clean.length <= 10) return `${clean.slice(0, 3)}-${clean.slice(3)}`
  return `${clean.slice(0, 3)}-${clean.slice(3, 10)}-${clean[10]}`
}
```

## Integración con Zod + React Hook Form

```typescript
// src/lib/validators/schemas.ts
import { z } from 'zod'
import { validateRNC, validateCedula } from './dgii'

export const rncSchema = z
  .string()
  .min(1, 'RNC requerido')
  .regex(/^\d{9}$/, 'El RNC debe tener 9 dígitos')
  .refine(validateRNC, 'RNC inválido (dígito verificador incorrecto)')

export const cedulaSchema = z
  .string()
  .min(1, 'Cédula requerida')
  .regex(/^\d{11}$/, 'La cédula debe tener 11 dígitos')
  .refine(validateCedula, 'Cédula inválida (dígito verificador incorrecto)')

// Esquema de cliente
export const createCustomerSchema = z.object({
  customerName: z.string().min(1, 'Nombre requerido').max(255),
  customerType: z.enum(['Company', 'Individual']),
  rnc: z.string().optional().refine(
    (v) => !v || validateRNC(v),
    'RNC inválido'
  ),
  cedula: z.string().optional().refine(
    (v) => !v || validateCedula(v),
    'Cédula inválida'
  ),
  hasCredit: z.boolean().default(false),
  creditLimit: z.number().min(0).optional(),
  creditDays: z.number().min(0).default(0),
  emailInvoice: z.string().email('Email inválido').optional().or(z.literal('')),
}).refine(
  (data) => {
    if (data.customerType === 'Company' && !data.rnc) return false
    if (data.customerType === 'Individual' && !data.cedula) return false
    return true
  },
  {
    message: 'Las empresas deben tener RNC; las personas deben tener cédula',
    path: ['customerType'],
  }
)
```

## Componente de Input con Validación en Tiempo Real

```tsx
// src/components/forms/RNCInput.tsx
import { useFormContext } from 'react-hook-form'
import { validateRNC, formatRNC } from '../../lib/validators/dgii'

export const RNCInput = ({ name = 'rnc', label = 'RNC' }) => {
  const { register, watch, formState: { errors } } = useFormContext()
  const value = watch(name) ?? ''
  const isValid = value.length === 9 && validateRNC(value)

  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          {...register(name)}
          placeholder="000000000"
          maxLength={9}
          className="w-full border rounded px-3 py-2"
          onChange={(e) => {
            // Solo permitir dígitos
            e.target.value = e.target.value.replace(/\D/g, '')
          }}
        />
        {value.length === 9 && (
          <span className={`absolute right-2 top-2 ${isValid ? 'text-green-500' : 'text-red-500'}`}>
            {isValid ? '✓' : '✗'}
          </span>
        )}
      </div>
      {errors[name] && (
        <p className="text-red-500 text-xs mt-1">{errors[name]?.message as string}</p>
      )}
    </div>
  )
}
```
