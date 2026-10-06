// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { onAuthStateChanged } from 'firebase/auth';
import { signUp, signInWithGoogle } from '../src/firebase/auth';
import App from '../src/App';

vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }));
vi.mock('../src/firebase/config', () => ({ auth: {} }));
vi.mock('../src/firebase/auth', () => ({
  signIn: vi.fn(), signUp: vi.fn(), signInWithGoogle: vi.fn(), resetPassword: vi.fn(),
}));
// Keep the real public pages, AuthProvider, route guards and route wiring;
// isolate protected page data fetching from this authentication test.
vi.mock('../src/pages/BoardsPage', () => ({ BoardsPage: () => <h1>Boards content</h1> }));
vi.mock('../src/pages/BoardPage', () => ({ BoardPage: () => <h1>Board content</h1> }));

let authObserver;
const unsubscribe = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  onAuthStateChanged.mockImplementation((_, callback) => {
    authObserver = callback;
    return unsubscribe;
  });
});
afterEach(cleanup);

function open(path) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

function restore(user) {
  act(() => authObserver(user));
}

it.each(['/', '/auth'])('waits for restoration then redirects signed-in visitors from %s', async (path) => {
  open(path);
  expect(window.location.pathname).toBe(path);
  expect(screen.getByRole('status')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Expense Management' })).toBeNull();
  restore({ uid: 'test-user' });
  await screen.findByRole('heading', { name: 'Boards content' });
  expect(window.location.pathname).toBe('/boards');
  expect(screen.queryByRole('checkbox')).toBeNull();
});

it.each(['/', '/auth'])('allows signed-out visitors at %s after restoration', (path) => {
  open(path);
  restore(null);
  expect(window.location.pathname).toBe(path);
  expect(screen.queryByRole('status')).toBeNull();
  expect(path === '/' ? screen.getByRole('heading', { name: 'Expense Management' }) : screen.getByRole('checkbox', { name: 'Remember me' })).toBeTruthy();
});

it.each(['/boards', '/board/test-board'])('preserves protected content and reacts to sign-out at %s', async (path) => {
  const view = open(path);
  expect(screen.getByRole('status')).toBeTruthy();
  expect(window.location.pathname).toBe(path);
  restore({ uid: 'test-user' });
  expect(screen.getByRole('heading', { name: path === '/boards' ? 'Boards content' : 'Board content' })).toBeTruthy();
  expect(window.location.pathname).toBe(path);
  restore(null);
  await screen.findByRole('checkbox', { name: 'Remember me' });
  expect(window.location.pathname).toBe('/auth');
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it.each(['/boards', '/board/test-board'])('redirects signed-out visitors from %s to auth', async (path) => {
  open(path);
  restore(null);
  await screen.findByRole('checkbox', { name: 'Remember me' });
  expect(window.location.pathname).toBe('/auth');
});

it.each(['signup', 'google'])('waits for %s profile completion after Firebase reports the user', async (method) => {
  let finishProfile;
  const operation = method === 'signup' ? signUp : signInWithGoogle;
  operation.mockReturnValue(new Promise((resolve) => { finishProfile = resolve; }));
  open('/auth');
  restore(null);
  if (method === 'signup') {
    fireEvent.click(screen.getByRole('button', { name: 'הרשמה', exact: true }));
    fireEvent.change(screen.getByLabelText('כינוי'), { target: { value: 'Nickname' } });
    fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'הירשם', exact: true }));
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'המשך עם Google' }));
  }
  restore({ uid: 'test-user' });
  expect(window.location.pathname).toBe('/auth');
  expect(screen.getByRole('checkbox').disabled).toBe(true);
  await act(async () => finishProfile());
  await screen.findByRole('heading', { name: 'Boards content' });
  expect(window.location.pathname).toBe('/boards');
});

it('keeps a profile error visible when Firebase has already signed in', async () => {
  let failProfile;
  signInWithGoogle.mockReturnValue(new Promise((_, reject) => { failProfile = reject; }));
  open('/auth');
  restore(null);
  fireEvent.click(screen.getByRole('button', { name: 'המשך עם Google' }));
  restore({ uid: 'test-user' });
  await act(async () => failProfile(new Error('Profile write failed')));
  expect(screen.getByText('שגיאה בהתחברות. נסה שוב')).toBeTruthy();
  expect(window.location.pathname).toBe('/auth');
  expect(screen.getByRole('checkbox').disabled).toBe(false);
});
