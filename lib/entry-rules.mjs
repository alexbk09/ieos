/**
 * Lógica pura de las ENTRADAS SEO (guías y comparativas).
 * ------------------------------------------------------------------
 * Formato .mjs para que Node lo ejecute directamente en tests
 * (mismo patrón que seo-rules.mjs / price-calculator.mjs) y para que los
 * servicios TypeScript la importen sin duplicar reglas.
 *
 * Contiene SOLO funciones deterministas y reutilizables:
 *  - Conteo de palabras y tiempo estimado de lectura.
 *  - Validación de calidad: gate anti "thin content" y anti plantilla.
 *  - Selección de pares comparables SOLO dentro de una misma categoría.
 *  - Construcción de la tabla comparativa desde especificaciones REALES.
 *  - Constructores de schema JSON-LD (Article, ItemList y BreadcrumbList).
 *
 * POR QUÉ todo entra por parámetro: los umbrales (palabras, secciones H2,
 * longitudes, topes) viven en lib/constants.ts. Aquí no hay ningún valor
 * quemado, de modo que los tests validan la LÓGICA sin acoplarse a la
 * configuración del negocio.
 */

import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  firmaTitulo,
  separarSeccionFichaTecnica,
  stripHtml,
} from './seo-rules.mjs'

// Se re-exportan para que la capa de servicios tenga UN solo punto de entrada.
export { buildBreadcrumbSchema, buildFaqSchema, firmaTitulo, stripHtml }

/**
 * Cuenta las palabras reales del cuerpo HTML (sin etiquetas).
 * @param {string} html Cuerpo HTML del artículo.
 * @returns {number} Número de palabras.
 */
export function contarPalabras(html) {
  return stripHtml(html).split(' ').filter(Boolean).length
}

/**
 * Calcula el tiempo de lectura estimado en minutos (siempre ≥ 1).
 * POR QUÉ existe: es una señal de calidad visible para el usuario y para
 * Google (los artículos "de 1 minuto" se perciben como contenido hueco).
 * @param {string} html Cuerpo HTML del artículo.
 * @param {number} [palabrasPorMinuto] Velocidad media de lectura.
 * @returns {number} Minutos estimados (entero).
 */
export function calcularMinutosLectura(html, palabrasPorMinuto = 200) {
  const velocidad = Number(palabrasPorMinuto) > 0 ? Number(palabrasPorMinuto) : 200
  return Math.max(1, Math.ceil(contarPalabras(html) / velocidad))
}

/**
 * Indica si el cuerpo HTML YA contiene la sección con ese título (<h2>).
 * ------------------------------------------------------------------
 * POR QUÉ existe: el artículo generado incluye su propia sección
 * "Preguntas Frecuentes" dentro del cuerpo. Si además se renderiza el bloque de
 * FAQ estructurada al pie, las mismas preguntas aparecen DOS veces en la página
 * (mala UX y contenido duplicado). Con este detector la vista muestra solo una.
 *
 * Reutiliza `separarSeccionFichaTecnica` (lógica pura ya testeada en seo-rules):
 * si esa función aísla contenido, es que la sección existe de verdad.
 *
 * @param {string} html Cuerpo HTML del artículo.
 * @param {string} titulo Texto EXACTO del <h2> a buscar.
 * @returns {boolean} TRUE si la sección está presente.
 */
export function tieneSeccionEnCuerpo(html, titulo) {
  return Boolean(separarSeccionFichaTecnica(html, titulo).fichaTecnica)
}

/**
 * Valida el FONDO de una entrada generada (o escrita a mano) por la IA.
 * ------------------------------------------------------------------
 * Es el gate que protege al negocio: si el contenido es genérico, corto o
 * sin estructura, Google lo trata como "contenido basura a escala". Por eso
 * el pipeline NUNCA publica una entrada que no pase esta validación.
 *
 * @param {{
 *   titulo?: string, slug?: string, resumen?: string, cuerpo_html?: string,
 *   faq?: {pregunta:string,respuesta:string}[], keywords?: string[],
 *   productos?: unknown[], tipo?: string,
 * }} data Entrada a validar.
 * @param {{
 *   bannedPhrases?: string[], requiredSections?: string[],
 *   minTitleLength?: number, maxTitleLength?: number,
 *   minResumenLength?: number, maxResumenLength?: number,
 *   minWords?: number, minFaq?: number, maxFaq?: number,
 *   minKeywords?: number, maxKeywords?: number, minProductos?: number,
 *   requireNoH1?: boolean, allowedTipos?: readonly string[],
 * }} [opciones] Umbrales inyectados desde lib/constants.ts.
 * @returns {{ ok: boolean, errores: string[] }} Resultado del gate.
 */
export function validarCalidadEntrada(data, opciones = {}) {
  const bannedPhrases = opciones.bannedPhrases ?? []
  const requiredSections = opciones.requiredSections ?? []
  const minTitleLength = opciones.minTitleLength ?? 0
  const maxTitleLength = opciones.maxTitleLength ?? 0
  const minResumenLength = opciones.minResumenLength ?? 0
  const maxResumenLength = opciones.maxResumenLength ?? 0
  const minWords = opciones.minWords ?? 0
  const minFaq = opciones.minFaq ?? 0
  const maxFaq = opciones.maxFaq ?? 0
  const minKeywords = opciones.minKeywords ?? 0
  const maxKeywords = opciones.maxKeywords ?? 0
  const minProductos = opciones.minProductos ?? 0
  const requireNoH1 = opciones.requireNoH1 ?? true
  const allowedTipos = opciones.allowedTipos ?? []

  const errores = []
  const titulo = String(data?.titulo ?? '').trim()
  const slug = String(data?.slug ?? '').trim()
  const resumen = String(data?.resumen ?? '').trim()
  const cuerpo = String(data?.cuerpo_html ?? '')
  const faq = Array.isArray(data?.faq) ? data.faq : []
  const keywords = Array.isArray(data?.keywords) ? data.keywords : []
  const productos = Array.isArray(data?.productos) ? data.productos.filter(Boolean) : []
  const tipo = String(data?.tipo ?? '').trim()

  // Se analiza el texto LEGIBLE (sin etiquetas) para no dar falsos negativos
  // por HTML intercalado ni falsos positivos por atributos de estilo.
  const textoLegible = (titulo + ' ' + resumen + ' ' + stripHtml(cuerpo)).toLowerCase()

  // 1) Muletillas/clichés de IA: la huella del contenido producido a escala.
  for (const frase of bannedPhrases) {
    if (textoLegible.includes(String(frase).toLowerCase())) {
      errores.push('Usa la frase generica prohibida "' + frase + '".')
    }
  }

  // 2) Título con intención y longitud indexable.
  if (titulo.length < minTitleLength) {
    errores.push('El titulo tiene menos de ' + minTitleLength + ' caracteres.')
  }
  if (maxTitleLength > 0 && titulo.length > maxTitleLength) {
    errores.push('El titulo supera los ' + maxTitleLength + ' caracteres.')
  }

  // 3) Meta description: ni tan corta que no aporte, ni truncada en Google.
  if (resumen.length < minResumenLength) {
    errores.push('El resumen tiene menos de ' + minResumenLength + ' caracteres.')
  }
  if (maxResumenLength > 0 && resumen.length > maxResumenLength) {
    errores.push('El resumen supera los ' + maxResumenLength + ' caracteres.')
  }

  // 4) Slug limpio (la URL es parte del SEO: sin acentos ni signos).
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errores.push('El slug no es valido: solo minusculas, numeros y guiones simples.')
  }

  // 5) H1 único: el artículo no puede traer su propio <h1> porque la página
  //    ya lo emite (jerarquía de encabezados correcta).
  if (requireNoH1 && /<h1[\s>]/i.test(cuerpo)) {
    errores.push('El cuerpo no puede contener <h1> (debe haber un unico H1).')
  }

  // 6) Longitud mínima del cuerpo (anti thin content).
  const palabras = contarPalabras(cuerpo)
  if (palabras < minWords) {
    errores.push('El cuerpo tiene ' + palabras + ' palabras; el minimo exigido es ' + minWords + '.')
  }

  // 7) Estructura H2 obligatoria (la que Google usa para entender la guía).
  const cuerpoLower = cuerpo.toLowerCase()
  for (const seccion of requiredSections) {
    if (!cuerpoLower.includes(String(seccion).toLowerCase())) {
      errores.push('Falta la seccion obligatoria "' + seccion + '".')
    }
  }

  // 8) FAQ útil (alimenta el schema FAQPage; vacías no aportan nada).
  const faqUtiles = faq.filter(
    (item) => String(item?.pregunta ?? '').trim() && String(item?.respuesta ?? '').trim(),
  )
  if (faqUtiles.length < minFaq) {
    errores.push('Se exigen al menos ' + minFaq + ' preguntas frecuentes con respuesta.')
  }
  if (maxFaq > 0 && faqUtiles.length > maxFaq) {
    errores.push('La FAQ supera el maximo de ' + maxFaq + ' preguntas.')
  }

  // 9) Palabras clave long-tail.
  const keywordsUtiles = keywords.map((k) => String(k ?? '').trim()).filter(Boolean)
  if (keywordsUtiles.length < minKeywords) {
    errores.push('Se exigen al menos ' + minKeywords + ' palabras clave.')
  }
  if (maxKeywords > 0 && keywordsUtiles.length > maxKeywords) {
    errores.push('Las palabras clave superan el maximo de ' + maxKeywords + '.')
  }

  // 10) Anclaje al catálogo REAL: sin productos no hay comparación posible.
  if (productos.length < minProductos) {
    errores.push('Se exigen al menos ' + minProductos + ' productos reales del catalogo.')
  }

  // 11) Tipo declarado válido (cuando el consumidor aporta la lista permitida).
  if (allowedTipos.length > 0 && tipo && !allowedTipos.includes(tipo)) {
    errores.push('El tipo "' + tipo + '" no es valido.')
  }

  return { ok: errores.length === 0, errores }
}

/**
 * Normaliza una clave de especificación para comparar entre fichas distintas
 * ("Potencia", "potencia ", "POTENCIA" y "Pótencia" deben coincidir).
 * @param {string} valor Clave o etiqueta cruda.
 * @returns {string} Clave normalizada.
 */
function normalizarClave(valor) {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Selecciona pares comparables ("X vs Y") SOLO dentro de una misma categoría.
 * ------------------------------------------------------------------
 * POR QUÉ esta restricción: comparar productos de nichos distintos produce
 * páginas sin sentido para el usuario y es exactamente lo que Google castiga
 * como "doorway". Además el resultado es DETERMINISTA (mismo input → mismo
 * output, sin Math.random) para poder testearlo y para que el anti-duplicado
 * del servicio sepa qué pares ya existen.
 *
 * @param {{ id: string, categoryIds?: string[] }[]} productos Productos con sus categorías.
 * @param {{ maxPares?: number }} [opciones] Tope de pares a devolver.
 * @returns {{ categoriaId: string, a: any, b: any }[]} Pares propuestos.
 */
export function seleccionarParesComparables(productos, opciones = {}) {
  const maxPares = Math.max(Number(opciones.maxPares) || 0, 0)
  const lista = Array.isArray(productos) ? productos.filter((p) => p?.id) : []
  if (maxPares === 0 || lista.length < 2) return []

  // Índice categoriaId → productos de esa categoría.
  const porCategoria = new Map()
  for (const producto of lista) {
    const categorias = Array.isArray(producto.categoryIds) ? producto.categoryIds.filter(Boolean) : []
    for (const categoriaId of categorias) {
      if (!porCategoria.has(categoriaId)) porCategoria.set(categoriaId, [])
      porCategoria.get(categoriaId).push(producto)
    }
  }

  const pares = []
  const vistos = new Set()
  // Orden determinista: categorías y productos ordenados por id.
  for (const categoriaId of [...porCategoria.keys()].sort()) {
    const grupo = [...porCategoria.get(categoriaId)].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    )
    // Emparejamiento consecutivo (0-1, 2-3, ...): cubre el nicho sin repetir
    // el mismo producto en todos los pares (más variedad de ángulos).
    for (let i = 0; i + 1 < grupo.length; i += 2) {
      const a = grupo[i]
      const b = grupo[i + 1]
      const clave = [a.id, b.id].sort().join('|')
      if (vistos.has(clave)) continue
      vistos.add(clave)
      pares.push({ categoriaId, a, b })
      if (pares.length >= maxPares) return pares
    }
  }

  return pares
}

/**
 * Construye la tabla comparativa a partir de las especificaciones REALES.
 * ------------------------------------------------------------------
 * POR QUÉ desde la BD y no desde el texto de la IA: comparar con datos
 * inventados destruye la confianza (y la conversión). El modelo solo elige
 * QUÉ criterios importan; los valores salen siempre de `specifications`.
 *
 * @param {{ slug: string, specifications?: Record<string, string> }[]} productos Productos a comparar.
 * @param {string[]} [criterios] Etiquetas de criterio pedidas (si vacío, se derivan).
 * @param {{ maxCriterios?: number }} [opciones] Tope de filas de la tabla.
 * @returns {{ criterios: { criterio: string, valores: { slug: string, valor: string }[] }[] }}
 */
export function construirComparativa(productos, criterios, opciones = {}) {
  const maxCriterios = Math.max(Number(opciones.maxCriterios) || 0, 0)
  const lista = Array.isArray(productos) ? productos.filter((p) => p?.slug) : []
  if (lista.length === 0) return { criterios: [] }

  /** Especificaciones de cada producto indexadas por clave normalizada. */
  const specsPorProducto = lista.map((producto) => {
    const mapa = new Map()
    for (const [clave, valor] of Object.entries(producto.specifications ?? {})) {
      mapa.set(normalizarClave(clave), String(valor ?? '').trim())
    }
    return mapa
  })

  /** Deriva las etiquetas de criterio de la UNIÓN de las specs reales. */
  function derivarCriterios() {
    const derivadas = []
    for (const producto of lista) {
      for (const clave of Object.keys(producto.specifications ?? {})) {
        if (!derivadas.some((d) => normalizarClave(d) === normalizarClave(clave))) {
          derivadas.push(String(clave))
        }
      }
    }
    return derivadas
  }

  /** Construye las filas (critério + valor por producto) para unas etiquetas. */
  function construirFilas(etiquetas) {
    const filas = []
    for (const etiqueta of etiquetas) {
      const clave = normalizarClave(etiqueta)
      const valores = lista.map((producto, indice) => ({
        slug: producto.slug,
        valor: specsPorProducto[indice].get(clave) ?? '',
      }))
      // Se descarta la fila si NINGÚN producto aporta valor: una fila vacía no
      // informa y solo añade ruido visual.
      if (valores.some((v) => v.valor)) filas.push({ criterio: etiqueta, valores })
    }
    return filas
  }

  /** Recorta la lista de criterios al tope de filas de la tabla. */
  const recortar = (etiquetas) => (maxCriterios > 0 ? etiquetas.slice(0, maxCriterios) : etiquetas)

  const pedidos = (Array.isArray(criterios) ? criterios : [])
    .map((c) => String(c ?? '').trim())
    .filter(Boolean)

  let filas = construirFilas(recortar(pedidos))
  // FALLBACK: si los criterios que propuso la IA no existen en ninguna ficha (o
  // no propuso ninguno), se usan los reales del catálogo. Una tabla vacía no
  // aporta nada: es preferible comparar criterios reales que no comparar nada.
  if (filas.length === 0) filas = construirFilas(recortar(derivarCriterios()))

  return { criterios: filas }
}

/**
 * Construye el JSON-LD de tipo Article de una entrada.
 * ------------------------------------------------------------------
 * POR QUÉ se omiten los campos vacíos: un schema con `image: ''` o
 * `datePublished: ''` es marcado INVÁLIDO y Google lo reporta como error en
 * Search Console. Solo se emite lo que existe de verdad.
 * Devuelve null si faltan los dos datos imprescindibles (url y titular).
 *
 * @param {{
 *   url?: string, headline?: string, description?: string, image?: string,
 *   datePublished?: string, dateModified?: string, author?: string,
 *   keywords?: string[], section?: string, inLanguage?: string,
 *   publisher?: { name?: string, logoUrl?: string },
 * }} input Datos reales de la entrada.
 * @returns {Record<string, unknown>|null} JSON-LD listo para <script>.
 */
export function buildArticleSchema(input) {
  const url = String(input?.url ?? '').trim()
  const headline = String(input?.headline ?? '').trim()
  if (!url || !headline) return null

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }

  const description = String(input?.description ?? '').trim()
  if (description) schema.description = description

  const image = String(input?.image ?? '').trim()
  if (image) schema.image = [image]

  const datePublished = String(input?.datePublished ?? '').trim()
  if (datePublished) schema.datePublished = datePublished

  const dateModified = String(input?.dateModified ?? '').trim()
  if (dateModified) schema.dateModified = dateModified

  const author = String(input?.author ?? '').trim()
  if (author) schema.author = { '@type': 'Person', name: author }

  const publisherName = String(input?.publisher?.name ?? '').trim()
  if (publisherName) {
    schema.publisher = { '@type': 'Organization', name: publisherName }
    const logoUrl = String(input?.publisher?.logoUrl ?? '').trim()
    if (logoUrl) schema.publisher.logo = { '@type': 'ImageObject', url: logoUrl }
  }

  const keywords = (Array.isArray(input?.keywords) ? input.keywords : [])
    .map((k) => String(k ?? '').trim())
    .filter(Boolean)
  if (keywords.length > 0) schema.keywords = keywords.join(', ')

  const section = String(input?.section ?? '').trim()
  if (section) schema.articleSection = section

  const inLanguage = String(input?.inLanguage ?? '').trim()
  if (inLanguage) schema.inLanguage = inLanguage

  return schema
}

/**
 * Construye el JSON-LD ItemList de los productos comparados en la entrada.
 * Google lo usa para entender que la página lista productos concretos.
 * @param {{ name: string, url: string }[]} items Productos en el orden mostrado.
 * @param {string} [nombre] Nombre de la lista.
 * @returns {Record<string, unknown>|null} JSON-LD o null si no hay items válidos.
 */
export function buildItemListSchema(items, nombre) {
  const lista = (Array.isArray(items) ? items : []).filter((item) => item?.name && item?.url)
  if (lista.length === 0) return null

  const nombreLimpio = String(nombre ?? '').trim()
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    ...(nombreLimpio ? { name: nombreLimpio } : {}),
    itemListElement: lista.map((item, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      name: item.name,
      url: item.url,
    })),
  }
}

/**
 * Ensambla el grafo JSON-LD completo de la página de entrada.
 * ------------------------------------------------------------------
 * POR QUÉ un único @graph: evita repetir el <script> y agrupa las entidades
 * relacionadas (artículo + lista de productos + migas de pan), con datos
 * coherentes con el contenido visible.
 * Los bloques sin datos se descartan (nunca se emite schema vacío).
 *
 * @param {{
 *   article?: Parameters<typeof buildArticleSchema>[0],
 *   items?: { name: string, url: string }[],
 *   itemsName?: string,
 *   breadcrumb?: { name: string, url: string }[],
 * }} input Piezas reales de la entrada.
 * @returns {Record<string, unknown>|null} JSON-LD con @graph o null si no hay nada.
 */
export function buildEntryJsonLd(input) {
  const graph = [
    buildArticleSchema(input?.article ?? {}),
    buildItemListSchema(input?.items, input?.itemsName),
    Array.isArray(input?.breadcrumb) && input.breadcrumb.length > 0
      ? buildBreadcrumbSchema(input.breadcrumb)
      : null,
  ].filter(Boolean)

  if (graph.length === 0) return null
  return { '@context': 'https://schema.org', '@graph': graph }
}

/**
 * Elige el nicho con MENOS entradas del lote de tipos indicado.
 * ------------------------------------------------------------------
 * POR QUÉ existe: el botón "crear 3 guías" del panel debe ROTAR de nicho en
 * cada clic. Sin rotación se repetiría el mismo nicho hasta saturarlo de
 * variaciones casi idénticas (lo que Google lee como "contenido basura a
 * escala" y desperdicia autoridad interna). Rotando, un solo clic tras otro va
 * cubriendo todo el catálogo y repartiendo el enlazado interno.
 *
 * Es determinista (ante empate gana el primero de la lista) para que los tests
 * y la UI coincidan siempre en cuál es "el siguiente nicho".
 *
 * @param {{ id: string, porTipo?: Record<string, number> }[]} nichos Nichos candidatos.
 * @param {string[]} tipos Tipos de entrada que cuenta la cobertura.
 * @returns {object|null} El nicho con menor cobertura, o null si no hay nichos.
 */
export function elegirNichoMenosCubierto(nichos, tipos) {
  const lista = Array.isArray(nichos) ? nichos.filter(Boolean) : []
  if (lista.length === 0) return null
  const tiposLista = Array.isArray(tipos) ? tipos : []

  let mejor = null
  let mejorCobertura = Number.POSITIVE_INFINITY
  for (const nicho of lista) {
    const porTipo = nicho?.porTipo ?? {}
    let cobertura = 0
    for (const tipo of tiposLista) cobertura += Number(porTipo[tipo] ?? 0) || 0
    // `<` estricto: el primero con la cobertura mínima se queda con el turno.
    if (cobertura < mejorCobertura) {
      mejor = nicho
      mejorCobertura = cobertura
    }
  }
  return mejor
}

