-- ============================================================
-- Migración 0004: Storage bucket + políticas de storage
-- Idempotente: ON CONFLICT + verificación en pg_policies
-- ============================================================

-- ============================================================
-- Bucket de imágenes del catálogo
-- ============================================================
insert into storage.buckets (id, name, public)
values ('productos-bucket', 'productos-bucket', true)
on conflict (id) do update set public = true;

-- ============================================================
-- Políticas de storage.objects
-- ============================================================
do $$
begin
  -- Lectura pública
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public product files'
  ) then
    create policy "Public product files"
    on storage.objects for select
    using (bucket_id = 'productos-bucket');
  end if;

  -- Insert de admin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins upload product files'
  ) then
    create policy "Admins upload product files"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'productos-bucket'
      and exists (
        select 1 from public.profiles where id = auth.uid() and role = 'admin'
      )
    );
  end if;

  -- Update de admin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins update product files'
  ) then
    create policy "Admins update product files"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'productos-bucket'
      and exists (
        select 1 from public.profiles where id = auth.uid() and role = 'admin'
      )
    )
    with check (
      bucket_id = 'productos-bucket'
      and exists (
        select 1 from public.profiles where id = auth.uid() and role = 'admin'
      )
    );
  end if;

  -- Delete de admin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins delete product files'
  ) then
    create policy "Admins delete product files"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'productos-bucket'
      and exists (
        select 1 from public.profiles where id = auth.uid() and role = 'admin'
      )
    );
  end if;
end $$;