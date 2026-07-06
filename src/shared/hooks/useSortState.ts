import { useState } from 'react'

/**
 * Manages server-side sort state.
 * Format: "field" (asc) | "-field" (desc)
 */
export function useSortState(defaultKey = '') {
  const [orderBy, setOrderBy] = useState(defaultKey)

  function sort(key: string) {
    setOrderBy((prev) => (prev === key ? `-${key}` : key))
  }

  return { orderBy, sort }
}
