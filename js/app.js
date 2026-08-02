/**
 * app.js
 * Shell behaviour shared by every page: sidebar toggle on mobile,
 * active nav highlighting, current-year footer stamp.
 * Page-specific logic lives in booking.js / table.js.
 */

document.addEventListener('DOMContentLoaded', () => {
  highlightActiveNav();
  wireSidebarToggle();
  stampCompanyInfo();
});

function highlightActiveNav() {
  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    const target = link.getAttribute('href');
    if (target === current) {
      link.classList.add('nav-link--active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

function wireSidebarToggle() {
  const toggle = document.querySelector('[data-sidebar-toggle]');
  const sidebar = document.querySelector('[data-sidebar]');
  const scrim = document.querySelector('[data-sidebar-scrim]');
  if (!toggle || !sidebar) return;

  const open = () => {
    sidebar.classList.add('sidebar--open');
    scrim?.classList.add('sidebar-scrim--visible');
  };
  const close = () => {
    sidebar.classList.remove('sidebar--open');
    scrim?.classList.remove('sidebar-scrim--visible');
  };

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('sidebar--open') ? close() : open();
  });
  scrim?.addEventListener('click', close);
}

function stampCompanyInfo() {
  document.querySelectorAll('[data-company-name]').forEach((el) => {
    el.textContent = CONFIG.COMPANY_NAME;
  });
  document.querySelectorAll('[data-company-tagline]').forEach((el) => {
    el.textContent = CONFIG.COMPANY_TAGLINE;
  });
  document.querySelectorAll('[data-current-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
}
