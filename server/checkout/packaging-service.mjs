import { planPackages } from '../shipping/packaging.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });
export async function packagesFor(selection, { admin, config }) {
    if (!selection.items?.length) return null;
    const ids = [...new Set(selection.items.map(item => String(item.producto_id)))];
    const { data, error } = await admin.from('producto')
      .select('id_producto,tipo,catalogo_producto_categoria(catalogo_categoria(slug))').in('id_producto', ids);
    if (error) throw fail(503, 'No se pudo determinar el embalaje');
    return planPackages(selection.items, data.map(product => ({
      id: product.id_producto, tipo: product.tipo,
      categorias: product.catalogo_producto_categoria.map(link => link.catalogo_categoria.slug),
    })), config.parcelProfiles, config.approvedRetailProfiles);
}
