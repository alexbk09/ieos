-- ============================================================
-- Migración 0005: Sincronizar roles de admin en profiles
--
-- Garantiza que cualquier usuario en auth.users cuya metadata
-- indique role='admin' (el admin creado por supabase/run.mjs)
-- tenga su perfil en public.profiles con role='admin' y role_id
-- apuntando al rol administrador.
-- ============================================================

do $$
declare
  v_admin_role_id uuid := (select id from public.roles where name = 'admin');
begin
  -- 1) Insertar perfiles faltantes para todos los usuarios en auth.users
  --    cuya user_metadata.role = 'admin'
  insert into public.profiles (id, email, full_name, role, role_id)
  select
    au.id,
    au.email,
    coalesce(au.raw_user_meta_data->>'full_name', au.email),
    'admin',
    v_admin_role_id
  from auth.users au
  where au.raw_user_meta_data->>'role' = 'admin'
    and not exists (select 1 from public.profiles p where p.id = au.id)
  on conflict (id) do nothing;

  -- 2) Actualizar perfiles existentes de usuarios admin (metadata = admin)
  update public.profiles p
  set role = 'admin',
      role_id = v_admin_role_id,
      email = au.email,
      full_name = coalesce(p.full_name, au.raw_user_meta_data->>'full_name', au.email)
  from auth.users au
  where p.id = au.id
    and au.raw_user_meta_data->>'role' = 'admin'
    and (p.role <> 'admin' or p.role_id is distinct from v_admin_role_id);

  -- 3) Normalizar 'user' → 'client' para compatibilidad con la BD
  --    (la app normaliza 'client'/'user' a 'user' internamente)
  update public.profiles
  set role = 'client'
  where role = 'user';
end $$;