-- ============================================================
-- Migración 0048: Módulo "SEO de Categorías" (hubs pSEO) para RBAC
--
-- Registra el módulo que controla el acceso a la edición del contenido
-- SEO editorial de las categorías (seo_title, seo_intro, seo_faq) que
-- alimenta las landings de nicho /categoria/[slug].
--
-- Idempotente: ON CONFLICT + DO UPDATE.
-- ============================================================

insert into public.modules (name, slug, description)
values (
  'SEO de Categorias',
  'categorias_seo',
  'Edicion del contenido editorial SEO de las categorias (titulo largo del hub, guia de compra e FAQ) que alimenta las landings de nicho.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, false
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'categorias_seo'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = false;
