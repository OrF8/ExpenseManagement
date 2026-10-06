// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthPage } from '../src/pages/AuthPage';
import { signIn, signUp, signInWithGoogle } from '../src/firebase/auth';

vi.mock('../src/firebase/auth', () => ({
  signIn: vi.fn(), signUp: vi.fn(), signInWithGoogle: vi.fn(), resetPassword: vi.fn(),
}));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/auth']}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/boards" element={<h1>Boards</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

it('defaults to checked and retains one accessible selection when switching tabs', () => {
  renderPage();
  const checkbox = screen.getByRole('checkbox', { name: 'Remember me' });
  expect(checkbox.checked).toBe(true);
  fireEvent.click(screen.getByText('Remember me'));
  expect(checkbox.checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'הרשמה', exact: true }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(checkbox.checked).toBe(false);
});

for (const method of ['signin', 'signup', 'google']) {
  it.each([true, false])(`${method} submits the shared selection (remember=%s)`, async (remember) => {
    renderPage();
    if (!remember) fireEvent.click(screen.getByRole('checkbox', { name: 'Remember me' }));
    if (method === 'google') {
      fireEvent.click(screen.getByRole('button', { name: 'המשך עם Google' }));
      expect(signInWithGoogle).toHaveBeenCalledExactlyOnceWith(remember);
    } else {
      if (method === 'signup') {
        fireEvent.click(screen.getByRole('button', { name: 'הרשמה', exact: true }));
        fireEvent.change(screen.getByLabelText('כינוי'), { target: { value: ' Nickname ' } });
      }
      fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'user@example.com' } });
      fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'password' } });
      fireEvent.click(screen.getByRole('button', { name: method === 'signup' ? 'הירשם' : 'התחבר', exact: true }));
      expect(method === 'signup' ? signUp : signIn).toHaveBeenCalledExactlyOnceWith(
        'user@example.com', 'password', ...(method === 'signup' ? ['Nickname'] : []), remember,
      );
    }
    await screen.findByRole('heading', { name: 'Boards' });
  });
}

it.each(['email', 'google'])('locks both methods and selection during %s auth, then unlocks on failure', async (method) => {
  let fail;
  const operation = method === 'email' ? signIn : signInWithGoogle;
  operation.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
  renderPage();
  fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'password' } });
  const emailButton = screen.getByRole('button', { name: 'התחבר', exact: true });
  const googleButton = screen.getByRole('button', { name: 'המשך עם Google' });
  fireEvent.click(method === 'email' ? emailButton : googleButton);
  expect(emailButton.disabled).toBe(true);
  expect(googleButton.disabled).toBe(true);
  expect(screen.getByRole('checkbox').disabled).toBe(true);
  fireEvent.click(method === 'email' ? googleButton : emailButton);
  expect(method === 'email' ? signInWithGoogle : signIn).not.toHaveBeenCalled();
  fail({ code: 'auth/too-many-requests' });
  await screen.findByText('יותר מדי ניסיונות. נסה שוב מאוחר יותר');
  await waitFor(() => expect(emailButton.disabled).toBe(false));
  expect(googleButton.disabled).toBe(false);
  expect(screen.getByRole('checkbox').disabled).toBe(false);
});
