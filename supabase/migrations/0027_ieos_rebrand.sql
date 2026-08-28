-- ============================================================
-- Migración 0027: Rebranding a IEOS (Wall Panels & Pisos SPC)
--
-- Actualiza el contenido de la tienda de ilumaX (iluminación LED)
-- a IEOS, empresa dedicada a wall panels y pisos SPC.
-- Incluye: site_settings (textos, portada, studio, contacto, footer)
-- e invoice_settings (emisor).
--
-- Idempotente: usa UPDATE ... WHERE id = 1.
-- ============================================================

-- ============================================================
-- 1) Rebranding de site_settings (fila singleton id=1)
-- ============================================================
update public.site_settings
set
  company_name = 'IEOS',
  tagline = 'Wall Panels & Pisos SPC',
  hero_texts = $json${
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
  studio_texts = $json${
    "eyebrow": "Nuestro espacio",
    "title": "Materiales con identidad para cada proyecto.",
    "items": [
      {"number": "01", "text": "Wall panels 3D que añaden textura, profundidad y estilo a cualquier pared."},
      {"number": "02", "text": "Pisos SPC resistentes al agua, rayaduras y al uso diario intenso."},
      {"number": "03", "text": "Asesoría para elegir el acabado perfecto para tu hogar o negocio."}
    ]
  }$json$::jsonb,
  contact_texts = $json${
    "eyebrow": "Hablemos",
    "title": "Tu próximo proyecto empieza aquí.",
    "description": "Cuéntanos qué espacio quieres transformar. Te ayudamos a elegir el wall panel o piso SPC ideal.",
    "formNamePlaceholder": "Tu nombre",
    "formEmailPlaceholder": "Correo electrónico",
    "formMessagePlaceholder": "Cuéntanos sobre tu proyecto",
    "formButton": "Enviar mensaje"
  }$json$::jsonb,
  footer_texts = $json${
    "copyright": "© 2025 IEOS. Caracas, Venezuela.",
    "slogan": "Transformamos espacios."
  }$json$::jsonb
where id = 1;

-- ============================================================
-- 2) Rebranding de invoice_settings (emisor en facturas)
-- ============================================================
update public.invoice_settings
set
  issuer_name = 'IEOS C.A.',
  issuer_email = 'ventas@ieos.ve'
where id = 1;