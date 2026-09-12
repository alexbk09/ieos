/**
 * Declaración de tipos para lib/ali-availability.mjs.
 * Lógica pura de disponibilidad de productos afiliados (ver lib/ali-availability.mjs).
 */

/** Estados posibles de disponibilidad AliExpress (products.ali_status). */
export type AliEstadoDisponibilidad = 'ok' | 'unavailable'

/** Acciones que la capa de datos ejecuta tras evaluar un producto. */
export type AliAccionDisponibilidad =
  | 'none'
  | 'sospecha'
  | 'marcar_no_disponible'
  | 'recuperar'

/** Motivos de la evaluación (logs/auditoría). */
export type AliMotivoDisponibilidad = 'detalle_ok' | 'sin_detalle' | 'precio_invalido'

/** Catálogo de estados (evita strings quemados en servicios y componentes). */
export const ALI_ESTADO: { readonly OK: AliEstadoDisponibilidad; readonly UNAVAILABLE: AliEstadoDisponibilidad }

/** Catálogo de acciones del evaluador. */
export const ALI_ACCION: {
  readonly NONE: AliAccionDisponibilidad
  readonly SOSPECHA: AliAccionDisponibilidad
  readonly MARCAR_NO_DISPONIBLE: AliAccionDisponibilidad
  readonly RECUPERAR: AliAccionDisponibilidad
}

/** Catálogo de motivos del evaluador. */
export const ALI_MOTIVO: {
  readonly DETALLE_OK: AliMotivoDisponibilidad
  readonly SIN_DETALLE: AliMotivoDisponibilidad
  readonly PRECIO_INVALIDO: AliMotivoDisponibilidad
}

/** Entrada del evaluador: datos ya resueltos por el servicio. */
export type EvaluacionDisponibilidadInput = {
  estadoActual?: string | null
  ausenciasPrevias?: number | null
  /** TRUE si `productdetail.get` devolvió el producto. */
  detalleRecibido?: boolean
  /** TRUE si el precio devuelto es comprable (> 0). */
  precioValido?: boolean
  /** Ausencias consecutivas necesarias para degradar (fuente: lib/constants.ts). */
  umbralAusencias?: number
}

/** Decisión determinista: estado a persistir, contador y acción a ejecutar. */
export type EvaluacionDisponibilidad = {
  estado: AliEstadoDisponibilidad
  ausencias: number
  accion: AliAccionDisponibilidad
  motivo: AliMotivoDisponibilidad
}

/** Resumen agregado de una verificación completa. */
export type ResumenVerificacion = {
  total: number
  degradados: number
  recuperados: number
  sospechas: number
  sinCambios: number
}

/** TRUE si el precio crudo representa una oferta comprable (> 0). */
export function esPrecioValido(valor: unknown): boolean

/** Evalúa la disponibilidad de un producto a partir del detalle fresco de la API. */
export function evaluarDisponibilidadAli(input: EvaluacionDisponibilidadInput): EvaluacionDisponibilidad

/** Cuenta degradados/recuperados/sospechas de una verificación. */
export function resumirVerificacion(resultados: { accion?: string }[]): ResumenVerificacion
