-- ============================================================
-- Migración 0028: Corregir recursión infinita en política de profiles
--
-- PROBLEMA:
--   La migración 0007 corrigió la política SELECT de profiles
--   usando public.is_admin() (SECURITY DEFINER), pero NO eliminó
--   la política "Profiles update admin" creada en 0003, que aún
--   usa una subconsulta directa a public.profiles dentro de su
--   propio USING/WITH CHECK. Esto causa:
--
--     infinite recursion detected in policy for relation "profiles"
--
--   al intentar actualizar un perfil (ej: guardar config desde admin).
--
-- SOLUCIÓN:
--   Eliminar y recrear "Profiles update admin" usando public.is_admin().
--   También se reemplazan las subconsultas directas a public.profiles
--   en políticas de otras tablas (site_settings, marcas, proveedores,
--   product_categories, product_images) por public.is_admin() para
--   evitar cualquier recursión futura.
-- ============================================================

-- ============================================================
-- 1) Corregir la política UPDATE de profiles (causa raíz)
-- ============================================================
drop policy if exists "Profiles update admin" on public.profiles;

create policy "Profiles update admin"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 2) Site settings: reemplazar subconsulta recursiva
-- ============================================================
drop policy if exists "Site settings admin all" on public.site_settings;

create policy "Site settings admin all"
  on public.site_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 3) Product categories / images: reemplazar subconsulta recursiva
-- ============================================================
drop policy if exists "Product categories admin all" on public.product_categories;

create policy "Product categories admin all"
  on public.product_categories for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Product images admin all" on public.product_images;

create policy "Product images admin all"
  on public.product_images for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 4) Marcas y proveedores: reemplazar subconsulta recursiva
-- ============================================================
drop policy if exists "Marcas admin all" on public.marcas;

create policy "Marcas admin all"
  on public.marcas for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Proveedores admin all" on public.proveedores;

create policy "Proveedores admin all"
  on public.proveedores for all
  using (public.is_admin())
  with check (public.is_admin());