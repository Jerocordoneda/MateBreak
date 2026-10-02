import { quoteCart } from '../../checkout/cart-quote.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });
export function cartRoutes(app, { admin, checked, hashToken, rpc, rotateCart }) {
  app.get('/api/metodos', async (req, res) => {
    const [pagos, envios] = await Promise.all([
      checked(admin.from('metodo_pago').select('codigo,nombre,instrucciones').eq('activo', true)),
      checked(admin.from('metodo_envio').select('codigo,nombre,costo,requiere_direccion').eq('activo', true)),
    ]); res.json({ pagos, envios });
  });
  app.get('/api/carrito/resumen', async (req, res) => {
    if (!req.hasCart) return res.json({cantidad:0});
    const {data,error}=await admin.rpc('mb_carrito_cantidad',{p_token_hash:hashToken(req.cartToken),p_usuario_id:req.user?.id ?? null});
    if (error) throw fail(503,'No se pudo consultar el carrito');
    res.json({cantidad:data});
  });
  app.get('/api/carrito', async (req, res) => {
    let cart;
    try { cart = await rpc(req, 'carrito'); }
    catch (error) {
      if (!['Sesion invalida', 'El carrito vencio'].includes(error.message)) throw error;
      rotateCart(req, res); cart = await rpc(req, 'carrito');
    }
    if (cart.estado === 'convertido') { rotateCart(req, res); cart = await rpc(req, 'carrito'); }
    res.json(await quoteCart(cart, admin));
  });
  app.put('/api/carrito/items/:id', async (req, res) => {
    if (!/^[1-9][0-9]{0,18}$/.test(req.params.id) || !Number.isInteger(req.body?.cantidad) || req.body.cantidad < 0 || req.body.cantidad > 99) throw fail(400, 'Producto o cantidad inválidos');
    res.json(await quoteCart(await rpc(req, 'cantidad', { producto_id: req.params.id, cantidad: req.body.cantidad }), admin));
  });
  app.put('/api/carrito/variantes/:id', async (req, res) => {
    const {cantidad,personalizacion}=req.body??{};
    if(!/^[1-9][0-9]{0,18}$/.test(req.params.id)||!Number.isInteger(cantidad)||cantidad<0||cantidad>99
      ||(personalizacion!==undefined&&(typeof personalizacion!=='string'||personalizacion.length>1000)))throw fail(400,'Variante, cantidad o personalización inválidas');
    res.json(await quoteCart(await rpc(req,'variante',{variante_id:req.params.id,cantidad,...(personalizacion===undefined?{}:{personalizacion})}), admin));
  });
}
