
  // FAQ accordion (adaptado del componente "Animated FAQ" de Framer)
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('faq-container');
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('[data-faq-item]'));
    rows.forEach((row) => {
      const toggle = row.querySelector('.faq-toggle');
      toggle.addEventListener('click', () => {
        const isOpen = row.classList.contains('is-open');
        rows.forEach((r) => {
          r.classList.remove('is-open');
          r.querySelector('.faq-toggle').setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          row.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
        }
      });
    });
  });