/**
 * Board detail page.
 *
 * Behaviour:
 *  - Regular board: shows transactions and totals (existing behaviour).
 *  - Super board (board.subBoardIds?.length > 0): shows sub-board grid with
 *    aggregate total and affordances to remove or add sub-boards.
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTransactions } from '../hooks/useTransactions';
import { useBoards } from '../hooks/useBoards';
import { useBoardTotals } from '../hooks/useBoardTotals';
import { useAuth } from '../context/AuthContext';
import { addTransaction, updateTransaction, deleteTransaction } from '../firebase/transactions';
import { subscribeToBoard, removeSubBoardFromSuper, mergeBoardsIntoSuper } from '../firebase/boards';
import { getUserProfile } from '../firebase/users';
import { isMergeValid } from '../utils/boardHierarchy';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionCard } from '../components/TransactionCard';
import { TotalsSummary } from '../components/TotalsSummary';
import { CollaboratorManager } from '../components/CollaboratorManager';

function formatAmount(amount) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
}

export function BoardPage() {
  const { boardId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { transactions, loading, error, totals } = useTransactions(boardId);
  const { boards: allBoards } = useBoards();
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [showCollabs, setShowCollabs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userNickname, setUserNickname] = useState('');

  // Load current user's nickname for defaulting the transaction name
  useEffect(() => {
    if (!user?.uid) return;
    getUserProfile(user.uid)
      .then((profile) => { if (profile?.nickname) setUserNickname(profile.nickname); })
      .catch((err) => { console.error('Failed to load user profile for default name:', err); });
  }, [user]);

  // Subscribe to real-time board metadata updates
  useEffect(() => {
    setBoardLoading(true);
    const unsub = subscribeToBoard(
      boardId,
      (b) => {
        if (!b || !b.memberUids.includes(user?.uid)) {
          setBoardLoading(false);
          navigate('/boards');
          return;
        }
        setBoard(b);
        setBoardLoading(false);
      },
      (err) => {
        setBoardError(err.message);
        setBoardLoading(false);
      }
    );
    return unsub;
  }, [boardId, user, navigate]);

  // ---------------------------------------------------------------------------
  // Super board helpers
  // ---------------------------------------------------------------------------
  const isSuperBoard = (board?.subBoardIds?.length ?? 0) > 0;
  const isOwner = board?.ownerUid === user?.uid;

  const subBoards = useMemo(() => {
    if (!isSuperBoard) return [];
    return (board.subBoardIds ?? [])
      .map((id) => allBoards.find((b) => b.id === id))
      .filter(Boolean);
  }, [isSuperBoard, board?.subBoardIds, allBoards]);

  const subBoardIds = useMemo(
    () => (board?.subBoardIds ?? []),
    [board?.subBoardIds],
  );
  const { totals: subBoardTotals } = useBoardTotals(subBoardIds);

  const aggregateTotal = useMemo(
    () => subBoardIds.reduce((sum, id) => sum + (subBoardTotals[id] ?? 0), 0),
    [subBoardIds, subBoardTotals],
  );


  // Remove-sub-board state
  const [removingSubBoardId, setRemovingSubBoardId] = useState(null);
  const [removeSubBoardError, setRemoveSubBoardError] = useState(null);

  async function handleRemoveSubBoard(subBoardId) {
    const subBoard = allBoards.find((b) => b.id === subBoardId);
    if (
      !window.confirm(
        `להסיר את "${subBoard?.title ?? subBoardId}" מלוח-על זה? הלוח יהפוך ללוח עצמאי.`,
      )
    )
      return;

    setRemovingSubBoardId(subBoardId);
    setRemoveSubBoardError(null);
    try {
      await removeSubBoardFromSuper(boardId, subBoardId);
    } catch (err) {
      setRemoveSubBoardError(err.message || 'שגיאה בהסרת לוח-המשנה. נסה שוב.');
    } finally {
      setRemovingSubBoardId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // "Add sub-board" modal (super board view, owner only)
  // Shows owned top-level boards that can be attached as sub-boards here.
  // ---------------------------------------------------------------------------
  const [showAddSubBoard, setShowAddSubBoard] = useState(false);
  const [attachingSubBoardId, setAttachingSubBoardId] = useState(null);
  const [attachSubBoardError, setAttachSubBoardError] = useState(null);

  // Boards that can be attached: owned by user, valid merge target
  const attachableCandidates = useMemo(() => {
    if (!isOwner || !board) return [];
    return allBoards.filter(
      (b) =>
        b.ownerUid === user?.uid &&
        b.id !== boardId &&
        !b.parentBoardId && // only top-level boards
        isMergeValid(b.id, boardId, allBoards),
    );
  }, [isOwner, board, allBoards, boardId, user?.uid]);

  async function handleAttachSubBoard(candidateId) {
    setAttachingSubBoardId(candidateId);
    setAttachSubBoardError(null);
    try {
      await mergeBoardsIntoSuper(candidateId, boardId);
      setShowAddSubBoard(false);
    } catch (err) {
      setAttachSubBoardError(err.message || 'שגיאה בצירוף הלוח. נסה שוב.');
    } finally {
      setAttachingSubBoardId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // "Move under board" modal (regular board view, owner only)
  // Shows owned boards that can be a parent for this board.
  // ---------------------------------------------------------------------------
  const [showMoveUnder, setShowMoveUnder] = useState(false);
  const [movingUnder, setMovingUnder] = useState(false);
  const [moveUnderError, setMoveUnderError] = useState(null);

  // Boards that can be a parent: owned by user, valid merge target
  const parentCandidates = useMemo(() => {
    if (!isOwner || !board) return [];
    return allBoards.filter(
      (b) =>
        b.ownerUid === user?.uid &&
        b.id !== boardId &&
        isMergeValid(boardId, b.id, allBoards),
    );
  }, [isOwner, board, allBoards, boardId, user?.uid]);

  async function handleMoveUnder(parentId) {
    const parent = allBoards.find((b) => b.id === parentId);
    const confirmed = window.confirm(
      `להעביר את "${board?.title}" תחת "${parent?.title ?? parentId}"?`,
    );
    if (!confirmed) return;

    setMovingUnder(true);
    setMoveUnderError(null);
    try {
      await mergeBoardsIntoSuper(boardId, parentId);
      // After attachment, navigate to the parent super board
      navigate(`/board/${parentId}`);
    } catch (err) {
      setMoveUnderError(err.message || 'שגיאה בהעברת הלוח. נסה שוב.');
      setMovingUnder(false);
    }
  }

  function openAddSubBoardModal() {
    setAttachSubBoardError(null);
    setShowAddSubBoard(true);
  }

  function openMoveUnderModal() {
    setMoveUnderError(null);
    setShowMoveUnder(true);
  }

  // ---------------------------------------------------------------------------
  // Transaction handlers
  // ---------------------------------------------------------------------------
  async function handleAdd(data) {
    setSubmitting(true);
    try {
      await addTransaction(boardId, data, user.uid);
      setShowAddModal(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(data) {
    setSubmitting(true);
    try {
      await updateTransaction(boardId, editTx.id, data);
      setEditTx(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(txId) {
    await deleteTransaction(boardId, txId);
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (boardLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-gray-950">
        <Spinner size="lg" />
      </div>
    );
  }

  if (boardError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 dark:bg-gray-950">
        <div className="text-center">
          <p className="text-red-500 dark:text-red-400 mb-4">{boardError}</p>
          <Button variant="secondary" onClick={() => navigate('/boards')}>חזרה</Button>
        </div>
      </div>
    );
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
            <button
              onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/boards')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label="חזרה"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{board?.title}</h1>
              {isSuperBoard && (
                <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                  לוח-על
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <ThemeToggle />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCollabs(true)}
              title="ניהול שיתוף"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              שיתוף
            </Button>
            {isSuperBoard && isOwner && (
              <Button size="sm" variant="secondary" onClick={openAddSubBoardModal}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                הוסף לוח-משנה
              </Button>
            )}
            {!isSuperBoard && isOwner && (
              <Button size="sm" variant="secondary" onClick={openMoveUnderModal}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h12" />
                </svg>
                העבר תחת לוח
              </Button>
            )}
            {!isSuperBoard && (
              <Button size="sm" onClick={() => setShowAddModal(true)}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                עסקה חדשה
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
        {isSuperBoard ? (
          /* ---------------------------------------------------------------- */
          /* Super board view: sub-board grid                                  */
          /* ---------------------------------------------------------------- */
          <>
            {/* Aggregate total banner */}
            <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-5 dark:from-indigo-950/50 dark:to-gray-900 dark:border-indigo-900">
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide mb-1">
                סה"כ הוצאות
              </p>
              <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 tabular-nums">
                {formatAmount(aggregateTotal)}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                מצטבר מ-{subBoardIds.length} לוחות-משנה
              </p>
            </div>

            {removeSubBoardError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {removeSubBoardError}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  לוחות-משנה
                </h2>
              </div>
              {subBoards.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="h-14 w-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                  }
                  title="אין לוחות-משנה"
                  description="גרור לוחות מרשימת הלוחות כדי לשלב אותם כאן, או לחץ 'הוסף לוח-משנה'"
                  action={
                    isOwner ? (
                      <Button variant="secondary" onClick={openAddSubBoardModal}>
                        הוסף לוח-משנה
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {subBoards.map((sub) => (
                    <div
                      key={sub.id}
                      className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-700 transition-all"
                    >
                      <button
                        className="block w-full text-right p-5"
                        onClick={() => navigate(`/board/${sub.id}`)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors">
                            {sub.title}
                          </h3>
                          <div className="h-8 w-8 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-900/50 flex items-center justify-center">
                            <svg className="h-4 w-4 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {sub.memberUids?.length ?? 0} משתתפים
                          </p>
                          <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 tabular-nums">
                            {formatAmount(subBoardTotals[sub.id] ?? 0)}
                          </span>
                        </div>
                      </button>
                      {isOwner && (
                        <div className="px-5 pb-4 flex justify-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={removingSubBoardId === sub.id}
                            onClick={() => handleRemoveSubBoard(sub.id)}
                            title="הסר מלוח-על"
                          >
                            הסר מלוח-על
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ---------------------------------------------------------------- */
          /* Regular board view: transactions                                  */
          /* ---------------------------------------------------------------- */
          <>
            {/* Totals */}
            <TotalsSummary totals={totals} />

            {/* Transactions */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                עסקאות
              </h2>

              {error && (
                <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  שגיאה בטעינת עסקאות: {error}
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-12">
                  <Spinner />
                </div>
              ) : transactions.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="h-14 w-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  }
                  title="אין עסקאות עדיין"
                  description="הוסף את העסקה הראשונה כדי להתחיל לעקוב"
                  action={
                    <Button onClick={() => setShowAddModal(true)}>
                      הוסף עסקה ראשונה
                    </Button>
                  }
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {transactions.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      onEdit={(tx) => setEditTx(tx)}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Add Transaction Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="עסקה חדשה"
      >
        <TransactionForm
          defaultName={userNickname}
          onSubmit={handleAdd}
          onCancel={() => setShowAddModal(false)}
          submitting={submitting}
        />
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal
        isOpen={!!editTx}
        onClose={() => setEditTx(null)}
        title="עריכת עסקה"
      >
        <TransactionForm
          initial={editTx}
          onSubmit={handleEdit}
          onCancel={() => setEditTx(null)}
          submitting={submitting}
        />
      </Modal>

      {/* Collaborators Modal */}
      <Modal
        isOpen={showCollabs}
        onClose={() => setShowCollabs(false)}
        title="ניהול שיתוף"
      >
        {board && <CollaboratorManager board={board} />}
      </Modal>

      {/* Add Sub-Board Modal (super board view, owner only) */}
      <Modal
        isOpen={showAddSubBoard}
        onClose={() => setShowAddSubBoard(false)}
        title="הוסף לוח-משנה"
      >
        <div className="flex flex-col gap-4">
          {attachSubBoardError && (
            <p className="text-sm text-red-500 dark:text-red-400">{attachSubBoardError}</p>
          )}
          {attachableCandidates.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              אין לוחות זמינים לצירוף. ניתן לצרף רק לוחות עצמאיים שבבעלותך.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                בחר לוח לצירוף ללוח-על זה:
              </p>
              <div className="flex flex-col gap-2">
                {attachableCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                        {candidate.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {candidate.memberUids?.length ?? 0} משתתפים
                      </p>
                    </div>
                    <Button
                      size="sm"
                      loading={attachingSubBoardId === candidate.id}
                      disabled={!!attachingSubBoardId}
                      onClick={() => handleAttachSubBoard(candidate.id)}
                    >
                      צרף
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowAddSubBoard(false)}>
              סגור
            </Button>
          </div>
        </div>
      </Modal>

      {/* Move Under Board Modal (regular board view, owner only) */}
      <Modal
        isOpen={showMoveUnder}
        onClose={() => setShowMoveUnder(false)}
        title="העבר תחת לוח"
      >
        <div className="flex flex-col gap-4">
          {moveUnderError && (
            <p className="text-sm text-red-500 dark:text-red-400">{moveUnderError}</p>
          )}
          {parentCandidates.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              אין לוחות זמינים. ניתן להעביר רק תחת לוחות שבבעלותך שאינם גורמים למעגלים.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                בחר לוח-על שתחתיו יוצב לוח זה:
              </p>
              <div className="flex flex-col gap-2">
                {parentCandidates.map((parent) => (
                  <div
                    key={parent.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                        {parent.title}
                      </p>
                      {(parent.subBoardIds?.length ?? 0) > 0 && (
                        <p className="text-xs text-indigo-500 dark:text-indigo-400">
                          לוח-על · {parent.subBoardIds.length} לוחות-משנה
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      loading={movingUnder}
                      disabled={movingUnder}
                      onClick={() => handleMoveUnder(parent.id)}
                    >
                      העבר
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShowMoveUnder(false)}>
              סגור
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
