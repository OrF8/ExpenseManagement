/**
 * Collaborator management UI for a board.
 * Allows the board owner to invite collaborators by email and manage pending invites.
 *
 * TODO (invite acceptance): Invite acceptance must be implemented via a secure
 * backend flow (e.g. Cloud Functions). The Firestore rules only allow the board
 * owner to manage invites; the invited user cannot accept client-side without
 * bypassing those rules. See boards.js for the full TODO note.
 */
import { useState, useEffect, useRef } from 'react';
import { createBoardInvite, subscribeToBoardInvites, deleteBoardInvite } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

export function CollaboratorManager({ board }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [invites, setInvites] = useState([]);
  const [revokeError, setRevokeError] = useState(null);
  const successTimerRef = useRef(null);

  const isOwner = user?.uid === board.ownerUid;

  // Subscribe to board invites (owner only — rules enforce this server-side)
  useEffect(() => {
    if (!isOwner) return;
    const unsub = subscribeToBoardInvites(
      board.id,
      (data) => setInvites(data),
      (err) => console.error('subscribeToBoardInvites error:', err)
    );
    return unsub;
  }, [board.id, isOwner]);

  // Clear the success timer when the component unmounts
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  async function handleInvite(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await createBoardInvite(board.id, email, user);
      setEmail('');
      setSuccess(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(inviteId) {
    setRevokeError(null);
    try {
      await deleteBoardInvite(board.id, inviteId);
    } catch (err) {
      setRevokeError(err.message);
    }
  }

  const pendingInvites = invites.filter((i) => i.status === 'pending');

  return (
    <div className="flex flex-col gap-4">
      {/* Invite by email — owner only */}
      {isOwner && (
        <form onSubmit={handleInvite} className="flex gap-2">
          <div className="flex-1">
            <Input
              type="email"
              placeholder="כתובת דוא״ל להזמנה"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              error={error}
            />
          </div>
          <Button type="submit" loading={loading} disabled={!email.trim()}>
            הזמן
          </Button>
        </form>
      )}
      {success && (
        <p className="text-sm text-green-600 dark:text-green-400 font-medium">
          ✓ ההזמנה נשלחה בהצלחה
        </p>
      )}

      {/* Current members */}
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          חברי הלוח ({board.memberUids.length})
        </p>
        <div className="flex flex-col gap-1">
          {board.memberUids.map((uid) => (
            <div
              key={uid}
              className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2"
            >
              <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs text-indigo-600 dark:text-indigo-400 font-bold shrink-0">
                {uid === board.ownerUid ? '★' : '•'}
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {uid === board.ownerUid ? 'בעלים' : 'חבר'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending invites — owner only */}
      {isOwner && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            הזמנות ממתינות ({pendingInvites.length})
          </p>
          {revokeError && (
            <p className="text-xs text-red-500 dark:text-red-400 mb-2">{revokeError}</p>
          )}
          {pendingInvites.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">אין הזמנות ממתינות</p>
          ) : (
            <div className="flex flex-col gap-1">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 px-3 py-2"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                      {invite.invitedEmail}
                    </span>
                    {invite.createdAt && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {invite.createdAt.toDate().toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleRevoke(invite.id)}
                  >
                    בטל
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
