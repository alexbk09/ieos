import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  INDEXING_DAILY_LIMIT,
  INDEXING_PUBLICATION_PRIORITY,
  INDEXING_STALE_BATCH_MINUTES,
  INDEXING_STATIC_PAGE_PATHS,
  SEO_INDEXING_BATCH_SIZE,
  SEO_INDEXING_MAX_ATTEMPTS,
  SEO_INDEXING_SITEMAP_TIMEOUT_MS,
  SEO_INDEXING_SYNC_LIMIT,
  SITEMAP_PATH,
} from '@/lib/constants'
import { absoluteUrl, getSiteOrigin } from '@/lib/seo-url'
import { isPublishedLocale } from '@/lib/i18n-config'
import { leerBanderaEntorno } from '@/lib/runtime-flags'
import { LEGAL_DOCUMENT_ORDER, legalDocumentPath } from '@/lib/legal-content'
import {
  calcularCuotaDiaria,
  decidirReintento,
  normalizarUrlParaBuscadores,
  planificarCanales,
  resumirEstados,
  seleccionarLote,
} from '@/lib/indexing-rules.mjs'
import { getSitemapProducts } from '@/services/aliProducts'
import {
  estaEnModoEstricto,
  getGoogleIndexingConfig,
  inspeccionarUrlEnGoogle,
  obtenerTokenDeGoogle,
  publicarUrlEnGoogleIndexingApi,
  reenviarSitemapAGoogle,
  type GoogleIndexingConfig,
} from '@/services/google-indexing'
import {
  enviarUrlsAIndexNow,
  getIndexNowConfig,
  verificarArchivoClaveIndexNow,
  type IndexNowConfig,
} from '@/services/indexnow'

/**
 * Servicio de INDEXACIÓN en buscadores (cola + auditoría).
 * ------------------------------------------------------------------
 * Responsabilidad única: mantener la cola `seo_indexing_urls` al día, mandar
 * los lotes por los canales PERMITIDOS y dejar auditoría en
 * `seo_indexing_log`. Es la capa que usan tanto el panel como los servicios de
 * catálogo/entradas cuando publican contenido (regla de oro: los componentes
 * nunca hablan con Supabase ni con Google).
 *
 * Decisiones de diseño (y su porqué):
 *  1. El SITEMAP es la fuente de verdad de "qué debería estar indexado": si una
 *     URL no está en el sitemap (o está `noindex`), no se audita ni se empuja.
 *  2. Se envían lotes de 25 y como máximo 100 URLs/día (INDEXING_DAILY_LIMIT),
 *     para no pasar por spam a escala ni agotar las cuotas de los buscadores.
 *  3. Google Indexing API solo recibe JobPosting/BroadcastEvent (política de
 *     Google); el resto sale por IndexNow + sitemap, que sí lo permiten.
 *  4. Todo fallo se registra y NO rompe la publicación del contenido.
 */

/** Tipos de contenido rastreables por este módulo. */
export type IndexingTipo = 'producto' | 'categoria' | 'guia' | 'pagina' | 'job_posting' | 'broadcast_event'

/** Estados posibles de una URL en la cola. */
export type IndexingEstado =
  | 'pendiente'
  | 'enviando'
  | 'enviado'
  | 'indexado'
  | 'no_indexado'
  | 'excluido'
  | 'error'

/** Canal de envío usado (o 'inspeccion' cuando la fila del log es una auditoría). */
export type IndexingCanal = 'indexnow' | 'google_indexing' | 'sitemap' | 'inspeccion'

/** Fila de la cola de indexación. */
export type IndexingUrlRow = {
  id: string
  url: string
  tipo: IndexingTipo
  ref_id: string | null
  ref_slug: string | null
  estado: IndexingEstado
  canal: Exclude<IndexingCanal, 'inspeccion'> | null
  origen: 'sitemap' | 'publicacion' | 'manual'
  lastmod: string | null
  enviado_en: string | null
  inspeccionado_en: string | null
  intentos: number
  ultimo_error: string | null
  cobertura: string | null
  riesgo_politica: boolean
  prioridad: number
  created_at: string
  updated_at: string
}

/** Fila del registro de envíos (auditoría inmutable). */
export type IndexingLogRow = {
  id: string
  url: string
  canal: IndexingCanal
  accion: 'publicar' | 'eliminar' | 'inspeccionar' | 'sitemap'
  resultado: 'ok' | 'error' | 'omitido' | 'bloqueado_politica'
  http_status: number | null
  detalle: string | null
  riesgo_politica: boolean
  usuario_email: string | null
  created_at: string
}

/** Panorama que consume el panel (resumen, cuota y salud de los canales). */
export type IndexingOverview = {
  resumen: ReturnType<typeof resumirEstados>
  cuota: ReturnType<typeof calcularCuotaDiaria>
  enviosHoy: { indexnow: number; google: number }
  google: GoogleIndexingConfig
  indexnow: IndexNowConfig
  ultimosMovimientos: IndexingLogRow[]
}

/** Entrada del webhook de publicación (la usan catálogo y entradas). */
export type PublicacionIndexable = {
  tipo: IndexingTipo
  /** Slug del contenido (o la ruta completa cuando `tipo = 'pagina'`). */
  slug: string
  /** Origen de la fila (por defecto 'publicacion'). */
  origen?: 'publicacion' | 'manual'
  /** `lastmod` real del contenido (ISO). */
  lastmod?: string | null
  /** Prioridad: las publicaciones nuevas se envían antes. */
  prioridad?: number
}

/** Resumen devuelto por cualquier operación por lotes. */
export type ResultadoLoteIndexacion = {
  procesadas: number
  enviadas: number
  inspeccionadas: number
  bloqueadas: number
  conError: number
  omitidas: number
  mensajes: string[]
  cuota: ReturnType<typeof calcularCuotaDiaria>
  /** Distribución por estado de las filas procesadas en esta tanda. */
  resumen: ReturnType<typeof resumirEstados>
}

/**
 * Construye la ruta pública de un contenido publicable.
 * @param tipo Tipo de contenido.
 * @param slug Slug del contenido o ruta completa si es una página.
 * @returns Ruta interna ('/productos/x') o '' si no se puede construir.
 */
export function rutaPublicaDeContenido(tipo: IndexingTipo, slug: string): string {
  const limpio = String(slug ?? '').trim().replace(/^\/+/, '')
  if (!limpio) return ''
  if (tipo === 'producto') return `/productos/${limpio}`
  if (tipo === 'categoria') return `/categoria/${limpio}`
  if (tipo === 'guia') return `/guias/${limpio}`
  return `/${limpio}`
}

/**
 * Deduce el tipo de contenido a partir de la ruta pública.
 * POR QUÉ: la sincronización parte del sitemap (fuente de verdad) y necesita
 * clasificar cada URL para decidir por qué canales puede salir.
 * @param pathname Ruta de la URL ('/es/productos/tira-led').
 * @returns Tipo de contenido deducido.
 */
export function tipoDesdeRuta(pathname: string): IndexingTipo {
  const segmentos = String(pathname ?? '')
    .split('/')
    .filter(Boolean)
  // Se descarta el prefijo de idioma publicado ('/en/productos/x').
  const resto = segmentos.length > 1 && isPublishedLocale(segmentos[0]) ? segmentos.slice(1) : segmentos
  const seccion = resto[0] ?? ''
  if (seccion === 'productos' && resto.length > 1) return 'producto'
  if (seccion === 'categoria' && resto.length > 1) return 'categoria'
  if (seccion === 'guias' && resto.length > 1) return 'guia'
  return 'pagina'
}

/** URL recuperada del sitemap (o del origen de datos interno de respaldo). */
export type UrlDelSitemap = {
  url: string
  tipo: IndexingTipo
  refSlug: string | null
  lastmod: string | null
}

/**
 * Inicio del día en UTC (frontera de la cuota diaria de envíos).
 * POR QUÉ UTC: el límite debe ser estable sin importar la zona del operador ni
 * la región del servidor; Google y IndexNow también razonan en UTC.
 * @returns Fecha ISO del inicio de la jornada UTC.
 */
function inicioDeHoyUtc(): string {
  const ahora = new Date()
  ahora.setUTCHours(0, 0, 0, 0)
  return ahora.toISOString()
}

/**
 * Extrae las entradas de un sitemap XML (URL + `lastmod`).
 * Se leen bloques `<url>` para tomar SOLO su `<loc>` principal y no las
 * imágenes (`<image:loc>`), que no son URLs de página indexables.
 * @param xml Contenido del sitemap.
 * @returns Lista de entradas con su fecha de modificación declarada.
 */
function extraerEntradasDelSitemapXml(xml: string): Array<{ url: string; lastmod: string | null }> {
  const entradas: Array<{ url: string; lastmod: string | null }> = []
  for (const bloque of String(xml ?? '').match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const url = bloque.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim()
    if (!url) continue
    const lastmod = bloque.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null
    entradas.push({ url, lastmod })
  }
  return entradas
}

/**
 * Clasifica una URL absoluta del sitemap en una entrada de la cola.
 * @param url URL absoluta.
 * @param lastmod Fecha de última modificación conocida (si se tiene).
 * @returns Entrada clasificada o null si la URL no es válida.
 */
function clasificarUrlDelSitemap(url: string, lastmod: string | null = null): UrlDelSitemap | null {
  try {
    const destino = new URL(url)
    const segmentos = destino.pathname.split('/').filter(Boolean)
    const resto = segmentos.length > 1 && isPublishedLocale(segmentos[0]) ? segmentos.slice(1) : segmentos
    const tipo = tipoDesdeRuta(destino.pathname)
    const refSlug = tipo === 'producto' || tipo === 'categoria' || tipo === 'guia' ? (resto[1] ?? null) : null
    return { url: destino.toString(), tipo, refSlug, lastmod }
  } catch {
    return null
  }
}

/**
 * Lee el sitemap PUBLICADO (misma fuente que ve Google).
 * POR QUÉ se consulta por HTTP en vez de recalcularlo: así la cola refleja
 * exactamente lo que el buscador tiene delante (incluidos los idiomas y las
 * URLs estáticas). Si no hay red (build local, cold start sin salida), se
 * devuelve null y se usa el respaldo interno.
 * @returns Entradas del sitemap o null si no se pudo leer.
 */
async function leerSitemapPublicado(): Promise<UrlDelSitemap[] | null> {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), SEO_INDEXING_SITEMAP_TIMEOUT_MS)
  try {
    const respuesta = await fetch(absoluteUrl(SITEMAP_PATH), {
      signal: controlador.signal,
      cache: 'no-store',
      headers: { accept: 'application/xml,text/xml' },
    })
    if (!respuesta.ok) return null
    const entradas = extraerEntradasDelSitemapXml(await respuesta.text())
      .map((entrada) => clasificarUrlDelSitemap(entrada.url, entrada.lastmod))
      .filter(Boolean) as UrlDelSitemap[]
    return entradas.length > 0 ? entradas : null
  } catch {
    return null
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Respaldo de la sincronización: reconstruye las URLs desde los MISMOS
 * servicios que alimentan app/sitemap.ts (productos, categorías y entradas),
 * más las rutas estáticas y los documentos legales.
 * @returns Entradas indexables sin depender de la red.
 */
async function leerUrlsDesdeOrigenInterno(): Promise<UrlDelSitemap[]> {
  // Import dinámico a propósito: catálogo y entradas llaman a este servicio
  // cuando publican, así que importarlos de forma estática crearía un ciclo
  // entre módulos (mismo patrón que usa aliProducts con catalog).
  const [{ getSitemapCategories }, { getSitemapEntries }] = await Promise.all([
    import('@/services/catalog'),
    import('@/services/entries'),
  ])

  const [productos, categorias, entradas] = await Promise.all([
    getSitemapProducts(),
    getSitemapCategories(),
    getSitemapEntries(),
  ])

  const items: UrlDelSitemap[] = []

  if (productos.success && productos.data) {
    for (const producto of productos.data) {
      const entrada = clasificarUrlDelSitemap(absoluteUrl(`/productos/${producto.slug}`), producto.lastmod ?? null)
      if (entrada) items.push(entrada)
    }
  }
  for (const categoria of categorias.items ?? []) {
    const entrada = clasificarUrlDelSitemap(absoluteUrl(`/categoria/${categoria.slug}`), categoria.lastmod ?? null)
    if (entrada) items.push(entrada)
  }
  for (const guia of entradas.items ?? []) {
    const entrada = clasificarUrlDelSitemap(absoluteUrl(`/guias/${guia.slug}`), guia.lastmod ?? null)
    if (entrada) items.push(entrada)
  }
  for (const ruta of INDEXING_STATIC_PAGE_PATHS) {
    const entrada = clasificarUrlDelSitemap(absoluteUrl(ruta))
    if (entrada) items.push(entrada)
  }
  for (const clave of LEGAL_DOCUMENT_ORDER) {
    const entrada = clasificarUrlDelSitemap(absoluteUrl(legalDocumentPath(clave)))
    if (entrada) items.push(entrada)
  }

  return items
}

/** Resumen por estado (misma forma que `resumirEstados` de lib/indexing-rules). */
type ResumenCola = {
  total: number
  pendiente: number
  enviando: number
  enviado: number
  indexado: number
  no_indexado: number
  excluido: number
  error: number
}

/**
 * Lee las URLs que "deberían" estar indexadas.
 * Prioriza el sitemap PUBLICADO (lo que Google ve) y, si no hay red, usa el
 * origen de datos interno con los mismos servicios que generan el XML.
 * @returns Entradas indexables y la fuente utilizada (para avisar en el panel).
 */
export async function obtenerUrlsIndexables(): Promise<{
  items: UrlDelSitemap[]
  fuente: 'sitemap_publicado' | 'origen_interno'
}> {
  const publicado = await leerSitemapPublicado()
  if (publicado) return { items: publicado, fuente: 'sitemap_publicado' }
  return { items: await leerUrlsDesdeOrigenInterno(), fuente: 'origen_interno' }
}

/**
 * Sincroniza la cola con el sitemap: AGREGA las URLs que falten.
 * POR QUÉ con `ignoreDuplicates`: la sincronización no debe pisar el trabajo
 * hecho (una URL ya enviada o indexada no vuelve a 'pendiente'); solo suma las
 * nuevas (catálogo recién importado, guías recién publicadas, idioma nuevo…).
 * @returns Cuántas URLs se añadieron y de qué fuente salieron.
 */
export async function sincronizarColaConSitemap(): Promise<{
  insertadas: number
  totalSitemap: number
  /** true si el sitemap cabía entero en esta corrida (no quedan URLs por importar). */
  completo: boolean
  fuente: 'sitemap_publicado' | 'origen_interno'
  error: string | null
}> {
  try {
    const { items, fuente } = await obtenerUrlsIndexables()

    // Una URL puede aparecer repetida (varias relaciones en el sitemap): se
    // deduplica antes de tocar la base de datos.
    const unicas = new Map<string, UrlDelSitemap>()
    for (const item of items) if (!unicas.has(item.url)) unicas.set(item.url, item)

    const filas = [...unicas.values()].slice(0, SEO_INDEXING_SYNC_LIMIT).map((item) => ({
      url: item.url,
      tipo: item.tipo,
      ref_slug: item.refSlug,
      lastmod: item.lastmod,
      origen: 'sitemap',
      estado: 'pendiente',
    }))
    // El sitemap puede tener más URLs que el tope por corrida: el panel avisa
    // para que el operador repita la sincronización (lotes de 1000).
    const completo = unicas.size <= SEO_INDEXING_SYNC_LIMIT

    if (filas.length === 0) return { insertadas: 0, totalSitemap: 0, completo, fuente, error: null }

    const supabase = await createServerClient()
    const { data, error } = await supabase
      .from('seo_indexing_urls')
      .upsert(filas, { onConflict: 'url', ignoreDuplicates: true })
      .select('url')
    if (error) return { insertadas: 0, totalSitemap: filas.length, completo, fuente, error: error.message }

    return { insertadas: (data ?? []).length, totalSitemap: filas.length, completo, fuente, error: null }
  } catch (err: any) {
    return {
      insertadas: 0,
      totalSitemap: 0,
      completo: false,
      fuente: 'origen_interno',
      error: err?.message ?? 'No se pudo sincronizar la cola con el sitemap.',
    }
  }
}

/**
 * Cuenta los envíos CORRECTOS de hoy, base de la cuota diaria.
 * Se cuentan por URL enviada (`canal = 'indexnow'`) y, aparte, las
 * notificaciones individuales a la Indexing API de Google (su propio límite).
 * @returns Envíos correctos de la jornada UTC.
 */
export async function contarEnviosDeHoy(): Promise<{ indexnow: number; google: number }> {
  const supabase = await createServerClient()
  const desde = inicioDeHoyUtc()
  const [indexnow, google] = await Promise.all([
    supabase
      .from('seo_indexing_log')
      .select('id', { count: 'exact', head: true })
      .eq('canal', 'indexnow')
      .eq('resultado', 'ok')
      .gte('created_at', desde),
    supabase
      .from('seo_indexing_log')
      .select('id', { count: 'exact', head: true })
      .eq('canal', 'google_indexing')
      .eq('resultado', 'ok')
      .gte('created_at', desde),
  ])
  return { indexnow: indexnow.count ?? 0, google: google.count ?? 0 }
}

/**
 * Escribe una línea en el registro de indexación (auditoría inmutable).
 * POR QUÉ nunca lanza: la observabilidad no puede tumbar la operación real
 * (publicar un producto o enviar un lote). Un fallo aquí solo se loguea.
 * @param entrada Datos del movimiento a registrar.
 */
async function registrarMovimiento(entrada: {
  url: string
  canal: IndexingCanal
  accion: IndexingLogRow['accion']
  resultado: IndexingLogRow['resultado']
  httpStatus?: number | null
  detalle?: string | null
  riesgoPolitica?: boolean
  usuarioEmail?: string | null
}): Promise<void> {
  await registrarMovimientos([entrada])
}

/**
 * Escribe VARIAS líneas de auditoría en una sola consulta.
 * Se usa en los envíos por lotes (25 URLs por tanda) para no hacer 25 INSERT.
 * @param entradas Movimientos a registrar.
 */
async function registrarMovimientos(
  entradas: Array<{
    url: string
    canal: IndexingCanal
    accion: IndexingLogRow['accion']
    resultado: IndexingLogRow['resultado']
    httpStatus?: number | null
    detalle?: string | null
    riesgoPolitica?: boolean
    usuarioEmail?: string | null
  }>,
): Promise<void> {
  if (entradas.length === 0) return
  try {
    const supabase = await createServerClient()
    await supabase.from('seo_indexing_log').insert(
      entradas.map((entrada) => ({
        url: entrada.url,
        canal: entrada.canal,
        accion: entrada.accion,
        resultado: entrada.resultado,
        http_status: entrada.httpStatus ?? null,
        detalle: entrada.detalle ?? null,
        riesgo_politica: Boolean(entrada.riesgoPolitica),
        usuario_email: entrada.usuarioEmail ?? null,
      })),
    )
  } catch (err: any) {
    console.warn('[seo-indexing] No se pudieron registrar los movimientos:', err?.message ?? err)
  }
}

/**
 * Resumen de la cola por estado (agregado en la base de datos).
 * @returns Conteos por estado y total.
 */
export async function obtenerResumenCola(): Promise<ResumenCola> {
  const resumen: ResumenCola = {
    total: 0,
    pendiente: 0,
    enviando: 0,
    enviado: 0,
    indexado: 0,
    no_indexado: 0,
    excluido: 0,
    error: 0,
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('seo_indexing_summary')
  if (error) {
    console.warn('[seo-indexing] obtenerResumenCola:', error.message)
    return resumen
  }

  for (const fila of (data ?? []) as Array<{ estado: string; total: number }>) {
    const total = Number(fila.total) || 0
    resumen.total += total
    if (fila.estado in resumen && fila.estado !== 'total') {
      resumen[fila.estado as keyof ResumenCola] = total
    }
  }
  return resumen
}

/**
 * Lista la cola de indexación con filtros y paginación.
 * @param opciones Filtros por estado/tipo y rango a devolver.
 * @returns Filas de la cola y el total que cumple el filtro.
 */
export async function listarColaDeIndexacion(
  opciones: {
    estado?: IndexingEstado | 'todos'
    tipo?: IndexingTipo | 'todos'
    /** Solo las que aún no se han enviado correctamente (pendiente/error). */
    soloPendientes?: boolean
    limit?: number
    offset?: number
  } = {},
): Promise<{ items: IndexingUrlRow[]; total: number; error: string | null }> {
  const limit = Math.min(Math.max(Number(opciones.limit) || SEO_INDEXING_BATCH_SIZE, 1), 200)
  const offset = Math.max(Number(opciones.offset) || 0, 0)

  const supabase = await createServerClient()
  let consulta = supabase.from('seo_indexing_urls').select('*', { count: 'exact' })

  if (opciones.soloPendientes) consulta = consulta.in('estado', ['pendiente', 'error'])
  else if (opciones.estado && opciones.estado !== 'todos') consulta = consulta.eq('estado', opciones.estado)
  if (opciones.tipo && opciones.tipo !== 'todos') consulta = consulta.eq('tipo', opciones.tipo)

  const { data, error, count } = await consulta
    .order('prioridad', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return { items: [], total: 0, error: error.message }
  return { items: (data ?? []) as IndexingUrlRow[], total: count ?? 0, error: null }
}

/**
 * Panorama completo del módulo para el panel (una sola llamada).
 * @returns Resumen, cuota diaria, salud de los canales y últimos movimientos.
 */
export async function obtenerPanoramaDeIndexacion(): Promise<IndexingOverview> {
  const [resumen, enviosHoy, movimientos] = await Promise.all([
    obtenerResumenCola(),
    contarEnviosDeHoy(),
    (async (): Promise<IndexingLogRow[]> => {
      const supabase = await createServerClient()
      const { data } = await supabase
        .from('seo_indexing_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      return (data ?? []) as IndexingLogRow[]
    })(),
  ])

  return {
    resumen,
    // La cuota se mide en URLs empujadas por IndexNow (el canal masivo).
    cuota: calcularCuotaDiaria(enviosHoy.indexnow, INDEXING_DAILY_LIMIT),
    enviosHoy,
    google: getGoogleIndexingConfig(),
    indexnow: getIndexNowConfig(),
    ultimosMovimientos: movimientos,
  }
}

/**
 * Actualiza el estado de una URL tras un envío.
 * @param url URL enviada.
 * @param resultado Éxito, canal, código HTTP y detalle del envío.
 */
async function marcarResultadoEnvio(
  url: string,
  resultado: { exito: boolean; canal: 'indexnow' | 'google_indexing'; httpStatus: number; detalle: string },
): Promise<void> {
  try {
    const supabase = await createServerClient()
    const { data } = await supabase.from('seo_indexing_urls').select('intentos').eq('url', url).maybeSingle()
    const intentos = Number(data?.intentos ?? 0) + (resultado.exito ? 0 : 1)
    // Si el fallo es reintentable (429/5xx/red) vuelve a 'pendiente' y la
    // próxima tanda lo recoge; si ya agotó los intentos, queda en 'error'.
    const reintentar =
      !resultado.exito && decidirReintento(resultado.httpStatus, intentos, SEO_INDEXING_MAX_ATTEMPTS)
    await supabase
      .from('seo_indexing_urls')
      .update({
        estado: resultado.exito ? 'enviado' : reintentar ? 'pendiente' : 'error',
        canal: resultado.exito ? resultado.canal : null,
        enviado_en: resultado.exito ? new Date().toISOString() : null,
        intentos,
        ultimo_error: resultado.exito ? null : resultado.detalle,
      })
      .eq('url', url)
  } catch (err: any) {
    console.warn('[seo-indexing] marcarResultadoEnvio:', err?.message ?? err)
  }
}

/**
 * WEBHOOK de publicación: encola la URL y la empuja a los buscadores.
 * ------------------------------------------------------------------
 * Es lo que engancha el catálogo y las guías con la indexación: cada vez que
 * la IA (o una persona) publica un producto, una categoría o una guía, el
 * SERVICIO correspondiente llama a esta función (nunca un componente). Hace
 * dos cosas, en este orden:
 *   1. Encola la URL con prioridad alta (queda registrada y auditable).
 *   2. La envía YA por los canales permitidos si el flag
 *      `INDEXING_AUTO_DISPATCH_ENABLED` está activo y hay cuota diaria.
 *
 * NUNCA lanza ni bloquea la publicación: cualquier fallo (sin credenciales,
 * sin red, cuota agotada) deja la URL en cola y se registra para reintentar
 * desde el panel. Google solo recibe tipos que su Indexing API admite.
 *
 * @param publicacion Tipo y slug del contenido publicado.
 * @param usuarioEmail Correo del operador (null si lo publicó la IA).
 * @returns Qué se encoló/envió, con el detalle legible del resultado.
 */
export async function notificarPublicacionIndexable(
  publicacion: PublicacionIndexable,
  usuarioEmail?: string | null,
): Promise<{ ok: boolean; url: string; canales: string[]; detalle: string }> {
  try {
    const validada = normalizarUrlParaBuscadores(
      absoluteUrl(rutaPublicaDeContenido(publicacion.tipo, publicacion.slug)),
      getSiteOrigin(),
    )
    if (!validada.valida) return { ok: false, url: '', canales: [], detalle: validada.motivo }
    const url = validada.url

    // 1) Encolar SIEMPRE (prioridad alta: las publicaciones nuevas van al frente).
    const supabase = await createServerClient()
    const { error: encoladoError } = await supabase.from('seo_indexing_urls').upsert(
      {
        url,
        tipo: publicacion.tipo,
        ref_slug: publicacion.slug,
        lastmod: publicacion.lastmod ?? new Date().toISOString(),
        origen: publicacion.origen ?? 'publicacion',
        estado: 'pendiente',
        prioridad: publicacion.prioridad ?? INDEXING_PUBLICATION_PRIORITY,
        intentos: 0,
        ultimo_error: null,
        riesgo_politica: false,
        enviado_en: null,
      },
      { onConflict: 'url' },
    )
    if (encoladoError) {
      console.warn('[seo-indexing] no se pudo encolar la publicación:', encoladoError.message)
      return { ok: false, url, canales: [], detalle: encoladoError.message }
    }

    const plan = planificarCanales(publicacion.tipo, { googleIndexingEstricto: estaEnModoEstricto() })

    // 2) Envío inmediato (opcional: las cargas masivas lo apagan para no
    //    disparar una petición por producto).
    if (!leerBanderaEntorno('INDEXING_AUTO_DISPATCH_ENABLED', false)) {
      await registrarMovimiento({
        url,
        canal: 'indexnow',
        accion: 'publicar',
        resultado: 'omitido',
        detalle: 'Envío automático desactivado por defecto: la URL queda en cola para el panel.',
        usuarioEmail,
      })
      return { ok: true, url, canales: [], detalle: 'Encolada (envío automático desactivado por defecto).' }
    }

    const cuota = calcularCuotaDiaria((await contarEnviosDeHoy()).indexnow, INDEXING_DAILY_LIMIT)
    if (cuota.agotada) {
      await registrarMovimiento({
        url,
        canal: 'indexnow',
        accion: 'publicar',
        resultado: 'omitido',
        detalle: 'Cuota diaria alcanzada: la URL queda en cola.',
        usuarioEmail,
      })
      return { ok: true, url, canales: [], detalle: 'Cuota diaria alcanzada: queda en cola.' }
    }

    const canales: string[] = []
    let detalle = 'Encolada.'

    if (plan.indexnow) {
      const envio = await enviarUrlsAIndexNow([url])
      canales.push('indexnow')
      detalle = envio.detalle
      await registrarMovimiento({
        url,
        canal: 'indexnow',
        accion: 'publicar',
        resultado: envio.ok ? 'ok' : 'error',
        httpStatus: envio.httpStatus,
        detalle: envio.detalle,
        usuarioEmail,
      })
      await marcarResultadoEnvio(url, {
        exito: envio.ok,
        canal: 'indexnow',
        httpStatus: envio.httpStatus,
        detalle: envio.detalle,
      })
    }

    // Google: solo si el tipo lo permite (JobPosting/BroadcastEvent) o si el
    // operador desactivó el modo estricto de forma consciente.
    if (plan.google) {
      const envioGoogle = await publicarUrlEnGoogleIndexingApi(url, publicacion.tipo)
      canales.push('google_indexing')
      await registrarMovimiento({
        url,
        canal: 'google_indexing',
        accion: 'publicar',
        resultado: envioGoogle.bloqueadoPolitica ? 'bloqueado_politica' : envioGoogle.ok ? 'ok' : 'error',
        httpStatus: envioGoogle.httpStatus,
        detalle: envioGoogle.detalle,
        riesgoPolitica: envioGoogle.riesgoPolitica,
        usuarioEmail,
      })
      // El estado de la fila lo manda IndexNow (el canal masivo); la
      // notificación a Google queda auditada aparte con su propio resultado.
    } else {
      await registrarMovimiento({
        url,
        canal: 'google_indexing',
        accion: 'publicar',
        resultado: 'bloqueado_politica',
        detalle: plan.motivo,
        usuarioEmail,
      })
    }

    return { ok: true, url, canales, detalle }
  } catch (err: any) {
    // Defensivo: un problema de indexación JAMÁS debe romper la publicación.
    console.warn('[seo-indexing] notificarPublicacionIndexable:', err?.message ?? err)
    return { ok: false, url: '', canales: [], detalle: err?.message ?? 'Error notificando la publicación.' }
  }
}

/**
 * Envía una tanda de URLs pendientes por los canales permitidos.
 * ------------------------------------------------------------------
 * Flujo de la tanda (lotes de 25, máximo 100 URLs/día):
 *   1. Recupera lotes abandonados (requests caídas) para no perder URLs.
 *   2. Comprueba la cuota diaria y acota la tanda.
 *   3. Reclama el lote de forma ATÓMICA en la base de datos (RPC).
 *   4. Manda las URLs compatibles a IndexNow en UNA sola petición.
 *   5. Manda a la Indexing API de Google SOLO los tipos que admite.
 *   6. Registra el resultado de cada URL y devuelve el resumen de la tanda.
 *
 * @param opciones Tamaño de tanda y correo del operador (auditoría).
 * @returns Contadores de la tanda, mensajes legibles y cuota restante.
 */
export async function enviarLotePendiente(
  opciones: { limit?: number; usuarioEmail?: string | null } = {},
): Promise<ResultadoLoteIndexacion> {
  const supabase = await createServerClient()
  const cuotaInicial = calcularCuotaDiaria((await contarEnviosDeHoy()).indexnow, INDEXING_DAILY_LIMIT)
  const resultado: ResultadoLoteIndexacion = {
    procesadas: 0,
    enviadas: 0,
    inspeccionadas: 0,
    bloqueadas: 0,
    conError: 0,
    omitidas: 0,
    mensajes: [],
    cuota: cuotaInicial,
    resumen: resumirEstados([]),
  }

  try {
    // 1) Recuperar lotes interrumpidos (una request caída deja filas 'enviando').
    const { data: liberadas } = await supabase.rpc('seo_indexing_release_stale', {
      p_minutos: INDEXING_STALE_BATCH_MINUTES,
    })
    if (Number(liberadas) > 0) {
      resultado.mensajes.push(`Se recuperaron ${liberadas} URL(s) de un lote interrumpido.`)
    }

    if (cuotaInicial.agotada) {
      resultado.mensajes.push('Cuota diaria alcanzada (100 URLs). Se reanuda a las 00:00 UTC.')
      return resultado
    }

    // 2) Acotar la tanda con la configuración y la cuota disponible.
    const pedido = Math.max(
      1,
      Math.min(Number(opciones.limit) || SEO_INDEXING_BATCH_SIZE, SEO_INDEXING_BATCH_SIZE),
    )
    const tamano = Math.min(pedido, cuotaInicial.restantes)

    // 3) Reclamo atómico del lote (dos operadores nunca toman la misma URL).
    const { data: reclamadas, error: errorReclamo } = await supabase.rpc('seo_indexing_claim_batch', {
      p_limit: tamano,
      p_max_intentos: SEO_INDEXING_MAX_ATTEMPTS,
    })
    if (errorReclamo) {
      resultado.mensajes.push(errorReclamo.message)
      return resultado
    }

    const reclamadasFilas = (reclamadas ?? []) as IndexingUrlRow[]
    if (reclamadasFilas.length === 0) {
      resultado.mensajes.push('No hay URLs pendientes de enviar.')
      return resultado
    }

    // Guardia de cuota: si otro operador gastó cuota mientras se reclamaba, el
    // excedente vuelve a 'pendiente' (nunca se supera el límite diario).
    const cuotaActual = calcularCuotaDiaria((await contarEnviosDeHoy()).indexnow, INDEXING_DAILY_LIMIT)
    const aProcesar = seleccionarLote<IndexingUrlRow>(reclamadasFilas, tamano, cuotaActual.restantes)
    const sobrantes = reclamadasFilas.filter((fila) => !aProcesar.some((procesada) => procesada.id === fila.id))
    if (sobrantes.length > 0) {
      await supabase
        .from('seo_indexing_urls')
        .update({ estado: 'pendiente' })
        .in('id', sobrantes.map((fila) => fila.id))
      resultado.omitidas += sobrantes.length
      resultado.mensajes.push(`${sobrantes.length} URL(s) devueltas a la cola por cuota.`)
    }

    const estricto = estaEnModoEstricto()
    const planDe = (fila: IndexingUrlRow) => planificarCanales(fila.tipo, { googleIndexingEstricto: estricto })
    const finales: Array<{ estado: string }> = []

    // 4) IndexNow: una sola petición con todas las URLs compatibles.
    const filasIndexNow = aProcesar.filter((fila) => planDe(fila).indexnow)
    const filasSinCanal = aProcesar.filter((fila) => {
      const plan = planDe(fila)
      return !plan.indexnow && !plan.google
    })
    resultado.bloqueadas += filasSinCanal.length

    if (filasIndexNow.length > 0) {
      const envio = await enviarUrlsAIndexNow(filasIndexNow.map((fila) => fila.url))
      for (const fila of filasIndexNow) {
        await marcarResultadoEnvio(fila.url, {
          exito: envio.ok,
          canal: 'indexnow',
          httpStatus: envio.httpStatus,
          detalle: envio.detalle,
        })
        finales.push({ estado: envio.ok ? 'enviado' : 'pendiente' })
      }
      await registrarMovimientos(
        filasIndexNow.map((fila) => ({
          url: fila.url,
          canal: 'indexnow' as IndexingCanal,
          accion: 'publicar' as IndexingLogRow['accion'],
          resultado: (envio.ok ? 'ok' : 'error') as IndexingLogRow['resultado'],
          httpStatus: envio.httpStatus,
          detalle: envio.detalle,
          usuarioEmail: opciones.usuarioEmail ?? null,
        })),
      )
      if (envio.ok) {
        resultado.enviadas += filasIndexNow.length
        resultado.mensajes.push(envio.detalle)
      } else {
        resultado.conError += filasIndexNow.length
        resultado.mensajes.push(envio.detalle)
      }
    }

    // 5) Google Indexing API: SOLO JobPosting/BroadcastEvent (política de Google).
    const filasGoogle = aProcesar.filter((fila) => planDe(fila).google)
    for (const fila of filasGoogle) {
      const envioGoogle = await publicarUrlEnGoogleIndexingApi(fila.url, fila.tipo)
      await registrarMovimiento({
        url: fila.url,
        canal: 'google_indexing',
        accion: 'publicar',
        resultado: envioGoogle.ok ? 'ok' : 'error',
        httpStatus: envioGoogle.httpStatus,
        detalle: envioGoogle.detalle,
        riesgoPolitica: envioGoogle.riesgoPolitica,
        usuarioEmail: opciones.usuarioEmail ?? null,
      })
      if (envioGoogle.ok) {
        // Solo cuenta como "enviada" si ningún canal la había mandado ya.
        if (!filasIndexNow.some((enviada) => enviada.id === fila.id)) resultado.enviadas += 1
        resultado.mensajes.push(`Google aceptó el aviso de ${fila.url}.`)
      } else {
        resultado.conError += 1
        resultado.mensajes.push(`Google rechazó ${fila.url}: ${envioGoogle.detalle}`)
      }
    }

    // 6) Cierre: contadores y cuota real restante.
    resultado.procesadas = aProcesar.length
    resultado.resumen = resumirEstados(finales)
    resultado.cuota = calcularCuotaDiaria((await contarEnviosDeHoy()).indexnow, INDEXING_DAILY_LIMIT)
    return resultado
  } catch (err: any) {
    resultado.mensajes.push(err?.message ?? 'Error enviando el lote de indexación.')
    return resultado
  }
}

/** Código HTTP 401: credenciales inválidas o revocadas. */
const HTTP_NO_AUTORIZADO = 401

/** Código HTTP 403: la API está deshabilitada o la propiedad no está verificada. */
const HTTP_PROHIBIDO = 403

/**
 * Audita en Google una tanda de URLs ya enviadas (URL Inspection API).
 * ------------------------------------------------------------------
 * POR QUÉ existe: es la única forma oficial de saber, desde el servidor, si
 * una URL está realmente en el índice. El panel la usa para marcar las que
 * siguen SIN indexar y priorizar ahí los esfuerzos.
 *
 * Si Google responde 401/403 el problema es de CONFIGURACIÓN (API deshabilitada
 * o cuenta de servicio sin propiedad en Search Console), así que el lote se
 * CORTA en la primera respuesta: no tiene sentido gastar 24 llamadas ni llenar
 * el registro con el mismo error repetido.
 *
 * @param opciones Tamaño de tanda y correo del operador.
 * @returns Cuántas se inspeccionaron y el nuevo estado de cada una.
 */
export async function inspeccionarLoteEnGoogle(
  opciones: { limit?: number; usuarioEmail?: string | null } = {},
): Promise<ResultadoLoteIndexacion> {
  const supabase = await createServerClient()
  const cuota = calcularCuotaDiaria((await contarEnviosDeHoy()).indexnow, INDEXING_DAILY_LIMIT)
  const resultado: ResultadoLoteIndexacion = {
    procesadas: 0,
    enviadas: 0,
    inspeccionadas: 0,
    bloqueadas: 0,
    conError: 0,
    omitidas: 0,
    mensajes: [],
    cuota,
    resumen: resumirEstados([]),
  }

  try {
    const tamano = Math.max(
      1,
      Math.min(Number(opciones.limit) || SEO_INDEXING_BATCH_SIZE, SEO_INDEXING_BATCH_SIZE),
    )
    // Se auditan las enviadas/nunca auditadas primero (las que pueden haber
    // entrado en el índice), dejando al final las que ya sabemos que faltan.
    const { data, error } = await supabase
      .from('seo_indexing_urls')
      .select('*')
      .in('estado', ['enviado', 'indexado', 'no_indexado'])
      .order('inspeccionado_en', { ascending: true, nullsFirst: true })
      .limit(tamano)
    if (error) {
      resultado.mensajes.push(error.message)
      return resultado
    }

    const filas = (data ?? []) as IndexingUrlRow[]
    if (filas.length === 0) {
      resultado.mensajes.push('No hay URLs enviadas que auditar todavía.')
      return resultado
    }

    const finales: Array<{ estado: string }> = []
    const movimientos: Array<{
      url: string
      canal: IndexingCanal
      accion: IndexingLogRow['accion']
      resultado: IndexingLogRow['resultado']
      httpStatus?: number | null
      detalle?: string | null
      usuarioEmail?: string | null
    }> = []

    for (const fila of filas) {
      const inspeccion = await inspeccionarUrlEnGoogle(fila.url)
      resultado.procesadas += 1

      if (!inspeccion.ok || inspeccion.estado === 'desconocido') {
        resultado.conError += 1
        movimientos.push({
          url: fila.url,
          canal: 'inspeccion',
          accion: 'inspeccionar',
          resultado: 'error',
          httpStatus: inspeccion.httpStatus,
          detalle: inspeccion.detalle,
          usuarioEmail: opciones.usuarioEmail ?? null,
        })

        // Error de CONFIGURACIÓN: se corta el lote con un mensaje accionable.
        if (
          inspeccion.httpStatus === HTTP_NO_AUTORIZADO ||
          inspeccion.httpStatus === HTTP_PROHIBIDO
        ) {
          resultado.mensajes.push(
            `Google rechazó la auditoría (HTTP ${inspeccion.httpStatus}): ${inspeccion.detalle}`,
          )
          resultado.mensajes.push(
            'Habilita la Google Search Console API en tu proyecto de Google Cloud y confirma que la cuenta de servicio figura como Propietario de la propiedad. No se gastó cuota en el resto del lote.',
          )
          break
        }
        continue
      }

      resultado.inspeccionadas += 1
      finales.push({ estado: inspeccion.estado })
      await supabase
        .from('seo_indexing_urls')
        .update({
          estado: inspeccion.estado,
          cobertura: inspeccion.cobertura,
          inspeccionado_en: new Date().toISOString(),
          ultimo_error: null,
        })
        .eq('id', fila.id)

      movimientos.push({
        url: fila.url,
        canal: 'inspeccion',
        accion: 'inspeccionar',
        resultado: 'ok',
        httpStatus: inspeccion.httpStatus,
        detalle: inspeccion.detalle,
        usuarioEmail: opciones.usuarioEmail ?? null,
      })
    }

    await registrarMovimientos(movimientos)
    resultado.resumen = resumirEstados(finales)
    if (resultado.inspeccionadas > 0) {
      resultado.mensajes.push(`Auditadas ${resultado.inspeccionadas} URL(s) en Google Search Console.`)
    }
    return resultado
  } catch (err: any) {
    resultado.mensajes.push(err?.message ?? 'Error auditando las URLs en Google.')
    return resultado
  }
}

/**
 * Reenvía el sitemap a Google Search Console.
 * @param usuarioEmail Correo del operador (auditoría).
 * @returns Resultado con el código HTTP de Search Console.
 */
export async function reenviarSitemapAGoogleConsole(
  usuarioEmail?: string | null,
): Promise<{ ok: boolean; httpStatus: number; detalle: string }> {
  const sitemap = absoluteUrl(SITEMAP_PATH)
  const resultado = await reenviarSitemapAGoogle(sitemap)

  await registrarMovimiento({
    url: sitemap,
    canal: 'sitemap',
    accion: 'sitemap',
    resultado: resultado.ok ? 'ok' : 'error',
    httpStatus: resultado.httpStatus,
    detalle: resultado.detalle,
    usuarioEmail,
  })

  return resultado
}

/**
 * Quita URLs de la cola (no afecta a la web, solo al seguimiento).
 * @param ids Identificadores de las filas a eliminar.
 * @returns Número de filas eliminadas o el error.
 */
export async function quitarUrlsDeLaCola(
  ids: string[],
): Promise<{ eliminadas: number; error: string | null }> {
  const limpios = (ids ?? []).map(String).filter(Boolean)
  if (limpios.length === 0) return { eliminadas: 0, error: 'No se indicó ninguna URL.' }

  const supabase = await createServerClient()
  const { error } = await supabase.from('seo_indexing_urls').delete().in('id', limpios)
  if (error) return { eliminadas: 0, error: error.message }
  return { eliminadas: limpios.length, error: null }
}

/**
 * Vacía por completo la COLA de indexación (no toca el registro de auditoría).
 * ------------------------------------------------------------------
 * POR QUÉ existe: al cambiar el dominio del sitio (por ejemplo pasar de
 * `dominio.com` a `www.dominio.com`) las URLs ya guardadas dejan de coincidir
 * con las del sitemap. Vaciar y volver a sincronizar deja la cola coherente
 * con el host nuevo en 3 pasos, en vez de borrar fila por fila.
 * @returns Número de filas eliminadas o el error.
 */
export async function vaciarColaDeIndexacion(): Promise<{ eliminadas: number; error: string | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('seo_indexing_urls')
    .delete()
    .not('id', 'is', null)
    .select('id')
  if (error) return { eliminadas: 0, error: error.message }
  return { eliminadas: (data ?? []).length, error: null }
}

/**
 * Vacía por completo el registro de auditoría (requiere permiso de borrado).
 * @returns Confirmación o el error.
 */
export async function limpiarRegistroDeIndexacion(): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('seo_indexing_log').delete().not('id', 'is', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true, error: null }
}

/** Informe del auto-diagnóstico de la configuración de indexación. */
export type DiagnosticoIndexacion = {
  indexnow: {
    configurado: boolean
    /** true si el archivo público contiene la clave configurada. */
    archivoOk: boolean
    archivoUrl: string | null
    detalle: string
  }
  google: {
    configurado: boolean
    /** true si la cuenta de servicio puede obtener un access token. */
    tokenOk: boolean
    clientEmail: string | null
    siteUrl: string | null
    detalle: string
  }
  cuota: ReturnType<typeof calcularCuotaDiaria>
  mensajes: string[]
}

/**
 * Diagnóstico de la configuración de indexación (para instalaciones nuevas).
 * ------------------------------------------------------------------
 * POR QUÉ existe: al instalar la plataforma en otro dominio, lo primero que
 * falla en silencio es la verificación de IndexNow (archivo ausente) o las
 * credenciales de Google. Este chequeo lo detecta ANTES de gastar cuota:
 *   1. Descarga `/<clave>.txt` del dominio público y comprueba su contenido.
 *   2. Pide un access token a Google con la cuenta de servicio configurada.
 * No envía ninguna URL a ningún buscador.
 * @returns Informe con el estado de cada canal y mensajes accionables.
 */
export async function diagnosticarIndexacion(): Promise<DiagnosticoIndexacion> {
  const [verificacion, token] = await Promise.all([verificarArchivoClaveIndexNow(), obtenerTokenDeGoogle()])
  const google = getGoogleIndexingConfig()
  const indexnow = getIndexNowConfig()
  const cuota = calcularCuotaDiaria((await contarEnviosDeHoy()).indexnow, INDEXING_DAILY_LIMIT)

  const mensajes: string[] = []
  if (!indexnow.configurado) mensajes.push('IndexNow: ' + indexnow.motivo)
  else if (!verificacion.ok) mensajes.push('IndexNow: ' + verificacion.detalle)
  if (!google.configurado) mensajes.push('Google: ' + google.motivo)
  else if (!token.token) mensajes.push('Google: ' + (token.error ?? 'no se pudo autenticar.'))
  if (mensajes.length === 0) mensajes.push('Configuración correcta: ambos canales están operativos.')

  return {
    indexnow: {
      configurado: indexnow.configurado,
      archivoOk: verificacion.ok,
      archivoUrl: verificacion.url,
      detalle: verificacion.detalle,
    },
    google: {
      configurado: google.configurado,
      tokenOk: Boolean(token.token),
      clientEmail: google.clientEmail,
      siteUrl: google.siteUrl,
      detalle: token.token ? 'Credenciales válidas (token obtenido).' : (token.error ?? 'Sin token.'),
    },
    cuota,
    mensajes,
  }
}










