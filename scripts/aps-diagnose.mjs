// Prüft mit den ECHTEN Autodesk-Zugangsdaten, ob die NWD-Konvertierung einsatzbereit ist:
//   APS_CLIENT_ID=… APS_CLIENT_SECRET=… APS_BUCKET=… npm run aps:diagnose
// Gibt aus: Anmeldung ok?, Bucket ok?, welche Ausgabeformate APS für Navisworks (nwd) tatsächlich anbietet.
// Legt höchstens den (leeren) Bucket an; startet keine Übersetzung, kostet nichts.
const { APS_CLIENT_ID: id, APS_CLIENT_SECRET: secret, APS_BUCKET: bucket } = process.env
if (!id || !secret || !bucket) { console.error('Bitte APS_CLIENT_ID, APS_CLIENT_SECRET und APS_BUCKET setzen.'); process.exit(1) }
const B = 'https://developer.api.autodesk.com'
const ok = (t) => console.log('✅ ' + t), nein = (t) => console.log('❌ ' + t)

const r = await fetch(`${B}/authentication/v2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') }, body: 'grant_type=client_credentials&scope=data:read data:write data:create bucket:create bucket:read' })
if (!r.ok) { nein(`Anmeldung fehlgeschlagen (${r.status}) – Client-ID/Secret prüfen`); process.exit(1) }
const { access_token: t } = await r.json(); ok('Anmeldung bei Autodesk')
const h = { Authorization: `Bearer ${t}` }

const b = await fetch(`${B}/oss/v2/buckets`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ bucketKey: bucket.toLowerCase(), policyKey: 'transient' }) })
if (b.ok || b.status === 409) ok(`Bucket „${bucket.toLowerCase()}“ vorhanden`); else nein(`Bucket nicht nutzbar (${b.status}) – Name evtl. vergeben (muss weltweit eindeutig sein)`)

const f = await fetch(`${B}/modelderivative/v2/designdata/formats`, { headers: h })
if (!f.ok) { nein(`Formatliste nicht abrufbar (${f.status})`); process.exit(1) }
const formate = (await f.json()).formats ?? {}
for (const aus of Object.keys(formate)) console.log(`   Ausgabe „${aus}“ ← ${formate[aus].join(', ')}`)
const kann = (aus) => (formate[aus] ?? []).includes('nwd')
console.log('')
kann('svf') || kann('svf2') ? ok('NWD → SVF/SVF2 möglich (Stufe 1 des Ablaufs)') : nein('NWD → SVF nicht gelistet')
kann('obj') ? ok('NWD → OBJ direkt möglich') : console.log('ℹ️  NWD → OBJ nicht direkt gelistet; der Ablauf nutzt SVF → OBJ (Stufe 2). Ob das klappt, zeigt nur ein echter Testlauf.')
kann('gltf') ? ok('NWD → glTF gelistet – dann lässt sich die Ausgabe auf glTF umstellen') : console.log('ℹ️  Kein glTF-Ausgabeformat gelistet.')
