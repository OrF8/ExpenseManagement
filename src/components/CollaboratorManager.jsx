/**
 * Collaborator management UI for a board.
 * Allows the board owner to invite collaborators by email and manage pending invites.
 */
import { useState, useEffect, useRef } from 'react';
import { createBoardInvite, subscribeToBoardInvites, deleteBoardInvite, removeBoardMember } from '../firebase/boards';
import { getUserProfilesByUids } from '../firebase/users';
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
  const [removeError, setRemoveError] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState([]);
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

  // Load real profile data for all board members
  useEffect(() => {
    if (!board.memberUids?.length) return;
    let stale = false;
    getUserProfilesByUids(board.memberUids)
      .then((profiles) => { if (!stale) setMemberProfiles(profiles); })
      .catch((err) => console.error('getUserProfilesByUids error:', err));
    return () => { stale = true; };
  }, [board.memberUids]);

  // Clear the success timer when the component unmounts
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  async function handleInvite(e) {
    e.preventDefault();
    if (!email.trim()) return;

    // Immediate feedback: prevent self-invite before hitting Firestore
    if (email.trim().toLowerCase() === (user?.email ?? '').trim().toLowerCase()) {
      setError('לא ניתן להזמין את עצמך ללוח');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await createBoardInvite(board.id, email, user, board.title);
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

  async function handleRemoveMember(memberUid) {
    if (!window.confirm('האם אתה בטוח שברצונך להסיר חבר זה מהלוח?')) return;
    setRemoveError(null);
    try {
      await removeBoardMember(board.id, memberUid);
    } catch (err) {
      setRemoveError(err.message);
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
          ✓ ההזמנה נרשמה בהצלחה
        </p>
      )}

      {/* Current members */}
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          חברי הלוח ({board.memberUids.length})
        </p>
        {removeError && (
          <p className="text-xs text-red-500 dark:text-red-400 mb-2">{removeError}</p>
        )}
        <div className="flex flex-col gap-1">
          {board.memberUids.map((uid) => {
            const profile = memberProfiles.find((p) => p.uid === uid);
            const nickname = profile?.nickname || 'משתמש';
            const email = profile?.email || '';
            const isCurrentUser = uid === user?.uid;
            const isBoardOwner = uid === board.ownerUid;
            const initial = nickname.charAt(0);
            return (
              <div
                key={uid}
                className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2"
              >
                <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs text-indigo-600 dark:text-indigo-400 font-bold shrink-0">
                  {isBoardOwner ? '★' : initial}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-800 dark:text-gray-200 font-medium truncate">
                      {nickname}
                    </span>
                    {isBoardOwner && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">בעלים</span>
                    )}
                    {isCurrentUser && (
                      <span className="text-xs text-indigo-500 dark:text-indigo-400 shrink-0">(אתה)</span>
                    )}
                  </div>
                  {email && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{email}</span>
                  )}
                </div>
                {isOwner && !isBoardOwner && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemoveMember(uid)}
                  >
                    הסר
                  </Button>
                )}
              </div>
            );
          })}
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
