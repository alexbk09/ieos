-- ============================================================
-- Migración 0054: identidad y portada de zonadehobbies
-- ------------------------------------------------------------
-- POR QUÉ una MIGRACIÓN y no un seeder:
--   El seeder corre en CADA `npm run supabase:setup` y pisaría los cambios que
--   el admin haga después. Una migración se aplica UNA sola vez (queda
--   registrada en _migrations), así que deja el contenido colocado sin poder
--   sobrescribir ediciones futuras.
--
-- QUÉ HACE:
--   1. Garantiza que exista la fila singleton (id = 1).
--   2. Actualiza marca, textos de portada, menú, footer, redes, tema y la
--      configuración visual del inicio (homepage_config) con los valores
--      curados: narrativa AliExpress, fondos por TOKENS de superficie
--      (--surface-1/2/3 + una única banda profunda) y copy orientado a SEO.
--   3. Deja la portada SIN imagen fija: el visual es el LOGO de la marca
--      (sin marco), así no aparece la foto heredada de la era LED.
--
-- Idempotente: `insert ... on conflict do nothing` + `update` acotado a id = 1.
-- ============================================================

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

update public.site_settings set
  company_name = 'zonadehobbies',
  tagline = 'Ofertas verificadas para tus hobbies',
  logo_url = '/logos/zonadehobbies-wordmark-on-light.webp',
  icon_url = '/logos/zonadehobbies-favicon.png',
  email = 'hola@zonadehobbies.com',
  nav_links = $json$[
    {"href": "/", "label": "Inicio"},
    {"href": "/catalogo", "label": "Catálogo", "highlight": true},
    {"href": "/#como-funciona", "label": "Cómo funciona"},
    {"href": "/#contacto", "label": "Contacto"}
  ]$json$::jsonb,
  hero_texts = $json${
    "eyebrow": "Ofertas verificadas · Envío internacional",
    "title": "Las mejores ofertas de AliExpress, ",
    "titleHighlight": "para tus hobbies.",
    "description": "Comparamos miles de productos y seleccionamos los mejor valorados de cada categoría: precio real, reseñas de compradores y envío rastreable. Encuentra el equipo para tu hobby sin pagar de más.",
    "primaryButton": "Ver ofertas del día",
    "primaryHref": "#catalogo",
    "secondaryButton": "Explorar categorías",
    "secondaryHref": "/catalogo",
    "badge": "Actualizado hoy",
    "imageAlt": "Ofertas destacadas para tus hobbies",
    "imageCaption": "Tu zona de hobbies",
    "imagePosition": "01 / 03",
    "stats": [
      {"value": "+1.000", "label": "productos curados"},
      {"value": "7-15", "label": "días de envío"},
      {"value": "0%", "label": "coste extra para ti"}
    ]
  }$json$::jsonb,
  hero_images = $json${"main": ""}$json$::jsonb,
  studio_texts = $json${
    "eyebrow": "Cómo funciona",
    "title": "Compra mejor en AliExpress con nuestra ayuda.",
    "items": [
      {"number": "01", "text": "Explora categorías y ofertas curadas por nuestro equipo."},
      {"number": "02", "text": "Compara precios, reseñas y valoraciones reales de compradores."},
      {"number": "03", "text": "Compra directo en AliExpress con total seguridad y transparencia."}
    ]
  }$json$::jsonb,
  contact_texts = $json${
    "eyebrow": "Hablemos",
    "title": "¿Necesitas ayuda para elegir?",
    "description": "Escríbenos y te ayudamos a encontrar el producto ideal o a resolver cualquier duda sobre tu compra en AliExpress.",
    "formNamePlaceholder": "Tu nombre",
    "formEmailPlaceholder": "Correo electrónico",
    "formMessagePlaceholder": "Cuéntanos qué buscas",
    "formButton": "Enviar mensaje"
  }$json$::jsonb,
  footer_texts = $json${
    "copyright": "© 2026 zonadehobbies. Caracas, Venezuela.",
    "slogan": "Curamos AliExpress para que disfrutes más tu hobby."
  }$json$::jsonb,
  social_links = $json${"instagram": "", "linkedin": "", "email": "mailto:hola@zonadehobbies.com"}$json$::jsonb,
  theme = $json${
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
  }$json$::jsonb,
  homepage_config = $json${
    "version": 1,
    "hero": {
      "layout": "text-left-image-right",
      "contentAlign": "left",
      "backgroundType": "gradient",
      "backgroundSolid": "transparent",
      "backgroundImage": "",
      "backgroundGradientFrom": "var(--surface-1)",
      "backgroundGradientTo": "var(--surface-3)",
      "showBadge": true,
      "showStats": true,
      "showImage": true,
      "overlay": true
    },
    "studio": {
      "backgroundType": "gradient",
      "backgroundSolid": "transparent",
      "backgroundImage": "",
      "backgroundGradientFrom": "var(--surface-2)",
      "backgroundGradientTo": "var(--surface-3)",
      "textColor": "",
      "accentColor": "",
      "mutedColor": "",
      "layout": "text-left"
    },
    "segments": [
      {
        "id": "seg-trust",
        "type": "trust-badges",
        "enabled": true,
        "backgroundType": "solid",
        "backgroundSolid": "var(--surface-1)",
        "backgroundImage": "",
        "backgroundGradientFrom": "var(--surface-1)",
        "backgroundGradientTo": "var(--surface-3)",
        "textColor": "",
        "eyebrow": "Compra con confianza",
        "title": "Compra con total seguridad",
        "description": "Curamos las mejores ofertas de AliExpress para que compres tranquilo: envío rastreable, pago protegido y precios verificados.",
        "badges": [
          {"icon": "truck", "title": "Envío rastreable", "text": "Seguimiento en tiempo real de tu pedido."},
          {"icon": "shield", "title": "Compra protegida", "text": "Pago seguro respaldado por AliExpress."},
          {"icon": "tag", "title": "Precios verificados", "text": "Curamos los mejores descuentos del día."}
        ]
      },
      {
        "id": "seg-categories",
        "type": "category-grid",
        "enabled": true,
        "backgroundType": "solid",
        "backgroundSolid": "var(--surface-2)",
        "backgroundImage": "",
        "backgroundGradientFrom": "var(--surface-2)",
        "backgroundGradientTo": "var(--surface-3)",
        "textColor": "",
        "eyebrow": "Explora por categoría",
        "title": "Categorías destacadas",
        "description": "Encuentra los productos más vendidos y mejor valorados de AliExpress, organizados por categoría para descubrir tu próximo hobby.",
        "categorySlugs": []
      },
      {
        "id": "seg-featured",
        "type": "product-carousel",
        "enabled": true,
        "backgroundType": "solid",
        "backgroundSolid": "var(--surface-3)",
        "backgroundImage": "",
        "backgroundGradientFrom": "var(--surface-3)",
        "backgroundGradientTo": "var(--surface-1)",
        "textColor": "",
        "eyebrow": "Selección del día",
        "title": "Ofertas que no puedes dejar pasar",
        "description": "Una curaduría de los productos con mejor relación calidad-precio de AliExpress, actualizada cada día.",
        "carouselLabel": "Más buscados",
        "productSlugs": []
      },
      {
        "id": "seg-how",
        "type": "how-it-works",
        "enabled": true,
        "backgroundType": "solid",
        "backgroundSolid": "var(--surface-1)",
        "backgroundImage": "",
        "backgroundGradientFrom": "var(--surface-1)",
        "backgroundGradientTo": "var(--surface-2)",
        "textColor": "",
        "eyebrow": "Transparencia",
        "title": "¿Cómo funciona?",
        "description": "Elige, compara y compra directo en AliExpress con total transparencia. Nosotros curamos las mejores ofertas para que ahorres tiempo y dinero.",
        "steps": [
          {"number": "01", "title": "Explora", "text": "Navega por nuestras categorías y ofertas curadas."},
          {"number": "02", "title": "Compara", "text": "Revisa precios, reseñas y valoraciones reales de compradores."},
          {"number": "03", "title": "Compra", "text": "Te llevamos a AliExpress para completar tu compra segura."}
        ]
      },
      {
        "id": "seg-testimonials",
        "type": "testimonials",
        "enabled": true,
        "backgroundType": "solid",
        "backgroundSolid": "var(--surface-2)",
        "backgroundImage": "",
        "backgroundGradientFrom": "var(--surface-2)",
        "backgroundGradientTo": "var(--surface-3)",
        "textColor": "",
        "eyebrow": "Opiniones reales",
        "title": "Lo que dicen nuestros clientes",
        "description": "Miles de compradores ya encontraron lo que buscaban a través de nuestras ofertas.",
        "testimonials": [
          {"name": "María G.", "role": "Compradora verificada", "text": "Encontré exactamente lo que buscaba a un precio increíble. El envío llegó antes de lo esperado.", "rating": 5},
          {"name": "Carlos R.", "role": "Comprador verificado", "text": "Comparé en varios sitios y aquí siempre encuentro las mejores ofertas de AliExpress.", "rating": 5},
          {"name": "Lucía M.", "role": "Compradora verificada", "text": "Me encanta que todo esté curado. Ahorro muchísimo tiempo buscando.", "rating": 4}
        ]
      },
      {
        "id": "seg-faq",
        "type": "faq",
        "enabled": true,
        "backgroundType": "solid",
        "backgroundSolid": "var(--surface-1)",
        "backgroundImage": "",
        "backgroundGradientFrom": "var(--surface-1)",
        "backgroundGradientTo": "var(--surface-2)",
        "textColor": "",
        "eyebrow": "Dudas frecuentes",
        "title": "Preguntas frecuentes",
        "description": "Resolvemos las dudas más comunes sobre cómo comprar a través de nuestra tienda.",
        "faqItems": [
          {"question": "¿Cómo compro un producto?", "answer": "Haz clic en el producto y te llevaremos a AliExpress para completar la compra de forma segura. Nosotros no vendemos directamente: somos una tienda de afiliados."},
          {"question": "¿Cuánto tarda el envío?", "answer": "Depende del vendedor y del destino. La mayoría de los envíos tardan entre 7 y 15 días hábiles."},
          {"question": "¿El pago es seguro?", "answer": "Sí. La compra se realiza directamente en AliExpress, que cuenta con protección al comprador y métodos de pago seguros."},
          {"question": "¿Pagan algo extra por usar la tienda?", "answer": "No. Tú pagas el mismo precio que en AliExpress. Nosotros recibimos una comisión del vendedor sin coste adicional para ti."}
        ]
      },
      {
        "id": "seg-newsletter",
        "type": "newsletter",
        "enabled": true,
        "backgroundType": "solid",
        "backgroundSolid": "var(--surface-deep)",
        "backgroundImage": "",
        "backgroundGradientFrom": "var(--surface-deep)",
        "backgroundGradientTo": "var(--surface-deep)",
        "textColor": "",
        "eyebrow": "No te pierdas nada",
        "title": "Recibe las mejores ofertas en tu correo",
        "description": "Suscríbete y recibe cada semana los descuentos y novedades más relevantes de AliExpress.",
        "newsletterButton": "Suscribirme",
        "newsletterPlaceholder": "tu@correo.com"
      }
    ]
  }$json$::jsonb,
  updated_at = now()
where id = 1;
