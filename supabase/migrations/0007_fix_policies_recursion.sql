-- ============================================================
-- Migración 0007: Corregir recursión infinita en políticas RLS
--
-- PROBLEMA:
--   Las políticas usaban subconsultas a public.profiles dentro
--   de la propia política de profiles y otras tablas, causando
--   "infinite recursion detected in policy for relation profiles".
--
-- SOLUCIÓN:
--   Función public.is_admin() con SECURITY DEFINER (no activa RLS).
-- ============================================================

-- 1) Función helper SECURITY DEFINER (evita recursión)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated, anon, service_role;

-- 2) Eliminar políticas recursivas
drop policy if exists "Profiles read own or admin" on public.profiles;
drop policy if exists "Roles admin all" on public.roles;
drop policy if exists "Modules admin all" on public.modules;
drop policy if exists "Role permissions read own role" on public.role_permissions;
drop policy if exists "Role permissions admin all" on public.role_permissions;
drop policy if exists "Categories admin all" on public.categories;
drop policy if exists "Products admin all" on public.products;
drop policy if exists "Solicitudes read own or admin" on public.solicitudes;
drop policy if exists "Solicitudes update own or admin" on public.solicitudes;
drop policy if exists "Solicitud items read own or admin" on public.solicitud_items;
drop policy if exists "Solicitud items update own or admin" on public.solicitud_items;
drop policy if exists "Product categories admin all" on public.product_categories;
drop policy if exists "Product images admin all" on public.product_images;
drop policy if exists "Admins upload product files" on storage.objects;
drop policy if exists "Admins update product files" on storage.objects;
drop policy if exists "Admins delete product files" on storage.objects;

-- 3) Recrear políticas de profiles
create policy "Profiles read own or admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- 4) Recrear políticas de roles y módulos
create policy "Roles admin all"
  on public.roles for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Modules admin all"
  on public.modules for all
  using (public.is_admin())
  with check (public.is_admin());

-- 5) Recrear políticas de role_permissions
create policy "Role permissions read own role"
  on public.role_permissions for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role_id = role_id
    )
    or public.is_admin()
  );

create policy "Role permissions admin all"
  on public.role_permissions for all
  using (public.is_admin())
  with check (public.is_admin());

-- 6) Recrear políticas de categories y products
create policy "Categories admin all"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Products admin all"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- 7) Recrear políticas de solicitudes y solicitud_items
create policy "Solicitudes read own or admin"
  on public.solicitudes for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Solicitudes update own or admin"
  on public.solicitudes for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Solicitud items read own or admin"
  on public.solicitud_items for select
  using (
    exists (
      select 1 from public.solicitudes s
      where s.id = solicitud_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Solicitud items update own or admin"
  on public.solicitud_items for update
  using (
    exists (
      select 1 from public.solicitudes s
      where s.id = solicitud_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.solicitudes s
      where s.id = solicitud_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  );

-- 8) Recrear políticas de product_categories y product_images
create policy "Product categories admin all"
  on public.product_categories for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Product images admin all"
  on public.product_images for all
  using (public.is_admin())
  with check (public.is_admin());

-- 9) Recrear políticas de storage.objects
create policy "Admins upload product files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'productos-bucket'
    and public.is_admin()
  );

create policy "Admins update product files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'productos-bucket'
    and public.is_admin()
  )
  with check (
    bucket_id = 'productos-bucket'
    and public.is_admin()
  );

create policy "Admins delete product files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'productos-bucket'
    and public.is_admin()
  );
