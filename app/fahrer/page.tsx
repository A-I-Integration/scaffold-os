'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Vehicle { id: string; name: string; license_plate: string; }
interface Driver { id: string; name: string; }
interface TransportOrder { inventory?: { name: string }; quantity: number; }
interface Stop { id: string; stop_order: number; address: string; status: string; transport_order: TransportOrder | null; estimated_arrival: string; actual_arrival: string; }
interface Tour { id: string; name: string; status: string; planned_date: string; planned_start_time: string; vehicle: Vehicle | null; driver: Driver | null; stops: Stop[]; }

export default function FahrerAppPage() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsPosition, setGpsPosition] = useState<{lat: number; lng: number} | null>(null);
  const [gpsError, setGpsError] = useState('');
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);

  async function loadTours() {
    setLoading(true);
    try {
      const res = await fetch('/api/tours?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        const active = (json.tours || []).filter((t: Tour) => t.status === 'planned' || t.status === 'in_progress');
        setTours(active);
        if (active.length === 1 && !activeTour) setActiveTour(active[0]);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  useEffect(() => {
    loadTours();
    const interval = setInterval(loadTours, 30000);
    return () => clearInterval(interval);
  }, []);

  // GPS-Tracking
  const startGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsError('Geolocation nicht unterstützt'); return; }
    setGpsEnabled(true); setGpsError('');
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        setGpsPosition({ lat: latitude, lng: longitude });
        const now = Date.now();
        if (now - lastSentRef.current < 30000) return;
        lastSentRef.current = now;
        const vid = activeTour?.vehicle?.id;
        const did = activeTour?.driver?.id;
        if (vid) {
          try {
            await fetch('/api/gps', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vehicle_id: vid, driver_id: did, lat: latitude, lng: longitude, accuracy, speed, heading }),
            });
          } catch (e) { console.error('GPS send failed:', e); }
        }
      },
      (err) => { setGpsError('GPS-Fehler: ' + err.message); setGpsEnabled(false); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, [activeTour]);

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setGpsEnabled(false);
  }, []);

  useEffect(() => { return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); }; }, []);

  async function updateStopStatus(stopId: string, status: string) {
    try {
      const res = await fetch('/api/tour-stops', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stopId, status, actual_arrival: status === 'completed' ? new Date().toISOString() : undefined }),
      });
      const json = await res.json(); if (!json.success) throw new Error(json.error);
      loadTours();
      if (activeTour) {
        const updatedStops = activeTour.stops.map(s => s.id === stopId ? { ...s, status, actual_arrival: status === 'completed' ? new Date().toISOString() : s.actual_arrival } : s);
        setActiveTour({ ...activeTour, stops: updatedStops });
      }
    } catch (err: any) { alert('Fehler: ' + err.message); }
  }

  async function startTour() {
    if (!activeTour) return;
    try {
      const res = await fetch('/api/tours', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeTour.id, status: 'in_progress' }),
      });
      const json = await res.json(); if (!json.success) throw new Error(json.error);
      loadTours(); setActiveTour({ ...activeTour, status: 'in_progress' }); startGPS();
    } catch (err: any) { alert('Fehler: ' + err.message); }
  }

  async function completeTour() {
    if (!activeTour) return;
    try {
      const res = await fetch('/api/tours', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeTour.id, status: 'completed', completed_at: new Date().toISOString() }),
      });
      const json = await res.json(); if (!json.success) throw new Error(json.error);
      stopGPS(); loadTours(); setActiveTour(null);
    } catch (err: any) { alert('Fehler: ' + err.message); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-[#1d1d1f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8590c]"></div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // TOUR-AUSWAHL
  // ═══════════════════════════════════════════════════════════
  if (!activeTour) {
    return (
      <div className="min-h-screen bg-white text-[#1d1d1f] p-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-[#e8590c] mb-2">🚛 Fahrer-App</h1>
          <p className="text-[#86868b] text-sm mb-6">Wähle deine aktuelle Tour</p>
          {tours.length === 0 ? (
            <div className="bg-[#f5f5f7] rounded-xl p-8 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-[#424245]">Keine aktiven Touren</p>
              <p className="text-sm text-[#86868b] mt-1">Aktualisiert automatisch alle 30 Sekunden</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tours.map(tour => (
                <button key={tour.id} onClick={() => setActiveTour(tour)} className="w-full text-left bg-[#f5f5f7] hover:bg-black/10 border border-black/10 rounded-xl p-4 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[#1d1d1f]">{tour.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${tour.status === 'in_progress' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-amber-950'}`}>
                      {tour.status === 'in_progress' ? '🔴 Unterwegs' : '📋 Geplant'}
                    </span>
                  </div>
                  <div className="text-sm text-[#86868b]">{tour.planned_date} {tour.planned_start_time}</div>
                  <div className="text-xs text-[#86868b] mt-1">{tour.vehicle?.name || 'Kein Fahrzeug'} | {tour.stops?.length || 0} Stopps</div>
                </button>
              ))}
            </div>
          )}
          <button onClick={loadTours} className="w-full mt-4 py-3 bg-black/10 hover:bg-black/15 rounded-xl text-sm font-medium transition-colors">🔄 Aktualisieren</button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // AKTIVE TOUR
  // ═══════════════════════════════════════════════════════════
  const pendingStops = activeTour.stops?.filter(s => s.status === 'pending') || [];
  const completedStops = activeTour.stops?.filter(s => s.status === 'completed') || [];
  const currentStop = pendingStops[0];

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]">
      <div className="bg-[#f5f5f7] border-b border-black/10 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => { stopGPS(); setActiveTour(null); }} className="text-[#86868b] text-sm">← Zurück</button>
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${activeTour.status === 'in_progress' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-amber-950'}`}>
            {activeTour.status === 'in_progress' ? '🔴 Unterwegs' : '📋 Geplant'}
          </span>
        </div>
        <h1 className="text-lg font-bold text-[#1d1d1f] truncate">{activeTour.name}</h1>
        <div className="text-xs text-[#86868b]">{activeTour.vehicle?.name || '–'} ({activeTour.vehicle?.license_plate || '–'}) | {completedStops.length}/{activeTour.stops?.length || 0} Stopps</div>
      </div>

      {gpsEnabled && gpsPosition && (
        <div className="bg-blue-50 border-b border-blue-200/50 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-blue-700">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>
            GPS aktiv: {gpsPosition.lat.toFixed(5)}, {gpsPosition.lng.toFixed(5)}
          </div>
          <button onClick={stopGPS} className="text-xs text-blue-600 hover:text-blue-700">Stoppen</button>
        </div>
      )}
      {gpsError && <div className="bg-red-50 border-b border-red-200/50 px-4 py-2 text-xs text-red-700">{gpsError}</div>}

      <div className="p-4 max-w-md mx-auto space-y-4">
        {activeTour.status === 'planned' && (
          <button onClick={startTour} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white text-lg transition-colors">🚀 Tour starten & GPS aktivieren</button>
        )}

        {currentStop && (
          <div className="bg-[#f5f5f7] border-2 border-[#e8590c]/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center font-bold text-sm">{currentStop.stop_order}</span>
              <div><div className="text-xs text-[#e8590c] font-bold uppercase tracking-wider">Nächster Stopp</div><div className="text-lg font-bold text-[#1d1d1f]">{currentStop.address}</div></div>
            </div>
            {currentStop.transport_order && (
              <div className="bg-black/10/50 rounded-xl p-3 mb-4">
                <div className="text-sm text-[#424245]">📦 {currentStop.transport_order.inventory?.name || '–'}</div>
                <div className="text-xs text-[#86868b]">Menge: {currentStop.transport_order.quantity} Stk</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStop.address)}`} target="_blank" rel="noopener noreferrer" className="py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white text-center transition-colors">🗺️ Navigation</a>
              <button onClick={() => updateStopStatus(currentStop.id, 'completed')} className="py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white transition-colors">✅ Abgeschlossen</button>
            </div>
          </div>
        )}

        {pendingStops.length === 0 && activeTour.status === 'in_progress' && (
          <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-6 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-green-300 font-bold text-lg">Alle Stopps abgeschlossen!</p>
            <button onClick={completeTour} className="w-full mt-4 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white transition-colors">Tour abschließen</button>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[#86868b] uppercase tracking-wider">Stopps</h3>
          {activeTour.stops?.map((stop) => (
            <div key={stop.id} className={`flex items-center gap-3 p-3 rounded-xl border ${stop.status === 'completed' ? 'bg-emerald-50 border-emerald-200' : stop.id === currentStop?.id ? 'bg-orange-50 border-[#e8590c]/30' : 'bg-[#f5f5f7] border-black/10'}`}>
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${stop.status === 'completed' ? 'bg-green-500 text-white' : 'bg-black/10 text-[#86868b]'}`}>{stop.stop_order}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${stop.status === 'completed' ? 'text-green-300 line-through' : 'text-[#1d1d1f]'}`}>{stop.address}</div>
                {stop.transport_order && <div className="text-xs text-[#86868b]">{stop.transport_order.inventory?.name || '–'} ({stop.transport_order.quantity} Stk)</div>}
              </div>
              <span className="text-lg">{stop.status === 'completed' ? '✅' : '⏳'}</span>
            </div>
          ))}
        </div>

        <button onClick={() => { stopGPS(); setActiveTour(null); }} className="w-full py-3 bg-black/10 hover:bg-black/15 rounded-xl text-sm font-medium transition-colors">← Zurück zur Tour-Auswahl</button>
      </div>
    </div>
  );
}