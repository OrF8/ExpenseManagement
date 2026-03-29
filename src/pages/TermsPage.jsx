/**
 * Terms of Service page.
 */
import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950" dir="ltr">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
              ₪
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">ExpenseManagement</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Effective date: March 29, 2025</p>

        <div className="prose-sm text-gray-700 dark:text-gray-300 space-y-6 leading-relaxed">
          <p>
            Welcome to ExpenseManagement. By accessing or using the application, you agree to these Terms of Service.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Use of the Service</h2>
            <p>
              ExpenseManagement is provided as a shared expense management application for personal or internal
              organizational use. You agree to use the service only in a lawful and responsible manner.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">2. User Accounts</h2>
            <p className="mb-2">
              You are responsible for maintaining the confidentiality of your account and for activities that occur
              under your account.
            </p>
            <p>You agree to provide accurate information when creating and using your account.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              3. Collaborative Features
            </h2>
            <p className="mb-2">
              The service allows users to create shared boards and collaborate with others. By using shared boards, you
              understand that content you submit to a board may be visible to other board members.
            </p>
            <p>
              You are responsible for the content you submit and for inviting collaborators appropriately.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">4. Prohibited Conduct</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>use the service for unlawful, fraudulent, or abusive purposes,</li>
              <li>attempt to gain unauthorized access to data, accounts, or systems,</li>
              <li>interfere with the operation or security of the service,</li>
              <li>upload or submit content that violates applicable law or the rights of others.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">5. Service Availability</h2>
            <p className="mb-2">
              We may modify, suspend, or discontinue all or part of the service at any time, with or without notice.
            </p>
            <p>We do not guarantee uninterrupted or error-free operation.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">6. No Financial Advice</h2>
            <p>
              ExpenseManagement is a tool for recording and managing information. It does not provide financial, legal,
              tax, or accounting advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              7. Disclaimer of Warranties
            </h2>
            <p>
              The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, without
              warranties of any kind to the maximum extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              8. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, we will not be liable for indirect, incidental, special,
              consequential, or punitive damages, or for loss of data, profits, or business opportunities arising from
              use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">9. Termination</h2>
            <p>
              We may suspend or terminate access to the service if we reasonably believe a user has violated these
              Terms or created risk for the service or its users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              10. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. Continued use of the service after an update means the
              updated Terms will apply.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">11. Contact</h2>
            <p>
              For questions about these Terms, please contact:{' '}
              <a
                href="mailto:expensemanagementwebsite@gmail.com"
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                expensemanagementwebsite@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
