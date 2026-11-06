// Beim Abmelden alle zwischengespeicherten Seiten und Dateien dieses Geräts löschen (geteilte Geräte, Datenschutz).
// Läuft ohne Service Worker (z. B. Entwicklung) einfach ins Leere.
export async function loescheOfflineKopien(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      reg?.active?.postMessage({ typ: 'cache-leeren' })
    }
    if (typeof caches !== 'undefined') {
      const namen = await caches.keys()
      await Promise.all(namen.filter((n) => n.startsWith('scaffold-')).map((n) => caches.delete(n)))
    }
  } catch { /* nicht kritisch */ }
}
