import { useState } from 'react'
import { AccountSelect } from '@/components/shared/AccountSelect'
import type { AsientoPreviewRow } from '@/shared/api/types'

interface Props {
  /** Cuenta que la fila muestra ahora mismo (heredada o ya reasignada) — se usa como valor
   *  inicial del selector, para que el usuario vea de entrada lo que ya trae en vez de un campo
   *  vacío pidiéndole elegir algo. */
  row: AsientoPreviewRow
  onCommit: (accountId: string) => void
  rootType?: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
}

// El id de cuenta en este sistema es su nombre completo de ERPNext, formato
// "número - nombre - compañía" (ej. "21-01-001 - CXP - PROVEEDORES LOCALES - JBC") — el número
// es el primer segmento. El `AccountSelect` solo muestra el nombre (sin el número) una vez
// seleccionado, así que se extrae acá para mostrarlo aparte.
function extractAccountNumber(accountId: string): string {
  return accountId.split(' - ')[0]?.trim() ?? ''
}

/** Selector de cuenta contable in-place para una fila del preview de asientos (ver
 *  AsientosPreviewModal.renderAccountCell) — reemplaza el texto de solo lectura de "Cuenta" por
 *  un número de cuenta + `AccountSelect`, ya posicionado en la cuenta actual de esa fila. */
export function EditableAccountCell({ row, onCommit, rootType }: Props) {
  const [value, setValue] = useState(row.account)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        className="td-muted"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        {extractAccountNumber(value)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <AccountSelect
          value={value}
          onChange={(v) => { setValue(v); onCommit(v) }}
          rootType={rootType}
        />
      </div>
    </div>
  )
}

/** Identifica, entre las filas de un preview de Emisión/Depósito, cuál es la del banco y cuál la
 *  del beneficiario/origen. La del tercero es inequívoca (trae `party`); la del banco es la
 *  primera fila sin `party` — no distingue una eventual línea de deducciones sin party propio,
 *  pero esas nunca son la primera fila en un Payment Entry/Journal Entry de Tesorería. */
export function findBancoYPartyRows(rows: AsientoPreviewRow[]) {
  const partyRow = rows.find((r) => !!r.party)
  const bancoRow = rows.find((r) => r !== partyRow && !r.party)
  return { bancoRow, partyRow }
}

/** Identifica, entre las filas de un preview de Transferencia Interna, cuál pata es origen (sale
 *  el dinero, por eso queda en crédito) y cuál destino (entra, en débito) — mismo criterio que ya
 *  usa TransferenciaInternaDetail para las líneas reales del asiento sometido. */
export function findOrigenYDestinoRows(rows: AsientoPreviewRow[]) {
  const origenRow = rows.find((r) => r.credit > 0)
  const destinoRow = rows.find((r) => r.debit > 0 && r.account !== origenRow?.account)
  return { origenRow, destinoRow }
}
