export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
      <div className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-[#334155] shadow-2xl text-center">
        <div className="text-4xl mb-4">📧</div>
        <h1 className="text-2xl font-bold text-white mb-2">Fast geschafft</h1>
        <p className="text-[#94a3b8] mb-6">
          Wir haben dir einen Bestätigungslink geschickt. Bitte prüfe dein E-Mail-Postfach und klicke auf den Link, um dein Konto zu aktivieren.
        </p>
        <a
          href="/login"
          className="inline-block py-2.5 px-6 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition"
        >
          Zum Login
        </a>
      </div>
    </div>
  )
}