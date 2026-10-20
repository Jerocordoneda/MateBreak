export async function startReservationExpiry(admin) {
let expiring = false;
const expire = async () => {
  if (expiring) return;
  expiring = true;
  try {
    const { error } = await admin.rpc('mb_expirar_reservas');
    if (error) console.error('No se pudieron liberar reservas vencidas:', error.code);
  } catch { console.error('Fallo de conexión al liberar reservas'); }
  finally { expiring = false; }
};
await expire();
return setInterval(expire, 60000).unref();
}
