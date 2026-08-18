/**
 * Constantes puras del ciclo de vida de solicitudes.
 * Independientes de Supabase y de next/headers — seguras para importar en componentes client.
 */

/** Estados válidos del ciclo de vida de una solicitud. */
export const REQUEST_STATUSES = ['pending', 'confirmed', 'shipped', 'completed', 'cancelled']

/** Etiquetas legibles para cada estado. */
export const REQUEST_STATUS_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  shipped: 'Enviada',
  completed: 'Completada',
  cancelled: 'Cancelada',
}