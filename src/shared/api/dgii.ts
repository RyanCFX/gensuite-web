import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type { DgiiTaxpayer } from './types'

export async function getDgiiTaxpayer(rnc: string) {
  const res = await client.get<{ success: true; data: DgiiTaxpayer }>(ENDPOINTS.dgii.taxpayers(rnc))
  return unwrap(res)
}
