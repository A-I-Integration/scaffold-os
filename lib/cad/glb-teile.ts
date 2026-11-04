// Bauteile in einer GLB-Datei erkennen, die wir beim Anzeigen ausblenden oder als Anker nutzen.
// Modelle aus KI-Werkzeugen oder Blender-Exporten haben oft benannte Knoten („Geruest_…“, „Kirchturm_Baukörper“).
// Unser eigenes Gerüst wird gezeichnet und berechnet – ein mitgeliefertes Gerüst würde es doppeln und verdecken.

/** Knoten, die ein Gerüst darstellen (Name beginnt mit Gerüst/Geruest/Scaffold). */
export const istGeruestKnoten = (name: string): boolean => /^(ger(ü|ue)st|scaffold)/i.test(name.trim())

/** Bodenplatte/Sockel des Modells (wir haben eigenen Boden). */
export const istSockelKnoten = (name: string): boolean => /(sockel|bodenplatte|ground|base_?plate)/i.test(name)

export const sollEntfallen = (name: string): boolean => istGeruestKnoten(name) || istSockelKnoten(name)

/** Knoten des Turmkörpers (für die automatische Ausrichtung am Gerüst). */
export const istTurmKoerperKnoten = (name: string): boolean => /turm.*(baukörper|baukoerper|schaft|körper|koerper)|tower.*(body|shaft)/i.test(name)
