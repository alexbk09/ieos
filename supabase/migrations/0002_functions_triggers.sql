-- ============================================================
-- Migración 0002: Funciones y triggers
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS
-- ============================================================

-- ============================================================
-- Trigger: asignar rol "client" al registrarse
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'client');
begin
  insert into public.profiles (id, email, full_name, role, role_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    (select r.id from public.roles r where r.name = v_role limit 1)
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role),
        role_id = coalesce(public.profiles.role_id, excluded.role_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ============================================================
-- Función: actualizar updated_at automáticamente
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Trigger: updated_at en profiles
-- ============================================================
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- ============================================================
-- Trigger: updated_at en products
-- ============================================================
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

-- ============================================================
-- Trigger: updated_at en solicitudes
-- ============================================================
drop trigger if exists solicitudes_set_updated_at on public.solicitudes;
create trigger solicitudes_set_updated_at
before update on public.solicitudes
for each row execute procedure public.set_updated_at();