# 🌍 Idiomas y traducciones (i18n)

Estado: **los 6 idiomas están publicados** (rutas, `hreflang` y sitemap activos).

| Concepto | Valor | Fuente única |
|---|---|---|
| Idiomas soportados | `es, en, fr, de, it, pt` | `lib/i18n-config.mjs` → `SUPPORTED_LOCALES` |
| Idiomas publicados | los 6 | `lib/i18n-config.mjs` → `PUBLISHED_LOCALES` |
| Idioma raíz (data) | `es` | `SOURCE_LOCALE` |
| Idioma por defecto (UI + `x-default`) | `es` | `DEFAULT_LOCALE` |

El idioma por defecto se sirve **sin prefijo** (`/catalogo`) y el resto con prefijo
(`/fr/catalogue`, `/de/katalog`…). `proxy.ts` hace el rewrite interno de las rutas sin
prefijo hacia `[locale]`, así ninguna URL ya indexada cambia.

---

## 1. Qué se traduce y dónde vive

| Capa | Dónde vive | Cómo se mantiene |
|---|---|---|
| Interfaz (UI) | `lib/i18n/messages/<locale>.mjs` (227 claves por idioma) | A mano; el traductor tiene fallback `locale → es` |
| Catálogo: productos | `products.translations` (JSONB) | Automático al crear (`createProduct`) + panel `/admin/idiomas` |
| Catálogo: categorías | `categories.*_i18n` (JSONB) | Automático en el pipeline + panel `/admin/idiomas` |
| Textos configurables (portada, hero, nav, contacto, footer) | `site_settings.i18n[locale]` | `npm run i18n:settings` |
| Entradas SEO (guías/comparativas) | `seo_entries.*_i18n` (JSONB) | **Automático al publicar** + `npm run i18n:entries` |
| Documentos legales | `lib/i18n/legal/<locale>.mjs` (generado) | `npm run i18n:legal` |

La detección de pendientes es **una sola** en todo el sistema:
`lib/i18n-translate.mjs` (`missingProductLocales`, `missingCategoryLocales`,
`missingEntryLocales`) y `lib/legal-i18n.mjs` (`missingLegalLocales`).

---

## 2. Contenido nuevo en los 6 idiomas

- **Productos:** al crearlos (manual o pipeline) se traducen solos. La carga masiva
  desactiva la traducción dentro de la petición HTTP (500 fichas no caben en un
  request) y se cierra después con `npm run i18n:products`.
- **Categorías:** el pipeline las traduce al crearlas; el panel de idiomas pone al día
  lo heredado.
- **Entradas SEO:** al **publicar** (`PATCH { estado: 'publicado' }`) se traduce lo que
  falte. Es *best-effort*: si el motor falla, la entrada queda publicada y el panel
  permite reintentar con la acción «Traducir».
- **Legales:** el contenido vive en el código, así que una traducción nueva o un cambio
  de texto del idioma raíz se propaga con `npm run i18n:legal`.

---

## 3. Comandos

```bash
npm run i18n:legal           # traduce los documentos legales pendientes
npm run i18n:legal:dry       # solo muestra el plan
npm run i18n:entries         # traduce las entradas SEO pendientes
npm run i18n:entries:dry     # solo muestra el plan
npm run i18n:products        # fichas de producto pendientes
npm run i18n:categories:es   # repara nombres base que quedaron en inglés
npm run i18n:settings        # textos configurables (portada, hero, footer…)
npm test                     # incluye tests de la lógica pura de i18n
```

Opciones útiles de los scripts de contenido: `--dry-run`, `--force`, `--limit <n>` y
(`i18n:legal`) `--only=fr,de` / `--doc=terms`.

---

## 4. Cómo añadir un idioma nuevo

1. Traduce la interfaz: `lib/i18n/messages/<locale>.mjs` con **todas** las claves del
   español (los tests de paridad de claves lo verifican).
2. Añade el locale a `SUPPORTED_LOCALES` (`lib/i18n-config.mjs`) y el par a
   `LOCALE_LLM_NAMES` / `LOCALE_NATIVE_NAMES` (para el asistente y los prompts).
3. Traduce el contenido: panel `/admin/idiomas` (productos y categorías) + `npm run
   i18n:entries` + `npm run i18n:settings` + `npm run i18n:legal`.
4. Publica: añade el locale a `PUBLISHED_LOCALES`. A partir de ahí se generan rutas,
   `hreflang`, `x-default`, sitemap y el selector de idioma **automáticamente**.
5. Reconstruye (`npm run build`) y comprueba `/sitemap.xml` y una URL `/xx/...`.

> Por qué publicar es un paso aparte: publicar un idioma con la UI o el contenido a
> medias genera páginas casi duplicadas que Google puede leer como *doorway pages*.

---

## 5. Decisiones y guardas (no romper)

- **Tokens literales:** `{name}`, `{email}` y `{address}` se sustituyen al renderizar
  (`renderLegalText`); el prompt obliga a conservarlos.
- **Anclas estables:** las traducciones legales se indexan por `id` de sección
  (`#aceptacion`, `#datos`…), nunca por posición: las URLs y anclas no cambian.
- **Validación estructural:** la traducción legal se acepta solo si conserva el número
  y tipo de bloques (y de ítems de cada lista). Si no, se sirve la sección en el idioma
  raíz: nunca se mezclan idiomas dentro de un bloque.
- **Tolerancia a claves traducidas:** el modelo a veces traduce el NOMBRE de los campos
  (`resumen` → `resumo`, `blocks` → `bloques`, `items` → `elementos`). `lib/i18n-aliases.mjs`
  resuelve los alias antes de fusionar, así que la traducción no se pierde en silencio;
  lo que se guarda queda siempre en la forma canónica del idioma raíz.
- **Fallback en cascada:** idioma pedido → idioma por defecto → idioma raíz → primer
  valor disponible (`lib/i18n-content.mjs`, `lib/site-settings-i18n.mjs`).
- **Textos base editados:** si cambias el texto español ya traducido, los idiomas no se
  actualizan solos (la detección busca *faltantes*, no *desactualizados*). Re-ejecuta el
  backfill con `--force` en el alcance que corresponda.
