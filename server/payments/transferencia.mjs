export const bankAccount = Object.freeze({
  cbu: '1430001713039403400016',
  alias: 'matebreak2026',
  holder: 'Franco Capperi',
  expiresHours: 24,
});

export function transferInstructions() {
  return {
    ...bankAccount,
    message: '¡Hola! ¿Cómo estás? ¡Felicitaciones POR TU COMPRA!\n\nPodés hacer tu TRANSFERENCIA a la siguiente cuenta:\n\nCBU: 1430001713039403400016\nAlias: matebreak2026\nTitular de la cuenta: Franco Capperi\n\nUna vez hecho el pago, envianos tu COMPROBANTE por Instagram/WhatsApp.\n\nNO PODEMOS CONFIRMARTE NI ENVIARTE TU COMPRA HASTA QUE NO NOS ENVIES EL PAGO.\n\nTENES 24HS PARA HACERLO.\n\n¡Gracias por tu compra!',
  };
}
