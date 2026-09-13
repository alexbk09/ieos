-- ============================================================
-- Migración 0059: repara el MENÚ de navegación (site_settings.nav_links)
-- ------------------------------------------------------------
-- POR QUÉ una migración: los datos guardados quedaron CORRUPTOS por un bug del
-- panel de configuración, que escribía el menú como OBJETO con índices
-- numéricos y una clave anidada "nav_links":
--   { "0": {...}, "1": {...}, "nav_links": [{...}] }
-- Consecuencias reales observadas:
--   1. El sitio en español no recibía un array válido y caía al menú por
--      defecto del código (DEFAULT_NAV_LINKS) → "Guías" se veía SOLO en español.
--   2. Los overrides por idioma (site_settings.i18n[locale].nav_links) traían el
--      menú VIEJO (sin "Guías" y con el ancla muerta /#studio), y al reemplazar
--      al base, el botón "Guías" desaparecía en EN/FR/DE/IT/PT.
--
-- QUÉ HACE (idempotente, se puede re-ejecutar):
--   1. Reescribe `nav_links` como ARRAY válido con los enlaces reales de la
--      tienda y el hub de contenido /guias incluido.
--   2. Deja el override de CADA idioma con los MISMOS hrefs que la base y la
--      etiqueta traducida (el resolver fusiona por href; aquí se normaliza para
--      que el panel muestre datos limpios y sin anclas muertas).
--
-- NOTA: el código ya sanea datos corruptos (lib/site-settings-i18n.mjs →
-- normalizeNavLinks) y fusiona el menú por href (mergeNavLinks), así que esta
-- migración deja la base coherente y traducida.
-- ============================================================

-- 1) Menú base (idioma raíz): array real, sin anclas rotas y con "Guías".
update public.site_settings
set nav_links = $json$[
  {"href": "/", "label": "Inicio"},
  {"href": "/catalogo", "label": "Catálogo", "highlight": true},
  {"href": "/#como-funciona", "label": "Cómo funciona"},
  {"href": "/#contacto", "label": "Contacto"},
  {"href": "/guias", "label": "Guías"}
]$json$::jsonb
where id = 1;

-- 2) Overrides por idioma: se conservan el resto de claves de texto (tagline,
--    hero_texts, footer_texts…) y solo se reemplaza `nav_links`, con los mismos
--    hrefs que la base para que la fusión por href resuelva la etiqueta.
update public.site_settings as s
set i18n = coalesce(s.i18n, '{}'::jsonb) || coalesce((
  select jsonb_object_agg(
    v.locale,
    coalesce(s.i18n -> v.locale, '{}'::jsonb) || jsonb_build_object('nav_links', v.links)
  )
  from (values
    ('en', $json$[
      {"href": "/", "label": "Home"},
      {"href": "/catalogo", "label": "Full catalog", "highlight": true},
      {"href": "/#como-funciona", "label": "How it works"},
      {"href": "/#contacto", "label": "Contact"},
      {"href": "/guias", "label": "Guides"}
    ]$json$::jsonb),
    ('fr', $json$[
      {"href": "/", "label": "Accueil"},
      {"href": "/catalogo", "label": "Catalogue complet", "highlight": true},
      {"href": "/#como-funciona", "label": "Comment ça marche"},
      {"href": "/#contacto", "label": "Contact"},
      {"href": "/guias", "label": "Guides"}
    ]$json$::jsonb),
    ('de', $json$[
      {"href": "/", "label": "Startseite"},
      {"href": "/catalogo", "label": "Katalog", "highlight": true},
      {"href": "/#como-funciona", "label": "So funktioniert's"},
      {"href": "/#contacto", "label": "Kontakt"},
      {"href": "/guias", "label": "Ratgeber"}
    ]$json$::jsonb),
    ('it', $json$[
      {"href": "/", "label": "Home"},
      {"href": "/catalogo", "label": "Catalogo completo", "highlight": true},
      {"href": "/#como-funciona", "label": "Come funziona"},
      {"href": "/#contacto", "label": "Contatti"},
      {"href": "/guias", "label": "Guide"}
    ]$json$::jsonb),
    ('pt', $json$[
      {"href": "/", "label": "Início"},
      {"href": "/catalogo", "label": "Catálogo completo", "highlight": true},
      {"href": "/#como-funciona", "label": "Como funciona"},
      {"href": "/#contacto", "label": "Contato"},
      {"href": "/guias", "label": "Guias"}
    ]$json$::jsonb)
  ) as v(locale, links)
), '{}'::jsonb)
where s.id = 1;
