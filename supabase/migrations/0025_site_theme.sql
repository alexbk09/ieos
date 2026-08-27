-- ============================================================
-- Migración 0025: Tema visual de marca (site_settings.theme)
-- ------------------------------------------------------------
-- Agrega la columna `theme` (jsonb) a site_settings para que cada
-- empresa configure sus colores: acento, azul marino, fondos, radio.
-- Los valores se guardan en HEX y la app los convierte a variables
-- CSS inyectadas en <head> (cero re-compilación, cero parpadeo).
-- Idempotente: usa ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- ============================================================

alter table public.site_settings
  add column if not exists theme jsonb not null default '{}'::jsonb;

-- ============================================================
-- Valores por defecto: reproducen el look actual de ilumaX.
-- (cian #06b6d4 + azul marino #020617)
-- ============================================================
update public.site_settings
set theme = $json${
  "brand": "#06b6d4",
  "brandStrong": "#0891b2",
  "brandLight": "#67e8f9",
  "brandForeground": "#020617",
  "navy": "#020617",
  "navyForeground": "#f8fafc",
  "navyMuted": "#cbd5e1",
  "background": "#f8fafc",
  "foreground": "#020617",
  "backgroundDark": "#020617",
  "foregroundDark": "#f8fafc",
  "radius": "1rem"
}$json$::jsonb
where id = 1
  and (theme is null or theme = '{}'::jsonb);