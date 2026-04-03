/**
 * Main boards listing page.
 *
 * Features:
 *  - Shows only top-level boards (parentBoardId is null/undefined).
 *  - Displays aggregate total expenses on each board card before entering.
 *  - Super boards show a badge and their sub-board count.
 *  - Drag-and-drop a board card onto another to merge them into a super board.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBoards } from '../hooks/useBoards';
import { useBoardTotals } from '../hooks/useBoardTotals';
import { useIncomingInvites } from '../hooks/useIncomingInvites';
import { useAuth } from '../context/AuthContext';
import { createBoard, deleteBoard, mergeBoardsIntoSuper, removeSubBoardFromSuper } from '../firebase/boards';
import { acceptBoardInvite, declineBoardInvite } from '../firebase/invites';
import { logOut, deleteMyAccount } from '../firebase/auth';
import { getUserProfile, updateNickname } from '../firebase/users';
import { isMergeValid, getAggregateTotalForBoard } from '../utils/boardHierarchy';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import logoIcon from '../assets/logo-icon.png';

function formatAmount(amount) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
}

export function BoardsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { boards, loading, error, retryingSecureConnection } = useBoards();
  const { invites: incomingInvites } = useIncomingInvites();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Per-invite action state: { [inviteId]: { accepting, declining, error } }
  const [inviteActions, setInviteActions] = useState({});

  // Nickname state
  const [nickname, setNickname] = useState('');
  const [showEditNickname, setShowEditNickname] = useState(false);
  const [editNicknameValue, setEditNicknameValue] = useState('');
  const [editNicknameError, setEditNicknameError] = useState(null);
  const [savingNickname, setSavingNickname] = useState(false);

  // Profile / Account modal state
  const [showProfile, setShowProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState(null);

  // Load current user's nickname
  useEffect(() => {
    if (!user?.uid) return;
    async function loadProfile() {
      try {
        const profile = await getUserProfile(user.uid);
        if (profile?.nickname) setNickname(profile.nickname);
      } catch (err) {
        console.error('Failed to load user profile:', err);
      }
    }
    loadProfile();
  }, [user]);

  // ---------------------------------------------------------------------------
  // Hierarchy-aware board lists
  // ---------------------------------------------------------------------------
  // A board is shown at the top level when:
  //   a) it has no parent (it is already a top-level board), OR
  //   b) its parent board is not accessible to the current user
  //      (e.g. the user was invited directly to a sub-board).
  // This prevents accessible child boards from disappearing from the list.
  const topLevelBoards = useMemo(
    () =>
      boards.filter((b) => {
        if (!b.parentBoardId) return true;
        // If the parent is among the user's boards, hide this board at top level
        // (it will be shown inside the parent's super-board view instead).
        return !boards.some((p) => p.id === b.parentBoardId);
      }),
    [boards],
  );

  const allBoardIds = useMemo(() => boards.map((b) => b.id), [boards]);
  const { totals: boardTotals } = useBoardTotals(allBoardIds);

  function getDisplayTotal(boardId) {
    return getAggregateTotalForBoard(boardId, boardTotals, boards);
  }

  // ---------------------------------------------------------------------------
  // Drag-and-drop merge
  // ---------------------------------------------------------------------------
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState(null);
  // Track drag-enter/leave nesting to avoid flickering when hovering child elements
  const dragDepthRef = useRef({});

  function handleDragStart(e, boardId) {
    const board = boards.find((b) => b.id === boardId);
    // Only regular top-level boards owned by the current user can be dragged.
    // Sub-boards (parentBoardId set) and super boards (subBoardIds non-empty) are excluded.
    if (board?.parentBoardId) { e.preventDefault(); return; }
    if ((board?.subBoardIds?.length ?? 0) > 0) { e.preventDefault(); return; }
    if (board?.ownerUid !== user?.uid) { e.preventDefault(); return; }
    setDraggingId(boardId);
    setMergeError(null);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
    dragDepthRef.current = {};
  }

  function handleDragOver(e, boardId) {
    e.preventDefault();
    if (!draggingId || boardId === draggingId) return;
    const target = boards.find((b) => b.id === boardId);
    if (!isMergeValid(draggingId, boardId, boards)) return;
    if (target?.ownerUid !== user?.uid) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(boardId);
  }

  function handleDragEnter(e, boardId) {
    e.preventDefault();
    dragDepthRef.current[boardId] = (dragDepthRef.current[boardId] ?? 0) + 1;
  }

  function handleDragLeave(e, boardId) {
    const depth = (dragDepthRef.current[boardId] ?? 1) - 1;
    dragDepthRef.current[boardId] = depth;
    if (depth <= 0) {
      dragDepthRef.current[boardId] = 0;
      setDragOverId((prev) => (prev === boardId ? null : prev));
    }
  }

  async function handleDrop(e, targetBoardId) {
    e.preventDefault();
    dragDepthRef.current[targetBoardId] = 0;
    setDragOverId(null);
    const fromId = draggingId;
    setDraggingId(null);

    if (!fromId || fromId === targetBoardId) return;

    const dragged = boards.find((b) => b.id === fromId);
    const target = boards.find((b) => b.id === targetBoardId);
    if (!dragged || !target) return;
    if (!isMergeValid(fromId, targetBoardId, boards)) return;
    if (target.ownerUid !== user?.uid) return;

    const confirmed = window.confirm(
      `לשלב את "${dragged.title}" כלוח-משנה תחת "${target.title}"?`,
    );
    if (!confirmed) return;

    setMerging(true);
    setMergeError(null);
    try {
      await mergeBoardsIntoSuper(fromId, targetBoardId);
    } catch (err) {
      setMergeError(err.message || 'שגיאה בשילוב הלוחות. נסה שוב.');
    } finally {
      setMerging(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Nickname
  // ---------------------------------------------------------------------------
  function openEditNickname() {
    setEditNicknameValue(nickname);
    setEditNicknameError(null);
    setShowEditNickname(true);
  }

  function closeEditNickname() {
    setShowEditNickname(false);
    setEditNicknameValue('');
    setEditNicknameError(null);
  }

  async function handleSaveNickname(e) {
    e.preventDefault();
    const trimmed = editNicknameValue.trim();
    if (!trimmed) {
      setEditNicknameError('הכינוי לא יכול להיות ריק.');
      return;
    }
    setSavingNickname(true);
    setEditNicknameError(null);
    try {
      await updateNickname(user.uid, trimmed);
      setNickname(trimmed);
      closeEditNickname();
    } catch (err) {
      console.error('Failed to save nickname:', err);
      setEditNicknameError(err.message || 'שגיאה בשמירת הכינוי. נסה שוב.');
    } finally {
      setSavingNickname(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Profile / Account modal
  // ---------------------------------------------------------------------------
  function openProfile() {
    setDeleteAccountError(null);
    setShowProfile(true);
  }

  function closeProfile() {
    setShowProfile(false);
    closeEditNickname();
    setDeleteAccountError(null);
  }

  function openDeleteConfirm() {
    setDeleteAccountError(null);
    setShowDeleteConfirm(true);
  }

  function closeDeleteConfirm() {
    setShowDeleteConfirm(false);
    setDeleteAccountError(null);
  }

  async function handleDeleteAccount() {
    // Guard against duplicate submits
    if (deleting) return;
    setDeleting(true);
    setDeleteAccountError(null);
    try {
      await deleteMyAccount();
      // Explicit exit: close modals, clear state, and navigate to the landing page.
      // This is the primary path for a successful deletion.
      // If navigation fails for any reason, fall back to a full page reload.
      closeDeleteConfirm();
      closeProfile();
      try {
        navigate('/');
      } catch {
        window.location.href = '/';
      }
    } catch (err) {
      console.error('Failed to delete account:', err);
      setDeleteAccountError(err.message || 'שגיאה במחיקת החשבון. נסה שוב.');
      setDeleting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Create board
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Invites
  // ---------------------------------------------------------------------------
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
    } catch (err) {
      setInviteAction(invite.id, {
        declining: false,
        error: err?.message || 'שגיאה בדחיית ההזמנה. נסה שוב.',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Delete board
  // ---------------------------------------------------------------------------
  const [deletingBoardId, setDeletingBoardId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  async function handleDeleteBoard(boardId) {
    const board = boards.find((b) => b.id === boardId);
    const subCount = board?.subBoardIds?.length ?? 0;
    const message =
      subCount > 0
        ? `הלוח מכיל ${subCount} לוחות-משנה. לוחות-המשנה יהפכו ללוחות עצמאיים.\nהאם אתה בטוח שברצונך למחוק את הלוח? פעולה זו אינה ניתנת לביטול.`
        : 'האם אתה בטוח שברצונך למחוק את הלוח? פעולה זו אינה ניתנת לביטול.';
    if (!window.confirm(message)) return;

    setDeletingBoardId(boardId);
    setDeleteError(null);
    try {
      // Detach sub-boards first so they become independent top-level boards
      if (subCount > 0 && board.subBoardIds) {
        await Promise.all(
          board.subBoardIds.map((subId) => removeSubBoardFromSuper(boardId, subId)),
        );
      }
      await deleteBoard(boardId);
    } catch (err) {
      setDeleteError(err.message || 'שגיאה במחיקת הלוח. נסה שוב.');
    } finally {
      setDeletingBoardId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------
  const [signOutError, setSignOutError] = useState(null);

  async function handleSignOut() {
    try {
      await logOut();
    } catch (err) {
      setSignOutError(err.message || 'שגיאה ביציאה. נסה שוב.');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="" className="h-8 w-8 rounded-xl" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">ניהול הוצאות</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={openProfile} className="flex items-center gap-1.5">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">{nickname || user?.email?.split('@')[0] || 'חשבון'}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {(error || signOutError || deleteError || mergeError) && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error
              ? `שגיאה בטעינת הלוחות: ${error}`
              : mergeError || deleteError || signOutError}
          </div>
        )}

        {/* Incoming invites section */}
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

        {draggingId && (
          <p className="mb-3 text-xs text-indigo-600 dark:text-indigo-400 text-center">
            גרור לוח זה מעל לוח אחר כדי לשלב אותם
          </p>
        )}

        {merging && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Spinner size="sm" />
            משלב לוחות…
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Spinner size="lg" />
            {retryingSecureConnection && (
              <p className="text-sm text-gray-500 dark:text-gray-400">מנסה שוב ליצור חיבור מאובטח…</p>
            )}
          </div>
        ) : topLevelBoards.length === 0 ? (
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
            {topLevelBoards.map((board) => {
              const isSuperBoard = (board.subBoardIds?.length ?? 0) > 0;
              const isSubBoard = !!board.parentBoardId;
              const isOwner = board.ownerUid === user?.uid;
              // Only regular top-level owned boards can initiate a drag
              const isDraggable = !isSuperBoard && !isSubBoard && isOwner;
              const isDragging = draggingId === board.id;
              const isValidDropTarget =
                !!draggingId &&
                draggingId !== board.id &&
                isMergeValid(draggingId, board.id, boards) &&
                board.ownerUid === user?.uid;
              const isDragOver = dragOverId === board.id && isValidDropTarget;
              const displayTotal = getDisplayTotal(board.id);

              return (
                <div
                  key={board.id}
                  draggable={isDraggable}
                  onDragStart={isDraggable ? (e) => handleDragStart(e, board.id) : undefined}
                  onDragEnd={isDraggable ? handleDragEnd : undefined}
                  onDragOver={isValidDropTarget ? (e) => handleDragOver(e, board.id) : undefined}
                  onDragEnter={isValidDropTarget ? (e) => handleDragEnter(e, board.id) : undefined}
                  onDragLeave={isValidDropTarget ? (e) => handleDragLeave(e, board.id) : undefined}
                  onDrop={isValidDropTarget ? (e) => handleDrop(e, board.id) : undefined}
                  className={[
                    'group rounded-2xl bg-white dark:bg-gray-800 border shadow-sm transition-all',
                    isDragging
                      ? 'opacity-50 border-gray-200 dark:border-gray-700'
                      : isDragOver
                      ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-600 shadow-md'
                      : 'border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-700',
                    isDraggable ? 'cursor-grab active:cursor-grabbing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <Link to={`/board/${board.id}`} className="block p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                          {board.title}
                        </h3>
                        {isSuperBoard && (
                          <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                            לוח-על · {board.subBoardIds.length}
                          </span>
                        )}
                      </div>
                      <div className="h-8 w-8 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-900/50 flex items-center justify-center">
                        {isSuperBoard ? (
                          <svg className="h-4 w-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                          </svg>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {board.memberUids.length} משתתפים
                      </p>
                      <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 tabular-nums">
                        {formatAmount(displayTotal)}
                      </span>
                    </div>
                  </Link>

                  {isOwner && (
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
              );
            })}
          </div>
        )}

        {topLevelBoards.length > 1 && !draggingId && (
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-600">
            גרור לוח מעל לוח אחר כדי לשלב אותם ללוח-על
          </p>
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

      {/* Profile / Account Modal */}
      <Modal
        isOpen={showProfile}
        onClose={closeProfile}
        title="הגדרות חשבון"
      >
        <div className="flex flex-col gap-5">
          {/* Profile info */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 font-semibold text-sm select-none">
              {(nickname || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{nickname || '—'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>

          {/* Edit nickname */}
          {showEditNickname ? (
            <form onSubmit={handleSaveNickname} className="flex flex-col gap-3">
              <Input
                label="כינוי חדש"
                value={editNicknameValue}
                onChange={(e) => setEditNicknameValue(e.target.value)}
                error={editNicknameError}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" size="sm" onClick={closeEditNickname}>
                  ביטול
                </Button>
                <Button type="submit" size="sm" loading={savingNickname} disabled={!editNicknameValue.trim()}>
                  שמור
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="secondary" size="sm" onClick={openEditNickname} className="self-start">
              שנה כינוי
            </Button>
          )}

          {/* Sign out */}
          <Button variant="secondary" size="sm" onClick={handleSignOut} className="self-start">
            יציאה
          </Button>

          {/* Destructive zone — account deletion */}
          <div className="border-t border-red-200 dark:border-red-800/60 pt-5">
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4">
              <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">מחיקת חשבון</h3>
              <p className="text-sm text-red-600/90 dark:text-red-500 mb-4 leading-relaxed">
                מחיקת החשבון תסיר לצמיתות את חשבונך וכל הנתונים שלך,
                כולל כל הלוחות שיצרת — אפילו לוחות משותפים עם אחרים —
                ואת כל הנתונים תחתם. פעולה זו אינה ניתנת לביטול.
              </p>
              <Button variant="danger" size="sm" onClick={openDeleteConfirm}>
                מחק חשבון
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={deleting ? () => {} : closeDeleteConfirm}
        title="מחיקת חשבון לצמיתות"
      >
        <div className="flex flex-col gap-4">
          {/* Warning list */}
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
            <ul className="text-sm text-red-700 dark:text-red-400 space-y-1.5 list-disc list-inside">
              <li>החשבון יימחק לצמיתות</li>
              <li>כל הלוחות שיצרת יימחקו, כולל לוחות משותפים</li>
              <li>כל הנתונים תחת אותם לוחות (הוצאות, הזמנות) יימחקו</li>
              <li>פעולה זו אינה ניתנת לביטול</li>
            </ul>
          </div>

          {deleteAccountError && (
            <p className="text-sm text-red-500 dark:text-red-400">{deleteAccountError}</p>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={closeDeleteConfirm}
              disabled={deleting}
            >
              ביטול
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={handleDeleteAccount}
            >
              מחק חשבון לצמיתות
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
