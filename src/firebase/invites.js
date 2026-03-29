/**
 * Client-side wrappers for Firebase callable functions related to board invites.
 *
 * These functions are thin wrappers around httpsCallable so that the rest of
 * the frontend can import them without worrying about function names or the
 * Functions SDK.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

/**
 * Accept a pending board invite.
 * The backend verifies authentication, invite ownership, and atomically adds
 * the caller to board memberUids while marking the invite as accepted.
 *
 * @param {string} boardId  - ID of the board that issued the invite
 * @param {string} inviteId - ID of the invite document
 * @returns {Promise<{ success: boolean }>}
 */
export async function acceptBoardInvite(boardId, inviteId) {
  const fn = httpsCallable(functions, 'acceptBoardInvite');
  const result = await fn({ boardId, inviteId });
  return result.data;
}

/**
 * Decline a pending board invite.
 * The backend verifies authentication and invite ownership before marking the
 * invite as declined.
 *
 * @param {string} boardId  - ID of the board that issued the invite
 * @param {string} inviteId - ID of the invite document
 * @returns {Promise<{ success: boolean }>}
 */
export async function declineBoardInvite(boardId, inviteId) {
  const fn = httpsCallable(functions, 'declineBoardInvite');
  const result = await fn({ boardId, inviteId });
  return result.data;
}
