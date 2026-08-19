-- ============================================================
-- Migración 0009: Bucket de avatares + políticas de storage
-- Idempotente: ON CONFLICT + verificación en pg_policies
-- ============================================================

-- ============================================================
-- Bucket de avatares de usuario
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars-bucket', 'avatars-bucket', true)
on conflict (id) do update set public = true;

-- ============================================================
-- Políticas de storage.objects
-- ============================================================
do $$
begin
  -- Lectura pública
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public avatar files'
  ) then
    create policy "Public avatar files"
    on storage.objects for select
    using (bucket_id = 'avatars-bucket');
  end if;

  -- Insert del usuario autenticado
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users upload own avatars'
  ) then
    create policy "Users upload own avatars"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars-bucket');
  end if;

  -- Update del usuario autenticado
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users update own avatars'
  ) then
    create policy "Users update own avatars"
    on storage.objects for update to authenticated
    using (bucket_id = 'avatars-bucket')
    with check (bucket_id = 'avatars-bucket');
  end if;

  -- Delete del usuario autenticado
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users delete own avatars'
  ) then
    create policy "Users delete own avatars"
    on storage.objects for delete to authenticated
    using (bucket_id = 'avatars-bucket');
  end if;
end $$;