import Link from 'next/link';

export default function HomePage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-blue-600"></span>
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            CampusVoice
          </span>
        </div>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          Institutional grievance and community advocacy portal. Project setup initialized.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/api/health"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Check Health Status
          </Link>
        </div>
      </div>
    </main>
  );
}
