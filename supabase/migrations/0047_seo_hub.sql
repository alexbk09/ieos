-- ============================================================
-- Migración 0047: Contenido SEO estructurado (productos y hubs)
--
-- Objetivo pSEO: alimentar schema JSON-LD (FAQPage, keywords) y las
-- páginas de "Categoría de Nicho" con contenido editorial único.
--
--   products.seo_faq       JSONB  → [{pregunta, respuesta}] → FAQPage.
--   products.seo_keywords  TEXT[] → términos long-tail (enlazado/relacionados).
--   categories.seo_title   TEXT   → H1 largo del hub ("Los mejores ...").
--   categories.seo_intro   TEXT   → HTML editorial (Guía de compra, etc.).
--   categories.seo_faq     JSONB  → FAQ del nicho → FAQPage del hub.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Se agregan NULLables para no romper el CRUD/importador actual.
-- ============================================================

-- ============================================================
-- 1) Columnas SEO en products
-- ============================================================
alter table public.products
  add column if not exists seo_faq jsonb,
  add column if not exists seo_keywords text[];

comment on column public.products.seo_faq is
  'Preguntas frecuentes estructuradas [{pregunta,respuesta}] generadas por la IA. Alimentan el schema FAQPage de Google.';
comment on column public.products.seo_keywords is
  'Palabras clave long-tail objetivo del producto (minúsculas). Usadas para enlazado interno y relacionados.';

-- Índice GIN para búsquedas por array de keywords (operador && / @>).
create index if not exists idx_products_seo_keywords
  on public.products using gin (seo_keywords);

-- ============================================================
-- 2) Columnas SEO de hub en categories
-- ============================================================
alter table public.categories
  add column if not exists seo_title text,
  add column if not exists seo_intro text,
  add column if not exists seo_faq jsonb;

comment on column public.categories.seo_title is
  'Título H1 largo de la landing de nicho (ej: "Los mejores teclados mecánicos — Guía"). Fallback = name.';
comment on column public.categories.seo_intro is
  'HTML editorial del hub (Guía de compra, Cómo elegir, Consejos). Se renderiza con RichDescription.';
comment on column public.categories.seo_faq is
  'Preguntas frecuentes del nicho [{pregunta,respuesta}]. Alimentan el schema FAQPage de la categoría.';
