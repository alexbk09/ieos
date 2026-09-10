import { test } from 'node:test'
import assert from 'node:assert/strict'

// Testing económico: se prueba SOLO la lógica pura de i18n (sin Supabase ni Next).
// Mismo patrón que seo-rules.test.mjs / price-calculator.test.mjs.
const {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  SOURCE_LOCALE,
  HREFLANG_X_DEFAULT,
  PUBLISHED_LOCALES,
  baseLanguage,
  isSupportedLocale,
  normalizeLocale,
  parseAcceptLanguage,
  negotiateLocale,
  buildLocalizedPath,
  localeFromPathname,
  buildHreflangAlternates,
  isPublishedLocale,
  publishedLocales,
} = await import('../lib/i18n-config.mjs')

const { resolveLocalizedValue, resolveLocalizedList, buildLocalizedSlug } = await import(
  '../lib/i18n-content.mjs'
)
const { slugify } = await import('../lib/slug.mjs')

// ---------- slugify (fuente única, re-exportada por services/catalog.ts) ----------

test('slugify normaliza acentos, signos y espacios a guiones', () => {
  assert.equal(slugify('Ratones Gamer'), 'ratones-gamer')
  assert.equal(slugify('Claviers Mécaniques'), 'claviers-mecaniques')
  assert.equal(slugify('  Teclados   Mecánicos RGB  '), 'teclados-mecanicos-rgb')
  assert.equal(slugify('Café/Leche & Azúcar'), 'cafe-leche-azucar')
})

test('slugify nunca devuelve un slug vacío (fallback determinista)', () => {
  assert.equal(slugify('¡¡¡', { stamp: 123, fallbackPrefix: 'item' }), 'item-123')
  assert.equal(slugify('', { stamp: 1 }), 'item-1')
})

// ---------- Identidad de locale ----------

test('baseLanguage reduce variantes regionales al idioma base', () => {
  assert.equal(baseLanguage('es-ES'), 'es')
  assert.equal(baseLanguage('FR-fr'), 'fr')
  assert.equal(baseLanguage('en'), 'en')
  assert.equal(baseLanguage(''), '')
  assert.equal(baseLanguage(undefined), '')
})

test('isSupportedLocale acepta variantes regionales y rechaza idiomas fuera de soporte', () => {
  assert.equal(isSupportedLocale('pt-PT'), true)
  assert.equal(isSupportedLocale('de'), true)
  assert.equal(isSupportedLocale('pl'), false)
  assert.equal(isSupportedLocale(''), false)
})

test('normalizeLocale cae al idioma por defecto si no está soportado', () => {
  assert.equal(normalizeLocale('fr-FR'), 'fr')
  assert.equal(normalizeLocale('pl-PL'), DEFAULT_LOCALE)
})

// ---------- Negociación Accept-Language ----------

test('parseAcceptLanguage ordena por calidad y descarta q=0 y "*"', () => {
  const parsed = parseAcceptLanguage('fr-CA,fr;q=0.9,en;q=0.8,de;q=0, *;q=0.5')
  assert.deepEqual(
    parsed.map((e) => e.locale),
    ['fr', 'en'],
  )
})

test('negotiateLocale prioriza la preferencia explícita (cookie/URL)', () => {
  const locale = negotiateLocale({
    preferred: 'de-DE',
    header: 'en-US,en;q=0.9',
    locales: SUPPORTED_LOCALES,
    defaultLocale: DEFAULT_LOCALE,
  })
  assert.equal(locale, 'de')
})

test('negotiateLocale elige el primer idioma soportado del header', () => {
  const locale = negotiateLocale({
    header: 'pl-PL,pl;q=0.9,fr;q=0.8,en;q=0.7',
    locales: SUPPORTED_LOCALES,
    defaultLocale: DEFAULT_LOCALE,
  })
  assert.equal(locale, 'fr')
})

test('negotiateLocale cae al idioma por defecto si nada coincide', () => {
  const locale = negotiateLocale({
    header: 'pl-PL,pl;q=0.9',
    locales: SUPPORTED_LOCALES,
    defaultLocale: DEFAULT_LOCALE,
  })
  assert.equal(locale, DEFAULT_LOCALE)
})

test('negotiateLocale ignora una preferencia no soportada y usa el header', () => {
  const locale = negotiateLocale({
    preferred: 'pl-PL',
    header: 'en-GB,en;q=0.9',
    locales: SUPPORTED_LOCALES,
    defaultLocale: DEFAULT_LOCALE,
  })
  assert.equal(locale, 'en')
})

// ---------- Rutas localizadas ----------

test('buildLocalizedPath prefija el idioma y respeta la raíz', () => {
  assert.equal(buildLocalizedPath('/categoria/ratones-gamer', 'fr'), '/fr/categoria/ratones-gamer')
  assert.equal(buildLocalizedPath('/', 'en'), '/en')
  assert.equal(buildLocalizedPath('catalogo', 'de'), '/de/catalogo')
})

test('buildLocalizedPath puede omitir el prefijo del idioma por defecto', () => {
  assert.equal(buildLocalizedPath('/catalogo', 'es', { prefixDefaultLocale: false }), '/catalogo')
  assert.equal(buildLocalizedPath('/', 'es', { prefixDefaultLocale: false }), '/')
  assert.equal(buildLocalizedPath('/catalogo', 'fr', { prefixDefaultLocale: false }), '/fr/catalogo')
})

test('localeFromPathname extrae el idioma y devuelve la ruta sin prefijo', () => {
  assert.deepEqual(localeFromPathname('/fr/categorie/claviers'), {
    locale: 'fr',
    path: '/categorie/claviers',
  })
  assert.deepEqual(localeFromPathname('/catalogo'), { locale: DEFAULT_LOCALE, path: '/catalogo' })
})

// ---------- hreflang (SEO internacional) ----------

test('buildHreflangAlternates incluye x-default apuntando al idioma por defecto', () => {
  const alternates = buildHreflangAlternates({
    pathsByLocale: {
      es: 'https://x.com/es/categoria/ratones-gamer',
      en: 'https://x.com/en/categoria/gaming-mice',
      fr: 'https://x.com/fr/categoria/ratones-gamer',
    },
    defaultLocale: DEFAULT_LOCALE,
  })
  assert.equal(alternates.es, 'https://x.com/es/categoria/ratones-gamer')
  assert.equal(alternates.fr, 'https://x.com/fr/categoria/ratones-gamer')
  assert.equal(alternates[HREFLANG_X_DEFAULT], alternates.es)
})

test('buildHreflangAlternates omite entradas vacías', () => {
  const alternates = buildHreflangAlternates({
    pathsByLocale: { es: '/es/x', en: '', fr: null },
    defaultLocale: 'es',
  })
  assert.deepEqual(Object.keys(alternates).sort(), ['es', 'x-default'])
})

// ---------- Resolución de traducciones JSONB con fallback ----------

const NAME_I18N = { en: 'Gaming Mice', es: 'Ratones Gamer', fr: 'Souris Gamer' }
const RESOLVE_OPTIONS = { sourceLocale: SOURCE_LOCALE, defaultLocale: DEFAULT_LOCALE }

test('resolveLocalizedValue devuelve la traducción exacta del idioma pedido', () => {
  assert.equal(resolveLocalizedValue(NAME_I18N, 'fr', RESOLVE_OPTIONS), 'Souris Gamer')
  assert.equal(resolveLocalizedValue(NAME_I18N, 'fr-FR', RESOLVE_OPTIONS), 'Souris Gamer')
})

test('resolveLocalizedValue aplica la cadena de fallback pedido → default → raíz', () => {
  // "de" no existe → cae al idioma por defecto (es).
  assert.equal(resolveLocalizedValue(NAME_I18N, 'de', RESOLVE_OPTIONS), 'Ratones Gamer')
  // Sin "es" ni "de" → cae a la raíz (en).
  assert.equal(resolveLocalizedValue({ en: 'Gaming Mice' }, 'de', RESOLVE_OPTIONS), 'Gaming Mice')
  // JSONB inválido, vacío o con texto en blanco → ''.
  assert.equal(resolveLocalizedValue(null, 'de', RESOLVE_OPTIONS), '')
  assert.equal(resolveLocalizedValue({}, 'de', RESOLVE_OPTIONS), '')
  assert.equal(resolveLocalizedValue({ es: '   ' }, 'es', RESOLVE_OPTIONS), '')
})

test('resolveLocalizedList resuelve FAQ traducidas con fallback', () => {
  const faq = {
    en: [{ pregunta: 'Q', respuesta: 'A' }],
    es: [{ pregunta: 'P', respuesta: 'R' }],
  }
  assert.deepEqual(resolveLocalizedList(faq, 'es', RESOLVE_OPTIONS), faq.es)
  assert.deepEqual(resolveLocalizedList(faq, 'pl', RESOLVE_OPTIONS), faq.es)
  assert.deepEqual(resolveLocalizedList(null, 'es', RESOLVE_OPTIONS), [])
})

test('buildLocalizedSlug genera el slug desde el nombre traducido', () => {
  assert.equal(buildLocalizedSlug(NAME_I18N, 'fr', RESOLVE_OPTIONS), 'souris-gamer')
  assert.equal(buildLocalizedSlug({ es: 'Ratones Gamer' }, 'pl', RESOLVE_OPTIONS), 'ratones-gamer')
  assert.equal(buildLocalizedSlug(null, 'fr', RESOLVE_OPTIONS), '')
})

// ---------- Coherencia de la configuración de locales ----------

test('DEFAULT_LOCALE es el primer locale soportado (invariante de configuración)', () => {
  assert.equal(SUPPORTED_LOCALES[0], DEFAULT_LOCALE)
  assert.ok(SUPPORTED_LOCALES.includes(SOURCE_LOCALE))
  assert.ok(SUPPORTED_LOCALES.includes(DEFAULT_LOCALE))
})

// ---------- Idiomas publicados (control de exposición a Google) ----------

test('PUBLISHED_LOCALES es subconjunto de SUPPORTED_LOCALES e incluye el default', () => {
  for (const locale of PUBLISHED_LOCALES) assert.ok(SUPPORTED_LOCALES.includes(locale))
  assert.ok(PUBLISHED_LOCALES.includes(DEFAULT_LOCALE))
})

test('isPublishedLocale acepta variantes regionales y rechaza idiomas no publicados', () => {
  assert.equal(isPublishedLocale('es-ES'), true)
  assert.equal(isPublishedLocale('fr'), false) // traducible pero aún no publicado
  assert.equal(isPublishedLocale(''), false)
})

test('publishedLocales fuerza el idioma por defecto y descarta idiomas inválidos', () => {
  assert.deepEqual(publishedLocales(['fr', 'zz', 'es']), ['fr', 'es'])
  // Si la lista no incluye el default, se antepone.
  assert.deepEqual(publishedLocales(['fr']), [DEFAULT_LOCALE, 'fr'])
  assert.deepEqual(publishedLocales([]), [DEFAULT_LOCALE])
})

// ---------- Núcleo de traducción (lib/i18n-translate.mjs) ----------

const {
  TARGET_LOCALES,
  buildCategoryMessages,
  parseTranslationResponse,
  mergeCategoryTranslations,
  mergeProductTranslations,
} = await import('../lib/i18n-translate.mjs')

test('TARGET_LOCALES excluye el idioma raíz (no se traduce a sí mismo)', () => {
  assert.ok(!TARGET_LOCALES.includes(SOURCE_LOCALE))
  assert.equal(TARGET_LOCALES.length, SUPPORTED_LOCALES.length - 1)
})

test('buildCategoryMessages pide los idiomas destino e incluye el nombre de origen', () => {
  const messages = buildCategoryMessages({ nombre: 'Gaming Mice', descripcion: 'x', locales: ['es', 'fr'] })
  assert.equal(messages[0].role, 'system')
  assert.equal(messages[1].role, 'user')
  const payload = JSON.parse(messages[1].content)
  assert.equal(payload.nombre_origen, 'Gaming Mice')
  assert.deepEqual(payload.idiomas_destino, ['es', 'fr'])
})

test('parseTranslationResponse limpia cercas ```json y valida la forma', () => {
  const ok = parseTranslationResponse('```json\n{"es":{"name":"Ratones"}}\n```')
  assert.equal(ok.success, true)
  assert.equal(ok.data.es.name, 'Ratones')

  assert.equal(parseTranslationResponse('').success, false)
  assert.equal(parseTranslationResponse('no-json').success, false)
  assert.equal(parseTranslationResponse('[1,2,3]').success, false)
})

test('mergeCategoryTranslations conserva el idioma raíz y genera slugs en local', () => {
  const row = { name: 'Gaming Mice', slug: 'gaming-mice', name_i18n: null, slug_i18n: null }
  const mapas = mergeCategoryTranslations(row, {
    es: { name: 'Ratones Gamer', description: 'Desc es' },
    fr: { name: 'Souris Gamer', description: 'Desc fr' },
    // "de" se omite a propósito: no debe crear una clave vacía.
  })
  // El idioma raíz se hereda del dato base: URL indexada intacta.
  assert.equal(mapas.name_i18n.en, 'Gaming Mice')
  assert.equal(mapas.slug_i18n.en, 'gaming-mice')
  assert.equal(mapas.name_i18n.es, 'Ratones Gamer')
  assert.equal(mapas.slug_i18n.es, 'ratones-gamer')
  assert.equal(mapas.slug_i18n.fr, 'souris-gamer')
  assert.equal(mapas.description_i18n.fr, 'Desc fr')
  assert.equal(mapas.name_i18n.de, undefined)
})

test('mergeCategoryTranslations preserva traducciones existentes al añadir idiomas', () => {
  const row = {
    name: 'Gaming Mice',
    slug: 'gaming-mice',
    name_i18n: { es: 'Ratones Gamer' },
    slug_i18n: { es: 'ratones-gamer' },
    description_i18n: { es: 'Desc es' },
  }
  const mapas = mergeCategoryTranslations(row, { de: { name: 'Gaming Mäuse' } })
  assert.equal(mapas.name_i18n.es, 'Ratones Gamer')
  assert.equal(mapas.name_i18n.de, 'Gaming Mäuse')
  assert.equal(mapas.slug_i18n.de, 'gaming-mause')
})

test('mergeProductTranslations fusiona nombre y título SEO por idioma', () => {
  const resultado = mergeProductTranslations(
    { fr: { name: 'Souris', titulo_seo: 'Viejo' } },
    {
      fr: { name: 'Souris Gamer', titulo_seo: 'Souris Gamer sans fil' },
      es: { name: 'Ratón Gamer' },
    },
  )
  assert.deepEqual(resultado.fr, { name: 'Souris Gamer', titulo_seo: 'Souris Gamer sans fil' })
  assert.deepEqual(resultado.es, { name: 'Ratón Gamer' })
  // Idiomas no solicitados no se crean.
  assert.equal(resultado.de, undefined)
})

test('mergeProductTranslations ignora entradas vacías y normaliza JSONB inválido', () => {
  assert.deepEqual(mergeProductTranslations(null, { es: { name: '   ' } }), {})
  assert.deepEqual(mergeProductTranslations([1, 2], { es: {} }), {})
})

// ---------- Mensajes de interfaz (lib/i18n-messages.mjs) ----------

const { MESSAGES, MESSAGE_LOCALES, translate, createTranslator } = await import(
  '../lib/i18n-messages.mjs'
)

test('MESSAGES define un diccionario para cada idioma soportado', () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.ok(MESSAGES[locale], 'falta el diccionario de ' + locale)
  }
  assert.deepEqual([...MESSAGE_LOCALES].sort(), [...SUPPORTED_LOCALES].sort())
})

test('todos los diccionarios cubren EXACTAMENTE las mismas claves (sin huecos)', () => {
  const base = Object.keys(MESSAGES[DEFAULT_LOCALE]).sort()
  assert.ok(base.length > 0)
  for (const locale of MESSAGE_LOCALES) {
    assert.deepEqual(
      Object.keys(MESSAGES[locale]).sort(),
      base,
      'claves distintas en el idioma ' + locale,
    )
  }
})

test('translate devuelve el texto del idioma pedido (acepta variantes regionales)', () => {
  assert.equal(translate(MESSAGES, 'es', 'header.openCart'), 'Abrir carrito')
  assert.equal(translate(MESSAGES, 'fr', 'header.openCart'), 'Ouvrir le panier')
  assert.equal(translate(MESSAGES, 'fr-FR', 'header.openCart'), 'Ouvrir le panier')
})

test('translate cae al idioma por defecto y, como último recurso, a la clave', () => {
  assert.equal(translate(MESSAGES, 'pl', 'header.openCart'), MESSAGES[DEFAULT_LOCALE]['header.openCart'])
  assert.equal(translate(MESSAGES, 'es', 'no.existe'), 'no.existe')
  assert.equal(translate({}, 'es', 'sin.diccionario'), 'sin.diccionario')
})

test('createTranslator interpola variables y conserva los marcadores sin valor', () => {
  const t = createTranslator({ es: { saludo: 'Hola {nombre}' } }, 'es')
  assert.equal(t('saludo', { nombre: 'Ana' }), 'Hola Ana')
  assert.equal(t('saludo'), 'Hola {nombre}')
})




