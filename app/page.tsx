export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
      <h1 className="text-4xl font-bold mb-4">🏗️ SCAFFOLD OS</h1>
      <p className="text-slate-400 mb-8 text-center max-w-md">
        Das Betriebssystem für den Gerüstbau.<br />
        Digitales Aufmaß, KI-Planung, Materialoptimierung.
      </p>
      <a 
        href="/aufmass" 
        className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-8 rounded-lg transition text-lg"
      >
        📏 Digitales Aufmaß starten →
      </a>
    </div>
  );
}