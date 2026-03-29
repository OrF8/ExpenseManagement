/**
 * Main boards listing page.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBoards } from '../hooks/useBoards';
import { useIncomingInvites } from '../hooks/useIncomingInvites';
import { useAuth } from '../context/AuthContext';
import { createBoard, deleteBoard } from '../firebase/boards';
import { acceptBoardInvite, declineBoardInvite } from '../firebase/invites';
import { logOut } from '../firebase/auth';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export function BoardsPage() {
  const { user } = useAuth();
  const { boards, loading, error } = useBoards();
  const { invites: incomingInvites } = useIncomingInvites();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Per-invite action state: { [inviteId]: { accepting, declining, error } }
  const [inviteActions, setInviteActions] = useState({});

  async function handleCreate(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createBoard(title, user.uid);
      setNewTitle('');
      setShowCreate(false);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function setInviteAction(inviteId, patch) {
    setInviteActions((prev) => ({
      ...prev,
      [inviteId]: { ...(prev[inviteId] || {}), ...patch },
    }));
  }

  async function handleAcceptInvite(invite) {
    setInviteAction(invite.id, { accepting: true, error: null });
    try {
      await acceptBoardInvite(invite.boardId, invite.id);
      // The invite will disappear from the list via the Firestore subscription,
      // and the board will appear via the boards subscription.
    } catch (err) {
      setInviteAction(invite.id, {
        accepting: false,
        error: err?.message || 'שגיאה בקבלת ההזמנה. נסה שוב.',
      });
    }
  }

  async function handleDeclineInvite(invite) {
    setInviteAction(invite.id, { declining: true, error: null });
    try {
      await declineBoardInvite(invite.boardId, invite.id);
      // The invite will disappear from the list via the Firestore subscription.
    } catch (err) {
      setInviteAction(invite.id, {
        declining: false,
        error: err?.message || 'שגיאה בדחיית ההזמנה. נסה שוב.',
      });
    }
  }

  const [deletingBoardId, setDeletingBoardId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  async function handleDeleteBoard(boardId) {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את הלוח? פעולה זו אינה ניתנת לביטול.')) return;
    setDeletingBoardId(boardId);
    setDeleteError(null);
    try {
      await deleteBoard(boardId);
    } catch (err) {
      setDeleteError(err.message || 'שגיאה במחיקת הלוח. נסה שוב.');
    } finally {
      setDeletingBoardId(null);
    }
  }

  const [signOutError, setSignOutError] = useState(null);

  async function handleSignOut() {
    try {
      await logOut();
    } catch (err) {
      setSignOutError(err.message || 'שגיאה ביציאה. נסה שוב.');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
              ₪
            </div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">ניהול הוצאות</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
              {user?.email}
            </span>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              יציאה
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {(error || signOutError || deleteError) && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error ? `שגיאה בטעינת הלוחות: ${error}` : deleteError || signOutError}
          </div>
        )}

        {/* Incoming invites section — only rendered when invites are loaded and non-empty */}
        {incomingInvites.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">הזמנות נכנסות</h2>
            <div className="flex flex-col gap-2">
              {incomingInvites.map((invite) => {
                const action = inviteActions[invite.id] || {};
                const isBusy = action.accepting || action.declining;
                return (
                  <div
                    key={invite.id}
                    className="rounded-2xl bg-white dark:bg-gray-800 border border-amber-100 dark:border-amber-800 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {invite.boardTitle || 'לוח ללא שם'}
                      </span>
                      <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 shrink-0">
                        ממתין לאישור
                      </span>
                    </div>
                    {invite.invitedByEmail && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        הוזמנת על ידי: {invite.invitedByEmail}
                      </p>
                    )}
                    {invite.createdAt && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {invite.createdAt.toDate().toLocaleDateString('he-IL')}
                      </p>
                    )}
                    {action.error && (
                      <p className="mt-1 text-xs text-red-500 dark:text-red-400">{action.error}</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        loading={action.accepting}
                        disabled={isBusy}
                        onClick={() => handleAcceptInvite(invite)}
                      >
                        קבל
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={action.declining}
                        disabled={isBusy}
                        onClick={() => handleDeclineInvite(invite)}
                      >
                        דחה
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">הלוחות שלי</h2>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            לוח חדש
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : boards.length === 0 ? (
          <EmptyState
            icon={
              <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            }
            title="אין לוחות עדיין"
            description="צור את הלוח הראשון שלך כדי להתחיל לעקוב אחרי הוצאות"
            action={
              <Button onClick={() => setShowCreate(true)}>
                צור לוח ראשון
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {boards.map((board) => (
              <div
                key={board.id}
                className="group rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-700 transition-all"
              >
                <Link
                  to={`/board/${board.id}`}
                  className="block p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                      {board.title}
                    </h3>
                    <div className="h-8 w-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/50 flex items-center justify-center">
                      <svg className="h-4 w-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {board.memberUids.length} משתתפים
                  </p>
                </Link>
                {board.ownerUid === user?.uid && (
                  <div className="px-5 pb-4 flex justify-end">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={deletingBoardId === board.id}
                      onClick={() => handleDeleteBoard(board.id)}
                    >
                      מחק
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Board Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setNewTitle(''); setCreateError(null); }}
        title="יצירת לוח חדש"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input
            label="שם הלוח"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="הוצאות ינואר 2025"
            autoFocus
          />
          {createError && (
            <p className="text-sm text-red-500 dark:text-red-400">{createError}</p>
          )}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowCreate(false); setNewTitle(''); }}
            >
              ביטול
            </Button>
            <Button type="submit" loading={creating} disabled={!newTitle.trim()}>
              צור לוח
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
