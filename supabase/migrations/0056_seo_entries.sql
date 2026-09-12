-- ============================================================
-- Migración 0056: Entradas SEO (comparativas y guías) — pSEO informacional
--
-- POR QUÉ:
--   El catálogo ya cubre la intención TRANSACCIONAL (hub de categoría +
--   ficha de producto). Falta la capa INTERMEDIA informacional: artículos
--   que resuelven una decisión de compra ("X vs Y", "¿vale la pena?",
--   "los mejores para regalar", "cómo elegir sin equivocarte"). Esas
--   entradas capturan keywords long-tail de alto volumen y enlazan entre sí
--   los hubs y las fichas (cluster topical), que es lo que Google premia.
--
--   ⚠️ ALCANCE ADITIVO: esta migración NO altera `categories` ni `products`
--   ni el pipeline existente. Solo AGREGA una entidad nueva que los enlaza.
--
--   1) seo_entries            → la entrada (borrador/revisión/publicado).
--   2) seo_entry_products     → comparativa: qué productos compara (orden + nota).
--   3) seo_entry_categories   → a qué nicho(s) pertenece (enlazado interno).
--   4) seo_entry_generations  → auditoría/coste de las generaciones con IA.
--   5) i18n JSONB (mismo patrón que categories): la URL y el texto se
--      localizan por idioma sin duplicar fila (no rompe enlaces ni métricas).
--   6) RLS: lectura pública SOLO de publicados; escritura por permiso RBAC
--      del módulo nuevo 'guias_comparativas'.
--
-- Idempotente: CREATE ... IF NOT EXISTS + ON CONFLICT + guardas de política.
-- Se ejecuta dentro de UNA transacción (supabase/run.mjs), por eso NO se usa
-- CREATE INDEX CONCURRENTLY.
-- ============================================================

-- ============================================================
-- 1) Tabla principal: la entrada editorial
-- ============================================================
create table if not exists public.seo_entries (
  id uuid primary key default gen_random_uuid(),

  -- Tipo de entrada: cada uno mapea a una intención de búsqueda distinta.
  tipo text not null default 'comparativa'
    check (tipo in (
      'comparativa',       -- "X vs Y": comparación directa entre productos
      'top_lista',         -- "Los 5 mejores ...": ranking
      'guia_compra',       -- "Cómo elegir ...": guía educativa
      'caso_uso',          -- "... para gamers nocturnos": por estilo de vida
      'vale_la_pena',      -- "¿Vale la pena ...?": decisión de compra
      'problema_solucion', -- "Errores al comprar ...": evita devoluciones
      'mito_realidad',     -- "... mitos y verdades": contenido entretenido
      'regalo'             -- "Regalos para ...": inspiración estacional
    )),

  -- Flujo editorial: nada se publica sin revisión humana (anti "spam a escala").
  estado text not null default 'borrador'
    check (estado in ('borrador', 'revision', 'publicado', 'archivado')),

  -- Contenido en el idioma RAÍZ (es). El resto de idiomas va en *_i18n.
  titulo text not null,
  slug text not null,
  resumen text,                 -- meta description (120-155 caracteres)
  cuerpo_html text,             -- artículo semántico (H2/H3, sin H1)
  comparativa jsonb,            -- datos estructurados de la tabla comparativa
  faq jsonb,                    -- [{pregunta,respuesta}] → schema FAQPage
  keywords text[],              -- términos long-tail objetivo
  keyword_objetivo text,        -- keyword principal de la entrada
  angulo text,                  -- gancho editorial ("para principiantes", "regalo")
  hero_image_url text,          -- imagen de cabecera (dominio propio)

  -- Señales E-E-A-T: autoría y revisión visibles (Google las exige en guías).
  autor text,
  revisor_id uuid references public.profiles(id) on delete set null,
  lectura_minutos int check (lectura_minutos is null or lectura_minutos > 0),

  -- Un borrador no debe entrar al sitemap; esto lo controla de forma explícita.
  indexado_google boolean not null default true,

  -- datePublished (sitemap + schema Article) y dateModified (updated_at).
  publicado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Traducciones por idioma (misma estrategia que categories.*_i18n).
  titulo_i18n jsonb,
  slug_i18n jsonb,
  resumen_i18n jsonb,
  cuerpo_html_i18n jsonb,
  faq_i18n jsonb
);

comment on table public.seo_entries is
  'Entradas SEO (comparativas y guias) que capturan intencion informacional y enlazan hubs y fichas (pSEO). NO sustituye a las categorias: las complementa.';
comment on column public.seo_entries.tipo is
  'Tipo/intencion de la entrada: comparativa | top_lista | guia_compra | caso_uso | vale_la_pena | problema_solucion | mito_realidad | regalo.';
comment on column public.seo_entries.estado is
  'Ciclo editorial: borrador | revision | publicado | archivado. Solo "publicado" es visible en publico y en el sitemap.';
comment on column public.seo_entries.comparativa is
  'Datos estructurados de la comparativa: { criterios: [{ criterio, valores: [{ slug, valor }] }] }. Alimenta el componente comparativo y el schema ItemList.';
comment on column public.seo_entries.faq is
  'Preguntas frecuentes estructuradas [{pregunta,respuesta}]. Alimentan el schema FAQPage de la entrada.';
comment on column public.seo_entries.keywords is
  'Palabras clave long-tail objetivo (minusculas). Sirven para enlazado interno y anti-duplicado.';
comment on column public.seo_entries.publicado_en is
  'Fecha de publicacion (datePublished del schema y lastmod del sitemap). La sincroniza el trigger segun `estado`.';
comment on column public.seo_entries.slug_i18n is
  'Slug/URL localizada por idioma (SEO internacional, como categories.slug_i18n). Fallback = slug.';
comment on column public.seo_entries.cuerpo_html_i18n is
  'Cuerpo HTML del articulo por idioma. Fallback = cuerpo_html.';
comment on column public.seo_entries.faq_i18n is
  'FAQ por idioma: { "es": [{pregunta,respuesta}], ... }. Fallback = faq.';

-- Slug unico global: la URL raiz no puede repetirse.
create unique index if not exists idx_seo_entries_slug_unique
  on public.seo_entries (slug);

-- Cola de trabajo del panel: filtrar por estado y ordenar por publicacion.
create index if not exists idx_seo_entries_estado_publicado
  on public.seo_entries (estado, publicado_en desc);

-- Filtros del manager (por tipo) e indice parcial para el sitemap.
create index if not exists idx_seo_entries_tipo
  on public.seo_entries (tipo);
create index if not exists idx_seo_entries_indexado
  on public.seo_entries (indexado_google)
  where estado = 'publicado';

-- Busqueda por keywords (operador && / @>) y por slug localizado.
create index if not exists idx_seo_entries_keywords_gin
  on public.seo_entries using gin (keywords);
create index if not exists idx_seo_entries_slug_i18n_gin
  on public.seo_entries using gin (slug_i18n);

-- Slug unico POR IDIOMA (evita que dos entradas colisionen en la misma URL
-- localizada). Mismo criterio que categories (migracion 0049).
create unique index if not exists idx_seo_entries_slug_i18n_es
  on public.seo_entries ((slug_i18n ->> 'es'))
  where (slug_i18n ? 'es');
create unique index if not exists idx_seo_entries_slug_i18n_en
  on public.seo_entries ((slug_i18n ->> 'en'))
  where (slug_i18n ? 'en');

-- ============================================================
-- 2) Relaciones (muchos-a-muchos con orden explícito)
--    Se usan tablas puente para que una entrada pueda comparar varios
--    productos y pertenecer a varios nichos sin duplicar la entrada.
-- ============================================================
create table if not exists public.seo_entry_products (
  entry_id uuid not null references public.seo_entries(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  posicion int not null default 0,          -- orden en la comparativa/top
  nota text,                                -- veredicto corto del producto
  created_at timestamptz not null default now(),
  primary key (entry_id, product_id)
);

comment on table public.seo_entry_products is
  'Productos que compara/recomienda una entrada. `posicion` fija el orden en la tabla comparativa y en el schema ItemList.';

-- Índice inverso: "¿en qué guías aparece este producto?" (enlazado de retorno).
create index if not exists idx_seo_entry_products_product
  on public.seo_entry_products (product_id);

create table if not exists public.seo_entry_categories (
  entry_id uuid not null references public.seo_entries(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (entry_id, category_id)
);

comment on table public.seo_entry_categories is
  'Nichos a los que pertenece la entrada. Sirve para el cluster de enlazado interno (entrada <-> hub de categoria).';

create index if not exists idx_seo_entry_categories_category
  on public.seo_entry_categories (category_id);

-- ============================================================
-- 3) Auditoría de generaciones con IA (control de coste y calidad)
--    Cada llamada al modelo deja rastro: modelo, tokens, coste y error.
--    Permite medir tasa de éxito y detectar prompts que fallan.
-- ============================================================
create table if not exists public.seo_entry_generations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.seo_entries(id) on delete set null,
  locale text not null default 'es',
  etapa text not null default 'generacion'
    check (etapa in ('generacion', 'traduccion')),
  modelo text,
  exito boolean not null default false,
  tokens_prompt int,
  tokens_salida int,
  coste_usd numeric(12,6),
  errores text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.seo_entry_generations is
  'Log de cada generacion/traduccion con IA de una entrada: modelo, tokens, coste y errores. Observabilidad del modulo.';

create index if not exists idx_seo_entry_generations_entry
  on public.seo_entry_generations (entry_id, created_at desc);
create index if not exists idx_seo_entry_generations_etapa
  on public.seo_entry_generations (etapa, exito, created_at desc);

-- ============================================================
-- 4) Sincronización de `publicado_en` + `updated_at`
--    POR QUÉ un trigger: la fecha de publicación alimenta datePublished y el
--    lastmod del sitemap. Sincronizarla en la BD garantiza que NUNCA se
--    publique una entrada sin fecha (incluso si el código la olvida) y que
--    al despublicar quede limpia.
-- ============================================================
create or replace function public.seo_entries_sync_publicado_en()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'publicado' then
    -- Conserva la fecha original al re-guardar un publicado.
    new.publicado_en = coalesce(new.publicado_en, now());
  else
    -- Borrador, revisión o archivado: sin fecha de publicación.
    new.publicado_en = null;
  end if;
  return new;
end;
$$;

drop trigger if exists seo_entries_sync_publicado_en on public.seo_entries;
create trigger seo_entries_sync_publicado_en
before insert or update on public.seo_entries
for each row execute procedure public.seo_entries_sync_publicado_en();

-- Reutiliza el helper estándar del proyecto (0002) para updated_at.
drop trigger if exists seo_entries_set_updated_at on public.seo_entries;
create trigger seo_entries_set_updated_at
before update on public.seo_entries
for each row execute procedure public.set_updated_at();

-- ============================================================
-- 5) RLS
--    Lectura pública: SOLO entradas publicadas (un borrador jamás se filtra
--    por la API pública ni entra al sitemap).
--    Escritura: permiso del módulo 'guias_comparativas' o admin.
--    Las políticas se crean con guarda (pg_policies) para ser idempotentes.
-- ============================================================
alter table public.seo_entries enable row level security;
alter table public.seo_entry_products enable row level security;
alter table public.seo_entry_categories enable row level security;
alter table public.seo_entry_generations enable row level security;

do $$
begin
  -- Lectura pública de publicados (visitantes y buscadores).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entries'
      and policyname = 'SEO entries public read published'
  ) then
    create policy "SEO entries public read published" on public.seo_entries
      for select using (estado = 'publicado');
  end if;

  -- Lectura del panel (incluye borradores y revisiones).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entries'
      and policyname = 'SEO entries authorized read'
  ) then
    create policy "SEO entries authorized read" on public.seo_entries
      for select to authenticated
      using (public.has_permission('guias_comparativas', 'read') or public.is_admin());
  end if;

  -- Alta de entradas.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entries'
      and policyname = 'SEO entries authorized insert'
  ) then
    create policy "SEO entries authorized insert" on public.seo_entries
      for insert to authenticated
      with check (public.has_permission('guias_comparativas', 'write') or public.is_admin());
  end if;

  -- Edición (publicar, despublicar, editar contenido).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entries'
      and policyname = 'SEO entries authorized update'
  ) then
    create policy "SEO entries authorized update" on public.seo_entries
      for update to authenticated
      using (public.has_permission('guias_comparativas', 'write') or public.is_admin())
      with check (public.has_permission('guias_comparativas', 'write') or public.is_admin());
  end if;

  -- Baja definitiva.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entries'
      and policyname = 'SEO entries authorized delete'
  ) then
    create policy "SEO entries authorized delete" on public.seo_entries
      for delete to authenticated
      using (public.has_permission('guias_comparativas', 'delete') or public.is_admin());
  end if;
end $$;

-- Relaciones de la comparativa: mismas reglas que la entrada padre.
do $$
begin
  -- Lectura pública solo si la entrada está publicada (subconsulta sujeta a la
  -- RLS de seo_entries, que ya limita a publicados para visitantes).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entry_products'
      and policyname = 'SEO entry products public read'
  ) then
    create policy "SEO entry products public read" on public.seo_entry_products
      for select using (
        exists (
          select 1 from public.seo_entries e
          where e.id = entry_id and e.estado = 'publicado'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entry_products'
      and policyname = 'SEO entry products authorized write'
  ) then
    create policy "SEO entry products authorized write" on public.seo_entry_products
      for all to authenticated
      using (public.has_permission('guias_comparativas', 'write') or public.is_admin())
      with check (public.has_permission('guias_comparativas', 'write') or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entry_categories'
      and policyname = 'SEO entry categories public read'
  ) then
    create policy "SEO entry categories public read" on public.seo_entry_categories
      for select using (
        exists (
          select 1 from public.seo_entries e
          where e.id = entry_id and e.estado = 'publicado'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entry_categories'
      and policyname = 'SEO entry categories authorized write'
  ) then
    create policy "SEO entry categories authorized write" on public.seo_entry_categories
      for all to authenticated
      using (public.has_permission('guias_comparativas', 'write') or public.is_admin())
      with check (public.has_permission('guias_comparativas', 'write') or public.is_admin());
  end if;

  -- El log de IA es interno: sin lectura pública.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entry_generations'
      and policyname = 'SEO entry generations authorized read'
  ) then
    create policy "SEO entry generations authorized read" on public.seo_entry_generations
      for select to authenticated
      using (public.has_permission('guias_comparativas', 'read') or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_entry_generations'
      and policyname = 'SEO entry generations authorized insert'
  ) then
    create policy "SEO entry generations authorized insert" on public.seo_entry_generations
      for insert to authenticated
      with check (public.has_permission('guias_comparativas', 'write') or public.is_admin());
  end if;
end $$;

-- ============================================================
-- 6) Módulo del panel + permisos para el rol admin
--    Mismo patrón que 0048 (SEO de Categorías) y 0051 (Idiomas).
--    El módulo convive con los existentes: no modifica ningún permiso previo.
-- ============================================================
insert into public.modules (name, slug, description)
values (
  'Guias y Comparativas',
  'guias_comparativas',
  'Entradas SEO informacionales (comparativas X vs Y, guias de compra, tops, casos de uso). Generacion asistida con IA, revision editorial, publicacion y registro en el sitemap.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'guias_comparativas'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;
