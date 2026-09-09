-- ============================================================
-- Migración 0046: Pipeline de Automatización AliExpress (Fase 2.2)
--
-- Objetivo: registrar el módulo 'ali_pipeline' para el RBAC del
-- panel admin. Este módulo controla el acceso al panel que ejecuta
-- el pipeline maestro: descubrimiento por API oficial + scraper +
-- enlace de afiliado + SEO con DeepSeek + persistencia en Supabase.
--
-- Idempotente: ON CONFLICT + DO UPDATE.
-- ============================================================

-- ============================================================
-- 1) Módulo del panel + permisos para el rol admin
-- ============================================================
insert into public.modules (name, slug, description)
values (
  'Pipeline AliExpress',
  'ali_pipeline',
  'Automatización integral: descubre productos top por keyword (API oficial), extrae detalle (scraper), genera enlace de afiliado, optimiza SEO con DeepSeek y guarda en Supabase.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'ali_pipeline'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;
