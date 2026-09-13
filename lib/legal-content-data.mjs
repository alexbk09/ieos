/**
 * DATA de los documentos legales (FUENTE ÚNICA), en formato .mjs puro.
 * ------------------------------------------------------------------
 * POR QUÉ está separado de lib/legal-content.ts:
 *  1) Los tests de Node y los scripts .mjs (backfill de traducciones) pueden
 *     importarlo DIRECTO, sin compilar TypeScript (mismo patrón que
 *     lib/i18n-config.mjs + lib/i18n-messages.mjs).
 *  2) lib/legal-content.ts lo re-expone con sus tipos y añade la lógica de
 *     localización: aquí SOLO hay datos, cero lógica y cero dependencias.
 *
 * El idioma RAÍZ es el español (SOURCE_LOCALE): estas cadenas se traducen a
 * los idiomas destino con scripts/backfill-legal-i18n.mjs, que escribe
 * lib/i18n/legal/<locale>.mjs. Los tokens {name} / {email} / {address} se
 * resuelven en render (lib/legal-content.ts).
 */
export const LEGAL_LAST_UPDATED = '2026-09-12'

// ---------- Documentos ----------

/** Términos y Condiciones: reglas de uso del sitio de afiliación. */
export const TERMS_DOCUMENT = {
  key: 'terms',
  path: '/terminos',
  titleKey: 'footer.terms',
  updatedAt: LEGAL_LAST_UPDATED,
  summary:
    'Las reglas de uso del sitio, el alcance de nuestros servicios y las limitaciones de responsabilidad aplicables.',
  sections: [
    {
      id: 'aceptacion',
      title: '1. Aceptación de los términos',
      blocks: [
        {
          kind: 'p',
          text: 'Estos Términos y Condiciones regulan el acceso y el uso de {name}, así como de todos los contenidos, secciones y funcionalidades que se ofrecen en el sitio.',
        },
        {
          kind: 'p',
          text: 'Al navegar, buscar productos, usar el asistente de compra o cualquier otra función del sitio, aceptas sin reservas estos términos. Si no estás de acuerdo con ellos, te pedimos que no utilices la plataforma.',
        },
        {
          kind: 'p',
          text: 'Si utilizas el sitio en representación de una empresa, declaras contar con facultades suficientes para obligarla y aceptas estas condiciones también en su nombre.',
        },
      ],
    },
    {
      id: 'naturaleza-servicio',
      title: '2. Naturaleza del servicio',
      blocks: [
        {
          kind: 'p',
          text: '{name} es un catálogo de curaduría y descubrimiento de productos que se comercializan en marketplaces de terceros, principalmente AliExpress. No somos una tienda de comercio electrónico directo ni actuamos como vendedor, intermediario o representante de los vendedores.',
        },
        {
          kind: 'p',
          text: 'Nuestra labor es seleccionar, organizar y presentar productos de interés para nuestros visitantes mediante enlaces de afiliado. La compra se formaliza siempre en el marketplace del vendedor, donde se aplican sus propias condiciones, políticas y sistemas de pago.',
        },
        {
          kind: 'p',
          text: 'Por lo anterior, no gestionamos pedidos, pagos, envíos, aduanas, devoluciones ni garantías: esas gestiones corresponden al vendedor y al marketplace conforme a sus propias políticas.',
        },
      ],
    },
    {
      id: 'uso-permitido',
      title: '3. Uso permitido del sitio',
      blocks: [
        { kind: 'p', text: 'Te comprometes a utilizar el sitio de forma lícita y diligente. En particular, aceptas no:' },
        {
          kind: 'ul',
          items: [
            'Utilizar el sitio para fines ilícitos, fraudulentos o contrarios al orden público.',
            'Extraer, copiar o reutilizar de forma masiva el catálogo, los textos o las imágenes mediante scraping automatizado sin autorización.',
            'Introducir virus, código malicioso o realizar acciones que afecten la disponibilidad, integridad o seguridad del sitio.',
            'Suplantar la identidad de {name}, de otros usuarios o de terceros.',
            'Manipular los enlaces de afiliado o las métricas del sitio para alterar su funcionamiento legítimo.',
          ],
        },
        {
          kind: 'p',
          text: 'El incumplimiento de estas obligaciones faculta a {name} a restringir o bloquear el acceso al sitio, sin perjuicio de las demás acciones legales que correspondan.',
        },
      ],
    },
    {
      id: 'propiedad-intelectual',
      title: '4. Propiedad intelectual',
      blocks: [
        {
          kind: 'p',
          text: 'El nombre, la marca, el logotipo, el diseño, la estructura de navegación, los textos editoriales y la selección de contenidos de {name} son titularidad de {name} o se utilizan con autorización, y están protegidos por la normativa de propiedad intelectual e industrial aplicable.',
        },
        {
          kind: 'p',
          text: 'Las imágenes, fichas, marcas y descripciones de productos pertenecen a sus respectivos titulares y se muestran con fines informativos y de referencia. Su presencia en el sitio no implica cesión ni licencia alguna a favor del usuario.',
        },
        {
          kind: 'p',
          text: 'No se permite reproducir, distribuir, transformar o comunicar públicamente los contenidos del sitio sin autorización previa y por escrito, salvo los usos permitidos por la ley.',
        },
      ],
    },
    {
      id: 'informacion-productos',
      title: '5. Información de productos, precios y disponibilidad',
      blocks: [
        {
          kind: 'p',
          text: 'La información de productos (denominación, precio, imágenes, especificaciones y valoraciones) se obtiene de fuentes del marketplace y se muestra como referencia. Aunque procuramos mantenerla actualizada y precisa, puede variar por cambios del vendedor, del tipo de cambio o de las condiciones del mercado.',
        },
        {
          kind: 'p',
          text: 'El precio y la disponibilidad definitivos son los que se muestran en el marketplace al momento de finalizar la compra. Te recomendamos verificar siempre la ficha del vendedor antes de pagar.',
        },
        {
          kind: 'p',
          text: '{name} no garantiza la ausencia de errores en la información publicada ni la disponibilidad permanente de las ofertas, y no será responsable por decisiones de compra basadas en datos desactualizados.',
        },
      ],
    },
    {
      id: 'enlaces-terceros',
      title: '6. Enlaces a terceros y marketplaces',
      blocks: [
        {
          kind: 'p',
          text: 'El sitio contiene enlaces a sitios de terceros, incluidos los marketplaces donde se completa la compra. Dichos enlaces se ofrecen para facilitar el acceso y se rigen por las políticas y condiciones de cada tercero.',
        },
        {
          kind: 'p',
          text: '{name} no controla ni respalda el contenido, las prácticas, los precios ni las políticas de esos sitios, y no asume responsabilidad por ellos. La relación comercial se establece exclusivamente entre tú y el vendedor o el marketplace correspondiente.',
        },
      ],
    },
    {
      id: 'limitacion-responsabilidad',
      title: '7. Limitación de responsabilidad',
      blocks: [
        {
          kind: 'p',
          text: 'El sitio se ofrece "tal cual" y "según disponibilidad". En la medida máxima permitida por la ley, {name} no será responsable de daños directos, indirectos, incidentales o consecuentes derivados del uso o de la imposibilidad de uso del sitio, ni de la pérdida de datos u oportunidades.',
        },
        {
          kind: 'p',
          text: 'Tampoco seremos responsables por interrupciones del servicio por causas ajenas a nuestro control (fallos de red, mantenimiento, fuerza mayor) ni por el actuar de vendedores, marketplaces, transportistas o autoridades aduaneras.',
        },
        {
          kind: 'p',
          text: 'Nada en estos términos excluye responsabilidades que no puedan limitarse conforme a la ley aplicable.',
        },
      ],
    },
    {
      id: 'indemnizacion',
      title: '8. Indemnización',
      blocks: [
        {
          kind: 'p',
          text: 'Aceptas mantener indemne a {name}, sus responsables y colaboradores frente a cualquier reclamación, pérdida, daño o gasto (incluidos honorarios razonables) derivado de tu uso indebido del sitio o del incumplimiento de estos términos.',
        },
      ],
    },
    {
      id: 'modificaciones',
      title: '9. Modificaciones de los términos',
      blocks: [
        {
          kind: 'p',
          text: '{name} podrá actualizar estos términos para reflejar cambios legales, técnicos u operativos. La versión vigente será siempre la publicada en esta página, con su fecha de última actualización.',
        },
        {
          kind: 'p',
          text: 'El uso continuado del sitio después de publicarse una modificación implica su aceptación. Si no estás de acuerdo, deberás abstenerte de utilizar el sitio.',
        },
      ],
    },
    {
      id: 'ley-aplicable',
      title: '10. Ley aplicable y jurisdicción',
      blocks: [
        {
          kind: 'p',
          text: 'Estos términos se rigen por las leyes de la República Bolivariana de Venezuela. Cualquier controversia se someterá a los tribunales competentes de {address}, sin perjuicio de los derechos que la ley reconozca al consumidor en su lugar de residencia.',
        },
      ],
    },
    {
      id: 'contacto',
      title: '11. Contacto',
      blocks: [
        {
          kind: 'p',
          text: 'Si tienes dudas sobre estos Términos y Condiciones, escríbenos a {email} y te responderemos lo antes posible.',
        },
      ],
    },
  ],
}

/** Política de Privacidad: qué datos tratamos, para qué y qué derechos tienes. */
export const PRIVACY_DOCUMENT = {
  key: 'privacy',
  path: '/privacidad',
  titleKey: 'footer.privacy',
  updatedAt: LEGAL_LAST_UPDATED,
  summary:
    'Qué datos personales recopilamos, con qué finalidad, durante cuánto tiempo y cómo puedes ejercer tus derechos.',
  sections: [
    {
      id: 'responsable',
      title: '1. Responsable del tratamiento',
      blocks: [
        {
          kind: 'p',
          text: 'El responsable del tratamiento de los datos recopilados a través de {name} es {name} ({address}). Puedes contactarnos en {email} para cualquier consulta relacionada con esta política.',
        },
        {
          kind: 'p',
          text: 'Nos comprometemos a tratar tus datos personales con confidencialidad, de forma lícita, leal y transparente, y únicamente para las finalidades descritas en este documento.',
        },
      ],
    },
    {
      id: 'datos',
      title: '2. Datos que recopilamos',
      blocks: [
        { kind: 'p', text: 'Según cómo uses el sitio, podemos tratar las siguientes categorías de datos:' },
        {
          kind: 'ul',
          items: [
            'Datos de contacto: el nombre y el correo electrónico que nos facilitas voluntariamente en el formulario de contacto o al registrarte.',
            'Datos de la cuenta: credenciales e información básica de perfil si creas una cuenta (por ejemplo, tu rol de usuario).',
            'Datos de uso: páginas visitadas, búsquedas, productos vistos o agregados al carrito y clics en enlaces de afiliado, con fines analíticos y de mejora del catálogo.',
            'Datos técnicos: dirección IP, tipo de navegador, idioma, dispositivo y datos equivalentes, necesarios para la seguridad y el funcionamiento del sitio.',
            'Datos de comunicación: el contenido de los mensajes que nos envías por los canales de contacto.',
          ],
        },
        {
          kind: 'p',
          text: 'No solicitamos datos sensibles ni datos de pago: la compra y el pago se realizan íntegramente en el marketplace del vendedor, nunca en este sitio.',
        },
      ],
    },
    {
      id: 'finalidades',
      title: '3. Para qué usamos tus datos',
      blocks: [
        { kind: 'p', text: 'Tratamos tus datos personales para las siguientes finalidades:' },
        {
          kind: 'ul',
          items: [
            'Gestionar y responder a las solicitudes que nos envías por los canales de contacto.',
            'Operar y mantener el sitio, incluidas la seguridad, la prevención de abusos y la resolución de incidencias técnicas.',
            'Analizar el uso del sitio de forma agregada para mejorar el catálogo, la navegación y la experiencia de compra.',
            'Medir el rendimiento de los enlaces de afiliado para entender qué contenidos resultan útiles.',
            'Cumplir obligaciones legales que nos resulten aplicables y atender requerimientos de autoridades competentes.',
          ],
        },
        {
          kind: 'p',
          text: 'No utilizamos tus datos para decisiones automatizadas con efectos jurídicos sobre ti ni creamos perfiles publicitarios a partir de ellos.',
        },
      ],
    },
    {
      id: 'base-legal',
      title: '4. Base legal del tratamiento',
      blocks: [
        {
          kind: 'p',
          text: 'Tratamos tus datos sobre las siguientes bases jurídicas: tu consentimiento (cuando nos contactas o aceptas el uso de cookies no esenciales), nuestro interés legítimo en operar y mejorar el sitio, la ejecución de la relación que mantenemos contigo cuando usas la plataforma y el cumplimiento de obligaciones legales.',
        },
        {
          kind: 'p',
          text: 'Puedes retirar tu consentimiento en cualquier momento, sin que ello afecte a la licitud del tratamiento realizado con anterioridad.',
        },
      ],
    },
    {
      id: 'cookies',
      title: '5. Cookies y tecnologías similares',
      blocks: [
        {
          kind: 'p',
          text: 'Usamos cookies y tecnologías equivalentes para recordar tus preferencias (por ejemplo, el idioma o el tema claro/oscuro), mantener la seguridad del sitio y obtener métricas agregadas de uso.',
        },
        {
          kind: 'p',
          text: 'Puedes configurar tu navegador para bloquear o eliminar cookies. Ten en cuenta que, si desactivas las estrictamente necesarias, algunas funciones del sitio podrían no operar correctamente.',
        },
        {
          kind: 'p',
          text: 'Los enlaces de afiliado pueden permitir que el marketplace reconozca que llegaste desde {name}. Ese tratamiento se rige por la política de cookies y privacidad del propio marketplace.',
        },
      ],
    },
    {
      id: 'terceros',
      title: '6. Terceros y encargados del tratamiento',
      blocks: [
        {
          kind: 'p',
          text: 'Para operar el sitio nos apoyamos en proveedores que pueden tratar datos por nuestra cuenta y bajo nuestras instrucciones, entre ellos: proveedores de infraestructura y hosting, proveedores de base de datos y autenticación, servicios de analítica y proveedores de inteligencia artificial que asisten la atención al visitante.',
        },
        {
          kind: 'p',
          text: 'Cuando haces clic en un enlace de afiliado y accedes al marketplace, ese tercero pasa a tratar tus datos como responsable independiente conforme a sus propias políticas, sobre las que no tenemos control.',
        },
        {
          kind: 'p',
          text: 'No vendemos, alquilamos ni cedemos tus datos personales a terceros con fines comerciales.',
        },
      ],
    },
    {
      id: 'transferencias',
      title: '7. Transferencias internacionales',
      blocks: [
        {
          kind: 'p',
          text: 'Algunos de nuestros proveedores pueden estar ubicados fuera de tu país, por lo que tus datos podrían transferirse internacionalmente. En tales casos exigimos garantías contractuales y medidas de seguridad adecuadas para proteger tu información.',
        },
      ],
    },
    {
      id: 'retencion',
      title: '8. Conservación de los datos',
      blocks: [
        {
          kind: 'p',
          text: 'Conservamos tus datos personales únicamente durante el tiempo necesario para cumplir las finalidades para las que fueron recopilados y, en su caso, los plazos exigidos por la legislación aplicable.',
        },
        {
          kind: 'p',
          text: 'Los datos de contacto se conservan mientras exista una relación o interés en resolver tu solicitud; los datos de uso se mantienen de forma agregada o anonimizada durante periodos limitados.',
        },
      ],
    },
    {
      id: 'derechos',
      title: '9. Tus derechos',
      blocks: [
        { kind: 'p', text: 'Puedes ejercer los siguientes derechos sobre tus datos personales:' },
        {
          kind: 'ul',
          items: [
            'Acceso: conocer qué datos tuyos tratamos.',
            'Rectificación: corregir datos inexactos o incompletos.',
            'Supresión: solicitar la eliminación de tus datos cuando ya no sean necesarios.',
            'Oposición y limitación: oponerte o restringir determinados tratamientos.',
            'Portabilidad: recibir tus datos en un formato estructurado.',
            'Retirar el consentimiento en cualquier momento, cuando el tratamiento se base en él.',
          ],
        },
        {
          kind: 'p',
          text: 'Para ejercerlos, escríbenos a {email} indicando el derecho que deseas ejercer y los datos necesarios para identificarte. Responderemos en los plazos previstos por la normativa aplicable.',
        },
      ],
    },
    {
      id: 'seguridad',
      title: '10. Seguridad de la información',
      blocks: [
        {
          kind: 'p',
          text: 'Aplicamos medidas técnicas y organizativas razonables para proteger tus datos frente a accesos no autorizados, pérdida, alteración o divulgación indebida, incluido el cifrado en tránsito y los controles de acceso.',
        },
        {
          kind: 'p',
          text: 'Ningún sistema es completamente infalible. Si detectáramos un incidente que afecte de forma significativa tus datos, actuaremos conforme a la ley y te informaremos cuando corresponda.',
        },
      ],
    },
    {
      id: 'menores',
      title: '11. Menores de edad',
      blocks: [
        {
          kind: 'p',
          text: 'El sitio está dirigido a personas mayores de edad. No recopilamos de forma consciente datos de menores. Si detectamos que hemos recibido datos de un menor sin autorización de sus representantes, procederemos a eliminarlos.',
        },
      ],
    },
    {
      id: 'cambios-privacidad',
      title: '12. Cambios en esta política',
      blocks: [
        {
          kind: 'p',
          text: 'Podemos actualizar esta Política de Privacidad para reflejar cambios legales, técnicos u operativos. Publicaremos siempre la versión vigente en esta página indicando su fecha de última actualización.',
        },
      ],
    },
    {
      id: 'contacto-privacidad',
      title: '13. Contacto',
      blocks: [
        {
          kind: 'p',
          text: 'Si tienes preguntas sobre esta Política de Privacidad o sobre el tratamiento de tus datos, escríbenos a {email}.',
        },
      ],
    },
  ],
}

/** Aviso de Afiliado: transparencia sobre cómo se monetiza el sitio. */
export const AFFILIATE_DOCUMENT = {
  key: 'affiliate',
  path: '/afiliados',
  titleKey: 'footer.affiliate',
  updatedAt: LEGAL_LAST_UPDATED,
  summary:
    'Declaración transparente de afiliación: cómo ganamos comisiones y por qué nunca pagas más por comprar a través de nuestros enlaces.',
  sections: [
    {
      id: 'declaracion',
      title: '1. Declaración de afiliación',
      blocks: [
        {
          kind: 'p',
          text: '{name} participa en el Programa de Afiliados de AliExpress y en otros programas de afiliación de terceros. Esto significa que podemos recibir una comisión cuando realizas una compra a través de los enlaces publicados en el sitio.',
        },
        {
          kind: 'p',
          text: 'Queremos que lo sepas con total claridad: esta es la principal forma en que financiamos la curaduría, el mantenimiento del catálogo y el desarrollo del sitio.',
        },
      ],
    },
    {
      id: 'como-funcionan',
      title: '2. Cómo funcionan los enlaces de afiliado',
      blocks: [
        {
          kind: 'p',
          text: 'Los enlaces de afiliado incluyen un identificador de seguimiento que permite al marketplace saber que la visita llegó desde {name}. Si compras dentro del periodo de atribución establecido por el programa, se nos acredita una comisión.',
        },
        {
          kind: 'p',
          text: 'Ese identificador no contiene tus datos personales: solo indica el origen de la visita. Tú sigues comprando directamente al vendedor del marketplace, con su cuenta y sus condiciones.',
        },
      ],
    },
    {
      id: 'sin-coste',
      title: '3. Sin coste adicional para ti',
      blocks: [
        {
          kind: 'p',
          text: 'La comisión no supone ningún coste adicional para ti: pagas exactamente el mismo precio que si accedieras directamente al marketplace sin pasar por nuestros enlaces.',
        },
        {
          kind: 'p',
          text: 'En ningún caso el precio que ves en el marketplace se incrementa por provenir de un enlace de afiliado. Las condiciones de pago, envío y garantía son las del vendedor.',
        },
      ],
    },
    {
      id: 'no-vendedor',
      title: '4. No somos el vendedor',
      blocks: [
        {
          kind: 'p',
          text: '{name} no vende directamente los productos mostrados ni procesa pagos. Actuamos como escaparate de curaduría y descubrimiento: la transacción se celebra íntegramente entre tú y el vendedor del marketplace.',
        },
        {
          kind: 'p',
          text: 'Por ello, cualquier incidencia relacionada con el pedido (envío, aduanas, producto defectuoso, devoluciones o garantías) debe gestionarse con el vendedor o con el servicio de atención del marketplace.',
        },
      ],
    },
    {
      id: 'precios',
      title: '5. Precios y disponibilidad',
      blocks: [
        {
          kind: 'p',
          text: 'Los precios y la disponibilidad que mostramos son referenciales y pueden cambiar en cualquier momento por decisiones del vendedor, promociones, stock o tipo de cambio. El dato válido es siempre el que aparece en el marketplace al confirmar la compra.',
        },
      ],
    },
    {
      id: 'independencia',
      title: '6. Independencia editorial',
      blocks: [
        {
          kind: 'p',
          text: 'La existencia de una comisión no condiciona nuestra selección: elegimos y organizamos los productos por su interés, utilidad o relación calidad-precio, no por el importe de la comisión.',
        },
        {
          kind: 'p',
          text: 'Cuando un producto no dispone de enlace de afiliado, lo indicamos y, si procede, ofrecemos alternativas dentro del catálogo.',
        },
      ],
    },
    {
      id: 'programas',
      title: '7. Programas de afiliación',
      blocks: [
        {
          kind: 'p',
          text: 'Participamos principalmente en el Programa de Afiliados de AliExpress y podríamos adherirnos a otros programas equivalentes. Cada programa se rige por sus propias condiciones de participación y atribución, que aceptamos al integrarnos en ellos.',
        },
      ],
    },
    {
      id: 'cumplimiento',
      title: '8. Cumplimiento y transparencia',
      blocks: [
        {
          kind: 'p',
          text: 'Esta declaración cumple con las exigencias de transparencia aplicables a los enlaces de afiliado y con las políticas de divulgación de los propios programas. Publicamos además un aviso de afiliado permanente en el pie de página y junto a los enlaces relevantes.',
        },
      ],
    },
    {
      id: 'contacto-afiliados',
      title: '9. Contacto',
      blocks: [
        {
          kind: 'p',
          text: 'Si tienes dudas sobre nuestra relación de afiliación o sobre un enlace concreto, escríbenos a {email}.',
        },
      ],
    },
  ],
}
