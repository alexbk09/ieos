-- ============================================================
-- Migración 0003: Políticas RLS
-- Idempotente: verifica en pg_policies antes de crear
-- ============================================================

-- ============================================================
-- Helper: verifica si una política existe
-- ============================================================
do $$
begin
  -- Política: Profiles read own or admin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Profiles read own or admin'
  ) then
    create policy "Profiles read own or admin"
    on public.profiles for select
    using (
      auth.uid() = id
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
  end if;

  -- Política: Profiles update own
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Profiles update own'
  ) then
    create policy "Profiles update own"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);
  end if;

  -- Política: Profiles update admin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Profiles update admin'
  ) then
    create policy "Profiles update admin"
    on public.profiles for update
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
  end if;
end $$;

-- ============================================================
-- Políticas: roles
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'roles' and policyname = 'Roles read public'
  ) then
    create policy "Roles read public"
    on public.roles for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'roles' and policyname = 'Roles admin all'
  ) then
    create policy "Roles admin all"
    on public.roles for all
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;

-- ============================================================
-- Políticas: modules
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'modules' and policyname = 'Modules read public'
  ) then
    create policy "Modules read public"
    on public.modules for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'modules' and policyname = 'Modules admin all'
  ) then
    create policy "Modules admin all"
    on public.modules for all
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;

-- ============================================================
-- Políticas: role_permissions
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'role_permissions' and policyname = 'Role permissions read own role'
  ) then
    create policy "Role permissions read own role"
    on public.role_permissions for select
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role_id = role_id
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'role_permissions' and policyname = 'Role permissions admin all'
  ) then
    create policy "Role permissions admin all"
    on public.role_permissions for all
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;

-- ============================================================
-- Políticas: categories
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'Categories read public'
  ) then
    create policy "Categories read public"
    on public.categories for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'Categories admin all'
  ) then
    create policy "Categories admin all"
    on public.categories for all
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
  end if;
end $$;

-- ============================================================
-- Políticas: products
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'Products read public'
  ) then
    create policy "Products read public"
    on public.products for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'Products admin all'
  ) then
    create policy "Products admin all"
    on public.products for all
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
  end if;
end $$;

-- ============================================================
-- Políticas: solicitudes
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitudes' and policyname = 'Solicitudes read own or admin'
  ) then
    create policy "Solicitudes read own or admin"
    on public.solicitudes for select
    using (
      auth.uid() = user_id
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitudes' and policyname = 'Solicitudes insert own'
  ) then
    create policy "Solicitudes insert own"
    on public.solicitudes for insert
    with check (
      auth.uid() = user_id
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitudes' and policyname = 'Solicitudes update own or admin'
  ) then
    create policy "Solicitudes update own or admin"
    on public.solicitudes for update
    using (
      auth.uid() = user_id
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
    with check (
      auth.uid() = user_id
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
  end if;
end $$;

-- ============================================================
-- Políticas: solicitud_items
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitud_items' and policyname = 'Solicitud items read own or admin'
  ) then
    create policy "Solicitud items read own or admin"
    on public.solicitud_items for select
    using (
      exists (
        select 1 from public.solicitudes s
        where s.id = solicitud_id
          and (
            s.user_id = auth.uid()
            or exists (
              select 1 from public.profiles p
              where p.id = auth.uid() and p.role = 'admin'
            )
          )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitud_items' and policyname = 'Solicitud items insert own'
  ) then
    create policy "Solicitud items insert own"
    on public.solicitud_items for insert
    with check (
      exists (
        select 1 from public.solicitudes s
        where s.id = solicitud_id and s.user_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'solicitud_items' and policyname = 'Solicitud items update own or admin'
  ) then
    create policy "Solicitud items update own or admin"
    on public.solicitud_items for update
    using (
      exists (
        select 1 from public.solicitudes s
        where s.id = solicitud_id
          and (
            s.user_id = auth.uid()
            or exists (
              select 1 from public.profiles p
              where p.id = auth.uid() and p.role = 'admin'
            )
          )
      )
    )
    with check (
      exists (
        select 1 from public.solicitudes s
        where s.id = solicitud_id
          and (
            s.user_id = auth.uid()
            or exists (
              select 1 from public.profiles p
              where p.id = auth.uid() and p.role = 'admin'
            )
          )
      )
    );
  end if;
end $$;