import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalTests } from '../scripts/local-test-runtime.mjs';

test('destructive local tests reject remote URLs and inherited secrets before connecting', () => {
  for (const [name,value] of [['SUPABASE_URL','https://blocked.supabase.co'],
    ['DATABASE_URL','postgresql://test:fixture@192.0.2.1:54322/postgres'],
    ['SUPABASE_SECRET_KEY','fixture-only'],['SUPABASE_ACCESS_TOKEN','fixture-only'],
    ['MP_ACCESS_TOKEN','fixture-only'],['PGPASSWORD','fixture-only']]) {
    const previous=process.env[name];
    try { process.env[name]=value;assert.throws(()=>assertLocalTests(),/forbidden|refused/); }
    finally { if(previous===undefined)delete process.env[name];else process.env[name]=previous; }
  }
});
