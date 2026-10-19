// GENERIERT aus lib/cad/punktwolke-teile.ts – nicht von Hand ändern (npm run build:worker-teile)
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/cad/punktwolke-teile.ts
var punktwolke_teile_exports = {};
__export(punktwolke_teile_exports, {
  teileAusPunkten: () => teileAusPunkten
});
module.exports = __toCommonJS(punktwolke_teile_exports);

// lib/cad/grundriss-erkennung.ts
function huelle(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const kreuz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const unten = [];
  for (const q of p) {
    while (unten.length >= 2 && kreuz(unten[unten.length - 2], unten[unten.length - 1], q) <= 0) unten.pop();
    unten.push(q);
  }
  const oben = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (oben.length >= 2 && kreuz(oben[oben.length - 2], oben[oben.length - 1], q) <= 0) oben.pop();
    oben.push(q);
  }
  unten.pop();
  oben.pop();
  return unten.concat(oben);
}
function hauptrichtung(pts) {
  const h = huelle(pts);
  if (h.length < 3) return 0;
  let besteA = Infinity, besterW = 0;
  for (let g = 0; g < 90; g += 0.5) {
    const w = g * Math.PI / 180, c = Math.cos(w), s = Math.sin(w);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, z] of h) {
      const u = x * c + z * s, v = -x * s + z * c;
      if (u < minX) minX = u;
      if (u > maxX) maxX = u;
      if (v < minY) minY = v;
      if (v > maxY) maxY = v;
    }
    const a = (maxX - minX) * (maxY - minY);
    if (a < besteA - 1e-9) {
      besteA = a;
      besterW = w;
    }
  }
  return besterW;
}
function dilatiere(m, nx, ny, r) {
  const aus = new Uint8Array(m.length);
  const t = new Uint8Array(m.length);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!m[y * nx + x]) continue;
    for (let d = -r; d <= r; d++) {
      const xx = x + d;
      if (xx >= 0 && xx < nx) t[y * nx + xx] = 1;
    }
  }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!t[y * nx + x]) continue;
    for (let d = -r; d <= r; d++) {
      const yy = y + d;
      if (yy >= 0 && yy < ny) aus[yy * nx + x] = 1;
    }
  }
  return aus;
}
function erodiere(m, nx, ny, r) {
  const inv = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1;
  const gross = dilatiere(inv, nx, ny, r);
  const aus = new Uint8Array(m.length);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (!m[y * nx + x]) continue;
    if (x < r || y < r || x >= nx - r || y >= ny - r) continue;
    if (!gross[y * nx + x]) aus[y * nx + x] = 1;
  }
  return aus;
}
function fuelleInneres(m, nx, ny) {
  const aussen = new Uint8Array(m.length);
  const stapel = [];
  const start = (x, y) => {
    const i = y * nx + x;
    if (!m[i] && !aussen[i]) {
      aussen[i] = 1;
      stapel.push(i);
    }
  };
  for (let x = 0; x < nx; x++) {
    start(x, 0);
    start(x, ny - 1);
  }
  for (let y = 0; y < ny; y++) {
    start(0, y);
    start(nx - 1, y);
  }
  while (stapel.length) {
    const i = stapel.pop();
    const x = i % nx, y = (i - x) / nx;
    if (x > 0) start(x - 1, y);
    if (x < nx - 1) start(x + 1, y);
    if (y > 0) start(x, y - 1);
    if (y < ny - 1) start(x, y + 1);
  }
  const aus = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) aus[i] = aussen[i] ? 0 : 1;
  return aus;
}
function groessteInsel(m, nx, ny) {
  const label = new Int32Array(m.length);
  let besteL = 0, besteGr = 0, l = 0;
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || label[s]) continue;
    l++;
    let gr = 0;
    const stapel = [s];
    label[s] = l;
    while (stapel.length) {
      const i = stapel.pop();
      gr++;
      const x = i % nx, y = (i - x) / nx;
      const nb = [x > 0 ? i - 1 : -1, x < nx - 1 ? i + 1 : -1, y > 0 ? i - nx : -1, y < ny - 1 ? i + nx : -1];
      for (const j of nb) if (j >= 0 && m[j] && !label[j]) {
        label[j] = l;
        stapel.push(j);
      }
    }
    if (gr > besteGr) {
      besteGr = gr;
      besteL = l;
    }
  }
  const aus = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) if (label[i] === besteL && besteL) aus[i] = 1;
  return aus;
}

// lib/cad/baukoerper-erkennung.ts
var MAX_RASTER = 520;
var MIN_ZELLE_M = 0.1;
function rasterHoehe(tris, m, hk, nx, ny, ox, oy, c) {
  const setze = (ix, iy, h) => {
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
    const i = iy * nx + ix;
    m[i] = 1;
    if (h > hk[i]) hk[i] = h;
  };
  for (const t of tris) {
    const px = [(t[0] - ox) / c, (t[3] - ox) / c, (t[6] - ox) / c];
    const py = [(t[1] - oy) / c, (t[4] - oy) / c, (t[7] - oy) / c];
    const ph = [t[2], t[5], t[8]];
    for (let e = 0; e < 3; e++) {
      const a = e, b = (e + 1) % 3;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(px[b] - px[a]), Math.abs(py[b] - py[a])) * 2));
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        setze(Math.floor(px[a] + (px[b] - px[a]) * f), Math.floor(py[a] + (py[b] - py[a]) * f), ph[a] + (ph[b] - ph[a]) * f);
      }
    }
    const det = (py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2]);
    if (Math.abs(det) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(...px))), x1 = Math.min(nx - 1, Math.floor(Math.max(...px)));
    const y0 = Math.max(0, Math.floor(Math.min(...py))), y1 = Math.min(ny - 1, Math.floor(Math.max(...py)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      const l1 = ((py[1] - py[2]) * (qx - px[2]) + (px[2] - px[1]) * (qy - py[2])) / det;
      const l2 = ((py[2] - py[0]) * (qx - px[2]) + (px[0] - px[2]) * (qy - py[2])) / det;
      const l3 = 1 - l1 - l2;
      if (l1 >= 0 && l2 >= 0 && l3 >= 0) setze(x, y, l1 * ph[0] + l2 * ph[1] + l3 * ph[2]);
    }
  }
}
var median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
function erkenneBaukoerper(tris) {
  if (tris.length < 2) return null;
  const alle = [];
  for (const t of tris) alle.push([t[0], t[1]], [t[3], t[4]], [t[6], t[7]]);
  let w = hauptrichtung(alle);
  const drehe = (x, z, wr) => [x * Math.cos(wr) + z * Math.sin(wr), -x * Math.sin(wr) + z * Math.cos(wr)];
  const grenzen = (wr) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const [x, z] of alle) {
      const [u, v] = drehe(x, z, wr);
      if (u < a) a = u;
      if (u > b) b = u;
      if (v < c) c = v;
      if (v > d) d = v;
    }
    return { a, b, c, d };
  };
  let g = grenzen(w);
  if (g.d - g.c > g.b - g.a) {
    w += Math.PI / 2;
    g = grenzen(w);
  }
  const bu = g.b - g.a, bv = g.d - g.c;
  if (!(bu > 3 && bv > 3)) return null;
  const zelle = Math.max(MIN_ZELLE_M, Math.max(bu, bv) / MAX_RASTER);
  const luecke = Math.max(1, Math.round(0.6 / zelle));
  const glatt = Math.max(1, Math.round(0.8 / zelle));
  const rand = luecke + glatt + 3;
  const nx = Math.ceil(bu / zelle) + 2 * rand, ny = Math.ceil(bv / zelle) + 2 * rand;
  const ox = g.a - rand * zelle, oy = g.c - rand * zelle;
  const gedreht = tris.map((t) => {
    const p1 = drehe(t[0], t[1], w), p2 = drehe(t[3], t[4], w), p3 = drehe(t[6], t[7], w);
    return [p1[0], p1[1], t[2], p2[0], p2[1], t[5], p3[0], p3[1], t[8]];
  });
  let m = new Uint8Array(nx * ny);
  const hk = new Float32Array(nx * ny).fill(-1);
  rasterHoehe(gedreht, m, hk, nx, ny, ox, oy, zelle);
  m = dilatiere(m, nx, ny, luecke);
  m = fuelleInneres(m, nx, ny);
  m = erodiere(m, nx, ny, luecke);
  m = dilatiere(erodiere(m, nx, ny, glatt), nx, ny, glatt);
  m = erodiere(dilatiere(m, nx, ny, glatt), nx, ny, glatt);
  m = groessteInsel(m, nx, ny);
  for (let pass = 0; pass < luecke + glatt + 40; pass++) {
    let geaendert = false;
    const neu = hk.slice();
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      if (!m[i] || hk[i] >= 0) continue;
      let best = -1;
      if (x > 0 && hk[i - 1] > best) best = hk[i - 1];
      if (x < nx - 1 && hk[i + 1] > best) best = hk[i + 1];
      if (y > 0 && hk[i - nx] > best) best = hk[i - nx];
      if (y < ny - 1 && hk[i + nx] > best) best = hk[i + nx];
      if (best >= 0) {
        neu[i] = best;
        geaendert = true;
      }
    }
    hk.set(neu);
    if (!geaendert) break;
  }
  const spalten = [];
  for (let x = 0; x < nx; x++) {
    let vmin = -1, vmax = -1, top = 0, n = 0;
    for (let y = 0; y < ny; y++) {
      const i = y * nx + x;
      if (!m[i]) continue;
      if (vmin < 0) vmin = y;
      vmax = y;
      n++;
      if (hk[i] > top) top = hk[i];
    }
    if (vmin < 0) {
      spalten.push(null);
      continue;
    }
    const rd = (y) => Math.max(0, hk[y * nx + x]);
    const a = Math.min(rd(vmin), rd(Math.min(vmax, vmin + 1)));
    const b = Math.min(rd(vmax), rd(Math.max(vmin, vmax - 1)));
    spalten.push({ vmin, vmax, eave: Math.min(a, b), top, n });
  }
  const xs = spalten.map((s, i) => s ? i : -1).filter((i) => i >= 0);
  if (xs.length < 4) return null;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const tolV = Math.max(2, Math.round(0.7 / zelle));
  const tolH = 1.5;
  let streifen = [];
  let start = x0;
  const ref = (a, b, key) => median(spalten.slice(a, b + 1).filter((s) => !!s).map((s) => s[key]));
  for (let x = x0 + 1; x <= x1 + 1; x++) {
    const s = x <= x1 ? spalten[x] : null;
    let trennen = x > x1 || !s;
    if (!trennen && s) {
      const a = Math.max(start, x - 6);
      trennen = Math.abs(s.vmin - ref(a, x - 1, "vmin")) > tolV || Math.abs(s.vmax - ref(a, x - 1, "vmax")) > tolV || Math.abs(s.eave - ref(a, x - 1, "eave")) > tolH;
    }
    if (trennen) {
      streifen.push({ von: start, bis: x - 1 });
      start = x;
    }
  }
  const minBreite = Math.max(2, Math.round(2 / zelle));
  for (let runde = 0; runde < 50; runde++) {
    const k = streifen.findIndex((s) => s.bis - s.von + 1 < minBreite);
    if (k < 0 || streifen.length < 2) break;
    const kandidaten = [k - 1, k + 1].filter((i) => i >= 0 && i < streifen.length);
    const abstand = (i) => {
      const s = streifen[i], t = streifen[k];
      return Math.abs(ref(s.von, s.bis, "eave") - ref(t.von, t.bis, "eave")) + Math.abs(ref(s.von, s.bis, "vmin") - ref(t.von, t.bis, "vmin")) * zelle + Math.abs(ref(s.von, s.bis, "vmax") - ref(t.von, t.bis, "vmax")) * zelle;
    };
    const j = kandidaten.sort((p, q) => abstand(p) - abstand(q))[0];
    const a = Math.min(j, k), b = Math.max(j, k);
    streifen.splice(a, 2, { von: streifen[a].von, bis: streifen[b].bis });
  }
  const gleich = (s, t) => Math.abs(ref(s.von, s.bis, "vmin") - ref(t.von, t.bis, "vmin")) <= tolV && Math.abs(ref(s.von, s.bis, "vmax") - ref(t.von, t.bis, "vmax")) <= tolV && Math.abs(ref(s.von, s.bis, "eave") - ref(t.von, t.bis, "eave")) <= tolH;
  streifen = streifen.reduce((acc, s) => {
    const l = acc[acc.length - 1];
    if (l && gleich(l, s)) l.bis = s.bis;
    else acc.push({ ...s });
    return acc;
  }, []);
  const gv0 = Math.min(...streifen.map((s) => ref(s.von, s.bis, "vmin")));
  const gv1 = Math.max(...streifen.map((s) => ref(s.von, s.bis, "vmax")));
  const mitteGesamt = (gv0 + gv1 + 1) / 2;
  const hinweise = [];
  const teile = streifen.map((s) => {
    const vmin = ref(s.von, s.bis, "vmin"), vmax = ref(s.von, s.bis, "vmax");
    const tiefe = (vmax - vmin + 1) * zelle;
    const mitte = (vmin + vmax + 1) / 2;
    const eave = ref(s.von, s.bis, "eave");
    let top = 0, anzahl = 0, oben = 0;
    const spitzen = [];
    const trim = s.bis - s.von + 1 >= Math.round(3 / zelle) ? Math.max(2, Math.round(0.5 / zelle)) : 0;
    for (let x = s.von + trim; x <= s.bis - trim; x++) for (let y = 0; y < ny; y++) {
      const i = y * nx + x;
      if (m[i]) {
        anzahl++;
        if (hk[i] > top) top = hk[i];
        spitzen.push(hk[i]);
      }
    }
    const dach = Math.max(0, top - eave);
    const laenge = (s.bis - s.von + 1) * zelle;
    let form = "flachdach";
    if (dach >= 1) {
      const schwelle = eave + dach * 0.7;
      for (const h of spitzen) if (h >= schwelle) oben++;
      const anteil = oben / Math.max(1, anzahl);
      form = anteil < 0.2 && Math.max(laenge, tiefe) / Math.min(laenge, tiefe) <= 1.8 ? "walmdach" : "satteldach";
    }
    return {
      laengeM: Math.round(laenge * 10) / 10,
      tiefeM: Math.round(tiefe * 10) / 10,
      versatzM: Math.round((mitte - mitteGesamt) * zelle * 10) / 10,
      hoeheM: Math.round((form === "flachdach" ? Math.max(eave, top) : eave) * 10) / 10,
      dachHoeheM: form === "flachdach" ? 0 : Math.round(dach * 10) / 10,
      dachForm: form
    };
  });
  const gesamtH = Math.max(...teile.map((t) => t.hoeheM + t.dachHoeheM));
  const hoeheMin = Math.min(...teile.map((t) => t.hoeheM + t.dachHoeheM));
  const tiefeMax = Math.max(...teile.map((t) => t.tiefeM));
  const mehrteilig = teile.length >= 2 && (gesamtH - hoeheMin > 2 || Math.max(...teile.map((t) => t.tiefeM)) - Math.min(...teile.map((t) => t.tiefeM)) > 1.5);
  let turmIndex = null;
  if (teile.length >= 2) {
    const hoehen = teile.map((t) => t.hoeheM + t.dachHoeheM);
    const hi = hoehen.indexOf(Math.max(...hoehen));
    const zweit = Math.max(...hoehen.filter((_, i) => i !== hi));
    const flaeche = (t) => t.laengeM * t.tiefeM;
    if (hoehen[hi] >= 1.4 * zweit && flaeche(teile[hi]) < Math.max(...teile.map(flaeche))) turmIndex = hi;
  }
  if (zelle > 0.4) hinweise.push(`Raster ${zelle.toFixed(2)} m \u2013 Ma\xDFe sind auf etwa ${(zelle * 100).toFixed(0)} cm genau.`);
  return {
    teile,
    tiefeMaxM: Math.round(tiefeMax * 10) / 10,
    laengeM: Math.round(teile.reduce((t, x) => t + x.laengeM, 0) * 10) / 10,
    gesamtHoeheM: Math.round(gesamtH * 10) / 10,
    turmIndex,
    mehrteilig,
    genauigkeitM: Math.round(zelle * 100) / 100,
    hinweise
  };
}

// lib/cad/modell-analyse.ts
var minVon = (l) => {
  let m = Infinity;
  for (const t of l) for (const k of [2, 5, 8]) if (t[k] < m) m = t[k];
  return m;
};
var prozentil = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : 0;
};
function bereinigeDreiecke(tris) {
  const hinweise = [];
  if (tris.length < 10) return { tris, hinweise };
  const cx = tris.map((t) => (t[0] + t[3] + t[6]) / 3), cz = tris.map((t) => (t[1] + t[4] + t[7]) / 3);
  const spanne = (a) => {
    const lo = prozentil(a, 0.1), hi = prozentil(a, 0.9), r = Math.max(hi - lo, 1);
    return { lo: lo - 2 * r, hi: hi + 2 * r };
  };
  const sx = spanne(cx), sz = spanne(cz);
  let rest = tris.filter((_, i) => cx[i] >= sx.lo && cx[i] <= sx.hi && cz[i] >= sz.lo && cz[i] <= sz.hi);
  if (rest.length < tris.length) hinweise.push(`${tris.length - rest.length} Dreiecke weit au\xDFerhalb des Geb\xE4udes wurden ignoriert.`);
  const minH = minVon(rest);
  const tol = 0.05;
  const istBoden = (t) => Math.max(t[2], t[5], t[8]) - minH <= tol;
  const boden = rest.filter(istBoden), uebrige = rest.filter((t) => !istBoden(t));
  if (boden.length > 0 && uebrige.length > 0) {
    const box = (l) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const t of l) for (const k of [0, 3, 6]) {
        x0 = Math.min(x0, t[k]);
        x1 = Math.max(x1, t[k]);
        z0 = Math.min(z0, t[k + 1]);
        z1 = Math.max(z1, t[k + 1]);
      }
      return { b: x1 - x0, t: z1 - z0 };
    };
    const bb = box(boden), bu = box(uebrige);
    if (bb.b > bu.b * 1.1 || bb.t > bu.t * 1.1) {
      rest = uebrige;
      hinweise.push("Eine Bodenplatte unter dem Geb\xE4ude wurde ignoriert.");
    }
  }
  return { tris: rest, hinweise };
}
function teilModell(e, quelle) {
  const gesamtL = e.teile.reduce((s, t) => s + t.laengeM, 0);
  let pos = -gesamtL / 2;
  const flaeche = (t) => t.laengeM * t.tiefeM;
  const groesster = e.teile.reduce((best, t, i) => flaeche(t) > flaeche(e.teile[best]) ? i : best, 0);
  return e.teile.map((t, i) => {
    const x0 = pos, x1 = pos + t.laengeM;
    pos = x1;
    const z0 = t.versatzM - t.tiefeM / 2, z1 = t.versatzM + t.tiefeM / 2;
    const typ = e.turmIndex === i ? "turm" : i === groesster ? "schiff" : "anbau";
    return {
      id: `teil-${i + 1}`,
      typ,
      laengeM: t.laengeM,
      tiefeM: t.tiefeM,
      hoeheM: t.hoeheM,
      dachForm: t.dachForm,
      dachHoeheM: t.dachHoeheM,
      versatzM: t.versatzM,
      startM: Math.round(x0 * 10) / 10,
      grundriss: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }].map((p) => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 })),
      quelle
    };
  });
}
function analysierePunkte(px, py, pz) {
  const n = pz.length;
  if (n < 50) return null;
  const h = Array.from(pz);
  const h0 = prozentil(h, 5e-3);
  const tris = [];
  for (let i = 0; i < n; i++) {
    const hh = Math.max(0, pz[i] - h0);
    tris.push([px[i], py[i], hh, px[i], py[i], hh, px[i], py[i], hh]);
  }
  const { tris: sauber, hinweise } = bereinigeDreiecke(tris);
  const ohneBoden = sauber.filter((t) => t[2] > 0.3);
  const ergebnis = erkenneBaukoerper(ohneBoden.length > 50 ? ohneBoden : sauber);
  if (!ergebnis) return null;
  return { einheit: "m", oben: "z", einheitGeschaetzt: false, teile: teilModell(ergebnis, "ply"), ergebnis, hinweise: [...hinweise, ...ergebnis.hinweise] };
}

// lib/cad/punktwolke-teile.ts
function teileAusPunkten(px, py, pz) {
  const a = analysierePunkte(px, py, pz);
  if (!a) return null;
  return { teile: a.teile, mehrteilig: a.ergebnis.mehrteilig, gesamtHoeheM: a.ergebnis.gesamtHoeheM, tiefeMaxM: a.ergebnis.tiefeMaxM, laengeM: a.ergebnis.laengeM, hinweise: a.hinweise };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  teileAusPunkten
});
