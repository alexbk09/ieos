// ============================================================
// Scroll lock global con contador (modales anidados)
// ------------------------------------------------------------
// El patrón anterior (guardar/restaurar overflow en cada modal)
// falla con modales anidados: si el modal padre se cierra antes
// que el hijo, el hijo restaura un overflow ya restaurado y deja
// el body con overflow hidden permanente, bloqueando el scroll
// de toda la app al navegar (Next.js conserva el mismo body).
//
// Este módulo usa un contador: solo el PRIMER modal que abre
// bloquea el body y solo el ÚLTIMO que cierra lo restaura.
// ============================================================

let lockCount = 0
let previousOverflow = ''

export function lockBodyScroll(): void {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}

export function unlockBodyScroll(): void {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow
  }
}

export function resetBodyScroll(): void {
  lockCount = 0
  previousOverflow = ''
  document.body.style.overflow = ''
}