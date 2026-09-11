-- ============================================================
-- Migración 0055: corrige el dominio de contacto a .online
-- ------------------------------------------------------------
-- POR QUÉ: el dominio real del sitio es zonadehobbies.online (ver
-- NEXT_PUBLIC_SITE_URL). La 0054 dejó el correo en .com, que NO está
-- registrado ni operativo; un mailto hacia un dominio inexistente rompe la
-- confianza y el JSON-LD (Organization.email) queda inválido.
--
-- Idempotente: solo actualiza las dos claves afectadas de la fila id = 1.
-- ============================================================

update public.site_settings
set
  email = 'hola@zonadehobbies.online',
  social_links = jsonb_set(
    coalesce(social_links, '{}'::jsonb),
    '{email}',
    '"mailto:hola@zonadehobbies.online"'::jsonb,
    true
  ),
  updated_at = now()
where id = 1;
