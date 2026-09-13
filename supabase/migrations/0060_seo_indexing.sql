-- ============================================================
-- Migración 0060: Indexación en buscadores (cola + auditoría)
--
-- POR QUÉ:
--   El sitemap ya declara TODAS las URLs que deben indexarse, pero Google
--   decide cuándo recrawlearlas y no existe API pública de "solicitar
--   indexación" para páginas normales (el botón de Search Console es UI).
--   Además, su Indexing API solo admite JobPosting/BroadcastEvent:
--     "The Indexing API can only be used to crawl pages with either
--      JobPosting or BroadcastEvent embedded in a VideoObject."
--     https://developers.google.com/search/apis/indexing-api/v3/quickstart
--
--   Con tantas URLs sin indexar, hace falta:
--     1) una COLA auditable de URLs candidatas (las del sitemap + lo que
--        publica la IA), con su estado real de indexación;
--     2) un REGISTRO de cada envío (canal, resultado, cuota diaria) para no
--        pasar de los límites del buscador ni parecer spam a escala;
--     3) un reclamo ATÓMICO de lotes para que dos operadores (o dos pestañas)
--        nunca envíen la misma URL a la vez.
--
--   1) seo_indexing_urls  → cola/estado por URL (fuente: sitemap o publicación).
--   2) seo_indexing_log   → auditoría de envíos e inspecciones + cuota diaria.
--   3) seo_indexing_claim_batch() → RPC transaccional que reclama un lote.
--   4) Módulo RBAC 'seo_indexing' con permisos de admin y RLS por permiso.
--
-- Idempotente: CREATE ... IF NOT EXISTS + ON CONFLICT + guardas de política.
-- Se ejecuta dentro de UNA transacción (supabase/run.mjs), por eso NO se usa
-- CREATE INDEX CONCURRENTLY.
-- ============================================================

-- ============================================================
-- 1) Cola de URLs a indexar / indexadas
-- ============================================================
create table if not exists public.seo_indexing_urls (
  id uuid primary key default gen_random_uuid(),

  -- URL canónica absoluta del propio dominio (una fila por URL, sin duplicados).
  url text not null unique,

  -- Tipo de contenido: decide qué canales pueden empujarla (política de Google).
  tipo text not null default 'pagina'
    check (tipo in ('producto','categoria','guia','pagina','job_posting','broadcast_event')),

  -- Referencia blanda a la entidad de origen (producto, categoría o entrada).
  -- Sin FK: la cola sobrevive al borrado del contenido (queda como histórica).
  ref_id uuid,
  ref_slug text,

  -- Ciclo de vida: pendiente → enviando → enviado → indexado/no_indexado.
  -- 'excluido' = la propia web la marca noindex (no es una incidencia).
  estado text not null default 'pendiente'
    check (estado in ('pendiente','enviando','enviado','indexado','no_indexado','excluido','error')),

  -- Último canal que la empujó con éxito y de dónde entró a la cola.
  canal text
    check (canal is null or canal in ('indexnow','google_indexing','sitemap','manual')),
  origen text not null default 'sitemap'
    check (origen in ('sitemap','publicacion','manual')),

  -- `<lastmod>` del sitemap: prioriza lo que cambió de verdad.
  lastmod timestamptz,
  enviado_en timestamptz,
  inspeccionado_en timestamptz,

  intentos integer not null default 0,

  -- Diagnóstico del último fallo y `coverageState` crudo de Google.
  ultimo_error text,
  cobertura text,

  -- Marca de envío fuera de las directrices (solo si el operador lo fuerza).
  riesgo_politica boolean not null default false,

  -- Mayor prioridad = se envía antes (las publicaciones nuevas van al frente).
  prioridad integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índice de trabajo del panel: pendientes ordenadas por prioridad/frescura.
create index if not exists seo_indexing_urls_estado_idx
  on public.seo_indexing_urls (estado, prioridad desc, lastmod asc nulls first);

-- Índice para las consultas por tipo (filtros del panel y métricas).
create index if not exists seo_indexing_urls_tipo_idx
  on public.seo_indexing_urls (tipo, estado);

drop trigger if exists seo_indexing_urls_set_updated_at on public.seo_indexing_urls;
create trigger seo_indexing_urls_set_updated_at
  before update on public.seo_indexing_urls
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 2) Registro de envíos e inspecciones (auditoría + cuota diaria)
-- ============================================================
create table if not exists public.seo_indexing_log (
  id uuid primary key default gen_random_uuid(),
  url text not null,

  canal text not null
    check (canal in ('indexnow','google_indexing','sitemap','inspeccion')),
  accion text not null default 'publicar'
    check (accion in ('publicar','eliminar','inspeccionar','sitemap')),

  -- 'bloqueado_politica' = evitado a propósito (tipo no soportado por Google).
  resultado text not null default 'ok'
    check (resultado in ('ok','error','omitido','bloqueado_politica')),

  http_status integer,
  detalle text,
  riesgo_politica boolean not null default false,

  usuario_id uuid references public.profiles(id) on delete set null,
  usuario_email text,

  created_at timestamptz not null default now()
);

-- Índice del contador de cuota: (canal, resultado, fecha) es exactamente el
-- filtro que usa el servicio para saber cuántos envíos correctos van hoy.
create index if not exists seo_indexing_log_cuota_idx
  on public.seo_indexing_log (canal, resultado, created_at desc);

create index if not exists seo_indexing_log_url_idx
  on public.seo_indexing_log (url, created_at desc);

-- ============================================================
-- 3) RPC transaccional: reclamar un lote de URLs a enviar
-- ============================================================
-- POR QUÉ una función y no varios UPDATE desde el servicio:
--   Reclamar el lote y marcarlo 'enviando' debe ser ATÓMICO. Con
--   `for update skip locked` dos operadores (o dos pestañas) nunca toman la
--   misma URL: el segundo recibe la siguiente tanda sin esperar al primero.
create or replace function public.seo_indexing_claim_batch(
  p_limit integer default 25,
  p_max_intentos integer default 3
)
returns setof public.seo_indexing_urls
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_max_intentos integer := greatest(1, coalesce(p_max_intentos, 3));
begin
  if not (public.has_permission('seo_indexing', 'write') or public.is_admin()) then
    raise exception 'Sin permiso para enviar URLs a buscadores.' using errcode = '42501';
  end if;

  return query
    with candidatos as (
      select u.id
      from public.seo_indexing_urls u
      where u.estado in ('pendiente', 'error')
        and u.intentos < v_max_intentos
        -- Las URLs marcadas con riesgo de política NO se envían solas:
        -- requieren una acción explícita del operador.
        and u.riesgo_politica = false
      order by u.prioridad desc, u.lastmod asc nulls first, u.created_at asc
      limit v_limite
      for update skip locked
    )
    update public.seo_indexing_urls t
       set estado = 'enviando',
           updated_at = now()
      from candidatos c
     where t.id = c.id
    returning t.*;
end;
$$;

grant execute on function public.seo_indexing_claim_batch(integer, integer) to authenticated;
revoke execute on function public.seo_indexing_claim_batch(integer, integer) from anon;

-- ============================================================
-- 4) RPC de recuperación: liberar lotes abandonados
-- ============================================================
-- POR QUÉ: si una request cae (timeout/cold start) después de reclamar el lote
-- pero antes de registrar el resultado, las filas quedarían 'enviando' para
-- siempre. Esta función las devuelve a 'pendiente' pasado un margen.
create or replace function public.seo_indexing_release_stale(p_minutos integer default 15)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_margen integer := greatest(1, coalesce(p_minutos, 15));
  v_liberadas integer := 0;
begin
  if not (public.has_permission('seo_indexing', 'write') or public.is_admin()) then
    raise exception 'Sin permiso para gestionar la cola de indexación.' using errcode = '42501';
  end if;

  update public.seo_indexing_urls
     set estado = 'pendiente',
         updated_at = now(),
         ultimo_error = 'Lote abandonado: se devolvió a pendiente.'
   where estado = 'enviando'
     and updated_at < now() - make_interval(mins => v_margen);

  get diagnostics v_liberadas = row_count;
  return v_liberadas;
end;
$$;

grant execute on function public.seo_indexing_release_stale(integer) to authenticated;
revoke execute on function public.seo_indexing_release_stale(integer) from anon;

-- ============================================================
-- 4b) RPC de resumen: conteo por estado en la BASE DE DATOS
-- ============================================================
-- POR QUÉ: PostgREST devuelve como máximo 1000 filas por consulta, así que
-- contar los estados en el cliente daría cifras falsas en catálogos grandes.
-- Agregar en SQL es exacto y no transfiere datos innecesarios.
create or replace function public.seo_indexing_summary()
returns table (estado text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('seo_indexing', 'read') or public.is_admin()) then
    raise exception 'Sin permiso para ver la cola de indexación.' using errcode = '42501';
  end if;

  return query
    select u.estado::text, count(*)::bigint
    from public.seo_indexing_urls u
    group by u.estado;
end;
$$;

grant execute on function public.seo_indexing_summary() to authenticated;
revoke execute on function public.seo_indexing_summary() from anon;


-- ============================================================
-- 5) RLS: solo el personal con permiso del módulo 'seo_indexing'
--    (mismo patrón que 0048 / 0056).
-- ============================================================
alter table public.seo_indexing_urls enable row level security;
alter table public.seo_indexing_log enable row level security;

do $$
begin
  -- ---------- Cola de URLs ----------
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_indexing_urls'
      and policyname = 'SEO indexing urls authorized read'
  ) then
    create policy "SEO indexing urls authorized read" on public.seo_indexing_urls
      for select to authenticated
      using (public.has_permission('seo_indexing', 'read') or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_indexing_urls'
      and policyname = 'SEO indexing urls authorized insert'
  ) then
    create policy "SEO indexing urls authorized insert" on public.seo_indexing_urls
      for insert to authenticated
      with check (public.has_permission('seo_indexing', 'write') or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_indexing_urls'
      and policyname = 'SEO indexing urls authorized update'
  ) then
    create policy "SEO indexing urls authorized update" on public.seo_indexing_urls
      for update to authenticated
      using (public.has_permission('seo_indexing', 'write') or public.is_admin())
      with check (public.has_permission('seo_indexing', 'write') or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_indexing_urls'
      and policyname = 'SEO indexing urls authorized delete'
  ) then
    create policy "SEO indexing urls authorized delete" on public.seo_indexing_urls
      for delete to authenticated
      using (public.has_permission('seo_indexing', 'delete') or public.is_admin());
  end if;

  -- ---------- Registro de envíos ----------
  -- El log es INMUTABLE: solo se inserta y se consulta (nunca se edita).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_indexing_log'
      and policyname = 'SEO indexing log authorized read'
  ) then
    create policy "SEO indexing log authorized read" on public.seo_indexing_log
      for select to authenticated
      using (public.has_permission('seo_indexing', 'read') or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_indexing_log'
      and policyname = 'SEO indexing log authorized insert'
  ) then
    create policy "SEO indexing log authorized insert" on public.seo_indexing_log
      for insert to authenticated
      with check (public.has_permission('seo_indexing', 'write') or public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seo_indexing_log'
      and policyname = 'SEO indexing log authorized delete'
  ) then
    create policy "SEO indexing log authorized delete" on public.seo_indexing_log
      for delete to authenticated
      using (public.has_permission('seo_indexing', 'delete') or public.is_admin());
  end if;
end $$;

-- ============================================================
-- 6) Módulo del panel + permisos para el rol admin
-- ============================================================
insert into public.modules (name, slug, description)
values (
  'Indexación en Buscadores',
  'seo_indexing',
  'Cola y auditoria de indexacion: envia automaticamente a los buscadores cada producto, categoria o guia publicada (IndexNow + sitemap) y permite ver que URLs del sitemap siguen SIN indexar, enviarlas en lotes de 25 respetando el limite diario de 100 y reenviar el sitemap a Google Search Console.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'seo_indexing'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;
