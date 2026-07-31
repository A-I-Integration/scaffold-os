export default function AufmassPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">📏 Digitales Aufmaß</h1>
      <p className="text-slate-400 mb-8">Baustelle: Schritt 1 von 6</p>
      
      <div className="bg-slate-800 rounded-xl p-6 max-w-md">
        <label className="block text-sm font-medium mb-2">Name des Ansprechpartners</label>
        <input 
          type="text" 
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          placeholder="z.B. Herr Müller"
        />
        
        <button className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg transition">
          Weiter →
        </button>
      </div>
    </div>
  );
}