-- ============================================================
-- Migración 0050: Internacionalización de productos (i18n)
--
-- POR QUÉ:
--   El pipeline extrae el título del producto en el idioma que devuelve la
--   fuente (AliExpress/scraper), normalmente distinto del idioma del visitante.
--   En lugar de duplicar filas por idioma (rompería stock, precios y el
--   enlazado interno), se guardan las traducciones en una sola columna JSONB.
--
-- FORMA DEL JSONB (translations):
--   {
--     "es": { "name": "Ratón gamer inalámbrico", "titulo_seo": "..." },
--     "fr": { "name": "Souris gamer sans fil",  "titulo_seo": "..." }
--   }
--
-- ESTRATEGIA DE LECTURA (en /services):
--   name_i18n[locale].name → name_i18n[default].name → name (raíz).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Aditivo y NULLable: NO rompe el CRUD ni el pipeline actual.
-- ============================================================

alter table public.products
  add column if not exists translations jsonb;

comment on column public.products.translations is
  'Traducciones del producto por idioma: { "es": { "name": "...", "titulo_seo": "..." } }. Fallback = name / titulo_seo (idioma raíz de la fuente).';

create index if not exists idx_products_translations_gin
  on public.products using gin (translations);
