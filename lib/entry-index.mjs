/**
 * Lógica pura del ÍNDICE de guías (/guias): búsqueda, filtros, orden y paginación.
 * ------------------------------------------------------------------
 * Formato .mjs (mismo patrón que entry-rules.mjs / seo-rules.mjs) para que Node
 * lo ejecute directo en los tests y para que el componente cliente lo reutilice
 * SIN reimplementar las reglas.
 *
 * POR QUÉ existe: el hub sirve TODAS las guías publicadas en el HTML (pSEO) y el
 * filtrado/paginado se resuelve en el cliente. Al ser funciones deterministas
 * (misma entrada → misma salida) el primer render del servidor y el del cliente
 * coinciden exactamente: cero desajustes de hidratación y cero parpadeos.
 *
 * Aquí NO hay valores quemados: el tamaño de página, el tope de enlaces y el
 * orden por defecto entran por parámetro desde lib/constants.ts.
 */

/**
 * Normaliza un texto para comparar búsquedas de forma tolerante.
 * POR QUÉ: el usuario escribe "camara" y el título dice "Cámara"; también
 * "LED-RGB" y "led rgb" deben encontrar la misma guía. Se pliegan acentos,
 * mayúsculas y signos de puntuación a espacios simples.
 * @param {unknown} valor Texto crudo.
 * @returns {string} Texto normalizado ('' si no hay nada útil).
 */
export function normalizarBusquedaTexto(valor) {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Construye el texto sobre el que busca el índice de guías.
 * Incluye título, resumen, ángulo editorial, palabras clave y nombres de nicho:
 * es exactamente lo que el comprador "tiene en la cabeza" al buscar.
 * @param {import('./entry-index').EntryIndexLike} item Entrada del índice.
 * @returns {string} Texto normalizado y listo para `includes`.
 */
export function textoBuscableEntrada(item) {
  const nichos = (item?.categorias ?? []).map((categoria) => categoria?.name).filter(Boolean)
  const claves = Array.isArray(item?.keywords) ? item.keywords : []
  return normalizarBusquedaTexto(
    [item?.titulo, item?.resumen, item?.angulo, claves.join(' '), nichos].filter(Boolean).join(' '),
  )
}

/**
 * Filtra las entradas por consulta libre, tipos y nichos.
 * ------------------------------------------------------------------
 * - La consulta se aplica por TÉRMINOS (AND): "regalo gamer" exige ambos;
 *   es lo que espera el usuario al añadir palabras.
 * - `tipos` y `nichos` vacíos significan "sin filtro" (no "ninguno").
 * - Un nicho coincide si la entrada pertenece a CUALQUIERA de los elegidos.
 * @param {import('./entry-index').EntryIndexLike[]} items Entradas del índice.
 * @param {{ consulta?: string, tipos?: string[], nichos?: string[] }} [filtros] Filtros activos.
 * @returns {import('./entry-index').EntryIndexLike[]} Entradas que cumplen TODO.
 */
export function filtrarEntradas(items, filtros = {}) {
  const lista = Array.isArray(items) ? items : []
  const consulta = normalizarBusquedaTexto(filtros.consulta)
  const tipos = Array.isArray(filtros.tipos) ? filtros.tipos.filter(Boolean) : []
  const nichos = Array.isArray(filtros.nichos) ? filtros.nichos.filter(Boolean) : []
  const terminos = consulta ? consulta.split(' ') : []

  return lista.filter((item) => {
    if (tipos.length > 0 && !tipos.includes(item?.tipo)) return false

    if (nichos.length > 0) {
      const ids = (item?.categorias ?? []).map((categoria) => categoria?.id).filter(Boolean)
      if (!nichos.some((nichoId) => ids.includes(nichoId))) return false
    }

    if (terminos.length > 0) {
      const texto = textoBuscableEntrada(item)
      if (!terminos.every((termino) => texto.includes(termino))) return false
    }

    return true
  })
}

/**
 * Extrae de una entrada el tiempo de lectura usable (0 cuando no hay dato).
 * @param {import('./entry-index').EntryIndexLike} item Entrada del índice.
 * @returns {number} Minutos de lectura.
 */
function minutosDeLectura(item) {
  const minutos = Number(item?.lecturaMinutos)
  return Number.isFinite(minutos) && minutos > 0 ? minutos : 0
}

/**
 * Extrae de una entrada la fecha de publicación en milisegundos (0 si no hay).
 * @param {import('./entry-index').EntryIndexLike} item Entrada del índice.
 * @returns {number} Timestamp comparable.
 */
function fechaDePublicacion(item) {
  const fecha = Date.parse(String(item?.publicadoEn ?? ''))
  return Number.isFinite(fecha) ? fecha : 0
}

/**
 * Ordena las entradas sin mutar el array original.
 * ------------------------------------------------------------------
 * Órdenes soportados (los valores viven en ENTRY_INDEX_SORT_OPTIONS):
 *  - 'az': título A-Z con la colación del idioma activo, ignorando los signos
 *    iniciales ("¿Vale la pena…?" se ordena por la V, no por la puntuación).
 *  - 'reading': lectura más corta primero (para quien decide rápido).
 *  - cualquier otro (incluido el de por defecto 'recent'): más recientes primero.
 * El desempate es SIEMPRE el título: así la paginación es estable y una entrada
 * no salta de página entre renders.
 * @template T
 * @param {T[]} items Entradas del índice.
 * @param {string} [orden] Orden elegido por el usuario.
 * @param {string} [locale] Idioma activo (colación de títulos).
 * @returns {T[]} Copia ordenada.
 */
export function ordenarEntradas(items, orden = 'recent', locale = undefined) {
  const lista = Array.isArray(items) ? [...items] : []

  /**
   * Prepara un título para ordenar: quita signos iniciales ("¿Vale la pena…")
   * para que A-Z ordene por la PALABRA y no por la puntuación.
   */
  const tituloOrdenable = (valor) => String(valor ?? '').replace(/^[^\p{L}\p{N}]+/u, '')

  /** Compara títulos respetando el idioma activo (acentos y números). */
  const porTitulo = (a, b) =>
    tituloOrdenable(a?.titulo).localeCompare(tituloOrdenable(b?.titulo), locale, {
      sensitivity: 'base',
      numeric: true,
    })

  if (orden === 'az') return lista.sort(porTitulo)

  if (orden === 'reading') {
    return lista.sort(
      (a, b) =>
        minutosDeLectura(a) - minutosDeLectura(b) ||
        fechaDePublicacion(b) - fechaDePublicacion(a) ||
        porTitulo(a, b),
    )
  }

  return lista.sort((a, b) => fechaDePublicacion(b) - fechaDePublicacion(a) || porTitulo(a, b))
}

/**
 * Pagina una lista y devuelve la metadata que necesita el paginador.
 * La página pedida se ACOTA al rango válido: si tras filtrar la página actual ya
 * no existe, el usuario ve la última disponible en vez de un vacío confuso.
 * @template T
 * @param {T[]} items Lista completa ya filtrada y ordenada.
 * @param {number} [pagina] Página pedida (1-based).
 * @param {number} [tamanoPagina] Elementos por página.
 * @returns {{ items: T[], pagina: number, totalPaginas: number, total: number, desde: number, hasta: number }}
 */
export function paginar(items, pagina = 1, tamanoPagina = 1) {
  const lista = Array.isArray(items) ? items : []
  const total = lista.length
  const porPagina = Number(tamanoPagina) > 0 ? Math.floor(Number(tamanoPagina)) : 1
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const paginaActual = Math.min(Math.max(Math.floor(Number(pagina)) || 1, 1), totalPaginas)
  const inicio = (paginaActual - 1) * porPagina

  return {
    items: lista.slice(inicio, inicio + porPagina),
    pagina: paginaActual,
    totalPaginas,
    total,
    desde: total === 0 ? 0 : inicio + 1,
    hasta: Math.min(inicio + porPagina, total),
  }
}

/**
 * Calcula los números de página visibles del paginador, con huecos (`null`).
 * ------------------------------------------------------------------
 * POR QUÉ con huecos: con decenas de guías, listar 40 botones rompe el diseño.
 * Se conservan SIEMPRE la primera y la última página y una ventana centrada en
 * la actual; los tramos colapsados se representan con `null` (la vista pinta "…").
 * @param {number} pagina Página actual.
 * @param {number} totalPaginas Total de páginas.
 * @param {number} [maxVisibles] Máximo de elementos a pintar (incluye huecos).
 * @returns {(number|null)[]} Páginas a pintar (null = elipsis).
 */
export function numerosDePagina(pagina, totalPaginas, maxVisibles = 7) {
  const total = Math.max(1, Math.floor(Number(totalPaginas)) || 1)
  const visibles = Math.max(3, Math.floor(Number(maxVisibles)) || 7)
  if (total <= visibles) return Array.from({ length: total }, (_, indice) => indice + 1)

  const actual = Math.min(Math.max(Math.floor(Number(pagina)) || 1, 1), total)
  // Los dos huecos "…" ocupan lugar: el resto es ventana de páginas reales.
  const lado = Math.floor((visibles - 4) / 2)
  let inicio = actual - lado
  let fin = actual + lado

  // Empuja la ventana hacia dentro cuando choca con los extremos.
  if (inicio < 2) {
    fin += 2 - inicio
    inicio = 2
  }
  if (fin > total - 1) {
    inicio -= fin - (total - 1)
    fin = total - 1
  }

  const paginas = [1]
  if (inicio > 2) paginas.push(null)
  for (let numero = Math.max(2, inicio); numero <= fin; numero += 1) paginas.push(numero)
  if (fin < total - 1) paginas.push(null)
  paginas.push(total)
  return paginas
}
