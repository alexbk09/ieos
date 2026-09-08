-- ============================================================
-- Migración 0042: Campos store afiliados en products
--
-- Agrega a public.products los campos del catálogo de afiliados
-- de la store SIN duplicar columnas que ya existen en el esquema.
--
-- Comparación contra la lista solicitada:
--
--   id BIGSERIAL             → products.id (uuid PK). NO se cambia;
--                              alterar el tipo rompería FK y código TS.
--   asin VARCHAR(50) UNIQUE  → NUEVO (único vía índice, nullable).
--   titulo_seo TEXT          → NUEVO (nullable; fallback = name).
--   slug TEXT UNIQUE         → YA EXISTE products.slug UNIQUE.
--   descripcion_html TEXT    → YA EXISTE products.description
--                              (guarda el HTML del editor).
--   precio_original NUMERIC  → NUEVO (precio tachado / referencia).
--   url_afiliado_amazon TEXT → RENOMBRADO url_afiliado_store TEXT
--                              (URL de afiliado de la store).
--   categoria VARCHAR(100)   → YA EXISTE vía product_categories (N:N
--                              con categories) + category_id legacy.
--   metadatos_fisicos JSONB  → YA EXISTE: products.peso +
--                              products.tamaño +
--                              products.specifications +
--                              products.weight_grams.
--   galeria_imagenes JSONB   → YA EXISTE product_images con
--                              color_name (imágenes por color).
--   indexado_google BOOLEAN  → NUEVO (DEFAULT false).
--   creado_el TIMESTAMPTZ    → YA EXISTE products.created_at.
--
-- NOT NULL: las nuevas columnas de texto NUEVAS se agregan NULLables
-- para no romper el CRUD / importador actual (que crea productos sin
-- datos de afiliado). indexado_google sí lleva DEFAULT false.
-- ============================================================

-- ============================================================
-- 1) Columnas nuevas en products
-- ============================================================
alter table public.products
  add column if not exists asin varchar(50),
  add column if not exists titulo_seo text,
  add column if not exists precio_original numeric(10,2),
  add column if not exists url_afiliado_store text,
  add column if not exists indexado_google boolean not null default false;

-- ============================================================
-- 2) Índices optimizados para filtros de React (miles de filas)
-- ============================================================
-- Búsqueda rápida por ASIN (único; permite múltiples NULLs para
-- productos que no son de afiliado).
create unique index if not exists idx_products_asin_unique
  on public.products(asin);

-- Índice parcial para productos marcados como indexables en Google.
create index if not exists idx_products_indexado_google
  on public.products(indexado_google)
  where indexado_google = true;

-- Filtro por URL de afiliado de store (ej. listar solo afiliados).
create index if not exists idx_products_url_afiliado_store
  on public.products(url_afiliado_store)
  where url_afiliado_store is not null;

-- Filtro legacy por category_id (product_categories N:N ya está
-- cubierto por idx_product_categories_category_id en la 0006).
create index if not exists idx_products_category_id
  on public.products(category_id);

-- products.slug NO necesita índice extra: la restricción
-- UNIQUE (0001_init.sql) ya crea el índice automáticamente,
-- equivalente a idx_productos_afiliados_slug.

-- ============================================================
-- 3) Documentación de las columnas nuevas
-- ============================================================
comment on column public.products.asin is
  'Código ASIN de la store. Único; NULL si el producto no es de afiliado.';
comment on column public.products.titulo_seo is
  'Título optimizado para SEO/Google. Si es NULL, usar name como fallback.';
comment on column public.products.precio_original is
  'Precio original/referencia en USD para mostrar oferta (ej. store). NULL = sin precio de comparación.';
comment on column public.products.url_afiliado_store is
  'URL de afiliado de la store (con tag de seguimiento) del producto. NULL si no aplica.';
comment on column public.products.indexado_google is
  'TRUE = incluir en sitemap / indexación de Google. Default FALSE.';