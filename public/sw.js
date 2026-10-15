// Huddle's offline shell. Keeps a copy of the app itself (the page, scripts,
// styles, fonts, icons) so Huddle opens with no connection — on the web and
// in the desktop app, which loads the same site. Data is handled separately
// by the app (src/lib/offline.js); this never touches Supabase or /api.
//
//   • The page: network first (so a deploy is picked up straight away), the
//     saved copy if the network fails or is too slow.
//   • /assets/*: file names change with every build, so a saved copy is
//     always right — served from the cache, fetched once.
//   • Anything else of ours (icons…): the saved copy now, refreshed behind.

const PAGE = "huddle-page-v1";
const FILES = "huddle-files-v1";
const MAX_FILES = 120;

// On first install the page has already loaded its files without us, so save
// the page and everything it points to (and the fonts its CSS points to) now.
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(precache().catch(() => {}));
});
const assetRefs = (text) => [...text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"|url\((\/assets\/[^)]+)\)/g)].map((m) => m[1] || m[2]);
async function precache() {
  const res = await fetch("/", { cache: "no-store" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await (await caches.open(PAGE)).put("/", res);
  const files = await caches.open(FILES);
  try { const icon = await fetch("/huddle-icon.png"); if (icon.ok) await files.put("/huddle-icon.png", icon); } catch (_) {}
  for (const u of new Set(assetRefs(html))) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      if (u.endsWith(".css")) for (const f of assetRefs(await r.clone().text())) { try { const fr = await fetch(f); if (fr.ok) await files.put(f, fr); } catch (_) {} }
      await files.put(u, r);
    } catch (_) {}
  }
}

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== PAGE && k !== FILES) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  if (req.mode === "navigate") e.respondWith(page(req));
  else if (url.pathname.startsWith("/assets/")) e.respondWith(cacheFirst(req));
  else e.respondWith(staleWhileRevalidate(req));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

async function page(req) {
  const cache = await caches.open(PAGE);
  try {
    const res = await Promise.race([fetch(req), timeout(6000)]);
    if (res.ok) await cache.put("/", res.clone());
    return res;
  } catch (_) {
    return (await cache.match("/", { ignoreVary: true })) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) { await cache.put(req, res.clone()); trim(cache); }
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(req, { ignoreVary: true });
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await fresh) || Response.error();
}

// Old builds' files pile up; keep the newest MAX_FILES.
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_FILES; i++) await cache.delete(keys[i]);
}
