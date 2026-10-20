// Changing step swaps panels in place: without this, focus stays on a button
// that just disappeared and screen readers hear nothing. Scroll first, then move
// focus to the new step's title without a second jump, and announce the step.
export const stepNames = { delivery: 'Paso 1 de 2: Entrega', payment: 'Paso 2 de 2: Pago' };

export function moveToStep(step, { heading, status, view }) {
  const reduce = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  view.scrollTo({ top: 0, behavior: reduce ? 'instant' : 'smooth' });
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  status.textContent = stepNames[step];
}
