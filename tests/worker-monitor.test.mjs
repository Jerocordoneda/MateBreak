import test from'node:test';import assert from'node:assert/strict';import{workerAlert}from'../server/jobs/monitor.mjs';
import{publicCspFor,publicCsp}from'../server/security/public-policy.mjs';
test('local Supabase image CSP permits only the configured loopback origin and never broadens production',()=>{
 assert.ok(publicCspFor({production:false,url:'http://127.0.0.1:54321'}).includes('https: http://127.0.0.1:54321;'));
 for(const c of[{production:true,url:'http://127.0.0.1:54321'},{production:false,url:'http://outside.example.test'},{production:false,url:'invalid'}])assert.equal(publicCspFor(c),publicCsp);
});
test('operator monitor detects payment backlog/age, financial holds and negative receipts as well as email review',()=>{
 for(const signal of[{payment_pending:101},{payment_oldest_seconds:3601},{financial_holds:1},{email_receipt_alerts:1},{email_pending:101},{email_oldest_seconds:3601},{email_review:1},{payment_review:1}])assert.equal(workerAlert(signal),true);
 assert.equal(workerAlert({payment_pending:100,payment_oldest_seconds:3600,email_pending:100,email_oldest_seconds:3600,financial_holds:0,email_receipt_alerts:0,email_review:0,payment_review:0}),false);
});
