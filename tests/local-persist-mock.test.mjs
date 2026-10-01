import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';

test('persisted mock checkout fails closed outside local Supabase and mock providers', () => {
  const config = { localPersistMock:true, url:'http://127.0.0.1:54321',
    origin:'http://localhost:3000', production:false, shippingMode:'mock', paymentsMode:'mock' };
  for (const change of [{url:'https://example.supabase.co'},{url:'http://127.0.0.1:54323'},
    {production:true,origin:'https://localhost:3000'},{origin:'https://example.com'},
    {shippingMode:'real'},{paymentsMode:'real'}])
    assert.throws(() => createApp({...config,...change}), /Persisted mock checkout requires local/);
});
