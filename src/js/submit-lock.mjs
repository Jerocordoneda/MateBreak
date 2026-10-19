// One submission at a time. A run that resolves to `leaving` has handed the page
// to a navigation: the control stays locked, so a second click cannot start
// another order or purchase while the browser is still showing this page.
export const leaving = Symbol('leaving');

export function submitLock(run, { lock, release }) {
  let busy = false;
  const submit = async (...args) => {
    if (busy) return;
    busy = true; lock();
    let outcome;
    try { outcome = await run(...args); return outcome; }
    finally { if (outcome !== leaving) { busy = false; release(); } }
  };
  // Back/forward cache restores the page as it was left: locked mid-navigation.
  submit.reset = () => { if (busy) { busy = false; release(); } };
  return submit;
}
