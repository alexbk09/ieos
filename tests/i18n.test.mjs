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

const { resolveLocalizedValue, resolveLocalizedList, resolveProductTranslations, buildLocalizedSlug } = await import(
  '../lib/i18n-content.mjs'
)
const { resolveSiteSettings, TRANSLATABLE_SETTINGS_KEYS, normalizeNavLinks, mergeNavLinks } = await import(
  '../lib/site-settings-i18n.mjs'
)
const { slugify } = await import('../lib/slug.mjs')
const {
  missingEntryLocales,
  mergeEntryTranslations,
  buildEntryMessages,
  chunkLocales,
  nameFingerprint,
  isSourceLocaleNamePending,
  buildSourceLocaleNameMessages,
  parseSourceLocaleName,
  mergeSourceLocaleName,
} = await import('../lib/i18n-translate.mjs')

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
  // Sin "es" ni "de" → cae a la raíz (es) y, si tampoco, al primer valor.
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

test('resolveProductTranslations resuelve name/titulo_seo/description/seo_faq del idioma pedido', () => {
  const translations = {
    en: {
      name: 'Gaming Mouse',
      titulo_seo: 'Wireless Gaming Mouse',
      description: '<p>Great mouse</p>',
      seo_faq: [{ pregunta: 'Wired?', respuesta: 'No.' }],
    },
    fr: { name: 'Souris Gamer', titulo_seo: 'Souris Gamer sans fil' },
  }
  const base = {
    name: 'Ratón Gamer',
    titulo_seo: 'Ratón Gamer Inalámbrico',
    description: '<p>Gran ratón</p>',
    seo_faq: [{ pregunta: '¿Cable?', respuesta: 'No.' }],
  }
  assert.deepEqual(resolveProductTranslations(translations, base, 'en', RESOLVE_OPTIONS), {
    name: 'Gaming Mouse',
    titulo_seo: 'Wireless Gaming Mouse',
    description: '<p>Great mouse</p>',
    seo_faq: [{ pregunta: 'Wired?', respuesta: 'No.' }],
  })
  // "fr" no trae cuerpo ni FAQ: cae al dato base (raíz), NUNCA a "en".
  const fr = resolveProductTranslations(translations, base, 'fr', RESOLVE_OPTIONS)
  assert.equal(fr.name, 'Souris Gamer')
  assert.equal(fr.description, '<p>Gran ratón</p>')
  assert.deepEqual(fr.seo_faq, base.seo_faq)
})

test('resolveProductTranslations NO cae en otro idioma: usa el dato base (raíz)', () => {
  const base = { name: 'Ratón Gamer', titulo_seo: null }
  // Sin traducción de "de" → devuelve la base (es), NUNCA "en" ni "fr".
  assert.equal(
    resolveProductTranslations({ en: { name: 'Gaming Mouse' } }, base, 'de', RESOLVE_OPTIONS).name,
    'Ratón Gamer',
  )
  // Sin traducciones ni base → cadenas vacías y lista vacía (no inventa texto).
  assert.deepEqual(resolveProductTranslations(null, { name: null, titulo_seo: null }, 'fr', RESOLVE_OPTIONS), {
    name: '',
    titulo_seo: '',
    description: '',
    seo_faq: [],
  })
})

// ---------- Textos configurables multilenguaje (site_settings.i18n) ----------

const BASE_SETTINGS = {
  company_name: 'Tienda',
  tagline: 'Las mejores ofertas',
  whatsapp_number: '58412',
  nav_links: [
    { href: '/', label: 'Inicio' },
    { href: '/catalogo', label: 'Ofertas' },
  ],
  hero_texts: { title: 'Hola', primaryHref: '#catalogo', stats: [{ value: '+1.000', label: 'productos' }] },
  i18n: {
    en: {
      company_name: 'Shop',
      nav_links: [
        { href: '/', label: 'Home' },
        { href: '/catalogo', label: 'Deals' },
      ],
      hero_texts: { title: 'Hi' },
    },
  },
}

test('resolveSiteSettings devuelve la base si el idioma no tiene overrides', () => {
  assert.equal(resolveSiteSettings(BASE_SETTINGS, 'de'), BASE_SETTINGS)
  assert.equal(resolveSiteSettings(BASE_SETTINGS, null), BASE_SETTINGS)
})

test('resolveSiteSettings aplica el override del idioma (deep merge + arrays)', () => {
  const en = resolveSiteSettings(BASE_SETTINGS, 'en')
  assert.equal(en.company_name, 'Shop')
  assert.equal(en.tagline, 'Las mejores ofertas') // no traducido: se conserva la base
  assert.equal(en.whatsapp_number, '58412') // no traducible: intacto
  assert.deepEqual(en.nav_links, [
    { href: '/', label: 'Home' },
    { href: '/catalogo', label: 'Deals' },
  ])
  assert.equal(en.hero_texts.title, 'Hi') // override
  assert.equal(en.hero_texts.primaryHref, '#catalogo') // merge profundo: se conserva del base
  assert.deepEqual(en.hero_texts.stats, [{ value: '+1.000', label: 'productos' }]) // array base intacto
})

test('resolveSiteSettings acepta variantes regionales (fr-CA → fr)', () => {
  const settings = { tagline: 'Base', i18n: { fr: { tagline: 'Base FR' } } }
  assert.equal(resolveSiteSettings(settings, 'fr-CA').tagline, 'Base FR')
})

test('resolveSiteSettings NO pierde enlaces del menú añadidos después de traducir', () => {
  // Regresión real: "Guías" se añadió a la base DESPUÉS de la traducción, así que
  // el array traducido (viejo) no lo traía y el botón desaparecía en EN/FR/DE...
  const settings = {
    nav_links: [
      { href: '/', label: 'Inicio' },
      { href: '/guias', label: 'Guías' },
      { href: '/catalogo', label: 'Catálogo', highlight: true },
    ],
    i18n: {
      en: {
        nav_links: [
          { href: '/', label: 'Home' },
          // Ancla VIEJA que ya no existe en la base: debe ignorarse.
          { href: '/#studio', label: 'Our space' },
          { href: '/catalogo', label: 'Full catalog', highlight: true },
        ],
      },
    },
  }
  assert.deepEqual(resolveSiteSettings(settings, 'en').nav_links, [
    { href: '/', label: 'Home' },
    // Sin traducción todavía: conserva la etiqueta base (nunca desaparece).
    { href: '/guias', label: 'Guías' },
    { href: '/catalogo', label: 'Full catalog', highlight: true },
  ])
})

test('normalizeNavLinks sanea el menú guardado como OBJETO (bug del editor)', () => {
  // Forma corrupta que dejó el panel: índices numéricos + clave anidada.
  const corrupto = {
    0: { href: '/', label: 'Inicio' },
    1: { href: '/catalogo', label: 'Catálogo', highlight: true },
    nav_links: [{ href: '/guias', label: 'Guías' }],
  }
  assert.deepEqual(normalizeNavLinks(corrupto), [
    { href: '/', label: 'Inicio' },
    { href: '/catalogo', label: 'Catálogo', highlight: true },
    { href: '/guias', label: 'Guías' },
  ])
  // Entradas inservibles (sin href/label) y valores no-array no rompen el menú.
  assert.deepEqual(normalizeNavLinks([{ href: '', label: 'x' }, { href: '/ok', label: '' }]), [])
  assert.deepEqual(normalizeNavLinks(null), [])
  assert.deepEqual(normalizeNavLinks({}), [])
})

test('mergeNavLinks: la base manda en estructura y el idioma en la etiqueta', () => {
  const base = [{ href: '/', label: 'Inicio' }, { href: '/guias', label: 'Guías' }]
  assert.deepEqual(mergeNavLinks(base, undefined), base)
  // Sin base utilizable, el override es la única fuente (no deja el menú vacío).
  assert.deepEqual(mergeNavLinks(null, base), base)
  // Base vacía y override con enlaces → se usa el override.
  assert.deepEqual(mergeNavLinks([], base), base)
})

test('TRANSLATABLE_SETTINGS_KEYS excluye campos técnicos (theme, urls, mapas)', () => {
  assert.ok(!TRANSLATABLE_SETTINGS_KEYS.includes('theme'))
  assert.ok(!TRANSLATABLE_SETTINGS_KEYS.includes('social_links'))
  assert.ok(!TRANSLATABLE_SETTINGS_KEYS.includes('map_lat'))
  assert.ok(TRANSLATABLE_SETTINGS_KEYS.includes('hero_texts'))
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
  // Todos los idiomas SOPORTADOS están publicados hoy (los 6).
  for (const locale of SUPPORTED_LOCALES) assert.equal(isPublishedLocale(locale), true)
  assert.equal(isPublishedLocale('es-VE'), true)
  // Un idioma fuera de SUPPORTED_LOCALES nunca se considera publicado.
  assert.equal(isPublishedLocale('ja'), false)
  assert.equal(isPublishedLocale(''), false)
})

test('publishedLocales() devuelve los 6 idiomas soportados y siempre el default', () => {
  const idiomas = publishedLocales()
  assert.deepEqual(idiomas, [...SUPPORTED_LOCALES])
  assert.ok(idiomas.includes(DEFAULT_LOCALE))
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
  missingProductLocales,
  missingCategoryLocales,
  normalizeFaqList,
  buildCategoryMessages,
  buildProductMessages,
  parseTranslationResponse,
  mergeCategoryTranslations,
  mergeProductTranslations,
} = await import('../lib/i18n-translate.mjs')

test('TARGET_LOCALES excluye el idioma raíz (no se traduce a sí mismo)', () => {
  assert.ok(!TARGET_LOCALES.includes(SOURCE_LOCALE))
  assert.equal(TARGET_LOCALES.length, SUPPORTED_LOCALES.length - 1)
})

test('missingProductLocales exige nombre y descripción por idioma', () => {
  const row = {
    description: '<p>Cuerpo</p>',
    translations: { en: { name: 'Mouse' }, fr: { name: 'Souris', description: '<p>Corps</p>' } },
  }
  // "en" tiene nombre pero no descripción → pendiente; "fr" completo → no.
  assert.deepEqual(missingProductLocales(row), ['en', 'de', 'it', 'pt'])
})

test('missingProductLocales no exige descripción si el producto no la tiene', () => {
  const row = { description: null, translations: { en: { name: 'Mouse' } } }
  assert.deepEqual(missingProductLocales(row), ['fr', 'de', 'it', 'pt'])
})

test('missingCategoryLocales exige slug y, si existe, el SEO editorial del hub', () => {
  const row = {
    seo_title: 'Mejores ratones',
    seo_intro: '<h2>Guia</h2>',
    seo_faq: [{ pregunta: 'Q', respuesta: 'A' }],
    name_i18n: { en: 'Gaming Mice' },
    slug_i18n: { en: 'gaming-mice' },
    seo_title_i18n: { en: 'Best mice' },
    // Falta la intro y la FAQ traducidas de "en".
  }
  assert.deepEqual(missingCategoryLocales(row), ['en', 'fr', 'de', 'it', 'pt'])

  // Con intro y FAQ traducidas, "en" deja de estar pendiente.
  const completo = {
    ...row,
    seo_intro_i18n: { en: '<h2>Guide</h2>' },
    seo_faq_i18n: { en: [{ pregunta: 'Which?', respuesta: 'It depends.' }] },
  }
  assert.ok(!missingCategoryLocales(completo).includes('en'))
})

test('missingCategoryLocales ignora el SEO cuando no existe en el idioma raíz', () => {
  // Sin seo_title/intro/faq base: basta con nombre + slug traducidos.
  const row = { name_i18n: { en: 'Gaming Mice' }, slug_i18n: { en: 'gaming-mice' } }
  assert.ok(!missingCategoryLocales(row).includes('en'))
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
  const row = { name: 'Ratones Gamer', slug: 'ratones-gamer', name_i18n: null, slug_i18n: null }
  const mapas = mergeCategoryTranslations(row, {
    en: { name: 'Gaming Mice', description: 'Desc en' },
    fr: { name: 'Souris Gamer', description: 'Desc fr' },
    // "de" se omite a propósito: no debe crear una clave vacía.
  })
  // El idioma raíz (es) se hereda del dato base: URL indexada intacta.
  assert.equal(mapas.name_i18n.es, 'Ratones Gamer')
  assert.equal(mapas.slug_i18n.es, 'ratones-gamer')
  assert.equal(mapas.name_i18n.en, 'Gaming Mice')
  assert.equal(mapas.slug_i18n.en, 'gaming-mice')
  assert.equal(mapas.slug_i18n.fr, 'souris-gamer')
  assert.equal(mapas.description_i18n.fr, 'Desc fr')
  assert.equal(mapas.name_i18n.de, undefined)
})

test('mergeCategoryTranslations preserva traducciones existentes al añadir idiomas', () => {
  const row = {
    name: 'Ratones Gamer',
    slug: 'ratones-gamer',
    name_i18n: { en: 'Gaming Mice' },
    slug_i18n: { en: 'gaming-mice' },
    description_i18n: { en: 'Desc en' },
  }
  const mapas = mergeCategoryTranslations(row, { de: { name: 'Gaming Mäuse' } })
  assert.equal(mapas.name_i18n.en, 'Gaming Mice')
  assert.equal(mapas.name_i18n.de, 'Gaming Mäuse')
  assert.equal(mapas.slug_i18n.de, 'gaming-mause')
})

test('mergeProductTranslations fusiona nombre y título SEO por idioma', () => {
  const resultado = mergeProductTranslations(
    { fr: { name: 'Souris', titulo_seo: 'Viejo' } },
    {
      fr: { name: 'Souris Gamer', titulo_seo: 'Souris Gamer sans fil' },
      en: { name: 'Gaming Mouse' },
    },
  )
  assert.deepEqual(resultado.fr, { name: 'Souris Gamer', titulo_seo: 'Souris Gamer sans fil' })
  assert.deepEqual(resultado.en, { name: 'Gaming Mouse' })
  // Idiomas no solicitados no se crean.
  assert.equal(resultado.de, undefined)
})

test('mergeProductTranslations ignora entradas vacías y normaliza JSONB inválido', () => {
  assert.deepEqual(mergeProductTranslations(null, { en: { name: '   ' } }), {})
  assert.deepEqual(mergeProductTranslations([1, 2], { en: {} }), {})
})

test('buildProductMessages incluye la descripción y la FAQ de origen', () => {
  const messages = buildProductMessages({
    nombre: 'Ratón Gamer',
    tituloSeo: 'Ratón inalámbrico',
    descripcion: '<h2>Características</h2>',
    seoFaq: [{ pregunta: '¿Cable?', respuesta: 'No.' }],
    locales: ['en', 'fr'],
  })
  const payload = JSON.parse(messages[1].content)
  assert.equal(payload.descripcion_origen, '<h2>Características</h2>')
  assert.deepEqual(payload.seo_faq_origen, [{ pregunta: '¿Cable?', respuesta: 'No.' }])
  assert.deepEqual(payload.idiomas_destino, ['en', 'fr'])
})

test('buildCategoryMessages incluye el contenido editorial del hub de origen', () => {
  const messages = buildCategoryMessages({
    nombre: 'Ratones Gamer',
    descripcion: 'Los mejores ratones.',
    seoTitle: 'Los mejores ratones gamer',
    seoIntro: '<h2>Guía de compra</h2>',
    seoFaq: [{ pregunta: '¿Cuál elegir?', respuesta: 'Depende del uso.' }],
    locales: ['en'],
  })
  const payload = JSON.parse(messages[1].content)
  assert.equal(payload.seo_title_origen, 'Los mejores ratones gamer')
  assert.equal(payload.seo_intro_origen, '<h2>Guía de compra</h2>')
  assert.deepEqual(payload.seo_faq_origen, [{ pregunta: '¿Cuál elegir?', respuesta: 'Depende del uso.' }])
})

test('normalizeFaqList descarta elementos inválidos o incompletos', () => {
  assert.deepEqual(normalizeFaqList(null), [])
  assert.deepEqual(normalizeFaqList('nope'), [])
  assert.deepEqual(
    normalizeFaqList([
      { pregunta: 'Q', respuesta: 'A' },
      { pregunta: '   ', respuesta: 'A' },
      { pregunta: 'Q2' },
      'nope',
      { pregunta: 'Q3', respuesta: '  A3  ' },
    ]),
    [
      { pregunta: 'Q', respuesta: 'A' },
      { pregunta: 'Q3', respuesta: 'A3' },
    ],
  )
})

test('mergeProductTranslations conserva la descripción y la FAQ traducidas', () => {
  const resultado = mergeProductTranslations(
    { fr: { name: 'Souris', description: '<p>Ancienne</p>', seo_faq: [{ pregunta: 'Vieja', respuesta: 'Si.' }] } },
    {
      fr: { name: 'Souris Gamer', description: '<p>Nouvelle</p>', seo_faq: [{ pregunta: 'Neuve', respuesta: 'Oui.' }] },
      // Solo el nombre: ningún otro campo se crea ni se borra.
      en: { name: 'Gaming Mouse' },
    },
  )
  assert.deepEqual(resultado.fr, {
    name: 'Souris Gamer',
    description: '<p>Nouvelle</p>',
    seo_faq: [{ pregunta: 'Neuve', respuesta: 'Oui.' }],
  })
  assert.deepEqual(resultado.en, { name: 'Gaming Mouse' })
})

test('mergeCategoryTranslations traduce también el contenido editorial del hub', () => {
  const row = { name: 'Ratones Gamer', slug: 'ratones-gamer' }
  const mapas = mergeCategoryTranslations(row, {
    en: {
      name: 'Gaming Mice',
      seo_title: 'Best Gaming Mice — Guide and comparison',
      seo_intro: '<h2>Buying guide</h2><p>Text</p>',
      seo_faq: [{ pregunta: 'Which mouse?', respuesta: 'It depends.' }],
    },
  })
  assert.equal(mapas.seo_title_i18n.en, 'Best Gaming Mice — Guide and comparison')
  assert.equal(mapas.seo_intro_i18n.en, '<h2>Buying guide</h2><p>Text</p>')
  assert.deepEqual(mapas.seo_faq_i18n.en, [{ pregunta: 'Which mouse?', respuesta: 'It depends.' }])
  // Un idioma sin FAQ no crea una clave vacía.
  assert.equal(mapas.seo_faq_i18n.fr, undefined)
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





// ---------- Entradas SEO: traducción (estabilidad de URL = SEO crítico) ----------

test('missingEntryLocales exige título, resumen, cuerpo y FAQ en cada idioma destino', () => {
  const row = {
    titulo: 'LED RGB vs LED direccionable',
    slug: 'led-rgb-vs-led-direccionable',
    resumen: 'Comparativa con datos reales.',
    cuerpo_html: '<h2>Comparativa</h2>',
    faq: [{ pregunta: '¿Cual elegir?', respuesta: 'Depende del uso.' }],
    titulo_i18n: { es: 'LED RGB vs LED direccionable', en: 'LED RGB vs addressable LED' },
    slug_i18n: { es: 'led-rgb-vs-led-direccionable', en: 'led-rgb-vs-addressable-led' },
    resumen_i18n: { es: 'Comparativa con datos reales.', en: 'Comparison with real data.' },
    // Falta cuerpo y FAQ en 'en' -> debe seguir pendiente.
    cuerpo_html_i18n: { es: '<h2>Comparativa</h2>' },
    faq_i18n: { es: [{ pregunta: '¿Cual elegir?', respuesta: 'Depende del uso.' }] },
  }
  const pendientes = missingEntryLocales(row)
  assert.ok(pendientes.includes('en'))
  // Con force, TODOS los idiomas destino vuelven a considerarse pendientes.
  assert.ok(missingEntryLocales(row, true).includes('fr'))
})

test('mergeEntryTranslations siembra el idioma raíz y genera el slug localizado', () => {
  const row = {
    titulo: 'LED RGB vs LED direccionable',
    slug: 'led-rgb-vs-led-direccionable',
    resumen: 'Comparativa con datos reales.',
    cuerpo_html: '<h2>Comparativa</h2><p>Texto base.</p>',
    faq: [{ pregunta: '¿Cual elegir?', respuesta: 'Depende del uso.' }],
    titulo_i18n: null,
    slug_i18n: null,
    resumen_i18n: null,
    cuerpo_html_i18n: null,
    faq_i18n: null,
  }
  const mapas = mergeEntryTranslations(row, {
    fr: {
      titulo: 'LED RGB ou LED adressable',
      resumen: 'Comparaison avec des donnees reelles.',
      cuerpo_html: '<h2>Comparatif</h2><p>Texte traduit.</p>',
      faq: [{ pregunta: 'Lequel choisir ?', respuesta: "Depend de l'usage." }],
    },
  })

  // El idioma raíz se hereda del dato base (nunca se traduce a sí mismo).
  assert.equal(mapas.titulo_i18n.es, 'LED RGB vs LED direccionable')
  assert.equal(mapas.slug_i18n.es, 'led-rgb-vs-led-direccionable')
  // El slug localizado se deriva del título traducido (URL del idioma).
  assert.equal(mapas.slug_i18n.fr, 'led-rgb-ou-led-adressable')
  assert.equal(mapas.cuerpo_html_i18n.fr, '<h2>Comparatif</h2><p>Texte traduit.</p>')
  assert.equal(mapas.faq_i18n.fr.length, 1)
})

test('mergeEntryTranslations ignora idiomas con datos vacíos (no borra lo existente)', () => {
  const row = {
    titulo: 'Titulo base',
    slug: 'titulo-base',
    resumen: 'Resumen base.',
    cuerpo_html: '<p>Base.</p>',
    faq: [],
    titulo_i18n: { en: 'Existing english title' },
    slug_i18n: { en: 'existing-english-title' },
    resumen_i18n: { en: 'Existing english summary.' },
    cuerpo_html_i18n: { en: '<p>Existing.</p>' },
    faq_i18n: null,
  }
  const mapas = mergeEntryTranslations(row, { en: { titulo: '', resumen: '' } })
  // Un campo vacío del modelo conserva el valor ya guardado.
  assert.equal(mapas.titulo_i18n.en, 'Existing english title')
  assert.equal(mapas.slug_i18n.en, 'existing-english-title')
  assert.equal(mapas.cuerpo_html_i18n.en, '<p>Existing.</p>')
})

test('mergeEntryTranslations acepta CLAVES TRADUCIDAS por el modelo (bug de pt: resumo)', () => {
  // Caso real: traduciendo al portugués el modelo devolvió `resumo` (clave
  // traducida) y la fusión descartaba el valor → la entrada quedaba "pendiente".
  const row = {
    titulo: 'Auriculares con cancelacion de ruido',
    slug: 'auriculares-cancelacion-ruido',
    resumen: 'Resumen base.',
    cuerpo_html: '<h2>Guia</h2><p>Base.</p>',
    faq: [{ pregunta: '¿Que tal?', respuesta: 'Bien.' }],
  }
  const mapas = mergeEntryTranslations(row, {
    pt: {
      titulo: 'Fones com cancelamento de ruido',
      resumo: 'Resumo em portugues.',
      corpo_html: '<h2>Guia</h2><p>Base.</p>',
      faq: [{ pergunta: '¿Que tal?', resposta: 'Bem.' }],
    },
  })

  assert.equal(mapas.titulo_i18n.pt, 'Fones com cancelamento de ruido')
  assert.equal(mapas.resumen_i18n.pt, 'Resumo em portugues.')
  assert.equal(mapas.slug_i18n.pt, 'fones-com-cancelamento-de-ruido')
  assert.equal(mapas.cuerpo_html_i18n.pt, '<h2>Guia</h2><p>Base.</p>')
  assert.deepEqual(mapas.faq_i18n.pt, [{ pregunta: '¿Que tal?', respuesta: 'Bem.' }])
  // Con las claves del idioma raíz también funciona (comportamiento normal).
  const normal = mergeEntryTranslations(row, { de: { titulo: 'Titel', resumen: 'Zusammenfassung.' } })
  assert.equal(normal.resumen_i18n.de, 'Zusammenfassung.')
})

test('buildEntryMessages pide las claves de idioma exactas y conserva la FAQ', () => {
  const messages = buildEntryMessages({
    titulo: 'LED RGB vs LED direccionable',
    resumen: 'Comparativa con datos reales.',
    cuerpoHtml: '<h2>Comparativa</h2><p>Texto.</p>',
    faq: [
      { pregunta: '¿Cual elegir?', respuesta: 'Depende del uso.' },
      { pregunta: '   ', respuesta: '' },
    ],
    locales: ['en', 'fr'],
  })
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  const payload = JSON.parse(messages[1].content)
  assert.deepEqual(payload.idiomas_destino, ['en', 'fr'])
  // La FAQ vacía se filtra antes de enviarla al modelo.
  assert.equal(payload.faq_origen.length, 1)
  assert.ok(messages[0].content.includes('cuerpo_html'))
})

// --- Traducción por lotes (evita respuestas cortadas por límite de tokens) ---

test('chunkLocales reparte los idiomas en lotes del tamaño indicado', () => {
  assert.deepEqual(chunkLocales(['en', 'fr', 'de', 'it', 'pt'], 2), [
    ['en', 'fr'],
    ['de', 'it'],
    ['pt'],
  ])
  assert.deepEqual(chunkLocales([], 2), [])
  assert.deepEqual(chunkLocales(['en'], 5), [['en']])
  // Tamaño inválido (0, null) => 1: nunca lotes vacíos ni bucles infinitos.
  assert.deepEqual(chunkLocales(['en', 'fr'], 0), [['en'], ['fr']])
})

test('parseTranslationResponse tolera cercas de código y texto alrededor del JSON', () => {
  const conCercas = parseTranslationResponse('```json\n{"en":{"titulo":"Hi"}}\n```')
  assert.equal(conCercas.success, true)
  assert.equal(conCercas.data.en.titulo, 'Hi')

  // El modelo añade una frase antes/después: se recorta al objeto JSON.
  const conProsa = parseTranslationResponse('Claro, aquí tienes:\n{"en":{"titulo":"Hi"}}\nEspero que sirva.')
  assert.equal(conProsa.success, true)
  assert.equal(conProsa.data.en.titulo, 'Hi')
})

test('parseTranslationResponse rechaza JSON realmente inválido (no inventa nada)', () => {
  assert.equal(parseTranslationResponse('{"en":{"titulo":"Hi"').success, false)
  assert.equal(parseTranslationResponse('').success, false)
  assert.equal(parseTranslationResponse('[1,2]').success, false)
  assert.equal(parseTranslationResponse('sin json').success, false)
})


// --- Idioma raíz: data heredada escrita en otro idioma (nombre de categoría) ---
// Contexto real que cubren estos tests: el pipeline nombró las categorías con la
// keyword en inglés mientras SOURCE_LOCALE ya era 'es'; el filtro del catálogo en
// español mostraba esos nombres. Estas funciones detectan y reparan ese desfase.

test('nameFingerprint ignora acentos, signos y orden de palabras', () => {
  assert.equal(nameFingerprint('Acrylic Stand Anime'), nameFingerprint('Anime Acrylic Stand'))
  assert.equal(nameFingerprint('  Teclados   Mecánicos RGB '), 'mecanicos rgb teclados')
  assert.equal(nameFingerprint(null), '')
})

test('isSourceLocaleNamePending detecta el nombre heredado en inglés', () => {
  // La clave del idioma raíz es una copia del inglés: nadie lo redactó en español.
  const heredada = {
    name: 'Action Figure Display Case',
    name_i18n: { es: 'Action Figure Display Case', en: 'Action Figure Display Case', fr: 'Vitrine pour Figurines' },
  }
  assert.equal(isSourceLocaleNamePending(heredada), true)

  // Ya redactado en español (distinto del inglés): nada que hacer.
  const reparada = {
    name: 'Vitrina para Figuras de Acción',
    name_i18n: { es: 'Vitrina para Figuras de Acción', en: 'Action Figure Display Case' },
  }
  assert.equal(isSourceLocaleNamePending(reparada), false)

  // Data anterior a la migración 0049: sin clave del idioma raíz.
  assert.equal(isSourceLocaleNamePending({ name: 'Earphones', name_i18n: { en: 'Earphones' } }), true)
  assert.equal(isSourceLocaleNamePending({ name: 'Earphones', name_i18n: {} }), true)

  // Sin nombre utilizable no se marca pendiente.
  assert.equal(isSourceLocaleNamePending({ name: '   ', name_i18n: {} }), false)
  // Sin inglés de referencia no hay con qué comparar: no se gasta una llamada.
  assert.equal(isSourceLocaleNamePending({ name: 'Earphones', name_i18n: { es: 'Earphones' } }), false)
})

test('mergeSourceLocaleName reescribe el idioma raíz y preserva idiomas y slugs', () => {
  const row = {
    name: '3 In 1 Magnetic Wireless Charger',
    slug: '3-in-1-magnetic-wireless-charger',
    name_i18n: { es: '3 In 1 Magnetic Wireless Charger', en: '3 in 1 Magnetic Wireless Charger', fr: 'Chargeur 3 en 1' },
    slug_i18n: { es: '3-in-1-magnetic-wireless-charger', fr: 'chargeur-3-en-1' },
  }
  const cambios = mergeSourceLocaleName(row, 'Cargador Inalámbrico Magnético 3 en 1')

  assert.equal(cambios.name, 'Cargador Inalámbrico Magnético 3 en 1')
  assert.equal(cambios.name_i18n.es, 'Cargador Inalámbrico Magnético 3 en 1')
  // Los demás idiomas se conservan tal cual.
  assert.equal(cambios.name_i18n.en, '3 in 1 Magnetic Wireless Charger')
  assert.equal(cambios.name_i18n.fr, 'Chargeur 3 en 1')
  // La URL indexada no se toca (el slug no forma parte de la fusión).
  assert.equal('slug' in cambios, false)
  assert.equal('slug_i18n' in cambios, false)
  // Sin nombre válido no se propone ningún cambio.
  assert.equal(mergeSourceLocaleName(row, '  '), null)
})

test('buildSourceLocaleNameMessages pide el nombre en el idioma raíz y su JSON', () => {
  const messages = buildSourceLocaleNameMessages({ nombre: 'Acrylic Stand Anime' })
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.ok(messages[0].content.includes('español'))
  assert.ok(messages[0].content.includes('{"name":""}'))
  assert.equal(JSON.parse(messages[1].content).nombre_origen, 'Acrylic Stand Anime')
})

test('parseSourceLocaleName lee {"name":"..."} y rechaza respuestas inválidas', () => {
  const ok = parseSourceLocaleName('```json\n{"name":"Vitrina para Figuras de Acción"}\n```')
  assert.equal(ok.success, true)
  assert.equal(ok.name, 'Vitrina para Figuras de Acción')

  assert.equal(parseSourceLocaleName('{"name":"   "}').success, false)
  assert.equal(parseSourceLocaleName('sin json').success, false)
})

