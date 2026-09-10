-- ============================================================
-- Migración 0051: Módulo "Idiomas de Categorías" (i18n) para RBAC
--
-- Registra el módulo que controla el acceso a la edición de las traducciones
-- por idioma de las categorías (name_i18n, slug_i18n, description_i18n y SEO),
-- y habilita lectura/escritura para el rol admin.
--
-- Idempotente: ON CONFLICT + DO UPDATE.
-- ============================================================

insert into public.modules (name, slug, description)
values (
  'Idiomas de Categorias',
  'categorias_idiomas',
  'Edicion de las traducciones por idioma de las categorias (nombre, slug, descripcion y SEO) para el SEO internacional.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, false
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'categorias_idiomas'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = false;
