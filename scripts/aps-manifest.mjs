// Zeigt das Autodesk-Protokoll (Manifest) eines NWD-Auftrags, z. B. um einen Fehler wie „extractor -777“ zu untersuchen:
//   APS_CLIENT_ID=… APS_CLIENT_SECRET=… npm run aps:manifest -- <aps_urn>
// Die URN steht in der Tabelle nwd_jobs (Spalte aps_urn): select aps_urn, fehler_text from nwd_jobs order by erstellt_am desc limit 3;
// Nur lesend. Gibt Status, Fortschritt und alle Meldungen der Ableitungen aus (keine Geheimnisse, kann an Claude geschickt werden).
const [urn] = process.argv.slice(2)
const { APS_CLIENT_ID: id, APS_CLIENT_SECRET: secret } = process.env
if (!urn || !id || !secret) { console.error('Aufruf: APS_CLIENT_ID=… APS_CLIENT_SECRET=… npm run aps:manifest -- <aps_urn>'); process.exit(1) }
const B = 'https://developer.api.autodesk.com'
const r = await fetch(`${B}/authentication/v2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') }, body: 'grant_type=client_credentials&scope=data:read' })
if (!r.ok) { console.error('Anmeldung fehlgeschlagen', r.status); process.exit(1) }
const { access_token: t } = await r.json()
const m = await fetch(`${B}/modelderivative/v2/designdata/${urn}/manifest`, { headers: { Authorization: `Bearer ${t}` } })
if (!m.ok) { console.error('Kein Manifest', m.status, '(nach 24 h oder nach erfolgreichem Auftrag gelöscht)'); process.exit(1) }
const j = await m.json()
const zeige = (n, tiefe = 0) => {
  const e = '  '.repeat(tiefe)
  const kopf = [n.outputType, n.role, n.type, n.status, n.progress].filter(Boolean).join(' · ')
  if (kopf) console.log(e + kopf)
  for (const msg of n.messages ?? []) console.log(e + '  ! ' + [msg.type, msg.code, msg.message].filter(Boolean).join(' | '))
  for (const c of [...(n.derivatives ?? []), ...(n.children ?? [])]) zeige(c, tiefe + 1)
}
console.log('Gesamt:', j.status, j.progress); zeige(j)
