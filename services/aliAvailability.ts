import { createClient as createServerClient } from '@/lib/supabase/server'
import { obtenerDetalleProductosPorIds } from '@/services/aliApi'
import type { AliProductoDetalle } from '@/services/aliApi'
import { revalidarSitemap } from '@/lib/sitemap-revalidate'
import { notifyAdmins } from '@/services/notifications'
import {
  ALI_ACCION,
  ALI_ESTADO,
  evaluarDisponibilidadAli,
  esPrecioValido,
  resumirVerificacion,
} from '@/lib/ali-availability'
import type {
  AliAccionDisponibilidad,
  AliEstadoDisponibilidad,
  AliMotivoDisponibilidad,
} from '@/lib/ali-availability'
import {
  ALIEXPRESS_PRODUCT_ID_REGEX,
  ALI_API_MIN_INTERVAL_MS,
  ALI_AVAILABILITY_MAX_PRODUCTS,
  ALI_AVAILABILITY_PAGE_SIZE,
  ALI_DETAIL_BATCH_SIZE,
  ALI_UNAVAILABLE_MISSES_THRESHOLD,
  AFFILIATE_DEFAULT_STOCK,
} from '@/lib/constants'
import { detectAliApiRateLimit, getAliRateLimitDelayMs } from '@/lib/ali-rate-limit.mjs'

/**
 * Servicio de VERIFICACIÓN DE DISPONIBILIDAD de afiliados AliExpress (Fase 2.8).
 * ==================================================================
 * Responsabilidad exclusiva: comparar el detalle REAL de la API oficial con el
 * estado publicado de cada producto afiliado y, cuando deja de ser comprable,
 * DEGRADAR su ficha de forma SEO-safe.
 *
 * POR QUÉ se rediseñó respecto al enriquecimiento existente (Fase 2.6):
 *   1) `aliEnrich` ya detectaba la ausencia, pero solo escribía un log: la
 *      ficha seguía viva con precio viejo y el JSON-LD emitía `InStock`.
 *   2) `aliEnrich` cuesta dinero: llama a la IA (DeepSeek) para marca/specs y
 *      hace búsquedas extra por producto. La disponibilidad NO necesita nada de
 *      eso: basta `productdetail.get` por lotes de 20 IDs.
 *   3) El scraper NO sirve como señal: AliExpress responde HTTP 200 incluso
 *      para items inexistentes y el HTML ya llega sin datos (`runParams = {}`).
 *
 * COSTE: la API de afiliados de AliExpress no cobra por llamada (solo límite de
 * frecuencia, ya mitigado con `ALI_API_MIN_INTERVAL_MS`). Este servicio NO usa
 * IA ni proxies de scraping → 0 tokens y 0 créditos de proxy.
 *
 * Reglas de oro respetadas:
 *  - Capa de abstracción pura: no toca React (los componentes usan la API route).
 *  - Contrato estable { success, data } | { success, error }.
 *  - Nunca oculta el producto (is_available se mantiene): degradar ≠ borrar, así
 *    no se pierde la URL indexada ni se generan soft-404.
 *  - Solo escribe campos de disponibilidad; el SEO ya generado no se toca.
 */

/** Etapas notificables del barrido (log en vivo del panel admin). */
export type EtapaDisponibilidad =
  | 'preparando'
  | 'consultando'
  | 'evaluando'
  | 'degradando'
  | 'recuperando'
  | 'completado'
  | 'error'

/** Notificación de progreso emitida al panel admin (SSE). */
export type NotificacionDisponibilidad = {
  etapa: EtapaDisponibilidad
  mensaje: string
  productoId?: string | null
  index?: number
  total?: number
}

/** Resultado por producto de la verificación. */
export type ResultadoDisponibilidad = {
  id: string
  slug: string
  nombre: string
  accion: AliAccionDisponibilidad
  estado: AliEstadoDisponibilidad
  motivo: AliMotivoDisponibilidad
  /** Ausencias consecutivas acumuladas (0 = comprable). */
  ausencias: number
  /** Precio devuelto por la API en esta verificación (null si no vino). */
  precio: number | null
}

/** Resumen agregado persistible/consumible por el panel. */
export type ResumenDisponibilidad = ReturnType<typeof resumirVerificacion>

/** Fila mínima del producto a verificar. */
type FilaProductoAli = {
  id: string
  slug: string
  name: string
  asin: string | null
  url_afiliado_ali: string | null
  ali_status: string | null
  ali_missing_checks: number | null
}

/** Espera simple para respetar el rate limit de la API oficial. */
function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Interpreta el límite pedido por la UI.
 * @returns Número de productos a verificar, o `null` para usar el tope defensivo.
 */
function normalizarLimite(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  const texto = String(valor).trim().toLowerCase()
  if (texto === '' || texto === 'all' || texto === 'todos' || texto === '0') return null
  const numero = Math.floor(Number(texto))
  if (!Number.isFinite(numero) || numero <= 0) return null
  return numero
}

/**
 * Resuelve el ID de AliExpress de una fila.
 * Orden: `asin` (fuente del pipeline) → ID embebido en la URL de afiliado
 * (cubre productos cargados a mano con enlace pero sin asin).
 */
function resolverAliProductId(fila: FilaProductoAli): string | null {
  const asin = fila.asin?.trim() ?? ''
  if (asin) {
    const hallado = asin.match(ALIEXPRESS_PRODUCT_ID_REGEX)?.[0]
    if (hallado) return hallado
  }
  const url = fila.url_afiliado_ali?.trim() ?? ''
  if (url) {
    const hallado = url.match(ALIEXPRESS_PRODUCT_ID_REGEX)?.[0]
    if (hallado) return hallado
  }
  return null
}

/**
 * Lee los productos afiliados publicados a verificar (paginado).
 * Orden de ROTACIÓN: `ali_last_checked_at` más antiguo primero (nulos primero),
 * así el botón es reanudable — pulsarlo de nuevo continúa por los pendientes.
 */
async function leerProductosAfiliados(limite: number | null) {
  const supabase = await createServerClient()
  const tope = limite ?? ALI_AVAILABILITY_MAX_PRODUCTS
  const filas: FilaProductoAli[] = []
  let desde = 0

  for (;;) {
    const { data, error } = await supabase
      .from('products')
      .select('id,slug,name,asin,url_afiliado_ali,ali_status,ali_missing_checks')
      .eq('is_available', true)
      .or('asin.not.is.null,url_afiliado_ali.not.is.null')
      .order('ali_last_checked_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false })
      .range(desde, desde + ALI_AVAILABILITY_PAGE_SIZE - 1)
    if (error) return { filas, error: error.message }

    const lote = (data ?? []) as FilaProductoAli[]
    filas.push(...lote)
    if (lote.length < ALI_AVAILABILITY_PAGE_SIZE) break
    if (filas.length >= tope) break
    desde += ALI_AVAILABILITY_PAGE_SIZE
  }

  return { filas: filas.slice(0, tope), error: null as string | null }
}

/**
 * Persiste el resultado de una evaluación y devuelve el mensaje de error (o null).
 *
 * Degradar  → stock 0 + `ali_status = 'unavailable'`. NUNCA se toca
 *             `is_available` (la ficha sigue viva: sin soft-404), ni el precio,
 *             ni el SEO ya generado.
 * Recuperar → restaura el stock de afiliado y limpia contadores/fechas.
 *
 * @param supabase Cliente de servidor (escritura).
 * @param fila Producto evaluado.
 * @param evaluacion Decisión del evaluador puro (estado/ausencias/acción).
 * @param fechaIso Marca temporal única de la corrida.
 * @returns Mensaje de error de Supabase, o `null` si el update fue correcto.
 */
async function aplicarEvaluacion(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  fila: FilaProductoAli,
  evaluacion: { estado: AliEstadoDisponibilidad; ausencias: number; accion: AliAccionDisponibilidad },
  fechaIso: string,
): Promise<string | null> {
  const cambios: Record<string, unknown> = {
    ali_status: evaluacion.estado,
    ali_missing_checks: evaluacion.ausencias,
    ali_last_checked_at: fechaIso,
  }

  if (evaluacion.accion === ALI_ACCION.MARCAR_NO_DISPONIBLE) {
    cambios.stock = 0
    cambios.ali_unavailable_since = fechaIso
  } else if (evaluacion.accion === ALI_ACCION.RECUPERAR) {
    cambios.stock = AFFILIATE_DEFAULT_STOCK
    cambios.ali_unavailable_since = null
  }

  const { error } = await supabase.from('products').update(cambios).eq('id', fila.id)
  return error?.message ?? null
}

/**
 * Verifica la disponibilidad REAL de los productos afiliados contra la API
 * oficial y degrada/recupera su ficha. Emite progreso para el log en vivo.
 *
 * @param opciones `limite` opcional (vacío/0 = tope defensivo del catálogo).
 * @param notificar Callback de progreso (SSE en la API route).
 */
export async function ejecutarVerificacionDisponibilidad(
  opciones: { limite?: unknown } = {},
  notificar: (notificacion: NotificacionDisponibilidad) => void,
): Promise<{
  success: boolean
  data?: ResultadoDisponibilidad[]
  resumen?: ResumenDisponibilidad
  error?: string
}> {
  const limite = normalizarLimite(opciones.limite)

  try {
    notificar({
      etapa: 'preparando',
      mensaje:
        limite == null
          ? `Seleccionando productos afiliados (hasta ${ALI_AVAILABILITY_MAX_PRODUCTS} por corrida, los menos revisados primero)...`
          : `Seleccionando hasta ${limite} productos afiliados...`,
    })

    const { filas: productos, error } = await leerProductosAfiliados(limite)
    if (error) return { success: false, error }

    if (productos.length === 0) {
      notificar({ etapa: 'completado', mensaje: 'No hay productos afiliados publicados para verificar.' })
      return { success: true, data: [], resumen: resumirVerificacion([]) }
    }

    const supabase = await createServerClient()

    // ID de AliExpress por fila (se resuelve una sola vez).
    const idPorFila = new Map<string, string>()
    for (const fila of productos) {
      const id = resolverAliProductId(fila)
      if (id) idPorFila.set(fila.id, id)
    }
    const ids = [...new Set(idPorFila.values())]
    if (ids.length === 0) {
      notificar({ etapa: 'completado', mensaje: 'Ningún producto afiliado tiene un ID de AliExpress resoluble.' })
      return { success: true, data: [], resumen: resumirVerificacion([]) }
    }

    // ---------- Detalle real en LOTES de 20 IDs (una llamada por lote) ----------
    const mapaDetalle = new Map<string, AliProductoDetalle>()
    // IDs cuyo lote falló (rate limit/red): NO se evalúan en esta corrida para
    // no confundir un problema de la API con un producto caído.
    const idsLoteFallido = new Set<string>()
    const totalLotes = Math.ceil(ids.length / ALI_DETAIL_BATCH_SIZE)
    let lotesOk = 0

    for (let i = 0; i < ids.length; i += ALI_DETAIL_BATCH_SIZE) {
      const loteIds = ids.slice(i, i + ALI_DETAIL_BATCH_SIZE)
      const numLote = Math.floor(i / ALI_DETAIL_BATCH_SIZE) + 1
      notificar({
        etapa: 'consultando',
        mensaje: `Consultando AliExpress (lote ${numLote}/${totalLotes} · ${loteIds.length} productos)...`,
      })

      const detalle = await obtenerDetalleProductosPorIds(loteIds)
      if (detalle.success && detalle.data) {
        lotesOk += 1
        for (const d of detalle.data) mapaDetalle.set(d.ali_product_id, d)
      } else {
        const rateLimit = detectAliApiRateLimit({ error: detalle.error })
        if (rateLimit.isRateLimit) {
          const delayMs = getAliRateLimitDelayMs({ error: detalle.error })
          notificar({
            etapa: 'error',
            mensaje: `AliExpress respondió con rate limit. Pausando ${delayMs} ms antes de reintentar...`,
          })
          await esperar(delayMs)
        }
        for (const id of loteIds) idsLoteFallido.add(id)
        notificar({
          etapa: 'error',
          mensaje: `Lote ${numLote} falló y se OMITE (no cuenta como caída): ${detalle.error}`,
        })
      }

      if (i + ALI_DETAIL_BATCH_SIZE < ids.length) await esperar(ALI_API_MIN_INTERVAL_MS)
    }

    // Válvula de seguridad: si NINGÚN lote respondió, es un problema de la API
    // (no 500 productos muertos). Se aborta sin escribir nada.
    if (lotesOk === 0) {
      const mensaje = 'AliExpress no devolvió detalle de ningún lote; no se modificó el catálogo. Revisa credenciales/rate limit y reintenta.'
      notificar({ etapa: 'error', mensaje })
      return { success: false, error: mensaje }
    }

    // ---------- Evaluación por producto ----------
    const fechaIso = new Date().toISOString()
    const resultados: ResultadoDisponibilidad[] = []

    for (let i = 0; i < productos.length; i += 1) {
      const fila = productos[i]
      const indice = i + 1
      const aliId = idPorFila.get(fila.id)

      // Sin ID resoluble no hay nada que verificar: se omite sin castigo.
      if (!aliId) {
        notificar({
          etapa: 'evaluando',
          mensaje: `[${indice}/${productos.length}] ${fila.slug}: sin ID de AliExpress resoluble; omitido.`,
          productoId: fila.id,
          index: indice,
          total: productos.length,
        })
        continue
      }

      // Lote fallido = dato desconocido, no ausencia: no se toca el contador.
      if (idsLoteFallido.has(aliId)) {
        notificar({
          etapa: 'evaluando',
          mensaje: `[${indice}/${productos.length}] ${fila.slug}: sin dato fiable de la API; se deja igual.`,
          productoId: fila.id,
          index: indice,
          total: productos.length,
        })
        continue
      }

      const detalle = mapaDetalle.get(aliId)
      const precio = detalle?.precio_min_venta ?? null

      // Evaluación determinista y testeable (lib/ali-availability.mjs).
      const evaluacion = evaluarDisponibilidadAli({
        estadoActual: fila.ali_status,
        ausenciasPrevias: fila.ali_missing_checks,
        detalleRecibido: Boolean(detalle),
        precioValido: esPrecioValido(precio),
        umbralAusencias: ALI_UNAVAILABLE_MISSES_THRESHOLD,
      })

      const errorUpdate = await aplicarEvaluacion(supabase, fila, evaluacion, fechaIso)

      resultados.push({
        id: fila.id,
        slug: fila.slug,
        nombre: fila.name,
        accion: evaluacion.accion,
        estado: evaluacion.estado,
        motivo: evaluacion.motivo,
        ausencias: evaluacion.ausencias,
        precio,
      })

      if (errorUpdate) {
        notificar({
          etapa: 'error',
          mensaje: `[${indice}/${productos.length}] ${fila.slug}: no se pudo guardar (${errorUpdate}).`,
          productoId: fila.id,
          index: indice,
          total: productos.length,
        })
        continue
      }

      if (evaluacion.accion === ALI_ACCION.MARCAR_NO_DISPONIBLE) {
        // La ficha degradada cambió de disponibilidad: se revalida su URL.
        revalidarSitemap({ productoSlug: fila.slug })
        notificar({
          etapa: 'degradando',
          mensaje: `[${indice}/${productos.length}] ${fila.slug}: NO DISPONIBLE (${evaluacion.motivo}). Ficha degradada (OutOfStock + alternativas) sin ocultarla.`,
          productoId: fila.id,
          index: indice,
          total: productos.length,
        })
      } else if (evaluacion.accion === ALI_ACCION.RECUPERAR) {
        revalidarSitemap({ productoSlug: fila.slug })
        notificar({
          etapa: 'recuperando',
          mensaje: `[${indice}/${productos.length}] ${fila.slug}: disponible otra vez. Ficha restaurada.`,
          productoId: fila.id,
          index: indice,
          total: productos.length,
        })
      } else if (evaluacion.accion === ALI_ACCION.SOSPECHA) {
        notificar({
          etapa: 'evaluando',
          mensaje: `[${indice}/${productos.length}] ${fila.slug}: en observación (${evaluacion.ausencias}/${ALI_UNAVAILABLE_MISSES_THRESHOLD}, ${evaluacion.motivo}).`,
          productoId: fila.id,
          index: indice,
          total: productos.length,
        })
      } else {
        notificar({
          etapa: 'evaluando',
          mensaje: `[${indice}/${productos.length}] ${fila.slug}: sin cambios.`,
          productoId: fila.id,
          index: indice,
          total: productos.length,
        })
      }
    }

    const resumen = resumirVerificacion(resultados)
    notificar({
      etapa: 'completado',
      mensaje: `Verificación finalizada: ${resumen.degradados} degradados, ${resumen.recuperados} recuperados, ${resumen.sospechas} en observación de ${resumen.total} productos.`,
    })

    // Aviso a admins solo cuando hubo algo accionable que revisar.
    if (resumen.degradados > 0 || resumen.recuperados > 0) {
      try {
        await notifyAdmins(
          'producto',
          `AliExpress: ${resumen.degradados} producto(s) no disponible(s)`,
          `Degradados: ${resumen.degradados} · Recuperados: ${resumen.recuperados}. Revisa el panel para buscar sustitutos.`,
          '/admin/ali-pipeline',
        )
      } catch {
        // Las notificaciones nunca deben romper la operación principal.
      }
    }

    // El sitemap debe reflejar el nuevo estado (stock/availability) de las fichas.
    revalidarSitemap()

    return { success: true, data: resultados, resumen }


  } catch (err: any) {
    console.error('[aliAvailability] ejecutarVerificacionDisponibilidad:', err?.message)
    notificar({ etapa: 'error', mensaje: err?.message ?? 'Error fatal de la verificación de disponibilidad.' })
    return { success: false, error: err?.message ?? 'Error fatal de la verificación de disponibilidad.' }
  }
}

/**
 * Resumen de salud del catálogo afiliado para el panel (GET del API route).
 * No llama a la API de AliExpress: solo cuenta lo ya verificado en la BD.
 */
export async function obtenerResumenDisponibilidad() {
  try {
    const supabase = await createServerClient()
    const filtroAfiliado = 'asin.not.is.null,url_afiliado_ali.not.is.null'
    const [total, caidos, sospechosos, ultima] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_available', true).or(filtroAfiliado),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('ali_status', ALI_ESTADO.UNAVAILABLE),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('ali_status', ALI_ESTADO.OK)
        .gt('ali_missing_checks', 0),
      supabase
        .from('products')
        .select('ali_last_checked_at')
        .not('ali_last_checked_at', 'is', null)
        .order('ali_last_checked_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return {
      success: true as const,
      data: {
        totalAfiliados: total.count ?? 0,
        noDisponibles: caidos.count ?? 0,
        sospechosos: sospechosos.count ?? 0,
        ultimaVerificacion: (ultima.data as { ali_last_checked_at?: string | null } | null)?.ali_last_checked_at ?? null,
        umbralAusencias: ALI_UNAVAILABLE_MISSES_THRESHOLD,
      },
    }
  } catch (err: any) {
    console.error('[aliAvailability] obtenerResumenDisponibilidad:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error leyendo el resumen de disponibilidad.' }
  }
}



