'use client';

import { useState, useEffect, useRef } from 'react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let animationId: number;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);
        // BarcodeDetector API (Chrome/Edge)
        if ('BarcodeDetector' in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ['code_128', 'ean_13', 'qr_code'] });
          const scanLoop = async () => {
            if (!videoRef.current || !scanning) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                onScan(barcodes[0].rawValue);
                stopCamera();
                return;
              }
            } catch { /* ignore */ }
            animationId = requestAnimationFrame(scanLoop);
          };
          scanLoop();
        } else {
          setError('BarcodeDetector nicht verfügbar. Bitte manuelle Eingabe nutzen.');
        }
      } catch (err: any) {
        setError('Kamera-Zugriff verweigert oder nicht verfügbar: ' + err.message);
      }
    }
    startCamera();
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }

  function handleManualSubmit() {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#f5f5f7] rounded-xl max-w-md w-full p-6 border border-black/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#1d1d1f]">📷 Barcode scannen</h3>
          <button onClick={() => { stopCamera(); onClose(); }} className="text-[#86868b] hover:text-[#1d1d1f]">✕</button>
        </div>

        {error ? (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        ) : (
          <div className="relative bg-black rounded-xl overflow-hidden mb-4" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 border-2 border-[#e8590c]/50 m-8 rounded-xl">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#e8590c]" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#e8590c]" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#e8590c]" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#e8590c]" />
            </div>
            <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-[#1d1d1f]/70">Barcode in den Rahmen halten</p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm text-[#86868b]">Oder Barcode manuell eingeben:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="z.B. BAR-001"
              className="flex-1 px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-[#1d1d1f] text-sm focus:outline-none focus:border-[#e8590c]"
              onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            />
            <button
              onClick={handleManualSubmit}
              className="px-4 py-2 bg-[#e8590c] hover:bg-[#d9480f] text-white rounded-xl text-sm font-bold text-white transition-colors"
            >
              Suchen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}