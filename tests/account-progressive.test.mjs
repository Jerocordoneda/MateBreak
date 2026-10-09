import test from 'node:test';
import assert from 'node:assert/strict';
import {runSections} from '../src/features/account/customer-panel.js';
test('account sections finish independently and isolate a secondary failure',async()=>{
 let release;const slow=new Promise(r=>release=r),events=[];
 const work=runSections({profile:async()=>{},orders:()=>slow,emails:async()=>{throw Error('offline');}}, {current:()=>true,onState:(n,s)=>events.push(n+':'+s)});
 await new Promise(r=>setImmediate(r));
 assert.ok(events.includes('profile:ready'));assert.ok(events.includes('emails:error'));assert.ok(!events.includes('orders:ready'));
 release();await work;assert.ok(events.includes('orders:ready'));
});
test('invalidated session cannot publish late results or errors',async()=>{
 let active=true,release;const events=[];
 const work=runSections({orders:()=>new Promise(r=>release=r)}, {current:()=>active,onState:(n,s)=>events.push(s)});
 active=false;release();await work;assert.deepEqual(events,['loading']);
 await runSections({orders:async()=>{throw Error('unused');}},{current:()=>false,onState:()=>assert.fail()});
});
