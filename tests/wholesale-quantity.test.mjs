import test from 'node:test';import assert from 'node:assert/strict';
import {quantity} from '../src/features/wholesale/quantity.mjs';
test('wholesale empty quantity is zero; integer editing preserves existing limits',()=>{
 for(const [input,expected]of [['',0],['0',0],['010',10],['10',10],['1000',1000],['1001',null],['-1',null],['1.5',null],['1e2',null],[' ',null],['NaN',null]])assert.equal(quantity(input),expected,input);
});
