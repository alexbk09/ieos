-- ============================================================
-- Migración 0008: Configuración del sitio (site_settings)
-- Idempotente: CREATE TABLE IF NOT EXISTS + INSERT ... ON CONFLICT
--
-- Tabla singleton (una sola fila, id=1) con todas las secciones
-- editables del sitio: marca, logo, ícono, menú, portada, studio,
-- contacto, footer y redes sociales.
-- ============================================================

-- ============================================================
-- Tabla de configuración del sitio
-- ============================================================
create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  company_name text not null default 'IEOS',
  tagline text not null default 'Wall Panels & Pisos SPC',
  logo_url text,
  icon_url text,
  whatsapp_number text not null default '584122649707',
  address text not null default 'Caracas, Venezuela',
  email text not null default 'ventas@ieos.ve',
  nav_links jsonb not null default '[]'::jsonb,
  hero_texts jsonb not null default '{}'::jsonb,
  hero_images jsonb not null default '{}'::jsonb,
  studio_texts jsonb not null default '{}'::jsonb,
  contact_texts jsonb not null default '{}'::jsonb,
  footer_texts jsonb not null default '{}'::jsonb,
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

-- ============================================================
-- Fila inicial con el contenido actual del sitio (id=1)
-- ============================================================
insert into public.site_settings (
  id, company_name, tagline, whatsapp_number, address, email,
  nav_links, hero_texts, hero_images, studio_texts, contact_texts,
  footer_texts, social_links
)
values (
  1,
  'IEOS',
  'Wall Panels & Pisos SPC',
  '584122649707',
  'Caracas, Venezuela',
  'ventas@ieos.ve',
  $json$[
    {"href": "/", "label": "Inicio"},
    {"href": "/#studio", "label": "Nuestro espacio"},
    {"href": "/#contacto", "label": "Contacto"},
    {"href": "/catalogo", "label": "Catálogo completo", "highlight": true}
  ]$json$::jsonb,
  $json${
    "eyebrow": "Wall Panels & Pisos SPC",
    "title": "Espacios que transforman.",
    "titleHighlight": "transforman.",
    "description": "Revestimientos de pared y pisos SPC que convierten cualquier ambiente en un espacio moderno, duradero y de instalación rápida.",
    "primaryButton": "Explorar catálogo",
    "primaryHref": "#catalogo",
    "secondaryButton": "Ver todo",
    "secondaryHref": "/catalogo",
    "badge": "Colección 2025",
    "imageAlt": "Wall panel decorativo 3D",
    "imageCaption": "Diseño que transforma",
    "imagePosition": "01 / 03",
    "stats": [
      {"value": "+15", "label": "líneas disponibles"},
      {"value": "100%", "label": "instalación fácil"},
      {"value": "+500", "label": "m² instalados"}
    ]
  }$json$::jsonb,
  $json${
    "main": "/products/webp/wall-tile.webp"
  }$json$::jsonb,
  $json${
    "eyebrow": "Nuestro espacio",
    "title": "Materiales con identidad para cada proyecto.",
    "items": [
      {"number": "01", "text": "Wall panels 3D que añaden textura, profundidad y estilo a cualquier pared."},
      {"number": "02", "text": "Pisos SPC resistentes al agua, rayaduras y al uso diario intenso."},
      {"number": "03", "text": "Asesoría para elegir el acabado perfecto para tu hogar o negocio."}
    ]
  }$json$::jsonb,
  $json${
    "eyebrow": "Hablemos",
    "title": "Tu próximo proyecto empieza aquí.",
    "description": "Cuéntanos qué espacio quieres transformar. Te ayudamos a elegir el wall panel o piso SPC ideal.",
    "formNamePlaceholder": "Tu nombre",
    "formEmailPlaceholder": "Correo electrónico",
    "formMessagePlaceholder": "Cuéntanos sobre tu proyecto",
    "formButton": "Enviar mensaje"
  }$json$::jsonb,
  $json${
    "copyright": "© 2025 IEOS. Caracas, Venezuela.",
    "slogan": "Transformamos espacios."
  }$json$::jsonb,
  $json${
    "instagram": "https://instagram.com",
    "linkedin": "https://linkedin.com",
    "email": "mailto:ventas@ieos.ve"
  }$json$::jsonb
  )
on conflict (id) do nothing;

-- ============================================================
-- Trigger: actualizar updated_at automáticamente
-- ============================================================
drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
before update on public.site_settings
for each row execute procedure public.set_updated_at();

-- ============================================================
-- Políticas RLS: lectura pública + administración por admin
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'site_settings' and policyname = 'Site settings read public'
  ) then
    create policy "Site settings read public"
    on public.site_settings for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'site_settings' and policyname = 'Site settings admin all'
  ) then
    create policy "Site settings admin all"
    on public.site_settings for all
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;