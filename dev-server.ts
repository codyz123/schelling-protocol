// Simple dev server: serves public/ static files + proxies /api/* to the backend
const STATIC_DIR = "./public";
const API_TARGET = "http://localhost:3456";
const PORT = 3457;

// Simple rewrite rules matching vercel.json
const rewrites: [RegExp, string][] = [
  [/^\/cards\/setup$/, "/cards-setup.html"],
  [/^\/cards\/([^/]+)\/contact-setup$/, "/contact-setup.html"],
  [/^\/cards\/([^/]+)$/, "/card.html"],
  [/^\/cards$/, "/cards.html"],
];

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Proxy /api/* to backend
    if (path.startsWith("/api/")) {
      const target = `${API_TARGET}${path}${url.search}`;
      const proxyReq = new Request(target, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      });
      try {
        return await fetch(proxyReq);
      } catch {
        return new Response("Backend unavailable", { status: 502 });
      }
    }

    // Apply rewrite rules
    for (const [pattern, dest] of rewrites) {
      if (pattern.test(path)) {
        path = dest;
        break;
      }
    }

    // Clean URLs (try .html)
    let file = Bun.file(`${STATIC_DIR}${path}`);
    if (!(await file.exists())) {
      file = Bun.file(`${STATIC_DIR}${path}.html`);
    }
    if (!(await file.exists())) {
      file = Bun.file(`${STATIC_DIR}/index.html`);
    }

    return new Response(file);
  },
});

console.log(`Dev server: http://localhost:${PORT}`);
console.log(`  /cards     → cards.html`);
console.log(`  /cards/setup → cards-setup.html`);
console.log(`  /cards/:slug → card.html`);
console.log(`  /api/*     → proxied to ${API_TARGET}`);
