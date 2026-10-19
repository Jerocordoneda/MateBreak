// The BFF, the checkout RPC and MiCorreo accept a street height of digits plus
// an optional letter (1234, 1234B); that contract stays as it is. The browser
// folds the usual Argentine spellings into it, keeping the original wording in
// Referencia, and explains what to do when there is no height to send.
const height = /^(?:(?:n(?:ro)?|n[º°o])\.?\s*|#\s*)?([1-9]\d{0,5})(?:\s*([A-Za-z])|\s+(bis|ter))?$/i;
const withoutNumber = /^(?:s\s*\/\s*n|s\.?\s*n\.?|sin\s+n[uú]mero|sin\s+altura)$/i;
const kilometre = /^km\.?\s*\d/i;

export const streetNumberHints = {
  withoutNumber: 'Para envíos a domicilio Correo Argentino necesita una altura. Si tu dirección es S/N, escribí la altura más cercana y aclará "S/N" y las calles cercanas en Referencia, o elegí otra forma de entrega.',
  kilometre: 'Para una ruta por kilómetro, escribí "Ruta 226 Km 12" en Calle, la altura o el kilómetro en Número (por ejemplo 12) y los detalles en Referencia.',
  zero: 'La altura no puede ser 0. Si tu dirección no tiene número, escribí la altura más cercana y aclará "S/N" en Referencia.',
};

export function streetNumber(raw, reference = '') {
  const text = String(raw ?? '').trim().replace(/\s+/g, ' '), note = String(reference ?? '').trim();
  const match = height.exec(text);
  if (match) {
    const numero = match[1] + (match[2] || '').toUpperCase();
    if (!match[3]) return {numero, referencia: note};
    const original = `Altura ${match[1]} ${match[3].toLowerCase()}`;
    return {numero, referencia: note.includes(original) ? note : [original, note].filter(Boolean).join(' · ')};
  }
  const hint = withoutNumber.test(text) ? streetNumberHints.withoutNumber
    : kilometre.test(text) ? streetNumberHints.kilometre
    : /^0+$/.test(text) ? streetNumberHints.zero : null;
  return {numero: text, referencia: note, hint};
}
