/**
 * Public landing page — visible to unauthenticated visitors.
 * Explains the purpose of the app and links to sign-in, privacy policy,
 * and terms of service.
 */
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-slate-900" dir="ltr">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold select-none">
              ₪
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Expense Management</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/auth"
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-16 flex flex-col items-center text-center gap-6">
        <div className="h-16 w-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-3xl font-bold select-none shadow-lg">
          ₪
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
          Expense Management
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-xl leading-relaxed">
          A simple web app for tracking and managing personal or shared expenses.
          Create boards, record transactions, and collaborate with others – all in one place.
        </p>

        <Link
          to="/auth"
          className="mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold px-8 py-3 transition-colors shadow-sm"
        >
          Get started – Sign in
        </Link>

        {/* Features */}
        <section className="mt-12 w-full grid gap-4 sm:grid-cols-2 text-left" aria-label="Key features">
          {[
            {
              icon: (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              ),
              title: 'Expense Boards',
              description: 'Create dedicated boards for any project, trip, household, or group – and keep all related expenses in one place.',
            },
            {
              icon: (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              ),
              title: 'Transaction Tracking',
              description: 'Record and organize transactions with names, amounts, payment types, installments, date and comments.',
            },
            {
              icon: (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ),
              title: 'Shared Collaboration',
              description: 'Invite others to your boards so everyone can see and track shared expenses in real time.',
            },
            {
              icon: (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ),
              title: 'Secure Sign-in',
              description: 'Sign in securely with your Google account or with an email and password, powered by Firebase Authentication.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm flex gap-4 items-start"
            >
              <div className="shrink-0 h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                {feature.icon}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{feature.title}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
