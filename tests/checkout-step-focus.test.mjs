import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveToStep} from '../src/features/checkout/step-focus.mjs';

function page({reducedMotion}) {
  const calls = [];
  const heading = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    focus(options) { calls.push(['focus', options]); },
  };
  const view = {
    matchMedia: query => ({matches: reducedMotion && query === '(prefers-reduced-motion: reduce)'}),
    scrollTo(options) { calls.push(['scroll', options]); },
  };
  return {calls, heading, status: {textContent: ''}, view};
}

test('Going to payment focuses the step title and announces the step', () => {
  const {calls, heading, status, view} = page({reducedMotion: false});
  moveToStep('payment', {heading, status, view});
  assert.equal(heading.attributes.tabindex, '-1', 'a heading needs tabindex=-1 to take focus');
  assert.deepEqual(calls.find(([name]) => name === 'focus'), ['focus', {preventScroll: true}]);
  assert.equal(status.textContent, 'Paso 2 de 2: Pago');
});

test('Scrolling happens before focus so the focus does not cut the scroll short', () => {
  const {calls, heading, status, view} = page({reducedMotion: false});
  moveToStep('delivery', {heading, status, view});
  assert.deepEqual(calls.map(([name]) => name), ['scroll', 'focus']);
  assert.deepEqual(calls[0][1], {top: 0, behavior: 'smooth'});
  assert.equal(status.textContent, 'Paso 1 de 2: Entrega');
});

test('With prefers-reduced-motion the step change jumps instead of animating', () => {
  const {calls, heading, status, view} = page({reducedMotion: true});
  moveToStep('payment', {heading, status, view});
  // `instant`, not `auto`: `auto` would inherit html{scroll-behavior:smooth}.
  assert.deepEqual(calls[0][1], {top: 0, behavior: 'instant'});
});
