/* ============================================================
   SCAFFOLD OS – Service Worker (Offline-Stufe 1: App startet ohne Netz)

   Was er tut:
   • Statische Dateien (/_next/static, 3D-Bausteine in /draco und /wasm, Icons) kommen aus dem Gerätespeicher, sobald sie einmal geladen wurden.
   • Seiten der freigegebenen Bereiche (CAD, Aufmaß, Stückliste) werden online normal geladen und dabei als Kopie abgelegt.
     Fällt das Netz aus (oder antwortet es nicht innerhalb von 4 Sekunden), wird die zuletzt gesehene Kopie gezeigt, sonst /offline.html.
   • Beim ersten Ablegen einer Seite werden auch ihre Skript- und Stildateien nachgeladen, die im Seitentext genannt sind.
   • Stufe 2: Ausgewählte LESENDE Stammdaten-Abfragen (Kunden, Firma, Leistungskatalog, Fahrzeuge, Projekte, eigene Rolle) werden bei jedem
     erfolgreichen Abruf als Kopie abgelegt. Ohne Netz kommt die zuletzt gesehene Kopie mit dem Kopfzeilen-Hinweis „x-offline-kopie“ (Stand-Zeit).
   Was er NICHT tut:
   • Keine anderen Server-Daten (/api sonst, Anmeldung, Überwachung) zwischenspeichern – die laufen immer übers Netz. Nur GET, nie Schreibzugriffe.
   • Keine Änderungen nachsenden (kommt in Stufe 3).
   • Beim Abmelden werden alle Kopien gelöscht (Nachricht { typ: 'cache-leeren' } von der Seite).
   ============================================================ */
'use strict'

const VERSION = 'v1'
const CACHE_STATISCH = 'scaffold-statisch-' + VERSION
const CACHE_SEITEN = 'scaffold-seiten-' + VERSION
const CACHE_DATEN = 'scaffold-daten-' + VERSION
const OFFLINE_URL = '/offline.html'
const NETZ_WARTEZEIT_MS = 4000

// Bereiche, deren Seiten offline zur Verfügung stehen sollen
const SEITEN_ERLAUBT = [/^\/cad(\/|$)/, /^\/aufmass(\/|$)/, /^\/stueckliste(\/|$)/]
// Lesende Stammdaten, die offline als letzte Kopie zur Verfügung stehen (nur GET, nur Erfolgsantworten mit JSON)
const DATEN_ERLAUBT = [/^\/api\/(me|kunden|company|leistungskatalog|vehicles|projects)$/]
// Nie zwischenspeichern
const NIE = [/^\/api\//, /^\/monitoring/, /^\/auth\//, /^\/login/, /^\/statiker/, /^\/admin/]

function istStatisch(pfad) {
  return pfad.indexOf('/_next/static/') === 0 || /^\/(draco|wasm|beispiele)\//.test(pfad) || /^\/(icon-192|icon-512|apple-touch-icon)\.png$/.test(pfad) || pfad === '/manifest.webmanifest'
}
function istErlaubteSeite(pfad) { return SEITEN_ERLAUBT.some(function (r) { return r.test(pfad) }) }
function istLesbareDaten(pfad) { return DATEN_ERLAUBT.some(function (r) { return r.test(pfad) }) }
function istGesperrt(pfad) { return NIE.some(function (r) { return r.test(pfad) }) }

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_STATISCH).then(function (c) { return c.add(OFFLINE_URL) }).then(function () { return self.skipWaiting() }))
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (namen) { return Promise.all(namen.filter(function (n) { return n.indexOf('scaffold-') === 0 && n !== CACHE_STATISCH && n !== CACHE_SEITEN && n !== CACHE_DATEN }).map(function (n) { return caches.delete(n) })) })
      .then(function () { return self.clients.claim() })
  )
})

self.addEventListener('message', function (event) {
  if (event.data && event.data.typ === 'cache-leeren') {
    event.waitUntil(caches.keys().then(function (namen) { return Promise.all(namen.filter(function (n) { return n.indexOf('scaffold-') === 0 }).map(function (n) { return caches.delete(n) })) }))
  }
})

function mitWartezeit(versprechen, ms) {
  return new Promise(function (ok, fehler) {
    const t = setTimeout(function () { fehler(new Error('Zeit abgelaufen')) }, ms)
    versprechen.then(function (v) { clearTimeout(t); ok(v) }, function (e) { clearTimeout(t); fehler(e) })
  })
}

function skripteAusSeite(html) {
  const treffer = html.match(/\/_next\/static\/[A-Za-z0-9_\-./%~]+\.(?:js|css|woff2?)/g) || []
  return Array.from(new Set(treffer)).slice(0, 80)
}

async function legeAssetsAb(response) {
  try {
    const text = await response.text()
    const cache = await caches.open(CACHE_STATISCH)
    await Promise.all(skripteAusSeite(text).map(async function (url) {
      if (await cache.match(url)) return
      try { const r = await fetch(url); if (r.ok) await cache.put(url, r) } catch (e) { /* offline: später */ }
    }))
  } catch (e) { /* nicht kritisch */ }
}

async function seiteNetzZuerst(request, url) {
  const cache = await caches.open(CACHE_SEITEN)
  try {
    const geladen = await mitWartezeit(fetch(request), NETZ_WARTEZEIT_MS)
    if (geladen && geladen.ok && geladen.type === 'basic' && !geladen.redirected) {
      cache.put(url.pathname, geladen.clone())
      legeAssetsAb(geladen.clone())
    }
    return geladen
  } catch (e) {
    const kopie = await cache.match(url.pathname)
    if (kopie) return kopie
    return (await caches.match(OFFLINE_URL)) || new Response('Offline', { status: 503 })
  }
}

async function datenNetzZuerst(request, url) {
  const cache = await caches.open(CACHE_DATEN)
  const schluessel = url.pathname + url.search
  try {
    const geladen = await mitWartezeit(fetch(request), NETZ_WARTEZEIT_MS)
    const art = (geladen && geladen.headers && geladen.headers.get('content-type')) || ''
    if (geladen && geladen.ok && geladen.status === 200 && geladen.type === 'basic' && art.indexOf('json') >= 0) {
      const kopie = geladen.clone()
      const text = await kopie.text()
      cache.put(schluessel, new Response(text, { status: 200, headers: { 'content-type': 'application/json', 'x-stand': String(Date.now()) } }))
    }
    return geladen
  } catch (e) {
    const alt = await cache.match(schluessel)
    if (!alt) throw e
    const text = await alt.text()
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json', 'x-offline-kopie': '1', 'x-stand': alt.headers.get('x-stand') || '' } })
  }
}

async function statischZuerst(request) {
  const cache = await caches.open(CACHE_STATISCH)
  const treffer = await cache.match(request)
  if (treffer) return treffer
  const geladen = await fetch(request)
  if (geladen && geladen.ok) cache.put(request, geladen.clone())
  return geladen
}

self.addEventListener('fetch', function (event) {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (istLesbareDaten(url.pathname)) { event.respondWith(datenNetzZuerst(request, url)); return }
  if (istGesperrt(url.pathname)) return
  if (istStatisch(url.pathname)) { event.respondWith(statischZuerst(request)); return }
  if (request.mode === 'navigate' && istErlaubteSeite(url.pathname)) { event.respondWith(seiteNetzZuerst(request, url)); return }
  if (request.mode === 'navigate' && url.pathname === '/offline.html') { event.respondWith(caches.match(OFFLINE_URL)); return }
})
