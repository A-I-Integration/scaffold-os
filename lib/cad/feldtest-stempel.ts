// Versions-Stempel für das Feldtest-Protokoll: welche Software-Version hat gemessen?
// Version aus package.json; Stand = Git-Commit des Builds, wenn die Plattform ihn bereitstellt
// (Vercel: NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA, nur wenn „Systemvariablen bereitstellen“ aktiv ist). Sonst „unbekannt“ – nichts erfunden.
import pkg from '../../package.json'

export function softwareStempel(): { name: string; version: string; stand: string } {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || ''
  return { name: 'SCAFFOLD OS', version: String(pkg.version), stand: sha ? sha.slice(0, 7) : 'Commit unbekannt (lokal oder Variable nicht gesetzt)' }
}
