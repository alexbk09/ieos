-- ============================================================
-- Migración 0023: Habilitar RLS en tablas de control de migraciones
--
-- Supabase alertó que _migrations y _migrations_history están
-- públicamente accesibles (rls_disabled_in_public).
--
-- Estas son tablas internas de administración (solo las usa el
-- script supabase/run.mjs con el rol postgres/superuser). No deben
-- ser accesibles vía API REST bajo ningún rol (anon/authenticated).
--
-- Solución:
--   - Habilitar RLS en ambas tablas.
--   - NO crear políticas para anon/authenticated → RLS bloquea
--     toda lectura/escritura desde la API.
--   - El rol postgres (usado por run.mjs) y service_role bypassan
--     RLS automáticamente, así que el script sigue funcionando.
-- ============================================================

alter table public._migrations enable row level security;
alter table public._migrations_history enable row level security;

-- Revocar acceso explícito a roles de la API (defensa en profundidad)
revoke all on public._migrations from anon, authenticated;
revoke all on public._migrations_history from anon, authenticated;

-- Los grants a service_role se mantienen (bypassa RLS igualmente)
grant all on public._migrations to service_role;
grant all on public._migrations_history to service_role;