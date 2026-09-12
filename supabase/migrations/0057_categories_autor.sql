-- ============================================================
-- Migración 0057: Autor de la categoría (firma editorial del hub)
--
-- POR QUÉ:
--   El hub de nicho (/categoria/[slug]) contiene contenido editorial (guía de
--   compra + FAQ) que posiciona por intención informacional. Mostrar QUIÉN firma
--   ese contenido es una señal E-E-A-T ("experiencia, pericia, autoridad y
--   confianza") que Google valora, igual que en las entradas de /guias.
--
--   Aditiva y NULLable: NO altera el CRUD, el pipeline de AliExpress ni las
--   queries actuales. El valor por defecto lo inyecta la aplicación desde la
--   variable de entorno NEXT_PUBLIC_DEFAULT_AUTHOR (lib/constants.ts →
--   DEFAULT_AUTHOR) y el panel prerrellena el campo para poder cambiarlo.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================

alter table public.categories
  add column if not exists autor text;

comment on column public.categories.autor is
  'Firma editorial del hub (autoría visible del contenido informacional). Se prerrellena con NEXT_PUBLIC_DEFAULT_AUTHOR y es editable en el panel.';
