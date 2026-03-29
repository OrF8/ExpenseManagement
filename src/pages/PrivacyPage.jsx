/**
 * Privacy Policy page.
 */
import { Link } from 'react-router-dom';

export function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Effective date: March 29, 2025</p>

        <div className="prose-sm text-gray-700 dark:text-gray-300 space-y-6 leading-relaxed">
          <p>
            ExpenseManagement (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) provides a shared expense
            management application that allows users to create boards, invite collaborators, and manage shared
            transactions.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Information We Collect</h2>
            <p className="mb-2">We may collect and store the following information:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Account information, such as email address, nickname, and authentication-related identifiers.</li>
              <li>
                Board and collaboration information, such as board titles, ownership, membership, and invitations.
              </li>
              <li>
                Transaction information, such as transaction name, amount, comments, payment type, installments, and
                related metadata entered by users.
              </li>
              <li>
                Technical and security information reasonably necessary to operate, secure, and improve the service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">2. How We Use Information</h2>
            <p className="mb-2">We use information to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>create and manage user accounts,</li>
              <li>authenticate users,</li>
              <li>enable board collaboration,</li>
              <li>store and display transactions,</li>
              <li>send or manage invitations,</li>
              <li>maintain security and prevent abuse,</li>
              <li>operate, maintain, and improve the application.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              3. Shared Content and Collaboration
            </h2>
            <p className="mb-2">
              This is a collaborative application. Information added to a shared board may be visible to other members
              of that board, including transaction details and member identity information such as nickname and email
              address.
            </p>
            <p>Users are responsible for exercising care when adding information to shared boards.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">4. Invitations</h2>
            <p>
              When a user invites another person to a board, we may store the invited email address and invitation
              metadata in order to manage the invitation process and board access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              5. Data Storage and Processing
            </h2>
            <p>
              Data is stored and processed using Firebase and related Google Cloud services. As a result, information
              may be processed and stored on infrastructure operated by Google and may be transferred or stored outside
              the user&rsquo;s country of residence.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">6. Data Retention</h2>
            <p>
              We retain information for as long as reasonably necessary to operate the service, comply with legal
              obligations, resolve disputes, and enforce our agreements, unless deletion is requested and technically
              feasible.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">7. Your Rights</h2>
            <p>
              Depending on applicable law, users may have rights to request access, correction, or deletion of their
              personal data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              8. Account and Data Deletion
            </h2>
            <p>
              If account deletion functionality is available in the app, users may use it to remove their account. If
              not, users may submit a deletion request by contacting us at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">9. Children</h2>
            <p>
              This service is not intended for children under the age required by applicable law to consent to data
              processing in their jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              10. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Continued use of the service after an update means
              the updated policy will apply.
            </p>
          </section>

          <p className="pt-2 text-sm text-gray-500 dark:text-gray-400">
            For questions or deletion requests, please contact:{' '}
            <a
              href="mailto:expensemanagementwebsite@gmail.com"
              className="text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              expensemanagementwebsite@gmail.com
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
