// Single source of truth for every page's <head> SEO block. Apply with
// `node scripts/apply-seo.mjs`; tests/seo.test.mjs fails when a page drifts.
// Titles: "Página · MateBreak®"; Home: "MateBreak® · Mates, termos y accesorios".
import {SITE_ORIGIN, SITE_NAME, HOME_TITLE, pageTitle} from '../src/js/page-meta.mjs';
export {SITE_ORIGIN, SITE_NAME, HOME_TITLE, pageTitle};
export const SHARE_IMAGE = '/src/assets/email/matebreak-logo.png';

const PRIVATE = 'noindex, follow';

// file → {name | title, description, path (canonical, omitted when the URL is
// set at runtime), robots (omitted = indexable)}.
export const pages = {
  'index.html': {title: HOME_TITLE, path: '/',
    description: 'Mates, termos, bombillas y sets con personalización láser. Envío gratis desde $80.000 y 10% de descuento pagando con transferencia.'},
  'src/pages/mates-personalizados.html': {name: 'Mates Personalizados', path: '/src/pages/mates-personalizados.html',
    description: 'Todos nuestros mates en una sola colección: algarrobo, calabaza y camionero. Cada pieza es única y lista para personalizar.'},
  'src/pages/algarrobo.html': {name: 'Mates de Algarrobo', path: '/src/pages/algarrobo.html',
    description: 'Mates torneados a mano en algarrobo negro del norte argentino. Cada veta cuenta una historia y cada pieza es única.'},
  'src/pages/calabaza.html': {name: 'Mates de Calabaza', path: '/src/pages/calabaza.html',
    description: 'Mates de calabaza brasileña de pared gruesa, curada a mano y forrada con los mejores cueros.'},
  'src/pages/camionero.html': {name: 'Mates Camioneros', path: '/src/pages/camionero.html',
    description: 'Mates camioneros de calabaza extra gruesa y cuero vacuno 100%, pensados para jornadas largas y mateadas intensas.'},
  'src/pages/termos.html': {name: 'Termos', path: '/src/pages/termos.html',
    description: 'Termos de acero inoxidable 18/8 con doble pared al vacío: exclusivos y personalizados para el ritual moderno.'},
  'src/pages/termos-exclusivos.html': {name: 'Termos Exclusivos', path: '/src/pages/termos-exclusivos.html',
    description: 'Termos exclusivos de acero inoxidable 18/8 y doble pared al vacío, con diseño táctico y minimalista.'},
  'src/pages/termos-personalizados.html': {name: 'Termos Personalizados', path: '/src/pages/termos-personalizados.html',
    description: 'Termos con grabado láser de alta precisión: tu nombre, tu logo, tu marca, tu ritual.'},
  'src/pages/sets.html': {name: 'Sets', path: '/src/pages/sets.html',
    description: 'Sets materos, parrilleros y premium: combinaciones completas para el ritual perfecto.'},
  'src/pages/sets-materos.html': {name: 'Sets Materos', path: '/src/pages/sets-materos.html',
    description: 'El ritual completo en un solo set: todo lo que necesitás para cebar mate.'},
  'src/pages/sets-parrilleros.html': {name: 'Sets Parrilleros', path: '/src/pages/sets-parrilleros.html',
    description: 'Sets parrilleros con mates y termos pensados para el fuego, el asado y las noches largas.'},
  'src/pages/sets-premium.html': {name: 'Sets Premium', path: '/src/pages/sets-premium.html',
    description: 'La máxima expresión de MateBreak®: materiales nobles, ediciones limitadas y presentaciones de regalo.'},
  'src/pages/accesorios.html': {name: 'Accesorios', path: '/src/pages/accesorios.html',
    description: 'Bombillas y materas de calidad premium para completar tu ritual del mate.'},
  'src/pages/catalogo.html': {name: 'Catálogo', path: '/tienda',
    description: 'Catálogo completo de MateBreak®: mates, termos, bombillas, materas y sets. Buscá y filtrá por categoría.'},
  // The product URL, title and description are set at runtime from the product.
  'src/pages/producto.html': {name: 'Producto',
    description: 'Detalle, variantes y precio de los productos de MateBreak®.'},
  'src/pages/regalos-empresariales.html': {name: 'Regalos Empresariales', path: '/regalos-empresariales',
    description: 'Regalos empresariales con mates personalizados: compra mayorista, grabado láser y packaging de lujo para tu equipo y tus clientes.'},
  'src/pages/podcast.html': {name: 'Podcast', path: '/podcast',
    description: 'Charlas reales de MateBreak Podcast. Mirá el episodio destacado y descubrí más conversaciones.'},
  'src/pages/faqs.html': {name: 'Preguntas Frecuentes', path: '/src/pages/faqs.html',
    description: 'Respuestas a las consultas más comunes sobre nuestros productos, políticas y servicios.'},
  'src/pages/nosotros.html': {name: 'Nosotros', path: '/src/pages/nosotros.html',
    description: 'Conocé MateBreak®: artesanía, precisión y pasión por nuestra tierra en cada detalle del ritual del mate.'},
  // Transactional and private screens: titled and described, never indexed.
  'src/pages/tienda.html': {name: 'Tu carrito', path: '/carrito', robots: PRIVATE,
    description: 'Revisá los productos de tu carrito antes de finalizar la compra.'},
  'src/pages/checkout.html': {name: 'Finalizar compra', path: '/checkout', robots: PRIVATE,
    description: 'Completá la entrega y el pago de tu compra en MateBreak®.'},
  'src/pages/checkout-resultado.html': {name: 'Tu compra', path: '/checkout/resultado', robots: PRIVATE,
    description: 'Estado de tu compra en MateBreak®.'},
  'src/pages/cuenta.html': {name: 'Mi cuenta', path: '/mi-cuenta', robots: PRIVATE,
    description: 'Ingresá a tu cuenta de MateBreak® para ver tus pedidos y datos.'},
  'src/pages/recuperar-cuenta.html': {name: 'Recuperar cuenta', path: '/recuperar-cuenta', robots: PRIVATE,
    description: 'Recuperá el acceso a tu cuenta de MateBreak® con un enlace para elegir una nueva contraseña.'},
  'src/pages/confirmar-cuenta.html': {name: 'Confirmá tu cuenta', path: '/src/pages/confirmar-cuenta.html', robots: PRIVATE,
    description: 'Confirmá tu correo para finalizar el registro en MateBreak®.'},
  'src/pages/pedido.html': {name: 'Tu pedido', path: '/src/pages/pedido.html', robots: 'noindex,nofollow',
    description: 'Detalle privado de tu pedido en MateBreak®.'},
  'src/pages/mayorista.html': {name: 'Catálogo Mayorista', path: '/mayorista', robots: 'noindex,nofollow',
    description: 'Catálogo mayorista de MateBreak® para clientes con cuenta habilitada.'},
  // Legacy redirect stubs keep their URLs and point search engines at the catalogue.
  'src/pages/algarrobo-clasico.html': {name: 'Catálogo de algarrobo', path: '/tienda', robots: PRIVATE,
    description: 'Redirección al catálogo de mates de algarrobo de MateBreak®.'},
  'src/pages/camionero-premium.html': {name: 'Catálogo de camioneros', path: '/tienda', robots: PRIVATE,
    description: 'Redirección al catálogo de mates camioneros de MateBreak®.'}
};

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function headBlock(file) {
  const page = pages[file];
  if (!page) throw new Error(`No SEO entry for ${file}`);
  const title = page.title || pageTitle(page.name);
  const lines = [`<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(page.description)}">`];
  if (page.robots) lines.push(`<meta name="robots" content="${page.robots}">`);
  // Private screens are noindex and must not point anywhere else (no canonical/og:url).
  const canonical = page.path && !page.robots;
  if (canonical) lines.push(`<link rel="canonical" href="${SITE_ORIGIN}${page.path}">`);
  lines.push('<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    '<meta property="og:locale" content="es_AR">',
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(page.description)}">`);
  if (canonical) lines.push(`<meta property="og:url" content="${SITE_ORIGIN}${page.path}">`);
  lines.push(`<meta property="og:image" content="${SITE_ORIGIN}${SHARE_IMAGE}">`,
    '<meta property="og:image:alt" content="Logo de MateBreak">',
    '<meta name="twitter:card" content="summary">');
  return `<!-- seo:start -->${lines.join('')}<!-- seo:end -->`;
}
