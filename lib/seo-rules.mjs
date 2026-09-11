/**
 * Lógica pura del módulo SEO (sin dependencias de Supabase ni de Next).
 * ------------------------------------------------------------------
 * Formato .mjs para que Node lo ejecute directamente en tests
 * (mismo patrón que price-calculator.mjs / form-validation.mjs).
 *
 * Contiene SOLO funciones deterministas y reutilizables:
 *  - Normalización/firma de títulos (anti-duplicado).
 *  - Validación de calidad del contenido generado por la IA.
 *  - Constructores de schema JSON-LD (BreadcrumbList y FAQPage).
 *
 * Las reglas configurables (frases prohibidas, secciones obligatorias,
 * longitudes) se inyectan por parámetro para no quemar "magic numbers":
 * la fuente única de esos valores es lib/constants.ts.
 */

/**
 * Normaliza un texto: minúsculas, sin acentos ni signos, espacios simples.
 * @param {string} titulo Texto de entrada.
 * @returns {string} Texto normalizado.
 */
export function normalizarTitulo(titulo) {
  return String(titulo ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrae la "firma" anti-duplicado de un título: las primeras N palabras.
 * @param {string} titulo Título a firmar.
 * @param {number} [maxPalabras] Nº de palabras significativas.
 * @returns {string} Firma normalizada.
 */
export function firmaTitulo(titulo, maxPalabras = 4) {
  return normalizarTitulo(titulo).split(' ').filter(Boolean).slice(0, maxPalabras).join(' ')
}

/**
 * Convierte HTML a texto plano (para respuestas de FAQ en el schema).
 * @param {string} html HTML de entrada.
 * @returns {string} Texto plano sin etiquetas.
 */
export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Valida el FONDO del contenido SEO generado por la IA.
 * @param {{titulo_seo:string,descripcion_html:string}} data Contenido.
 * @param {{bannedPhrases?:string[],requiredSections?:string[],minTitleLength?:number,requireNoH1?:boolean}} [opciones]
 * @returns {{ ok: boolean, errores: string[] }}
 */
export function validarCalidadSeo(data, opciones = {}) {
  const bannedPhrases = opciones.bannedPhrases ?? []
  const requiredSections = opciones.requiredSections ?? []
  const minTitleLength = opciones.minTitleLength ?? 0
  const requireNoH1 = opciones.requireNoH1 ?? true

  const errores = []
  const titulo = String(data?.titulo_seo ?? '')
  const descripcion = String(data?.descripcion_html ?? '')
  const tituloLower = titulo.toLowerCase()
  const descLower = descripcion.toLowerCase()

  for (const frase of bannedPhrases) {
    const objetivo = String(frase).toLowerCase()
    if (tituloLower.includes(objetivo) || descLower.includes(objetivo)) {
      errores.push('Usa la frase generica prohibida "' + frase + '".')
    }
  }

  if (titulo.trim().length < minTitleLength) {
    errores.push('El titulo tiene menos de ' + minTitleLength + ' caracteres.')
  }

  if (requireNoH1 && /<h1[\s>]/i.test(descripcion)) {
    errores.push('La descripcion no puede contener <h1> (debe haber un unico H1).')
  }

  for (const seccion of requiredSections) {
    if (!descLower.includes(String(seccion).toLowerCase())) {
      errores.push('Falta la seccion obligatoria "' + seccion + '".')
    }
  }

  return { ok: errores.length === 0, errores }
}

/**
 * Construye el JSON-LD BreadcrumbList (migas de pan estructuradas).
 * @param {{name:string,url:string}[]} items Niveles ordenados.
 * @returns {Record<string, unknown>}
 */
export function buildBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: (items ?? []).map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/**
 * Construye el JSON-LD FAQPage a partir de la FAQ estructurada.
 * Devuelve null si no hay preguntas válidas (nunca emite schema vacío).
 * @param {{pregunta:string,respuesta:string}[]|null|undefined} faq
 * @returns {Record<string, unknown>|null}
 */
export function buildFaqSchema(faq) {
  const items = (faq ?? []).filter((f) => f?.pregunta?.trim() && f?.respuesta?.trim())
  if (items.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.pregunta.trim(),
      acceptedAnswer: { '@type': 'Answer', text: stripHtml(f.respuesta) },
    })),
  }
}

/**
 * Separa la sección de la FICHA TÉCNICA del resto de la descripción.
 * ------------------------------------------------------------------
 * POR QUÉ existe: la IA redacta el "párrafo fluido" de la ficha técnica DENTRO
 * de la descripción (bajo un <h2> fijo, ver SEO_OPTIONAL_SPECS_SECTION). El
 * frontend lo muestra en una PESTAÑA aparte, así que necesita aislarlo sin
 * romper el HTML y SIN volver a consultar la BD ni re-generar contenido.
 *
 * Regla determinista: la sección va desde el <h2> con el título indicado hasta
 * el SIGUIENTE <h2> (o el final del HTML). Los <h3> internos pertenecen a la
 * sección. Si el título no existe, la descripción se devuelve intacta.
 *
 * @param {string} html Descripción HTML completa.
 * @param {string} titulo Texto EXACTO del <h2> que abre la sección.
 * @returns {{ descripcion: string, fichaTecnica: string }} Descripción sin la
 *   sección y la sección aislada ('' si no existe).
 */
export function separarSeccionFichaTecnica(html, titulo) {
  const texto = String(html ?? '')
  const tituloLimpio = String(titulo ?? '').trim()
  if (!texto || !tituloLimpio) return { descripcion: texto, fichaTecnica: '' }

  // Escapa el título para usarlo dentro de una RegExp (evita inyección de patrón).
  const escapado = tituloLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Tolerante a atributos y espacios dentro del <h2>.
  const apertura = new RegExp('<h2[^>]*>\\s*' + escapado + '\\s*</h2>', 'i')
  const coincidencia = apertura.exec(texto)
  if (!coincidencia) return { descripcion: texto, fichaTecnica: '' }

  const inicio = coincidencia.index
  const despuesDeApertura = texto.slice(inicio + coincidencia[0].length)
  // La sección termina en el SIGUIENTE <h2>; si no hay, llega hasta el final.
  const indiceSiguiente = despuesDeApertura.search(/<h2[\s>]/i)

  const fichaTecnica =
    (indiceSiguiente === -1 ? despuesDeApertura : despuesDeApertura.slice(0, indiceSiguiente)).trim()
  const cola = indiceSiguiente === -1 ? '' : despuesDeApertura.slice(indiceSiguiente)

  return {
    descripcion: (texto.slice(0, inicio) + cola).replace(/\s+/g, ' ').trim(),
    fichaTecnica,
  }
}

