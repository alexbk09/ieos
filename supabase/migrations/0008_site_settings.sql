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
  company_name text not null default 'ilumaX',
  tagline text not null default 'Arquitectura de luz',
  logo_url text,
  icon_url text,
  whatsapp_number text not null default '584122649707',
  address text not null default 'Caracas, Venezuela',
  email text not null default 'hola@ilumax.ve',
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
  'ilumaX',
  'Arquitectura de luz',
  '584122649707',
  'Caracas, Venezuela',
  'hola@ilumax.ve',
  $json$[
    {"href": "/", "label": "Inicio"},
    {"href": "/#studio", "label": "Studio"},
    {"href": "/#contacto", "label": "Contacto"},
    {"href": "/catalogo", "label": "Catálogo completo", "highlight": true}
  ]$json$::jsonb,
  $json${
    "eyebrow": "Arquitectura de luz",
    "title": "Luz que define espacios.",
    "titleHighlight": "espacios.",
    "description": "Soluciones LED y revestimientos que convierten ambientes cotidianos en experiencias memorables. Diseñamos la atmósfera, tú habitas el resultado.",
    "primaryButton": "Explorar catálogo",
    "primaryHref": "#catalogo",
    "secondaryButton": "Ver todo",
    "secondaryHref": "/catalogo",
    "badge": "Colección 2025",
    "imageAlt": "Línea Aura 12W",
    "imageCaption": "La luz como material",
    "imagePosition": "01 / 03",
    "stats": [
      {"value": "+12", "label": "años de experiencia"},
      {"value": "24/7", "label": "asesoría técnica"},
      {"value": "100%", "label": "diseño venezolano"}
    ]
  }$json$::jsonb,
  $json${
    "main": "/products/webp/linea-aura.webp"
  }$json$::jsonb,
  $json${
    "eyebrow": "El studio",
    "title": "Diseñamos lo que otros solo iluminan.",
    "items": [
      {"number": "01", "text": "Curaduría de piezas con intención y larga vida útil."},
      {"number": "02", "text": "Asesoría para traducir ideas en instalaciones reales."},
      {"number": "03", "text": "Materiales que hacen que cada proyecto tenga identidad."}
    ]
  }$json$::jsonb,
  $json${
    "eyebrow": "Hablemos",
    "title": "Tu espacio tiene algo que decir.",
    "description": "Cuéntanos sobre tu próximo proyecto. Nuestro equipo puede ayudarte a elegir la solución correcta.",
    "formNamePlaceholder": "Tu nombre",
    "formEmailPlaceholder": "Correo electrónico",
    "formMessagePlaceholder": "Cuéntanos sobre tu proyecto",
    "formButton": "Enviar mensaje"
  }$json$::jsonb,
  $json${
    "copyright": "© 2025 ilumaX. Caracas, Venezuela.",
    "slogan": "Iluminamos ideas."
  }$json$::jsonb,
  $json${
    "instagram": "https://instagram.com",
    "linkedin": "https://linkedin.com",
    "email": "mailto:hola@ilumax.ve"
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