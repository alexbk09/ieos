# 🔌 Pipeline de Automatización AliExpress (Fase 2.2)

Documento técnico que explica **cómo funciona** el scraping tradicional, la
conexión con la **API oficial de AliExpress Open Platform**, el cerebro SEO
con **DeepSeek** y la persistencia en **Supabase**, todo orquestado desde el
panel de administración.

---

## 1. Arquitectura de archivos

```
services/
├── aliApi.ts        → API oficial AliExpress (buscar top + marca + valoración + enlace)
├── aliScraper.ts    → Scraper tradicional (ZenRows/ScraperAPI) con renderizado JS
├── aliProducts.ts   → Capa Supabase: anti-duplicados, marca, categoría, insert
├── aliReviews.ts    → Opiniones: limpia + traduce reseñas reales (DeepSeek)
├── aliImages.ts     → Espeja imágenes del CDN al storage propio (sitemap de imágenes)
├── aliEnrich.ts     → RE-ENRIQUECIMIENTO: refresca precio/stock/valoración de publicados
├── aliPipeline.ts   → ORQUESTADOR maestro: une todo en un flujo secuencial
└── seo-content.ts   → Cerebro SEO (DeepSeek): traduce título + genera HTML + FAQ

lib/
└── reviews.mjs      → Lógica pura (testeable) de valoraciones y reseñas

app/api/admin/ali-pipeline/enrich/route.ts   → API route (SSE) del re-enriquecimiento
components/ali-enrich-panel.tsx              → Botón + log en vivo "Actualizar precios y datos"
```

app/api/admin/ali-pipeline/route.ts   → API route (SSE) que ejecuta el pipeline
components/ali-pipeline-manager.tsx   → Panel admin (keyword + botón + toasts en vivo)
app/admin/ali-pipeline/page.tsx       → Página admin protegida
supabase/migrations/0046_ali_pipeline.sql → Registra módulo 'ali_pipeline' en RBAC
```

**Regla de oro cumplida:** ningún componente de React llama a `supabase.from()`.
Todo pasa por `/services` y por la API route del servidor.

---

## 2. ¿Cómo busca productos el agente? (API oficial)

`services/aliApi.ts` → `buscarProductosMasVendidos(keyword, page, sort)`

1. Lee las credenciales del `.env` del servidor (`ALI_APP_KEY`, `ALI_APP_SECRET`,
   `ALI_TRACKING_ID`). **Nunca** se exponen al navegador.
2. Construye la **firma HMAC-SHA256** que AliExpress exige: ordena los parámetros
   alfabéticamente, concatena `clave+valor` y firma con el App Secret.
3. Llama al endpoint `aliexpress.affiliate.product.query` con:
   - `keywords` = la palabra semilla.
   - `sort` = `VOLUME_DESC` (más vendidos) o `COMMISSION_DESC` (mejor comisión).
   - `tracking_id` = tu ID de seguimiento de AliExpress Union.
4. Devuelve un array tipado `AliProductoBuscado[]` con `ali_product_id`,
   `titulo_fabrica`, `url_producto`, precios y comisión.

**Enlace de afiliado:** `generarEnlaceAfiliado(url)` llama a
`aliexpress.affiliate.link.generate` y devuelve la URL larga/corta con tu
`tracking_id`. Sin tracking ID **no se acreditan comisiones**.

---

## 3. ¿Cómo extrae el detalle físico? (Scraper tradicional)

`services/aliScraper.ts` → `scrapearProductoAliExpress(url)`

AliExpress bloquea bots, así que se usa un **proxy con renderizado JS**:

- **ZenRows** (clave principal, gratis 1.000 créditos/mes) → `ZENROWS_API_KEY`.
- **ScraperAPI** (respaldo si ZenRows da 429) → `SCRAPERAPI_API_KEY`.

El scraper abre la URL del producto, espera a que el JS cargue y extrae del
JSON embebido (`window.runParams`, `_init_data_`, `_d_c_.DCData`, `__NEXT_DATA__`…)
y del DOM:

- `titulo_original` (título de fábrica, desordenado).
- `precio_base` (mínimo/máximo en USD).
- `metadatos_fisicos` (**tabla de especificaciones técnicas**) → se guarda como
  JSONB (`products.specifications`).
- `galeria_imagenes` (variantes de imagen por color/ownerItemId).
- `descripcion` (HTML de la descripción).

La **tabla de especificaciones** se extrae con una *cascada*
(`extraerEspecificacionesDom` + `extraerMetadatosRunParams`): primero las filas de
props con selectores agnósticos (`[class*="specification--*"]`), luego listas
`<dl><dt><dd>` y, por último, cualquier `<table>` de dos columnas; en paralelo se
recorren las rutas del JSON (`productPropComponent`, `productProps`…). El
resultado siempre se sanea (dedupe por clave + topes de longitud/cantidad) con
`lib/spec-normalizer.mjs`. Si AliExpress no expone la tabla, el pipeline degrada
derivando marca/specs del título con IA (`services/aliMeta.ts`).

> El scraper es **frío** (sin IA): solo captura datos crudos. La traducción y
> el SEO los hace DeepSeek en el paso 5.

---

## 3.1 Marca, opiniones y valoraciones (Fases 2.3–2.5)

### Marca (habilita el filtro por marca)
- `aliApi.ts` lee la marca de la respuesta oficial probando varias claves
  (`brand`, `brand_name`, `brandName`): el "envelope" de AliExpress cambia entre versiones.
- `aliScraper.ts` la refuerza desde `runParams` (`brandComponent`,
  `productInfoComponent`) y, como respaldo, desde el DOM (`og:brand`,
  `itemprop="brand"`) y la especificación `Brand Name`.
- `aliProducts.obtenerMarcaAliExpress` reutiliza o crea la fila en `marcas`
  (comparación case-insensitive) y el producto se guarda con `marca_id`, por lo
  que el filtro público por marca del catálogo funciona automáticamente.

### Valoraciones y opiniones (`products.rating_*` / `reviews` — migración 0052)
- **La valoración es real**: la API aporta `evaluate_rate` (ej. `"97.6%"`) y
  `lib/reviews.mjs` la normaliza a escala 0-5 (`parsearValoracion`).
- Las reseñas se extraen (best-effort) por el scraper y `services/aliReviews.ts`
  las limpia y TRADUCE en una sola llamada a DeepSeek; si la IA falla, se
  conservan los textos originales (degradación elegante).
- La ficha muestra la media (estrellas), el nº de valoraciones y las reseñas.
- El JSON-LD `AggregateRating` se emite **solo** cuando existen media y nº
  reales: nunca se inventan reseñas (riesgo de penalización de Google).

### Espejado de imágenes (opcional)
- `services/aliImages.ts` descarga las fotos del CDN y las sube optimizadas
  (WebP) al bucket propio. Se activa con `MIRROR_AFFILIATE_IMAGES` (por defecto
  `false`). Al activarlo, el sitemap de imágenes empieza a publicar `<image:loc>`
  (Google solo admite imágenes de dominios verificados/propios).

### Enlaces salientes
- Todos los CTA de afiliado usan `rel="nofollow sponsored noopener noreferrer"`
  (`AFFILIATE_LINK_REL` en `lib/constants.ts`) para no ceder autoridad del dominio.

### Backfill del catálogo existente
- `npm run brands:backfill` (o `:dry`) rellena `products.marca_id` de los
  productos antiguos detectando la marca en `specifications`.

### Re-enriquecimiento (Fase 2.6 — botón "Actualizar precios y datos")
- Los precios, la disponibilidad y las especificaciones cambian con el tiempo.
  El panel `/admin/ali-pipeline` incluye un módulo que refresca los **últimos N
  productos publicados**.
- `services/aliEnrich.ts` → `ejecutarEnriquecimientoLote({ limit }, notificar)`.
- **Fuente de datos (v2, tras el diagnóstico):** el scraper ya NO sirve para
  esto, porque AliExpress devuelve el HTML con `window.runParams = { }` (vacío)
  y sin `specification--name`. Por eso el enriquecimiento usa la **API oficial**:
  - `obtenerDetalleProductosPorIds(ids)` → UNA llamada a
    `aliexpress.affiliate.productdetail.get` (por lote) con el **precio real**,
    precio original, imagen principal y galería.
  - `extraerMarcaYSpecs(titulo)` (IA) → **marca y especificaciones derivadas del
    título**, verificando que cada valor aparezca LITERALMENTE en él.
  - Valoración: best-effort vía `product.query` (solo si coincide el ID).
- Solo actualiza **campos volátiles** (precio, `precio_original`, `image_url`,
  `specifications`, `marca_id`, `rating_average`, stock/disponibilidad). **Nunca**
  toca `name`, `slug`, `description`, `seo_faq`, `seo_keywords` ni los enlaces.
- Respeta el límite de la API (~1 llamada/seg) con `ALI_API_MIN_INTERVAL_MS`.

### ⚠️ Límites reales de la fuente (verificado a fondo)
| Dato | Disponibilidad | Nota |
|------|----------------|------|
| Precio / imágenes / ventas | ✅ API oficial | `productdetail.get` |
| Valoración | ⚠️ parcial (~75%) | `evaluate_rate` solo en `product.query` |
| Marca | ⚠️ derivada | NO viene en API ni HTML; se extrae del título |
| Especificaciones | ⚠️ best-effort | DOM/tabla + JSON; si faltan, se derivan del título (literal) |
| Opiniones (reseñas) | ❌ no disponible | No hay fuente: ni API ni HTML público |

> Consecuencia: la sección "Opiniones" se queda con el enlace al marketplace
> cuando no hay reseñas reales; nunca se inventan.

---

## 4. El pipeline maestro (orquestador)

`services/aliPipeline.ts` → `ejecutarPipelineAutomatizacion(keyword, notificar)`

Flujo secuencial asíncrono, con un callback `notificar` que emite el progreso
en tiempo real:

| Paso | Acción | Servicio |
|------|--------|----------|
| 1 | **Descubrir** los top por keyword (VOLUME_DESC) | `aliApi.buscarProductosMasVendidos` |
| 2 | **Resolver** la categoría del nicho + **generar el HUB** (guía + FAQ) si falta | `aliProducts.obtenerCategoriaAliExpress` + `seo-hub.generateHubContent` |
| 3 | **Filtrar** duplicados (¿ya existe el `ali_product_id`?) | `aliProducts.existeProductoAliExpress` |
| 4 | **Extraer** detalle físico + imágenes por color | `aliScraper.scrapearProductoAliExpress` |
| 5 | **Generar** enlace de afiliado oficial con tracking | `aliApi.generarEnlaceAfiliado` |
| 6 | **SEO único** con DeepSeek (título optimizado + HTML H2/H3 + FAQ + keywords) con control anti-duplicado | `seo-content.generateSeoContent` + `seoDedupe.existeTituloSimilar` |
| 7 | **Guardar** en Supabase (incluye `seo_faq` y `seo_keywords`), **traducir la ficha** automáticamente al crearla (nombre, título SEO, cuerpo HTML de la descripción y FAQ a los idiomas soportados) y **revalidar el sitemap** al instante | `aliProducts.insertAutomatedProduct` → `catalog.createProduct` (traduce vía `i18n-translate.traducirProducto`) |
| 8 | **Traducir el nicho** (categoría: nombre, slug, descripción y contenido editorial del hub: `seo_title`, `seo_intro` y `seo_faq`) | `i18n-translate.traducirCategoria` |

**Internacional (i18n):** el contenido se traduce al CREARSE (paso 7), tanto para
los productos del pipeline como para las altas manuales/API; el nicho se completa
una vez por ejecución (paso 8). Todo es **idempotente**: si ya está traducido, no
vuelve a llamar al modelo (coste cero). Los idiomas publicados en la web se
controlan con `PUBLISHED_LOCALES` (lib/i18n-config.mjs); un producto sin traducción
usa el fallback de su idioma raíz.

**Panel "Idiomas y Traducciones" (`/admin/idiomas`, RBAC `categorias_idiomas`):**
traduce desde la UI el contenido pendiente (lo ya existente y las cargas masivas)
sin consola, reutilizando `services/i18n-pending`. La carga masiva NO traduce en
línea (una sola petición HTTP no aguanta cientos de llamadas al modelo): se
completa desde este panel. El backfill por consola (`npm run i18n:products` /
`npm run i18n:backfill`) sigue disponible para CI o ejecuciones desatendidas.

**Defensivo:** procesa máximo 5 productos nuevos por ejecución para no agotar
créditos del proxy ni de DeepSeek. Cada producto se procesa en un `try-catch`
independiente: si uno falla, el resto continúa.

### 4.1 SEO estructurado y sitemap (migración 0047)

- **Contenido único (anti-duplicado):** `seo-content` exige títulos de 40–60
  caracteres, prohíbe frases genéricas ("compra segura", "mejor precio"…) y
  valida que la descripción tenga las secciones H2 obligatorias y ningún `<h1>`.
  Si el modelo no cumple, reintenta UNA vez autocorrigiéndose.
- **FAQ + keywords estructuradas:** se guardan en `products.seo_faq` y
  `products.seo_keywords`, y alimentan el schema `FAQPage` de la ficha.
- **Hub de categoría:** `seo-hub` genera (una vez por nicho) el título largo,
  la guía de compra y la FAQ del hub en `categories.seo_*`.
- **Sitemap al instante:** `lib/sitemap-revalidate.ts` revalida `/sitemap.xml`
  y las rutas afectadas tras cada alta/edición/baja, sin esperar el ISR de 1 h.
- **Párrafo fluido + pestaña "Ficha técnica":** `seo-content` redacta, bajo
  `<h2>Especificaciones físicas</h2>`, **un párrafo fluido** que traduce la tabla
  de specs crudas a beneficios de compra. La ficha pública lo aísla en cliente
  (`lib/seo-rules.separarSeccionFichaTecnica`) y lo muestra en la pestaña
  *Ficha técnica* (`components/ui/tabs.tsx`) junto a los datos físicos y la tabla
  de especificaciones. Ambos paneles permanecen en el DOM (`hidden` al estar
  inactivos), así Google indexa también el contenido de las pestañas cerradas.

---

## 5. Interfaz de control (UI/UX)

`/admin/ali-pipeline` (protegido por `requireAdmin` + RBAC módulo `ali_pipeline`).

- Campo **"Palabra Clave Semilla"** (ej: `tira led rgb`).
- Botón **"Escanear y Optimizar Nicho"**.
- **Toasts en tiempo real** por cada etapa del pipeline (descubriendo,
  filtrando, extrayendo, generando enlace, procesando SEO, guardando,
  completado/error).
- **Log en vivo** con iconos por etapa y contador `[i/total]`.
- **Resultado final** con cada producto guardado (o su error) y enlace a la ficha.

La comunicación usa **Server-Sent Events (SSE)**: la API route abre un stream
y el pipeline va empujando cada notificación al navegador.

---

## 6. Variables de entorno (.env)

```env
# ── Scraper (Fase 2.1) ─────────────────────────────
ZENROWS_API_KEY=tu_clave_zenrows
SCRAPERAPI_API_KEY=tu_clave_scraperapi

# ── AliExpress Open Platform (Fase 2.2) ────────────
ALI_APP_KEY=PON_AQUI_TU_APP_KEY
ALI_APP_SECRET=PON_AQUI_TU_APP_SECRET
ALI_TRACKING_ID=PON_AQUI_TU_TRACKING_ID
ALI_LOCALE=es_ES

# ── DeepSeek (cerebro SEO) ─────────────────────────
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### Cómo obtener las credenciales de AliExpress

1. Entra a **https://pub.aliexpress.com** → sección **Open Platform** (o
   https://open.aliexpress.com).
2. Crea una **aplicación** y copia su **App Key** y **App Secret**.
3. Solicita acceso a los métodos de afiliado:
   - `aliexpress.affiliate.product.query` (buscar top por keyword).
   - `aliexpress.affiliate.link.generate` (convertir URL → enlace afiliado).
4. En **Union → Tracking ID** crea tu ID de seguimiento y pégalo en
   `ALI_TRACKING_ID`. Sin él no se acreditan comisiones.

> ⚠️ Estas llaves solo se leen en el servidor (API routes). Si no las
> configuras, el panel muestra un aviso claro y deshabilita el botón.

---

## 7. Base de datos (migración 0046)

`supabase/migrations/0046_ali_pipeline.sql` registra el módulo `ali_pipeline`
en la tabla `modules` y otorga permisos completos al rol `admin`. Ejecútala
con el runner de migraciones del proyecto (p. ej. `supabase/run.mjs`) para que
el nuevo ítem del menú aparezca en el panel.

---

## 8. Resumen del flujo completo

```
Admin escribe keyword
        │
        ▼
POST /api/admin/ali-pipeline  (SSE stream)
        │
        ▼
ejecutarPipelineAutomatizacion(keyword)
  1. buscarProductosMasVendidos  → IDs top (API oficial)
  2. existeProductoAliExpress    → filtra duplicados (Supabase)
  3. scrapearProductoAliExpress  → detalle físico + imágenes (proxy)
  4. generarEnlaceAfiliado       → URL con tracking (API oficial)
  5. generateSeoContent          → título + HTML + FAQ (DeepSeek)
  6. insertAutomatedProduct      → guarda en Supabase (listo para React)
        │
        ▼
Toasts en vivo + log + resultado final en el panel
```
