-- ============================================================
-- Seeder 0001: Roles, módulos y permisos base
-- Idempotente: ON CONFLICT DO UPDATE / DO NOTHING
-- ============================================================

-- ============================================================
-- Insertar roles base (administrador y cliente)
-- ============================================================
insert into public.roles (name, description)
values
  ('admin',  'Administrador del sistema con acceso total a todos los módulos'),
  ('client', 'Cliente final que navega el catálogo y envía solicitudes')
on conflict (name) do update
  set description = excluded.description;

-- ============================================================
-- Insertar módulos del sistema
-- ============================================================
insert into public.modules (name, slug, description)
values
  ('Dashboard',          'dashboard',        'Resumen general del panel administrativo'),
  ('Productos',          'productos',        'Gestión de productos del catálogo'),
  ('Categorías',         'categorias',       'Gestión de categorías del catálogo'),
  ('Usuarios',           'usuarios',         'Gestión de usuarios y asignación de roles'),
  ('Solicitudes',        'solicitudes',      'Gestión de solicitudes de los clientes'),
  ('Roles y Permisos',   'roles_permissions','Gestión de roles, módulos y permisos')
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

-- ============================================================
-- Asignar permisos al rol administrador (lectura/escritura/borrado en todo)
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
-- Asignar permisos al rol cliente (solo lectura en productos y solicitudes)
-- ============================================================
insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, false, false
from public.roles r
cross join public.modules m
where r.name = 'client'
  and m.slug in ('productos', 'solicitudes')
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = false,
  can_delete = false;