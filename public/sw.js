/* Service worker de Podium (#15, #33).
 * - Páginas: red primero; si no hay señal, la última copia guardada o la página "sin conexión".
 * - Archivos estáticos de Next (/_next/static): caché primero (tienen hash en el nombre).
 * - /api y envíos (POST de server actions) nunca pasan por la caché.
 * - Avisos push (#43).
 */
const VERSION = "v1";
const PAGES = `podium-pages-${VERSION}`;
const STATIC = `podium-static-${VERSION}`;
const OFFLINE_URL = "/sin-conexion";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("podium-") && ![PAGES, STATIC].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPage(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Peticiones RSC de navegación interna: si fallan, Next hace una navegación completa
  // y esa sí la responde la caché de páginas.
  if (request.headers.get("rsc") || url.searchParams.has("_rsc")) return;

  if (isPage(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic" && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname + url.search, copy));
          }
          return res;
        })
        .catch(
          async () => (await caches.match(url.pathname + url.search)) || (await caches.match(OFFLINE_URL)),
        ),
    );
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  // Guarda páginas para abrirlas sin señal (p. ej. las listas de las clases del día).
  if (data.type === "cache-pages" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(PAGES).then((cache) =>
        Promise.all(
          data.urls.map((u) =>
            fetch(u, { credentials: "same-origin" })
              .then((res) => (res.ok && !res.redirected ? cache.put(u, res) : undefined))
              .catch(() => undefined),
          ),
        ),
      ),
    );
  }
  // Al cerrar sesión se borran las páginas guardadas (pueden tener datos personales).
  if (data.type === "clear") {
    event.waitUntil(caches.delete(PAGES));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "Podium", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Podium", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { href: data.href || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => new URL(w.url).pathname === href);
      return same ? same.focus() : self.clients.openWindow(href);
    }),
  );
});
