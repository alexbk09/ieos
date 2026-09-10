# 🔌 Pipeline de Automatización AliExpress (Fase 2.2)

Documento técnico que explica **cómo funciona** el scraping tradicional, la
conexión con la **API oficial de AliExpress Open Platform**, el cerebro SEO
con **DeepSeek** y la persistencia en **Supabase**, todo orquestado desde el
panel de administración.

---

## 1. Arquitectura de archivos

```
services/
├── aliApi.ts        → API oficial AliExpress (buscar top + generar enlace afiliado)
├── aliScraper.ts    → Scraper tradicional (ZenRows/ScraperAPI) con renderizado JS
├── aliProducts.ts   → Capa Supabase: anti-duplicados, categoría, insert automatizado
├── aliPipeline.ts   → ORQUESTADOR maestro: une todo en un flujo secuencial
└── seo-content.ts   → Cerebro SEO (DeepSeek): traduce título + genera HTML + FAQ

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
`window.runParams` (JSON embebido) y del DOM:

- `titulo_original` (título de fábrica, desordenado).
- `precio_base` (mínimo/máximo en USD).
- `metadatos_fisicos` (peso, dimensiones, materiales) → se guarda como JSONB.
- `galeria_imagenes` (variantes de imagen por color/ownerItemId).
- `descripcion` (HTML de la descripción).

> El scraper es **frío** (sin IA): solo captura datos crudos. La traducción y
> el SEO los hace DeepSeek en el paso 5.

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
| 7 | **Guardar** en Supabase (incluye `seo_faq` y `seo_keywords`) y **revalidar el sitemap** al instante | `aliProducts.insertAutomatedProduct` → `catalog.createProduct` |

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
