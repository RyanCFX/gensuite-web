import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { listCuentas } from '@/shared/api/cuentas'

interface AccountSelectProps {
  value: string
  onChange: (accountId: string) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
  id?: string
  // Filter to specific account type (Income, Expense, Asset, Bank, Cash, etc.)
  accountType?: string
  rootType?: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
  // If true, exclude group accounts (only ledger accounts accept transactions)
  ledgerOnly?: boolean
}

export function AccountSelect({ value, onChange, placeholder = 'Buscar cuenta…', error, disabled, id, accountType, rootType, ledgerOnly = true }: AccountSelectProps) {
  const [query, setQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['accounts-search', query, accountType, rootType],
    queryFn: () => listCuentas({
      search: query || undefined,
      accountType: accountType || undefined,
      rootType: rootType || undefined,
      isGroup: ledgerOnly ? false : undefined,  // exclude groups when ledgerOnly
      limit: 20,
    }),
    staleTime: 30_000,
  })

  const options: SearchSelectOption[] = (data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.accountName,
    sublabel: [c.accountNumber, c.accountType].filter(Boolean).join(' · '),
  }))

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={(id) => onChange(id)}
      options={options}
      onSearch={setQuery}
      loading={isLoading}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
    />
  )
}
