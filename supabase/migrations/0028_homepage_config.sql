-- Migración 0028: Personalización del inicio (homepage_config)
alter table public.site_settings
  add column if not exists homepage_config jsonb not null default '{}'::jsonb;