-- ============================================================
-- Migración 0013: Gestión de roles y permisos por módulo
--
-- 1) Asegura que existan los módulos del sistema (incluido
--    'roles_permissions' que ya vive en el seeder 0001).
-- 2) Asegura permisos completos para el rol admin en TODOS los
--    módulos (incluyendo módulos nuevos como configuración).
-- 3) Funciones helper para verificar permisos en la app:
--      - public.has_permission(slug, action)
--      - public.get_user_permissions()
--
-- Idempotente: CREATE OR REPLACE + ON CONFLICT DO UPDATE
-- ============================================================

-- ============================================================
-- 1) Asegurar módulos del sistema
-- ============================================================
insert into public.modules (name, slug, description)
values
  ('Dashboard',          'dashboard',         'Resumen general del panel administrativo'),
  ('Productos',          'productos',         'Gestión de productos del catálogo'),
  ('Categorías',         'categorias',        'Gestión de categorías del catálogo'),
  ('Usuarios',           'usuarios',          'Gestión de usuarios y asignación de roles'),
  ('Solicitudes',        'solicitudes',       'Gestión de solicitudes de los clientes'),
  ('Roles y Permisos',   'roles_permissions', 'Gestión de roles, módulos y permisos'),
  ('Configuración',      'configuracion',     'Ajustes generales del sitio y facturación')
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

-- ============================================================
-- 2) Asegurar permisos completos del rol admin en todos los módulos
-- ============================================================
insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

-- ============================================================
-- 3) Función helper: public.has_permission(slug, action)
--    Verifica si el usuario autenticado tiene permiso sobre un
--    módulo y acción específica.
--    Acciones: 'read' | 'write' | 'delete'
-- ============================================================
create or replace function public.has_permission(p_slug text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.role_permissions rp
    join public.modules m on m.id = rp.module_id
    join public.profiles p on p.role_id = rp.role_id
    where p.id = auth.uid()
      and m.slug = p_slug
      and case lower(p_action)
        when 'read'   then rp.can_read
        when 'write'  then rp.can_write
        when 'delete' then rp.can_delete
        else false
      end
  );
$$;

grant execute on function public.has_permission(text, text) to authenticated, anon, service_role;

-- ============================================================
-- 4) Función helper: public.get_user_permissions()
--    Devuelve todos los permisos del usuario autenticado,
--    útil para filtrar la navegación y la UI.
-- ============================================================
create or replace function public.get_user_permissions()
returns table (
  module_slug text,
  can_read boolean,
  can_write boolean,
  can_delete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.slug, rp.can_read, rp.can_write, rp.can_delete
  from public.role_permissions rp
  join public.modules m on m.id = rp.module_id
  join public.profiles p on p.role_id = rp.role_id
  where p.id = auth.uid();
$$;

grant execute on function public.get_user_permissions() to authenticated, anon, service_role;