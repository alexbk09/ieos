-- ============================================================
-- Migración 0010: Corregir trigger de creación de perfiles
--
-- El registro desde la app envía metadata con 'name' y 'phone',
-- pero el trigger original solo leía 'full_name'. Esto causaba
-- que los clientes registrados por la app no tuvieran su nombre
-- ni teléfono en la tabla profiles.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'client');
  v_full_name text := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    new.email
  );
  v_phone text := nullif(new.raw_user_meta_data->>'phone', '');
begin
  insert into public.profiles (id, email, full_name, phone, role, role_id)
  values (
    new.id,
    new.email,
    v_full_name,
    v_phone,
    v_role,
    (select r.id from public.roles r where r.name = v_role limit 1)
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone = coalesce(public.profiles.phone, excluded.phone),
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
-- Política: Profiles insert own
-- Permite que el usuario cree su propio perfil si no existe
-- (necesario para el UPSERT en updateProfile cuando el trigger
-- no creó la fila, por ejemplo clientes registrados antes).
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Profiles insert own'
  ) then
    create policy "Profiles insert own"
    on public.profiles for insert
    with check (auth.uid() = id);
  end if;
end $$;
