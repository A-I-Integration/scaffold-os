'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface Props {
  onSave: (signatureDataUrl: string) => void;
  onCancel: () => void;
}

export default function SignaturePad({ onSave, onCancel }: Props) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  function handleClear() {
    sigRef.current?.clear();
    setIsEmpty(true);
  }

  function handleSave() {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const dataUrl = sigRef.current.toDataURL('image/png');
      onSave(dataUrl);
    }
  }

  function handleBegin() {
    setIsEmpty(false);
  }

  return (
    <div className="bg-[#f5f5f7] rounded-xl border border-black/10 p-6">
      <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">✍️ Digitale Unterschrift</h3>
      <p className="text-sm text-[#86868b] mb-4">
        Bitte unterschreiben Sie mit dem Finger oder der Maus. Die Unterschrift wird mit dem Projekt gespeichert.
      </p>
      <div className="bg-white rounded-xl overflow-hidden" style={{ touchAction: 'none' }}>
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          canvasProps={{
            width: 500,
            height: 200,
            className: 'w-full h-[200px] cursor-crosshair',
          }}
          onBegin={handleBegin}
        />
      </div>
      <div className="flex gap-3 mt-4">
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-black/10 hover:bg-black/15 rounded-xl text-sm text-[#1d1d1f] transition-colors"
        >
          🗑️ Löschen
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-black/10 hover:bg-black/15 rounded-xl text-sm text-[#1d1d1f] transition-colors"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={isEmpty}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold text-white transition-colors"
        >
          ✅ Unterschrift speichern
        </button>
      </div>
    </div>
  );
}
