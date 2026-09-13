import { test } from 'node:test'
import assert from 'node:assert/strict'

// Testing económico: SOLO la lógica pura de indexación (sin red ni Supabase).
// Mismo patrón que price-calculator.test.mjs / seo-rules.test.mjs.
const {
  calcularCuotaDiaria,
  construirCargaIndexNow,
  decidirReintento,
  esTipoSoportadoPorGoogle,
  estadoDesdeInspeccion,
  normalizarUrlParaBuscadores,
  planificarCanales,
  resumirEstados,
  seleccionarLote,
  validarClaveIndexNow,
} = await import('../lib/indexing-rules.mjs')

const ORIGIN = 'https://zonadehobbies.online'

// ---------- Política de Google (lo más crítico: evita perder el acceso) ----------

test('la Indexing API solo se planifica para JobPosting/BroadcastEvent', () => {
  assert.equal(esTipoSoportadoPorGoogle('job_posting'), true)
  assert.equal(esTipoSoportadoPorGoogle('broadcast_event'), true)
  // Tipos del catálogo: NO soportados por política de Google.
  assert.equal(esTipoSoportadoPorGoogle('producto'), false)
  assert.equal(esTipoSoportadoPorGoogle('categoria'), false)
  assert.equal(esTipoSoportadoPorGoogle('guia'), false)

  const producto = planificarCanales('producto')
  assert.equal(producto.google, false) // modo estricto (default)
  assert.equal(producto.indexnow, true) // canal permitido y real
  assert.equal(producto.sitemap, true)
  assert.equal(producto.riesgoPolitica, false)

  const empleo = planificarCanales('job_posting')
  assert.equal(empleo.google, true)
  assert.equal(empleo.riesgoPolitica, false)
})

test('planificarCanales marca riesgo cuando se fuerza un tipo no soportado', () => {
  const forzado = planificarCanales('producto', { googleIndexingEstricto: false })
  assert.equal(forzado.google, true)
  assert.equal(forzado.riesgoPolitica, true)
  assert.match(forzado.motivo, /AVISO/)
})

test('planificarCanales descarta tipos desconocidos', () => {
  const raro = planificarCanales('newsletter')
  assert.deepEqual(
    { indexnow: raro.indexnow, google: raro.google, sitemap: raro.sitemap },
    { indexnow: false, google: false, sitemap: false },
  )
})

// ---------- Validación de URLs ----------

test('normalizarUrlParaBuscadores acepta rutas internas y absolutas del dominio', () => {
  assert.deepEqual(normalizarUrlParaBuscadores('/productos/tira-led', ORIGIN), {
    valida: true,
    url: 'https://zonadehobbies.online/productos/tira-led',
    motivo: '',
  })
  assert.equal(normalizarUrlParaBuscadores('productos/tira-led', ORIGIN).url, `${ORIGIN}/productos/tira-led`)
  assert.equal(normalizarUrlParaBuscadores(`${ORIGIN}/guias/x`, ORIGIN).valida, true)
})

test('normalizarUrlParaBuscadores quita el fragmento (#) y rechaza dominios ajenos', () => {
  assert.equal(
    normalizarUrlParaBuscadores(`${ORIGIN}/guias/x#seccion`, ORIGIN).url,
    `${ORIGIN}/guias/x`,
  )
  const ajeno = normalizarUrlParaBuscadores('https://s.click.aliexpress.com/e/abc', ORIGIN)
  assert.equal(ajeno.valida, false)
  assert.match(ajeno.motivo, /no pertenece al dominio/)
})

test('normalizarUrlParaBuscadores exige origin y URL no vacía', () => {
  assert.equal(normalizarUrlParaBuscadores('/x', '').valida, false)
  assert.equal(normalizarUrlParaBuscadores('', ORIGIN).valida, false)
  assert.equal(normalizarUrlParaBuscadores('   ', ORIGIN).valida, false)
})

// ---------- Cuota diaria y lotes ----------

test('calcularCuotaDiaria respeta el tope y detecta agotamiento', () => {
  assert.deepEqual(calcularCuotaDiaria(0, 100), { consumidos: 0, limite: 100, restantes: 100, agotada: false })
  assert.deepEqual(calcularCuotaDiaria(25, 100), { consumidos: 25, limite: 100, restantes: 75, agotada: false })
  assert.deepEqual(calcularCuotaDiaria(120, 100), { consumidos: 100, limite: 100, restantes: 0, agotada: true })
  assert.equal(calcularCuotaDiaria(-5, 100).consumidos, 0)
})

test('seleccionarLote acota por tamaño de tanda Y por cuota disponible', () => {
  const urls = Array.from({ length: 90 }, (_, i) => `/productos/p${i}`)
  assert.equal(seleccionarLote(urls, 25, 100).length, 25) // nunca más de 25 por clic
  assert.equal(seleccionarLote(urls, 25, 10).length, 10) // la cuota manda
  assert.equal(seleccionarLote(urls, 25, 0).length, 0) // cuota agotada
})

test('construirCargaIndexNow exige host, clave válida y URLs', () => {
  const clave = '9f3a1c7e5b2d86401fa6c93e7d5b18a4'
  assert.equal(validarClaveIndexNow(clave), true)
  assert.equal(validarClaveIndexNow('corta'), false)
  assert.equal(validarClaveIndexNow('9f3a1c7e5b2d8640!'), false)

  const carga = construirCargaIndexNow({
    host: 'zonadehobbies.online',
    key: clave,
    urls: [`${ORIGIN}/productos/x`],
  })
  assert.deepEqual(carga, {
    host: 'zonadehobbies.online',
    key: clave,
    urlList: [`${ORIGIN}/productos/x`],
  })
  assert.equal(construirCargaIndexNow({ host: '', key: clave, urls: ['x'] }), null)
  assert.equal(construirCargaIndexNow({ host: 'a.com', key: 'mala', urls: ['x'] }), null)
  assert.equal(construirCargaIndexNow({ host: 'a.com', key: clave, urls: [] }), null)
})

// ---------- Reintentos ----------

test('decidirReintento reintenta 429/5xx/red y no los 4xx definitivos', () => {
  assert.equal(decidirReintento(429, 1, 3), true)
  assert.equal(decidirReintento(500, 1, 3), true)
  assert.equal(decidirReintento(0, 1, 3), true) // fallo de red
  assert.equal(decidirReintento(400, 1, 3), false) // payload inválido
  assert.equal(decidirReintento(422, 1, 3), false) // host/URL rechazada
  assert.equal(decidirReintento(500, 3, 3), false) // sin intentos disponibles
})

// ---------- Inspección (Search Console URL Inspection API) ----------

test('estadoDesdeInspeccion mapea cobertura e indexación', () => {
  assert.equal(
    estadoDesdeInspeccion({
      inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' } },
    }),
    'indexado',
  )
  assert.equal(
    estadoDesdeInspeccion({
      inspectionResult: {
        indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed' },
      },
    }),
    'no_indexado',
  )
  assert.equal(
    estadoDesdeInspeccion({
      inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google' } },
    }),
    'no_indexado',
  )
  assert.equal(
    estadoDesdeInspeccion({
      inspectionResult: {
        indexStatusResult: {
          verdict: 'NEUTRAL',
          coverageState: 'Excluded by noindex tag',
          indexingState: 'BLOCKED_BY_META_TAG',
        },
      },
    }),
    'excluido',
  )
  assert.equal(estadoDesdeInspeccion(null), 'desconocido')
})

test('resumirEstados cuenta la cola por estado', () => {
  const resumen = resumirEstados([
    { estado: 'pendiente' },
    { estado: 'pendiente' },
    { estado: 'indexado' },
    { estado: 'no_indexado' },
    { estado: 'error' },
    {},
  ])
  assert.deepEqual(resumen, {
    total: 6,
    pendiente: 3,
    enviando: 0,
    enviado: 0,
    indexado: 1,
    no_indexado: 1,
    excluido: 0,
    error: 1,
  })
})
