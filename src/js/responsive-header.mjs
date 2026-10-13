// Presentation-only enhancement: every category remains an ordinary navigation link.
export function mountResponsiveHeader(root = document) {
  for (const header of root.querySelectorAll('.mb-commerce-header')) {
    if (header.dataset.responsiveMounted) continue;
    const actions = header.querySelector('.mb-header-actions');
    const bar = header.querySelector('.mb-categorybar');
    const nav = header.querySelector('.mb-category-nav');
    if (!actions || !bar || !nav) continue;
    header.dataset.responsiveMounted = 'true';
    bar.id ||= 'mb-category-menu';
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'mb-menu-toggle'; toggle.textContent = '☰';
    toggle.setAttribute('aria-label', 'Abrir navegación');
    toggle.setAttribute('aria-controls', bar.id); toggle.setAttribute('aria-expanded', 'false');
    actions.append(toggle);
    const setSubmenu=(button,open)=>{if(!button)return;button.setAttribute('aria-expanded',String(open));button.textContent=open?'⌄':'>';};
    const close = (focus = false) => {
      for (const group of nav.querySelectorAll('.mb-subnav-open')) { group.classList.remove('mb-subnav-open'); setSubmenu(group.querySelector('.mb-subnav-toggle'),false); }
      header.classList.remove('mb-nav-open'); toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir navegación'); toggle.textContent = '☰';
      if (focus) toggle.focus();
    };
    toggle.addEventListener('click', () => {
      const open = !header.classList.contains('mb-nav-open');
      header.classList.toggle('mb-nav-open', open); toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar navegación' : 'Abrir navegación'); toggle.textContent = open ? '×' : '☰';
    });
    for (const group of nav.querySelectorAll('.group')) {
      const link = group.querySelector(':scope > a'), menu = group.querySelector('.dropdown-menu');
      if (!link || !menu) continue;
      const label = link.textContent.replace('expand_more', '').trim();
      const button = document.createElement('button'); button.type = 'button'; button.className = 'mb-subnav-toggle';
      button.textContent = '>'; button.setAttribute('aria-label', 'Subcategorías de ' + label);
      button.setAttribute('aria-expanded', 'false');
      const icon = link.querySelector('.material-symbols-outlined'); icon?.remove();
      link.after(button);
      button.addEventListener('click', () => {
        group.classList.remove('mb-subnav-dismissed');
        const open = !group.classList.contains('mb-subnav-open');
        group.classList.toggle('mb-subnav-dismissed',!open);
        for (const other of nav.querySelectorAll('.mb-subnav-open')) {
          if (other === group) continue;
          other.classList.remove('mb-subnav-open');
          setSubmenu(other.querySelector('.mb-subnav-toggle'),false);
        }
        group.classList.toggle('mb-subnav-open', open); setSubmenu(button,open);
      });
      group.addEventListener('pointerenter', () => group.classList.remove('mb-subnav-dismissed'));
      button.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          for (const other of nav.querySelectorAll('.mb-subnav-open')) {
            if (other === group) continue;
            other.classList.remove('mb-subnav-open');
            setSubmenu(other.querySelector('.mb-subnav-toggle'),false);
          }
          group.classList.remove('mb-subnav-dismissed'); group.classList.add('mb-subnav-open'); setSubmenu(button,true); menu.querySelector('a')?.focus();
        }
      });
    }
    const secondary = document.createElement('div'); secondary.className = 'mb-mobile-secondary';
    for (const link of header.querySelectorAll('.mb-help-nav a')) secondary.append(link.cloneNode(true));
    if (secondary.childElementCount) nav.append(secondary);
    header.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const submenuButton = event.target.closest('.group')?.querySelector('.mb-subnav-toggle');
      for (const group of nav.querySelectorAll('.mb-subnav-open')) {
        group.classList.add('mb-subnav-dismissed');
        group.classList.remove('mb-subnav-open'); setSubmenu(group.querySelector('.mb-subnav-toggle'),false);
      }
      if (header.classList.contains('mb-nav-open')) close(true);
      else submenuButton?.focus();
    });
    header.addEventListener('focusout', event => { if (!header.contains(event.relatedTarget)) close(); });
    document.addEventListener('click', event => { if (!header.contains(event.target)) close(); });
    nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
    const mobile = matchMedia('(max-width: 760px)');
    mobile.addEventListener('change', () => close());
  }
}
