// Shared footer component — single source of truth
// Injected by all pages via <script src="/shared/footer.js"></script>
(function() {
  const VERSION = '3.0';

  const FOOTER_HTML = `
    <div class="container">
      <div class="footer-inner">
        <div class="footer-links">
          <a href="https://github.com/codyz123/schelling-protocol" target="_blank">GitHub</a>
          <a href="/docs">API Docs</a>
          <a href="/changelog">Changelog</a>
        </div>
        <div class="footer-right" style="color:#666;font-size:.85rem">
          Schelling Protocol v${VERSION} · Built by <a href="https://github.com/codyz123" target="_blank">Schelling Labs</a>
        </div>
      </div>
    </div>`;

  let footer = document.querySelector('footer');
  if (footer) {
    footer.innerHTML = FOOTER_HTML;
  } else {
    footer = document.createElement('footer');
    footer.innerHTML = FOOTER_HTML;
    document.body.appendChild(footer);
  }
})();
