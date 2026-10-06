import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserLocalPersistence, browserSessionPersistence, setPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../src/firebase/config';
import { createUserProfile, getUserProfile } from '../src/firebase/users';
import { logOut, signIn, signUp, signInWithGoogle } from '../src/firebase/auth';

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: { type: 'LOCAL' },
  browserSessionPersistence: { type: 'SESSION' },
  setPersistence: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock('../src/firebase/config', () => ({ auth: {}, googleProvider: {}, functions: {} }));
vi.mock('../src/firebase/users', () => ({ createUserProfile: vi.fn(), getUserProfile: vi.fn() }));

const credential = { user: { uid: 'test-user', email: 'user@example.com', displayName: 'Test User' } };
const methods = [
  ['email sign-in', (remember) => signIn('user@example.com', 'password', remember), signInWithEmailAndPassword],
  ['sign-up', (remember) => signUp('user@example.com', 'password', 'Nickname', remember), createUserWithEmailAndPassword],
  ['Google', (remember) => signInWithGoogle(remember), signInWithPopup],
];

beforeEach(() => {
  vi.resetAllMocks();
  for (const [, , operation] of methods) operation.mockResolvedValue(credential);
  getUserProfile.mockResolvedValue({ nickname: 'Existing' });
});

describe.each(methods)('%s persistence', (_, authenticate, operation) => {
  it.each([true, false])('awaits selected persistence before authentication (remember=%s)', async (remember) => {
    let finishPersistence;
    setPersistence.mockReturnValue(new Promise((resolve) => { finishPersistence = resolve; }));
    const pending = authenticate(remember);
    expect(setPersistence).toHaveBeenCalledWith(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    expect(operation).not.toHaveBeenCalled();
    finishPersistence();
    await expect(pending).resolves.toBe(credential);
    expect(operation).toHaveBeenCalledExactlyOnceWith(
      ...(operation === signInWithPopup ? [auth, googleProvider] : [auth, 'user@example.com', 'password']),
    );
  });

  it('defaults to local persistence', async () => {
    await authenticate();
    expect(setPersistence).toHaveBeenCalledWith(auth, browserLocalPersistence);
  });

  it('does not authenticate if selecting persistence fails', async () => {
    const error = new Error('Storage unavailable');
    setPersistence.mockRejectedValue(error);
    await expect(authenticate(false)).rejects.toBe(error);
    expect(operation).not.toHaveBeenCalled();
    expect(createUserProfile).not.toHaveBeenCalled();
  });
});

it('preserves profile creation for registration and new Google users', async () => {
  await signUp('user@example.com', 'password', 'Nickname', false);
  expect(createUserProfile).toHaveBeenCalledWith('test-user', 'user@example.com', 'Nickname');
  getUserProfile.mockResolvedValue(null);
  await signInWithGoogle(true);
  expect(createUserProfile).toHaveBeenCalledWith('test-user', 'user@example.com', 'Test User');
});

it.each([true, false])('explicit logout signs out after either persistence selection (%s)', async (remember) => {
  await signIn('user@example.com', 'password', remember);
  setPersistence.mockClear();
  await logOut();
  expect(signOut).toHaveBeenCalledExactlyOnceWith(auth);
  expect(setPersistence).not.toHaveBeenCalled();
});
