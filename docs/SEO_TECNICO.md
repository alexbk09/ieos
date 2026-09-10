# SEO Técnico — Estrategia pSEO de la plataforma

Documento de referencia de la implementación SEO (Programmatic SEO) de la tienda
de afiliados. Describe qué se cumple, dónde vive cada pieza y cómo se mantiene.

---

## 1. Mapa de rutas y su SEO

| Ruta | Render | H1 | Schema JSON-LD | Indexación |
|------|--------|----|----------------|------------|
| `/` | ISR 300s | Hero configurable | Organization, WebSite+SearchAction, ItemList, FAQPage | index |
| `/catalogo` | SSG+ISR | Catálogo | — | index |
| `/categoria/[slug]` | SSG+ISR | H1 largo del hub (`categories.seo_title` o nombre) | BreadcrumbList, ItemList, FAQPage | index |
| `/productos/[slug]` | SSG+ISR | Nombre del producto (único) | Product (+Offer), BreadcrumbList, FAQPage | index/noindex según `indexado_google` |
| `/sitemap.xml` | ISR 1h + on-demand | — | Sitemap (+ imágenes) | — |
| `/robots.txt` | dinámico | — | — | — |
| `/llms.txt` | ISR 1h | — | — | Para motores de IA |

---

## 2. Capa de contenido con IA (anti-duplicado)

`services/seo-content.ts` (DeepSeek) genera por producto:

- `titulo_seo` de 40–60 caracteres (marca + beneficio + producto + keyword).
- `descripcion_html` semántico con `<h2>Características principales</h2>`,
  `<h2>Preguntas Frecuentes</h2>` (con `<h3>`), y opcional
  `<h2>Especificaciones físicas</h2>`. Nunca `<h1>`.
- `keywords`: términos long-tail.
- `faq`: pares pregunta/respuesta → schema `FAQPage`.

**Validación doble:** forma con Zod + fondo con `lib/seo-rules.mjs`
(`validarCalidadSeo`), que prohíbe frases genéricas y exige las secciones.
Reintento único autocorrectivo.

`services/seoDedupe.ts` compara la "firma" del título contra el catálogo y
avisa al modelo (`evitarTitulos`) para no publicar clones.

`services/seo-hub.ts` genera, una vez por nicho, el contenido editorial del hub
(`categories.seo_title`, `seo_intro`, `seo_faq`).

---

## 3. Jerarquía de encabezados

- **Un único `<h1>`** por página (nombre del producto / título del hub).
- `components/rich-description.tsx` blanquea y **demota cualquier `<h1>`** de la
  IA a `<h2>` para proteger la regla del H1 único.
- Secciones de la ficha con `<h2>` real: *Ficha técnica*, *Especificaciones*,
  *Opiniones* y *Productos relacionados*.

---

## 4. Enlazado interno (Cluster)

- Breadcrumb visible enlazando a `/categoria/[slug]`.
- Módulo **"Productos relacionados"** (`components/related-products.tsx`) al pie
  de cada ficha, alimentado en servidor por `catalog.getRelatedProducts`
  (misma categoría, excluye el actual).
- Grillas de categoría y home enlazan a las fichas.

---

## 5. Sitemap automático

- `app/sitemap.ts` es data-driven: incluye rutas estáticas, hubs y fichas con
  `indexado_google = true`, con `<lastmod>` real e imagen por producto.
- `lib/sitemap-revalidate.ts` (`revalidarSitemap`) se invoca en
  `createProduct`, `updateProduct`, `deleteProduct`, `createProductsBulk` y
  `updateCategorySeo` → **el sitemap se actualiza al instante** tras cualquier cambio.

---

## 6. Motores de IA

- `app/llms.txt/route.ts` expone un índice plano (hubs + productos) para
  ChatGPT/Gemini/Perplexity.
- Schema JSON-LD consistente con la UI (sin `aggregateRating` inventado, para
  no violar políticas de Google).

---

## 7. Archivos clave

| Archivo | Responsabilidad |
|---------|-----------------|
| `lib/seo-rules.mjs` / `.d.ts` | Lógica pura SEO (validación + builders de schema) |
| `lib/sitemap-revalidate.ts` | Revalidación on-demand del sitemap |
| `lib/schema/product-schema.ts` | Schema de Product/Offer y re-export de Breadcrumb/FAQ |
| `services/seo-content.ts` | Generación de contenido con IA |
| `services/seo-hub.ts` | Generación del hub de categoría |
| `services/seoDedupe.ts` | Control anti-duplicado |
| `services/catalog.ts` | Lectura/escritura + relacionados + revalidación |
| `app/sitemap.ts`, `app/robots.ts`, `app/llms.txt/route.ts` | Archivos SEO |
| `app/api/admin/categorias/seo/route.ts` | API RBAC del SEO de categorías |

---

## 8. Pruebas

`tests/seo-rules.test.mjs` valida (11 casos): normalización/firma de títulos,
reglas de calidad del contenido y constructores de `BreadcrumbList`/`FAQPage`.
