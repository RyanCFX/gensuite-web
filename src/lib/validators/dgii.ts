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

export function validateNCFFormat(value: string): boolean {
  return /^[BE]\d{10}$/.test(value)
}

export function formatRNC(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 9)
  if (clean.length <= 1) return clean
  if (clean.length <= 3) return `${clean[0]}-${clean.slice(1)}`
  if (clean.length <= 8) return `${clean[0]}-${clean.slice(1, 3)}-${clean.slice(3)}`
  return `${clean[0]}-${clean.slice(1, 3)}-${clean.slice(3, 8)}-${clean[8]}`
}

export function formatCedula(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 11)
  if (clean.length <= 3) return clean
  if (clean.length <= 10) return `${clean.slice(0, 3)}-${clean.slice(3)}`
  return `${clean.slice(0, 3)}-${clean.slice(3, 10)}-${clean[10]}`
}
