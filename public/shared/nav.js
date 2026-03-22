// Shared navigation component — single source of truth
// Injected by all pages via <script src="/shared/nav.js"></script>
(function() {
  const LOGO_SVG = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" stroke="url(#nav-g)" stroke-width="3"/>
    <circle cx="20" cy="24" r="4.5" fill="#8b5cf6"/><circle cx="44" cy="24" r="4.5" fill="#8b5cf6"/><circle cx="32" cy="44" r="4.5" fill="#8b5cf6"/>
    <line x1="20" y1="24" x2="44" y2="24" stroke="#6366f180" stroke-width="1.5"/>
    <line x1="20" y1="24" x2="32" y2="44" stroke="#6366f180" stroke-width="1.5"/>
    <line x1="44" y1="24" x2="32" y2="44" stroke="#6366f180" stroke-width="1.5"/>
    <circle cx="32" cy="30.5" r="2" fill="#a78bfa" opacity="0.6"/>
    <defs><linearGradient id="nav-g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient></defs>
  </svg>`;

  const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%236366f1'/%3E%3Cstop offset='100%25' style='stop-color:%23a78bfa'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='32' cy='32' r='30' fill='none' stroke='url(%23g)' stroke-width='3'/%3E%3Ccircle cx='20' cy='24' r='4.5' fill='%238b5cf6'/%3E%3Ccircle cx='44' cy='24' r='4.5' fill='%238b5cf6'/%3E%3Ccircle cx='32' cy='44' r='4.5' fill='%238b5cf6'/%3E%3Cline x1='20' y1='24' x2='44' y2='24' stroke='%236366f180' stroke-width='1.5'/%3E%3Cline x1='20' y1='24' x2='32' y2='44' stroke='%236366f180' stroke-width='1.5'/%3E%3Cline x1='44' y1='24' x2='32' y2='44' stroke='%236366f180' stroke-width='1.5'/%3E%3Ccircle cx='32' cy='30.5' r='2' fill='%23a78bfa' opacity='0.6'/%3E%3C/svg%3E";

  const NAV_LINKS = [
    { href: '/browse', label: 'Browse' },
    { href: '/cards', label: 'Cards' },
    { href: '/serendipity', label: 'Serendipity' },
    { href: '/changelog', label: 'Changelog' },
    { href: 'https://github.com/codyz123/schelling-protocol', label: 'GitHub', external: true },
    { href: '/#start', label: 'Get Started', className: 'btn btn-primary' },
  ];

  // Determine active link from current path
  const path = window.location.pathname.replace(/\/$/, '') || '/';

  function isActive(href) {
    if (href === '/') return path === '/';
    return path === href || path.startsWith(href + '/');
  }

  // Inject favicon if not present
  if (!document.querySelector('link[rel="icon"]')) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = FAVICON;
    document.head.appendChild(link);
  }

  // Build nav HTML
  const linksHTML = NAV_LINKS.map(link => {
    const active = isActive(link.href) ? ' style="color:#fff"' : '';
    const target = link.external ? ' target="_blank"' : '';
    const cls = link.className ? ` class="${link.className}"` : '';
    return `<a href="${link.href}"${cls}${active}${target}>${link.label}</a>`;
  }).join('\n');

  // Find or create nav element
  let nav = document.getElementById('nav');
  if (nav) {
    // Replace existing nav content
    nav.innerHTML = `
      <div class="container">
        <div class="nav-inner">
          <a href="/" class="nav-brand">${LOGO_SVG} Schelling Protocol</a>
          <button class="nav-hamburger" id="navHamburger" aria-label="Toggle menu">
            <span></span><span></span><span></span>
          </button>
          <div class="nav-links" id="navLinks">${linksHTML}</div>
        </div>
      </div>`;
  } else {
    // Create nav element
    nav = document.createElement('nav');
    nav.className = 'nav';
    nav.id = 'nav';
    nav.innerHTML = `
      <div class="container">
        <div class="nav-inner">
          <a href="/" class="nav-brand">${LOGO_SVG} Schelling Protocol</a>
          <button class="nav-hamburger" id="navHamburger" aria-label="Toggle menu">
            <span></span><span></span><span></span>
          </button>
          <div class="nav-links" id="navLinks">${linksHTML}</div>
        </div>
      </div>`;
    document.body.prepend(nav);
  }

  // Scroll behavior
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 20));

  // Hamburger toggle
  const hamburger = document.getElementById('navHamburger');
  const navLinks = document.getElementById('navLinks');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navLinks.classList.remove('open');
  }));
})();
