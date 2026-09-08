import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Genera las iniciales de un nombre (empresa o persona).
 * Toma la primera letra de las primeras 2 palabras y las convierte en mayúsculas.
 * Ejemplo: "ilumaX" → "iX", "Mi Empresa C.A." → "ME".
 */
export function getInitials(name?: string | null): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    || 'U'
}