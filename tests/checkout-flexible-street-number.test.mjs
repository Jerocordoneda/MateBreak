import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateRecipient} from '../server/checkout/policy.mjs';
import {flexibleHeight, canonicalStreetNumber} from '../src/features/checkout/recipient-validation.mjs';
import {loadConfig} from '../server/config/environment.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const recipient = {nombre: 'Ana', apellido: 'Prueba', email: 'ana@example.com', telefono: '2494123456', codigo_postal: '7000',
  provincia: 'Buenos Aires', ciudad: 'Tandil', calle: 'Ruta 226', referencia: ''};
const flexible = {flexibleStreetNumber: true};
const migration = read('supabase/migrations/20261019120000_flexible_street_number.sql');
const rollback = read('supabase/rollbacks/20261019120000_flexible_street_number.down.sql');
const original = read('supabase/migrations/20261004184020_manual_review_checkout_policy.sql');
const definition = sql => {
  const start = sql.indexOf('create or replace function private.mb_checkout_minorista_v1');
  return sql.slice(start, sql.indexOf('end $$;', start) + 'end $$;'.length);
};
const env = {NODE_ENV: 'development', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: 'synthetic',
  SUPABASE_SECRET_KEY: 'synthetic', SHIPPING_MODE: 'mock', PAYMENTS_MODE: 'mock'};
const databaseRule = sql => new RegExp(/->>'numero' !~ '([^']+)'/.exec(sql)[1]);

test('Off by default: the BFF keeps today\'s numeric street height', () => {
  assert.equal(loadConfig(env).config.flexibleStreetNumber, false);
  for (const numero of ['S/N', 'Km 12', '1234 bis', '0'])
    assert.throws(() => validateRecipient({...recipient, numero}), error => Boolean(error.fields?.numero), numero);
  assert.equal(validateRecipient({...recipient, numero: '1234b'}).numero, '1234b', 'today\'s values are untouched');
});

test('With CHECKOUT_FLEXIBLE_STREET_NUMBER=1 the BFF accepts S/N, KM and BIS in one spelling', () => {
  assert.equal(loadConfig({...env, CHECKOUT_FLEXIBLE_STREET_NUMBER: '1'}).config.flexibleStreetNumber, true);
  for (const [typed, stored] of [['S/N', 'S/N'], ['s/n', 'S/N'], ['SN', 'S/N'], ['sin número', 'S/N'], ['Km 12', 'KM 12'], ['km 12.5', 'KM 12,5'],
    ['1234 bis', '1234 BIS'], ['1234bis', '1234 BIS'], ['1234 ter', '1234 TER'], ['0', '0'], ['N° 1234', '1234'], ['1234 b', '1234B'], ['742', '742']])
    assert.equal(validateRecipient({...recipient, numero: typed}, 'correo_domicilio', undefined, flexible).numero, stored, typed);
});

test('The flexible rule still refuses free text and markup', () => {
  for (const numero of ['', '<script>', 'S/N/N', '1234567', 'KM', 'Ruta 3 Km 12', '12 B C', 'bis'])
    assert.throws(() => validateRecipient({...recipient, numero}, 'correo_domicilio', undefined, flexible), error => Boolean(error.fields?.numero), numero);
  assert.equal(validateRecipient({...recipient, numero: 'S/N'}, 'retiro', undefined, flexible).numero, '', 'pickup still drops the address');
});

test('The migration changes only the numero rule of mb_checkout_minorista_v1', () => {
  const before = definition(original).split('\n'), after = definition(migration).split('\n');
  assert.equal(after.length, before.length);
  const changed = after.map((line, index) => line !== before[index] ? index : -1).filter(index => index >= 0);
  assert.equal(changed.length, 1);
  assert.match(before[changed[0]], /->>'numero' !~ '\^\[1-9\]\[0-9\]\{0,5\}\[A-Za-z\]\?\$'/);
  assert.doesNotMatch(migration.replace(definition(migration), ''), /\b(drop|delete|truncate|alter table|update|insert)\b/i);
});

test('The database rule accepts every value it accepted before and every value the BFF stores', () => {
  const before = databaseRule(original), after = databaseRule(migration);
  const slashes = source => source.replaceAll('\\/', '/');
  assert.equal(slashes(after.source), slashes(flexibleHeight.source), 'browser, BFF and database share one rule');
  for (const numero of ['1', '742', '1234', '1234b', '1234B', '999999z']) { assert.match(numero, before); assert.match(numero, after); }
  for (const typed of ['S/N', 'km 12.5', '1234 bis', '0', 'N° 1234']) assert.match(canonicalStreetNumber(typed), after, typed);
  for (const numero of ['s/n', 'Km 12', '1234 bis', '<b>', '']) assert.doesNotMatch(numero, after, `${numero} must arrive canonical`);
});

test('The rollback restores the previous definition verbatim and is not a migration', () => {
  assert.equal(definition(rollback), definition(original));
  assert.match(rollback, /CHECKOUT_FLEXIBLE_STREET_NUMBER is 0/);
});
