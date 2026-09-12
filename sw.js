/**
 * Service worker de la PWA. Solo guarda en caché la "cascarón" de la app
 * (HTML/CSS/JS/íconos) para que abra rápido e incluso sin internet; los datos
 * (partidos, tabla, envíos) siempre se piden en vivo al Sheet, nunca se
 * guardan en caché, porque tienen que estar actualizados.
 */
const CACHE_NAME = "quiniela-shell-v9";
const ARCHIVOS_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ARCHIVOS_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(
        nombres.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);

  // Nunca cachear las llamadas a la API de Apps Script (script.google.com /
  // script.googleusercontent.com) -- siempre deben ir a la red.
  if (url.origin.indexOf("google") !== -1) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cacheada) {
      return (
        cacheada ||
        fetch(event.request).catch(function () {
          if (event.request.mode === "navigate") return caches.match("./index.html");
        })
      );
    })
  );
});
