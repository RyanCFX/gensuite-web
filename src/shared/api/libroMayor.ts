import { client } from './client'
import { ENDPOINTS } from './endpoints'

export interface LibroMayorMovimiento {
  postingDate: string
  voucherType: string
  voucherNo: string
  debit: number
  credit: number
  balance: number
  party?: string | null
  partyType?: string | null
  remarks?: string | null
  costCenter?: string | null
}

export interface LibroMayorCuenta {
  account: string
  openingDebit: number
  openingCredit: number
  openingBalance: number
  movements: LibroMayorMovimiento[]
  periodDebit: number
  periodCredit: number
  closingBalance: number
}

export interface LibroMayorData {
  fromDate: string
  toDate: string
  totalAccounts: number
  accounts: LibroMayorCuenta[]
}

export interface LibroMayorParams {
  fromDate?: string
  toDate?: string
  account?: string
}

export async function getLibroMayor(params?: LibroMayorParams): Promise<LibroMayorData> {
  const res = await client.get<{ success: true; data: LibroMayorData }>(
    ENDPOINTS.reportes.libroMayor,
    { params }
  )
  return res.data.data
}
