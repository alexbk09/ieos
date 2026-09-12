# Plan de Entradas SEO (guías y comparativas)

Documento de referencia del módulo de **entradas SEO**: qué tipos existen, con qué
reglas se generan, cómo se publican y cómo se mide si funcionan.

> Regla de oro del módulo: **la IA acelera, no sustituye, el criterio editorial.**
> Nada se publica sin revisión humana y sin al menos 2 productos reales del catálogo.

---

## 1. Alcance: qué NO se toca

El módulo es **aditivo**. No modifica ni sustituye:

- `categories` ni los hubs `/categoria/[slug]` (`seo_title`, `seo_intro`, `seo_faq`).
- `products`, precios, stock ni el pipeline de AliExpress.
- Los módulos admin existentes (`categorias_seo`, `categorias_idiomas`, …).

Solo AGREGA una entidad nueva (`seo_entries`) y la enlaza con lo que ya existe.

---

## 2. Arquitectura del contenido

```
Hub de contenido  /guias                     (índice, pSEO)
   └── Entrada    /guias/[slug]              (artículo indexable)
          ├── Productos comparados  → /productos/[slug]
          ├── Nichos                → /categoria/[slug]
          └── Entradas relacionadas → /guias/[slug]   (cluster)
```

El enlazado es **bidireccional**: la categoría muestra las guías del nicho y cada
ficha de producto muestra las guías donde aparece. Es lo que Google entiende como
cluster temático y lo que reparte autoridad interna.

---

## 3. Tipos de entrada (`ENTRY_TYPES`)

| Tipo | Intención de búsqueda | Ejemplo de título |
|---|---|---|
| `comparativa` | "X vs Y" | LED RGB vs LED direccionable: cuál conviene |
| `top_lista` | ranking | Los 5 mejores teclados mecánicos para empezar |
| `guia_compra` | educativa | Cómo elegir una tira LED sin equivocarte |
| `caso_uso` | estilo de vida | Altavoces para apartamentos pequeños |
| `vale_la_pena` | decisión | ¿Vale la pena un monitor 144 Hz en 2026? |
| `problema_solucion` | evita errores | Errores al comprar una impresora 3D |
| `mito_realidad` | entretenida | 5 mitos sobre las luces RGB |
| `regalo` | inspiración | Regalos para amantes del DIY |

Los tipos viven en `lib/constants.ts` (`ENTRY_TYPES`) y deben coincidir con el
`CHECK` de la migración `0056`.

---

## 4. Estructura obligatoria del artículo

Cinco secciones H2 (`ENTRY_REQUIRED_SECTIONS`), en este orden:

1. **Por qué sí comprarlo** — contexto y beneficio real.
2. **Comparativa** — la tabla con datos del catálogo.
3. **Para quién es** — segmentación honesta (y para quién NO es).
4. **Cómo elegir** — criterios de decisión.
5. **Preguntas frecuentes** — 3–6 dudas reales (alimentan el schema FAQPage).

Un único `<h1>` por página (el del layout): el cuerpo nunca puede traer `<h1>`.

---

## 5. Gate de calidad (lo que bloquea una publicación)

`lib/entry-rules.mjs` → `validarCalidadEntrada` rechaza la entrada si:

- Usa clichés de IA (`ENTRY_BANNED_PHRASES`: "en el mundo actual", "sumérgete"…).
- El título sale de rango (`ENTRY_TITLE_MIN_LENGTH`–`ENTRY_TITLE_MAX_LENGTH`).
- La meta description sale de rango (`ENTRY_RESUMEN_MIN_LENGTH`–`ENTRY_RESUMEN_MAX_LENGTH`).
- El slug no es limpio (solo minúsculas, números y guiones simples).
- El cuerpo tiene menos de `ENTRY_MIN_WORDS` palabras (anti *thin content*).
- Falta alguna sección H2 obligatoria.
- Hay menos de `ENTRY_MIN_FAQ` preguntas o menos de `ENTRY_MIN_KEYWORDS` keywords.
- Se enlazan menos de `ENTRY_MIN_PRODUCTS` productos reales.
- El tipo no está en `ENTRY_TYPES`.

Además, `services/entry-dedupe.ts` compara la **firma del título** y el slug contra
lo ya publicado: si es un clon, se reintenta automáticamente con otro ángulo.

---

## 6. Datos reales, nunca inventados

- El **brief** (`services/entry-brief.ts`) se arma solo con `categories` y
  `products` reales (nombre, specs, precio, keywords). Si no hay 2 productos
  disponibles, la generación FALLA en vez de inventar.
- La **tabla comparativa** la construye `construirComparativa` con las
  `specifications` del catálogo. El modelo solo elige QUÉ criterios importan;
  los valores son verificables.
- La **FAQ** visible y el schema `FAQPage` son el mismo dato (Google exige que el
  marcado coincida con lo que ve el usuario).

---

## 7. Ciclo editorial

```
borrador  →  revision  →  publicado  →  archivado
   │                          │
   │                          └── entra al sitemap y a la web (ISR + revalidación)
   └── solo visible en el panel (RLS: el público no lo ve)
```

- `estado = publicado` es lo ÚNICO visible al público y en `/sitemap.xml`.
- El trigger `seo_entries_sync_publicado_en` sella `publicado_en` al publicar y lo
  limpia al despublicar (nunca hay una entrada publicada sin fecha).
- Con `indexado_google = false` la página se sirve con `noindex, follow` y sale
  del sitemap (útil para conservar entradas antiguas sin canibalizar).

---

## 8. Reglas de escala (anti "doorway pages")

| Regla | Valor | Dónde |
|---|---|---|
| Entradas por nicho | `ENTRY_MAX_PER_CATEGORY` (6) | `lib/constants.ts` |
| Productos por entrada | `ENTRY_MAX_PRODUCTS` (5) | `lib/constants.ts` |
| Criterios de tabla | `ENTRY_MAX_CRITERIA` (8) | `lib/constants.ts` |
| Pares comparables | `ENTRY_MAX_PAIRS` (6) | `lib/constants.ts` |

Recomendaciones operativas:

1. **No publicar en bloque**: repartir las publicaciones (drip) para que el sitio
   parezca vivo y no "generado a escala".
2. **Revisar antes de publicar**: ajustar el ángulo y el veredicto de cada producto
   es lo que convierte un texto correcto en uno útil.
3. **Traducir solo idiomas publicados** (`PUBLISHED_LOCALES`): nunca crear URL para
   un idioma cuya interfaz todavía no está lista.
4. **Un ángulo distinto por entrada**: si dos entradas del mismo nicho dicen lo
   mismo, se canibalizan.

---

## 9. Internacionalización

- El idioma **raíz es español**: el contenido se redacta en `es` y se traduce hacia
  los idiomas de `PUBLISHED_LOCALES`.
- El **slug se localiza** (`slug_i18n`): `/guias/…` en español y `/en/guias/…` en
  inglés, con `hreflang` + `x-default` correctos.
- El idioma raíz NUNCA se traduce a sí mismo: se hereda del dato base, así una URL
  ya indexada no cambia.
- Traducir tiene coste cero si el idioma ya está completo (no se llama al modelo).

### Traducción por lotes y reanudable (robustez)

Un artículo completo + su FAQ **no caben en una sola respuesta para 5 idiomas**:
el modelo agotaba los tokens de salida (`finish_reason = length`), la respuesta
llegaba cortada y el JSON inválido provocaba un error 500.

Por eso la traducción funciona así:

1. **Lotes de idiomas** (`TRANSLATION_LOCALE_BATCH_SIZE`): cada llamada traduce
   un lote pequeño, garantizando que la respuesta quepa entera.
2. **Detección explícita de truncado**: si aun así el modelo se corta, el error
   dice exactamente eso (y qué lote) en lugar de "JSON no válido".
3. **Reanudable desde el panel**: el servidor traduce un lote y devuelve cuántos
   idiomas quedan; el cliente repite tandas hasta terminar. Cada petición dura
   ~15 s (lejos del límite de la plataforma) y los idiomas ya traducidos se
   conservan, así que reintentar nunca reinicia el trabajo.

---

## 10. SEO técnico asociado

| Pieza | Dónde | Qué aporta |
|---|---|---|
| `/guias` y `/guias/[slug]` | `app/(site)/[locale]/guias/**` | SSG + ISR 300s (HTML sin JS) |
| Sitemap | `app/sitemap.ts` (sección 4) | Publicadas + indexables, `lastmod` real, slugs localizados |
| `llms.txt` | `app/llms.txt/route.ts` | Índice para motores de IA |
| JSON-LD | `buildEntryJsonLd` | `Article` + `ItemList` + `FAQPage` + `BreadcrumbList` |
| Revalidación | `lib/sitemap-revalidate.ts` | Publicar/editar refresca sitemap + página al instante |
| Enlazado interno | hub ↔ entrada ↔ ficha | Cluster temático y reparto de autoridad |

---

## 11. KPIs (qué se mide)

- Entradas **indexadas** vs publicadas (Search Console → Cobertura).
- Impresiones y clics por **cluster de entrada** (no por página suelta).
- Posición media de las keywords objetivo (`keyword_objetivo`).
- **Tiempo hasta la indexación** tras publicar.
- Clics a afiliado originados en entradas (analítica de producto existente).
- Coste por entrada generada (`seo_entry_generations`: tokens y coste real).

---

## 12. Archivos del módulo

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0056_seo_entries.sql` | Tablas, RLS, triggers y módulo RBAC |
| `lib/entry-rules.mjs` / `.d.ts` | Lógica pura (gate, pares, comparativa, schema) |
| `services/entries.ts` | Capa única de datos (lecturas públicas + panel) |
| `services/entry-brief.ts` | Brief anclado a datos reales del catálogo |
| `services/entry-content.ts` | Generación con IA + gate + reintento autocorrectivo |
| `services/entry-dedupe.ts` | Anti-duplicado (firma de título y slug) |
| `services/i18n-translate.ts` | `traducirEntrada` (solo idiomas pendientes) |
| `app/api/admin/entradas/**` | API RBAC (CRUD, `generate`, `traducir`) |
| `app/(internal)/admin/entradas/page.tsx` | Página del panel |
| `components/entry-manager.tsx` | Cola de trabajo + asistente IA |
| `components/entry-editor.tsx` | Editor de una entrada |
| `components/comparison-table.tsx` | Tabla comparativa (datos reales) |
| `components/entry-card.tsx` | Tarjeta reutilizable de entrada |
| `components/entry-index-view.tsx` | Vista del hub `/guias` |
| `components/entry-page-view.tsx` | Vista de `/guias/[slug]` |
| `app/(site)/[locale]/guias/**` | Páginas públicas (ISR + JSON-LD) |
| `tests/entry-rules.test.mjs` | Tests del gate, pares, comparativa y schema |

---

## 13. Procedimiento operativo

1. **Generar**: panel → *Guías y Comparativas* → elegir tipo y nicho (o "deja que la
   IA elija") → *Generar borrador*.
2. **Revisar**: ajustar título, ángulo, veredicto de cada producto y FAQ en el editor.
3. **Traducir** (opcional): botón de idiomas → traduce solo lo pendiente.
4. **Publicar**: botón de publicar en la lista → entra a la web y al sitemap.
5. **Medir**: Search Console + analítica de producto; re-priorizar según impresiones.

---

## 14. Firma editorial (autor) configurable

La autoría visible es una señal **E-E-A-T** que Google valora en contenido
informacional. En este proyecto es **configurable por entorno** y **editable**
sin tocar código:

| Pieza | Dónde |
|---|---|
| Variable de entorno | `NEXT_PUBLIC_DEFAULT_AUTHOR` (p. ej. `zonadehobbies`) |
| Constante única | `DEFAULT_AUTHOR` en `lib/constants.ts` |
| Guías | `seo_entries.autor` (migración 0056) → se muestra «Por {autor}» en `/guias/[slug]` |
| Hubs de categoría | `categories.autor` (migración 0057) → se muestra «Por {autor}» en `/categoria/[slug]` |
| Generación con IA | Al generar una guía o un hub se firma con `DEFAULT_AUTHOR` |
| Panel | El campo **Autor** aparece **prerrellenado** con la variable y se puede cambiar contenido por contenido (o dejarlo vacío para quitar la firma) |

Reglas de escritura (para no pisar la firma por accidente):

- `undefined` = la clave no viaja → **no se toca** el autor guardado.
- `null` / cadena vacía = el administrador lo dejó en blanco → **se limpia**.
