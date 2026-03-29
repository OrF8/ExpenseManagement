/**
 * Authentication page with sign-in and sign-up tabs.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp, signInWithGoogle, resetPassword } from '../firebase/auth';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import logoHorizontal from '../assets/logo-horizontal-filled.png';

function getHebrewError(code) {
  const map = {
    'auth/user-not-found': 'משתמש לא נמצא',
    'auth/wrong-password': 'סיסמה שגויה',
    'auth/invalid-credential': 'אימייל או סיסמה שגויים',
    'auth/email-already-in-use': 'כתובת אימייל כבר קיימת במערכת',
    'auth/weak-password': 'הסיסמה חלשה מדי (לפחות 6 תווים)',
    'auth/invalid-email': 'כתובת אימייל לא תקינה',
    'auth/popup-closed-by-user': 'ההתחברות בוטלה',
    'auth/too-many-requests': 'יותר מדי ניסיונות. נסה שוב מאוחר יותר',
  };
  return map[code] || 'שגיאה בהתחברות. נסה שוב';
}

function getHebrewResetError(code) {
  const map = {
    'auth/invalid-email': 'כתובת אימייל לא תקינה',
    'auth/too-many-requests': 'יותר מדי ניסיונות. נסה שוב מאוחר יותר',
    'auth/user-not-found': 'שגיאה בשליחת הדואר. נסה שוב',
  };
  return map[code] || 'שגיאה בשליחת הדואר. נסה שוב';
}

export function AuthPage() {
  const [tab, setTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);
  const [resetError, setResetError] = useState(null);

  function openResetModal() {
    setResetEmail(email.trim());
    setResetMessage(null);
    setResetError(null);
    setShowResetModal(true);
  }

  function closeResetModal() {
    setShowResetModal(false);
    setResetMessage(null);
    setResetError(null);
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    const trimmed = resetEmail.trim();
    if (!trimmed) {
      setResetError('יש להזין כתובת אימייל');
      return;
    }
    setResetError(null);
    setResetMessage(null);
    setResetLoading(true);
    try {
      await resetPassword(trimmed);
      setResetMessage('אם קיים חשבון עבור כתובת זו, נשלח אליה מייל לאיפוס הסיסמה.');
    } catch (err) {
      setResetError(getHebrewResetError(err.code));
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === 'signin') {
        await signIn(email, password);
      } else {
        if (!nickname.trim()) {
          setError('יש להזין כינוי');
          setLoading(false);
          return;
        }
        await signUp(email, password, nickname.trim());
      }
      navigate('/');
    } catch (err) {
      setError(getHebrewError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (err) {
      setError(getHebrewError(err.code));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src={logoHorizontal}
            alt="ניהול הוצאות – לוגו האפליקציה"
            className="h-16 w-auto mx-auto mb-2"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">מעקב פשוט אחרי הוצאות משותפות</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          {/* Tabs */}
          <div className="flex rounded-xl bg-gray-50 dark:bg-gray-900 p-1 mb-6">
            {[
              { id: 'signin', label: 'התחברות' },
              { id: 'signup', label: 'הרשמה' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setError(null); setNickname(''); }}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="אימייל"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            {tab === 'signup' && (
              <Input
                label="כינוי"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="השם שיוצג עבורך ויופיע כברירת מחדל בעסקאות"
                autoComplete="nickname"
                required
              />
            )}
            <Input
              label="סיסמה"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              required
            />
            {tab === 'signin' && (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={openResetModal}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
                >
                  שכחת סיסמה?
                </button>
              </div>
            )}
            <Button type="submit" loading={loading} className="w-full mt-1">
              {tab === 'signin' ? 'התחבר' : 'הירשם'}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-gray-800 px-3 text-xs text-gray-400 dark:text-gray-500">או</span>
            </div>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={handleGoogle}
            loading={googleLoading}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            המשך עם Google
          </Button>
        </div>
      </div>

      <Modal isOpen={showResetModal} onClose={closeResetModal} title="איפוס סיסמה">
        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס הסיסמה.
          </p>
          <Input
            label="אימייל"
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          {resetMessage && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-800 px-3 py-2.5 text-sm text-green-700 dark:text-green-400">
              {resetMessage}
            </div>
          )}
          {resetError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
              {resetError}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={closeResetModal}>
              ביטול
            </Button>
            <Button type="submit" loading={resetLoading} disabled={!!resetMessage} aria-label={resetMessage ? 'הקישור נשלח' : 'שלח קישור לאיפוס סיסמה'}>
              {resetMessage ? 'נשלח' : 'שלח קישור'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
