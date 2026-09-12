/**
 * Lógica pura de DISPONIBILIDAD de productos afiliados de AliExpress.
 * ------------------------------------------------------------------
 * Formato .mjs para que Node lo ejecute directo en los tests y para que los
 * servicios TypeScript (importando el .d.ts hermano) la reutilicen sin duplicar
 * reglas. Mismo patrón que lib/reviews.mjs / lib/price-calculator.mjs.
 *
 * POR QUÉ existe (diagnóstico previo):
 *   `services/aliEnrich.ts` YA detectaba que un producto desaparecía de
 *   AliExpress, pero solo escribía un log: la ficha seguía publicada con
 *   precio viejo y el JSON-LD seguía emitiendo `InStock`. Además, la API
 *   oficial no expone un inventario real (el "stock 50" de los afiliados es un
 *   placeholder), así que la señal fiable es:
 *     1) el ID ya NO viene en `productdetail.get`, o
 *     2) viene SIN precio válido (0 / vacío) → no es comprable.
 *   Este módulo convierte esas señales en una decisión determinista y
 *   testeable: sospecha → degradación (tras N ausencias) → recuperación.
 *
 * Reglas de oro respetadas:
 *  - Cero magic numbers: el umbral de ausencias se INYECTA por parámetro
 *    (su fuente única es lib/constants.ts).
 *  - Determinista y sin efectos secundarios: la BD se toca en el servicio.
 *  - Degradar NO es ocultar: `is_available` se mantiene true para no generar
 *    soft-404 ni perder la URL indexada (política SEO-safe).
 */

/** Estados posibles de disponibilidad AliExpress (columna products.ali_status). */
export const ALI_ESTADO = {
  /** Producto comprable: su detalle viene con precio válido. */
  OK: 'ok',
  /** Caído o sin precio verificable: ficha degradada (OutOfStock + alternativas). */
  UNAVAILABLE: 'unavailable',
}

/** Acciones que la capa de datos debe ejecutar tras evaluar un producto. */
export const ALI_ACCION = {
  /** Sin cambios: todo sigue igual (o la degradación ya estaba aplicada). */
  NONE: 'none',
  /** Primera(s) ausencia(s): solo se cuenta, NO se degrada todavía. */
  SOSPECHA: 'sospecha',
  /** Se alcanzó el umbral: degradar la ficha (stock 0 + ali_status unavailable). */
  MARCAR_NO_DISPONIBLE: 'marcar_no_disponible',
  /** Volvió a estar comprable: restaurar disponibilidad y limpiar contadores. */
  RECUPERAR: 'recuperar',
}

/** Motivos de la evaluación (para logs y auditoría). */
export const ALI_MOTIVO = {
  DETALLE_OK: 'detalle_ok',
  SIN_DETALLE: 'sin_detalle',
  PRECIO_INVALIDO: 'precio_invalido',
}

/**
 * Indica si un precio crudo representa una oferta comprable.
 * `null`, `undefined`, `''`, `0`, negativos o NaN NO son válidos.
 * @param {unknown} valor Precio crudo devuelto por la API.
 * @returns {boolean}
 */
export function esPrecioValido(valor) {
  if (valor === null || valor === undefined || valor === '') return false
  const numero = Number(valor)
  return Number.isFinite(numero) && numero > 0
}

/** Normaliza el umbral de ausencias (entero >= 1; por defecto 1). */
function normalizarUmbral(valor) {
  const numero = Math.floor(Number(valor))
  return Number.isFinite(numero) && numero >= 1 ? numero : 1
}

/**
 * Evalúa la disponibilidad de UN producto a partir del detalle fresco de la API.
 *
 * @param {{
 *   estadoActual?: string|null,
 *   ausenciasPrevias?: number|null,
 *   detalleRecibido?: boolean,
 *   precioValido?: boolean,
 *   umbralAusencias?: number
 * }} input Datos ya resueltos por el servicio (sin llamadas a la API).
 * @returns {{ estado: string, ausencias: number, accion: string, motivo: string }}
 *   Decisión determinista: estado a persistir, contador actualizado y acción.
 */
export function evaluarDisponibilidadAli(input) {
  const datos = input ?? {}
  const estadoActual = datos.estadoActual === ALI_ESTADO.UNAVAILABLE ? ALI_ESTADO.UNAVAILABLE : ALI_ESTADO.OK
  const ausenciasPrevias = Math.max(Math.floor(Number(datos.ausenciasPrevias)) || 0, 0)
  const umbral = normalizarUmbral(datos.umbralAusencias)

  // FAIL-SAFE: si la llamada llega incompleta (flags ausentes) NO se degrada
  // nada. Un error de programación jamás debe despublicar una ficha que vende;
  // en el peor caso se pospone una verificación, nunca se rompe el catálogo.
  if (typeof datos.detalleRecibido !== 'boolean' || typeof datos.precioValido !== 'boolean') {
    return {
      estado: estadoActual,
      ausencias: ausenciasPrevias,
      accion: ALI_ACCION.NONE,
      motivo: ALI_MOTIVO.SIN_DETALLE,
    }
  }

  const detalleRecibido = datos.detalleRecibido
  const precioValido = datos.precioValido

  // Producto comprable: se limpia cualquier sospecha y se restaura si hacía falta.
  if (detalleRecibido && precioValido) {
    const estabaCaido = estadoActual === ALI_ESTADO.UNAVAILABLE
    return {
      estado: ALI_ESTADO.OK,
      ausencias: 0,
      accion: estabaCaido ? ALI_ACCION.RECUPERAR : ALI_ACCION.NONE,
      motivo: ALI_MOTIVO.DETALLE_OK,
    }
  }

  // No comprable: se acumula la ausencia (con tope = umbral para no crecer sin fin).
  const ausencias = Math.min(ausenciasPrevias + 1, umbral)
  const motivo = detalleRecibido ? ALI_MOTIVO.PRECIO_INVALIDO : ALI_MOTIVO.SIN_DETALLE

  if (ausencias < umbral) {
    return { estado: estadoActual, ausencias, accion: ALI_ACCION.SOSPECHA, motivo }
  }

  // Umbral alcanzado: se degrada una sola vez (idempotente en re-ejecuciones).
  return {
    estado: ALI_ESTADO.UNAVAILABLE,
    ausencias,
    accion: estadoActual === ALI_ESTADO.UNAVAILABLE ? ALI_ACCION.NONE : ALI_ACCION.MARCAR_NO_DISPONIBLE,
    motivo,
  }
}

/**
 * Resumen agregado de una verificación completa (para el panel admin y logs).
 * @param {{ accion?: string }[]} resultados Resultados individuales de la verificación.
 * @returns {{ total: number, degradados: number, recuperados: number, sospechas: number, sinCambios: number }}
 */
export function resumirVerificacion(resultados) {
  const lista = Array.isArray(resultados) ? resultados : []
  const resumen = { total: lista.length, degradados: 0, recuperados: 0, sospechas: 0, sinCambios: 0 }
  for (const item of lista) {
    switch (item?.accion) {
      case ALI_ACCION.MARCAR_NO_DISPONIBLE:
        resumen.degradados += 1
        break
      case ALI_ACCION.RECUPERAR:
        resumen.recuperados += 1
        break
      case ALI_ACCION.SOSPECHA:
        resumen.sospechas += 1
        break
      default:
        resumen.sinCambios += 1
    }
  }
  return resumen
}
