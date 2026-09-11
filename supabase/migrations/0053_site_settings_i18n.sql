-- ============================================================
-- Migración 0053: Internacionalización de los textos configurables
-- (site_settings.i18n)
--
-- POR QUÉ:
--   Los textos que el admin define (marca, eslogan, menú, hero, "cómo
--   funciona", contacto y footer) solo existían en el idioma base. Para servir
--   la tienda en varios idiomas SIN duplicar columnas rígidas (titulo_es,
--   titulo_en…), se guardan los overrides por idioma en UNA columna JSONB,
--   igual que categories.*_i18n (migración 0049).
--
-- FORMA DEL JSONB (i18n):
--   {
--     "en": { "tagline": "...", "nav_links": [{ "href": "/", "label": "Home" }],
--             "hero_texts": { "title": "...", ... }, "footer_texts": {...} },
--     "fr": { ... }
--   }
--
-- ESTRATEGIA DE LECTURA (en /services, nunca en componentes):
--   base (idioma raíz) ← deep-merge de i18n[locale] (lib/site-settings-i18n.mjs).
--   Si un idioma no tiene overrides, se sirve la base (cero cambios visibles).
--
-- Idempotente y aditivo: ADD COLUMN IF NOT EXISTS. No rompe el admin ni el render.
-- ============================================================

alter table public.site_settings
  add column if not exists i18n jsonb;

comment on column public.site_settings.i18n is
  'Overrides por idioma de los textos configurables: { "en": { "tagline": "...", "nav_links": [...], "hero_texts": {...} } }. Fallback = idioma base.';

create index if not exists idx_site_settings_i18n_gin
  on public.site_settings using gin (i18n);
