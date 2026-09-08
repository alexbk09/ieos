-- ============================================================
-- Migración 0044: Analítica de Productos (afiliados AliExpress/Amazon)
--
-- Objetivo: dar al administrador visibilidad de qué productos generan
-- mayor interés y conversión real hacia marketplaces de afiliado.
--
-- 1) product_daily_analytics: conteos diarios POR PRODUCTO.
--      - views_count              -> vistas de detalle (modal o /productos/[slug])
--      - product_card_clicks_count-> clics sobre la card para ver detalle
--      - add_to_cart_count        -> veces que se agregó al carrito híbrido
--      - aliexpress_clicks_count  -> clics de salida a AliExpress (afiliado)
--      - amazon_clicks_count      -> clics de salida a Amazon (afiliado)
--      - store_clicks_count       -> clics de salida a tienda propia/legado
--      - ai_impressions_count     -> veces que el Asistente IA lo mostró
-- 2) product_search_logs: términos de búsqueda (filtro catálogo e IA).
-- 3) Funciones SECURITY DEFINER que la app usa vía RPC (la UI NUNCA
--    escribe directo a Supabase; pasa por /services y /api/analytics).
-- 4) Módulo 'analytics_productos' + permisos admin + RLS (lectura).
--
-- Idempotente: CREATE TABLE/FUNCTION IF NOT EXISTS + ON CONFLICT.
-- ============================================================

-- ============================================================
-- 1) Tabla de métricas diarias por producto
-- ============================================================
create table if not exists public.product_daily_analytics (
  product_id uuid not null references public.products(id) on delete cascade,
  day date not null,
  views_count int not null default 0,
  product_card_clicks_count int not null default 0,
  add_to_cart_count int not null default 0,
  aliexpress_clicks_count int not null default 0,
  amazon_clicks_count int not null default 0,
  store_clicks_count int not null default 0,
  ai_impressions_count int not null default 0,
  primary key (product_id, day)
);

create index if not exists idx_product_analytics_day
  on public.product_daily_analytics (day desc);

create index if not exists idx_product_analytics_product
  on public.product_daily_analytics (product_id, day desc);

comment on table public.product_daily_analytics is
  'Conteos diarios de interacciones por producto para el panel de analítica.';

-- ============================================================
-- 2) Log de términos de búsqueda (filtros del catálogo + IA)
-- ============================================================
create table if not exists public.product_search_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  source text not null check (source in ('catalog_filter', 'agent')),
  results_count int not null default 0,
  session_id text,
  search_day date not null default ((now() at time zone 'America/Caracas')::date),
  created_at timestamptz not null default now()
);

create index if not exists idx_product_search_logs_day
  on public.product_search_logs (search_day desc, source);

comment on table public.product_search_logs is
  'Historial de términos buscados por clientes (filtro de catálogo o asistente IA).';

-- ============================================================
-- 3) Función RPC: registrar evento de producto
--    Seguridad: SECURITY DEFINER -> la UI/API inserta sin RLS bloqueante
--    pero SOLO escritura vía función; nunca SELECT/UPDATE directo anónimo.
-- ============================================================
create or replace function public.track_product_event(
  p_product_id uuid,
  p_event_type text,
  p_market text default null,
  p_source text default 'catalog'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Caracas')::date;
begin
  -- Valida el tipo de evento conocido (defensa contra payloads inválidos).
  if p_event_type not in ('product_view', 'card_click', 'add_to_cart', 'affiliate_click', 'ai_impression') then
    raise exception 'Evento de producto no soportado: %', p_event_type;
  end if;

  insert into public.product_daily_analytics (
    product_id, day,
    views_count,
    product_card_clicks_count,
    add_to_cart_count,
    aliexpress_clicks_count,
    amazon_clicks_count,
    store_clicks_count,
    ai_impressions_count
  )
  values (
    p_product_id, v_day,
    case when p_event_type = 'product_view' then 1 else 0 end,
    case when p_event_type = 'card_click' then 1 else 0 end,
    case when p_event_type = 'add_to_cart' then 1 else 0 end,
    case when p_event_type = 'affiliate_click' and lower(p_market) = 'aliexpress' then 1 else 0 end,
    case when p_event_type = 'affiliate_click' and lower(p_market) = 'amazon' then 1 else 0 end,
    case when p_event_type = 'affiliate_click' and lower(p_market) = 'store' then 1 else 0 end,
    case when p_event_type = 'ai_impression' then 1 else 0 end
  )
  on conflict (product_id, day) do update set
    views_count = product_daily_analytics.views_count + excluded.views_count,
    product_card_clicks_count = product_daily_analytics.product_card_clicks_count + excluded.product_card_clicks_count,
    add_to_cart_count = product_daily_analytics.add_to_cart_count + excluded.add_to_cart_count,
    aliexpress_clicks_count = product_daily_analytics.aliexpress_clicks_count + excluded.aliexpress_clicks_count,
    amazon_clicks_count = product_daily_analytics.amazon_clicks_count + excluded.amazon_clicks_count,
    store_clicks_count = product_daily_analytics.store_clicks_count + excluded.store_clicks_count,
    ai_impressions_count = product_daily_analytics.ai_impressions_count + excluded.ai_impressions_count;
end;
$$;

grant execute on function public.track_product_event(uuid, text, text, text) to anon, authenticated, service_role;

-- ============================================================
-- 3b) Función RPC: registrar término de búsqueda
-- ============================================================
create or replace function public.track_search_log(
  p_query text,
  p_source text,
  p_results_count int default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text;
begin
  v_normalized := lower(trim(p_query));
  -- Ignora consultas vacías para no contaminar el ranking de búsquedas.
  if v_normalized is null or v_normalized = '' then
    return;
  end if;

  insert into public.product_search_logs (query, source, results_count)
  values (v_normalized, p_source, greatest(p_results_count, 0));
end;
$$;

grant execute on function public.track_search_log(text, text, int) to anon, authenticated, service_role;

-- ============================================================
-- 3c) Función RPC: registrar búsqueda del Asistente IA + las
--     impresiones de los productos devueltos (una sola llamada).
--     Recibe el array de product_ids que el modelo mostrará.
-- ============================================================
create or replace function public.track_agent_search(
  p_query text,
  p_results_count int default 0,
  p_product_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_day date := (now() at time zone 'America/Caracas')::date;
begin
  -- 1) Registra el término buscado en la IA.
  insert into public.product_search_logs (query, source, results_count)
  values (lower(trim(p_query)), 'agent', greatest(p_results_count, 0));

  -- 2) Incrementa ai_impressions_count de cada producto mostrado.
  foreach v_product_id in array p_product_ids loop
    if v_product_id is not null then
      insert into public.product_daily_analytics (
        product_id, day, ai_impressions_count
      ) values (v_product_id, v_day, 1)
      on conflict (product_id, day) do update set
        ai_impressions_count = product_daily_analytics.ai_impressions_count + 1;
    end if;
  end loop;
end;
$$;

grant execute on function public.track_agent_search(text, int, uuid[]) to anon, authenticated, service_role;

-- ============================================================
-- 4) RLS
-- ============================================================
alter table public.product_daily_analytics enable row level security;
alter table public.product_search_logs enable row level security;

-- Lectura de analítica: solo quien tenga permiso del módulo o sea admin.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_daily_analytics'
      and policyname = 'Product analytics read authorized'
  ) then
    create policy "Product analytics read authorized" on public.product_daily_analytics
      for select using (
        public.has_permission('analytics_productos', 'read') or public.is_admin()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_search_logs'
      and policyname = 'Product search logs read authorized'
  ) then
    create policy "Product search logs read authorized" on public.product_search_logs
      for select using (
        public.has_permission('analytics_productos', 'read') or public.is_admin()
      );
  end if;
end $$;

-- ============================================================
-- 5) Módulo del panel + permisos para el rol admin
-- ============================================================
insert into public.modules (name, slug, description)
values (
  'Analítica de Productos',
  'analytics_productos',
  'Productos más vistos, más clickeados, agregados al carrito, clics de afiliado a AliExpress/Amazon y términos de búsqueda.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'analytics_productos'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;