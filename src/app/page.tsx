import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="relative isolate overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#6366f1] to-[#a855f7] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 text-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-8">
          <span>⚡ Phase 1 Active &bull; Excel Onboarding & Cron Engine</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto">
          Autonomous AI Internship <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            Review & Mentorship
          </span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Replaces manual internship management with full autonomy: upload student rosters, auto-generate domain tasks via Gemini, dispatch congratulatory invites, and conduct AI voice meetings right inside this web app.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/admin"
            className="px-8 py-3.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30 hover:scale-[1.02] flex items-center space-x-2 text-base"
          >
            <span>Launch Admin Portal</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>

          <a
            href="/sample-interns.xlsx"
            download
            className="px-6 py-3.5 rounded-xl font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition-all hover:text-white flex items-center space-x-2 text-base"
          >
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Get Sample Excel File</span>
          </a>
        </div>

        {/* 3 Phases Roadmap Cards */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="glass-panel p-6 rounded-2xl border-indigo-500/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 px-3 py-1 bg-indigo-500/20 text-indigo-300 text-[10px] font-bold rounded-bl-lg border-l border-b border-indigo-500/30">
              CURRENT PHASE
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-lg mb-4">
              01
            </div>
            <h3 className="text-lg font-bold text-white">Foundation & Onboarding</h3>
            <p className="mt-2 text-sm text-slate-400">
              Prisma SQLite schema, Excel parser, Gemini domain task templates, congratulations email dispatch with meeting tokens & OTP, and minute-by-minute node-cron engine.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border-slate-800 opacity-80">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-lg mb-4">
              02
            </div>
            <h3 className="text-lg font-bold text-white">In-App Voice Orientation</h3>
            <p className="mt-2 text-sm text-slate-400">
              Call-style room UI at <code className="text-xs text-purple-300">/meet/[token]</code>, 6-digit OTP verification, animated voice orb, Web Speech API speech synthesis & recognition, and Q&A handling.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border-slate-800 opacity-80">
            <div className="w-10 h-10 rounded-lg bg-pink-600/20 text-pink-400 flex items-center justify-center font-bold text-lg mb-4">
              03
            </div>
            <h3 className="text-lg font-bold text-white">Review & Certification</h3>
            <p className="mt-2 text-sm text-slate-400">
              Work submission (GitHub API, PDF/DOCX parsing), Gemini automated evaluation JSON scoring, spoken mentor feedback, next review scheduling, and certificate PDF generation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
