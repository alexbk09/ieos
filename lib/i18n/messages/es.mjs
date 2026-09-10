/**
 * Diccionario de interfaz — ESPAÑOL (idioma por defecto).
 * ------------------------------------------------------------------
 * Cada idioma vive en su propio archivo .mjs (lógica pura, importable por
 * componentes, tests y scripts sin compilar TypeScript).
 *
 * REGLA: ninguna frase visible del shell (header/footer/navegación de
 * categorías) debe estar quemada en un componente; todas salen de aquí a través
 * de lib/i18n-messages.mjs (translate / createTranslator).
 *
 * Los textos de CONTENIDO editable (hero, footer, nav links) siguen viniendo de
 * site_settings; esto cubre solo las etiquetas fijas de la interfaz.
 */
export default {
  'header.openCart': 'Abrir carrito',
  'header.menu': 'Menú',
  'header.account': 'Mi cuenta',
  'header.myAccount': 'Mi Perfil',
  'header.myRequests': 'Mis Solicitudes',
  'header.adminPanel': 'Panel admin',
  'header.language': 'Idioma',
  'footer.developedBy': 'Desarrollado por',
  'footer.sendEmail': 'Enviar correo',
  'category.exploreOthers': 'Explora otras categorías',
  'category.exploreOthersSubtitle': 'Descubre más productos curados por nuestro equipo.',
  'category.viewFullCatalog': 'Ver catálogo completo',
  'category.faq': 'Preguntas frecuentes',
  'category.empty': 'Aún no hay productos publicados en esta categoría.',
  'category.seeAll': 'Ver todo el catálogo',
  'category.stockOne': 'producto',
  'category.stockMany': 'productos',
}
