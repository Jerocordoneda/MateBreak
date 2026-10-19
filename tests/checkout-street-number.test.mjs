import {test} from 'node:test';
import assert from 'node:assert/strict';
import {streetNumber, streetNumberHints} from '../src/features/checkout/street-number.mjs';
import {validateRecipient} from '../server/checkout/policy.mjs';

const recipient = {nombre: 'Ana', apellido: 'Prueba', email: 'ana@example.com', telefono: '2494123456', codigo_postal: '7000',
  provincia: 'Buenos Aires', ciudad: 'Tandil', calle: 'Pinto', piso: '', departamento: '', referencia: 'Timbre 2'};
// The same rule mb_checkout_minorista applies in the database.
const databaseHeight = /^[1-9][0-9]{0,5}[A-Za-z]?$/;
const send = numero => { const street = streetNumber(numero, recipient.referencia); return {street, sent: validateRecipient({...recipient, ...street})}; };

test('"1234 bis" is sent as 1234 and keeps its wording in Referencia; the server and database accept it', () => {
  const {street, sent} = send('1234 bis');
  assert.equal(sent.numero, '1234');
  assert.equal(sent.referencia, 'Altura 1234 bis · Timbre 2');
  assert.match(street.numero, databaseHeight);
  assert.equal(streetNumber('1234 bis', 'Altura 1234 bis · Timbre 2').referencia, 'Altura 1234 bis · Timbre 2', 'a second read does not repeat the note');
});

test('Usual spellings of a height reach the server in its own format', () => {
  for (const [typed, numero] of [['N° 1234', '1234'], ['Nº 1234', '1234'], ['nro. 1234', '1234'], ['#1234', '1234'], ['1234 b', '1234B'], ['1234B', '1234B'], [' 742 ', '742'], ['1234 ter', '1234']]) {
    assert.equal(send(typed).sent.numero, numero, typed);
    assert.match(numero, databaseHeight);
  }
});

test('"S/N", "Km 12" and "0" get specific guidance instead of the generic error', () => {
  for (const typed of ['S/N', 's/n', 'S / N', 'SN', 'sin número', 'Sin altura']) assert.equal(streetNumber(typed).hint, streetNumberHints.withoutNumber, typed);
  for (const typed of ['Km 12', 'km 12,5', 'KM. 3']) assert.equal(streetNumber(typed).hint, streetNumberHints.kilometre, typed);
  for (const typed of ['0', '000']) assert.equal(streetNumber(typed).hint, streetNumberHints.zero, typed);
  for (const hint of Object.values(streetNumberHints)) assert.match(hint, /altura/i);
});

test('The server contract is not weakened: raw "S/N", "Km 12", "1234 bis" and "0" are still rejected there', () => {
  for (const numero of ['S/N', 'Km 12', '1234 bis', '0', '<script>'])
    assert.throws(() => validateRecipient({...recipient, numero}), error => error.code === 'INVALID_RECIPIENT' && Boolean(error.fields.numero), numero);
});

test('Anything else is left as typed for the regular validation', () => {
  assert.deepEqual(streetNumber('12a3', ''), {numero: '12a3', referencia: '', hint: null});
  assert.deepEqual(streetNumber(undefined), {numero: '', referencia: '', hint: null});
});
