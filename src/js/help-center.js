// Ayuda: filters the questions as the visitor types. Everything is static
// markup; without JavaScript every answer stays readable and the search stays
// invisible (its space is kept, so nothing shifts when it appears).
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function mountHelpSearch(root = document) {
  const form = root.querySelector('[data-help-search]');
  const input = form?.querySelector('input');
  const status = root.querySelector('[data-help-status]');
  const empty = root.querySelector('[data-help-empty]');
  const groups = [...root.querySelectorAll('[data-help-group]')];
  if (!form || !input || !groups.length) return;
  form.classList.add('is-ready');
  const items = groups.flatMap(group => [...group.querySelectorAll('details')].map(item => ({group, item, text: fold(item.textContent + ' ' + group.querySelector('h2').textContent)})));
  const opened = new Set();

  function apply() {
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const entry of items) {
      const match = words.every(word => entry.text.includes(word));
      entry.item.hidden = !match;
      if (match) shown++;
      // Matches open so the answer is visible; clearing the search restores the
      // visitor's own choices.
      if (words.length) { if (match && !entry.item.open) { entry.item.open = true; opened.add(entry.item); } }
      else if (opened.has(entry.item)) { entry.item.open = false; opened.delete(entry.item); }
    }
    for (const group of groups) group.hidden = !group.querySelector('details:not([hidden])');
    empty.hidden = shown > 0;
    status.textContent = !words.length ? '' : shown === 1 ? '1 respuesta encontrada' : shown ? `${shown} respuestas encontradas` : 'No encontramos respuestas para tu búsqueda';
  }

  input.addEventListener('input', apply);
  form.addEventListener('submit', event => {
    event.preventDefault();
    root.querySelector('[data-help-group]:not([hidden]) details:not([hidden]) summary')?.focus();
  });
  root.querySelector('[data-help-reset]')?.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
  apply();
}

mountHelpSearch();
