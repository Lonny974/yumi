# Assemble la PWA (dossier docs/) à partir de src/app.html.
import json, pathlib
from PIL import Image, ImageDraw
root = pathlib.Path(__file__).resolve().parent.parent
out = root / "docs"; out.mkdir(exist_ok=True)
body = (root / "src" / "app.html").read_text()
head = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f9fafb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b1120" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Yumi">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" href="icons/icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:0}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}html{height:100%;box-sizing:border-box}</style>
</head>
<body>
"""
cfg_file = root / "build" / "config.json"   # URL + clé publique Supabase (sans risque : l'accès est protégé par les règles RLS)
cfg = "<script>window.RECETTES_CONFIG = " + cfg_file.read_text().strip() + ";</script>\n" if cfg_file.exists() else ""
(out / "index.html").write_text(head + cfg + body + "\n</body>\n</html>\n")
(out / "manifest.webmanifest").write_text(json.dumps({
  "name": "Yumi", "short_name": "Yumi", "lang": "fr", "start_url": "./", "scope": "./",
  "display": "standalone", "background_color": "#f9fafb", "theme_color": "#111827",
  "icons": [{"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]
}, ensure_ascii=False, indent=2))
(out / "sw.js").write_text("""const CACHE = "yumi-v3";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
// Réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && (new URL(e.request.url).origin === location.origin || e.request.url.includes("fonts.g"))) {
      const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
""")
icons = out / "icons"; icons.mkdir(exist_ok=True)
im = Image.open(root / "build" / "icon-1024.png").convert("RGB")   # rendu par Chromium avec Inter
for n in (180, 192, 512):
    im.resize((n, n), Image.LANCZOS).save(icons / f"icon-{n}.png")
print("ok", out)
