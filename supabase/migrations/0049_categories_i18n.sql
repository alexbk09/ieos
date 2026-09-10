-- ============================================================
-- Migración 0049: Internacionalización de categorías (i18n)
--
-- POR QUÉ:
--   El nicho se descubre con la API de AliExpress en INGLÉS (idioma raíz o
--   "puente"), pero el público es multilingüe (Europa). Se conservan
--   `name`/`slug` en inglés como idioma raíz y se añaden columnas JSONB con
--   las traducciones por locale: { "es": "...", "fr": "...", "de": "..." }.
--
--   Se usa JSONB (igual que `seo_faq`/`specifications`) porque el set de
--   idiomas puede crecer sin migraciones nuevas ni cambiar las queries.
--
-- ESTRATEGIA DE LECTURA (aplicada en /services, nunca en componentes):
--   locale pedido → idioma por defecto → idioma raíz (inglés) → primer valor.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Aditivo y NULLable: NO rompe el CRUD, el pipeline de AliExpress ni las
-- queries actuales (siguen usando name/slug, intactos).
-- ============================================================

alter table public.categories
  add column if not exists name_i18n jsonb,
  add column if not exists slug_i18n jsonb,
  add column if not exists description_i18n jsonb,
  add column if not exists seo_title_i18n jsonb,
  add column if not exists seo_intro_i18n jsonb,
  add column if not exists seo_faq_i18n jsonb;

comment on column public.categories.name_i18n is
  'Nombre visible de la categoría por idioma. Ej: {"en":"Gaming Mice","es":"Ratones Gamer"}. Fallback = name (inglés, idioma raíz).';
comment on column public.categories.slug_i18n is
  'Slug/URL localizada por idioma. Ej: {"es":"ratones-gamer","fr":"souris-gamer"}. Fallback = slug (inglés).';
comment on column public.categories.description_i18n is
  'Descripción corta por idioma (meta description / intro de la landing).';
comment on column public.categories.seo_title_i18n is
  'Título H1 largo del hub de nicho por idioma. Fallback = seo_title / name.';
comment on column public.categories.seo_intro_i18n is
  'HTML editorial del hub (guía de compra) por idioma. Fallback = seo_intro.';
comment on column public.categories.seo_faq_i18n is
  'FAQ del nicho por idioma: { "es": [{pregunta,respuesta}], ... }. Alimenta el schema FAQPage.';

-- Slug único POR IDIOMA: evita que dos categorías colisionen en la misma URL.
-- Se crean índices parciales para los idiomas base (por defecto y raíz) y un
-- índice GIN para consultas de contención del resto de idiomas.
create unique index if not exists idx_categories_slug_i18n_es
  on public.categories ((slug_i18n ->> 'es'))
  where (slug_i18n ? 'es');

create unique index if not exists idx_categories_slug_i18n_en
  on public.categories ((slug_i18n ->> 'en'))
  where (slug_i18n ? 'en');

create index if not exists idx_categories_slug_i18n_gin
  on public.categories using gin (slug_i18n);

-- GIN para filtrar categorías por nombre traducido (búsquedas futuras).
create index if not exists idx_categories_name_i18n_gin
  on public.categories using gin (name_i18n);
