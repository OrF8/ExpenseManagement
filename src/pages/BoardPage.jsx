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
import { addTransaction, updateTransaction, deleteTransaction, getTransactionsForBoard } from '../firebase/transactions';
import { subscribeToBoard, removeSubBoardFromSuper, mergeBoardsIntoSuper, createBoard, renameBoard } from '../firebase/boards';
import { getUserProfile } from '../firebase/users';
import { isMergeValid } from '../utils/boardHierarchy';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionCard } from '../components/TransactionCard';
import { TotalsSummary } from '../components/TotalsSummary';
import { CollaboratorManager } from '../components/CollaboratorManager';
import { BoardHierarchyActionsMenu } from '../components/ui/BoardHierarchyActionsMenu';
import { TRANSACTION_TYPE_LABELS } from '../constants/transactionTypes';
import { subscribeWithAppCheckRetry } from '../utils/appCheckRetry';
import { exportBoardToExcel } from '../utils/exportBoardToExcel';

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
  const [boardRetryingSecureConnection, setBoardRetryingSecureConnection] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [showCollabs, setShowCollabs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [userNickname, setUserNickname] = useState('');
  /**
   * Active payment-method filter.
   * null  → no filter active
   * string → a perGroup key, e.g. "card:1234" or "type:cash"
   */
  const [activePaymentFilterKey, setActivePaymentFilterKey] = useState(null);

  // Clear the payment-method filter whenever the user navigates to a different board
  useEffect(() => {
    setActivePaymentFilterKey(null);
  }, [boardId]);

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
    setBoardError(null);
    setBoardRetryingSecureConnection(false);

    const unsub = subscribeWithAppCheckRetry(
      (onData, onError) => subscribeToBoard(boardId, onData, onError),
      (b) => {
        if (!b || !b.memberUids.includes(user?.uid)) {
          setBoardRetryingSecureConnection(false);
          setBoardLoading(false);
          navigate('/boards');
          return;
        }
        setBoard(b);
        setBoardRetryingSecureConnection(false);
        setBoardLoading(false);
      },
      (err) => {
        setBoardError(err.message);
        setBoardRetryingSecureConnection(false);
        setBoardLoading(false);
      },
      {
        onRetryAttempt: () => {
          setBoardRetryingSecureConnection(true);
          setBoardLoading(true);
          setBoardError(null);
        },
      },
    );
    return unsub;
  }, [boardId, user, navigate]);

  // ---------------------------------------------------------------------------
  // Board type helpers
  // One-level hierarchy rules:
  //   isSuperBoard : has sub-boards (no parent allowed)
  //   isSubBoard   : has a parent (no children allowed)
  //   regular      : neither (can become either)
  // ---------------------------------------------------------------------------
  const isSuperBoard = (board?.subBoardIds?.length ?? 0) > 0;
  const isSubBoard = !!board?.parentBoardId;
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

  // ---------------------------------------------------------------------------
  // Payment-method filter helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns filtered transactions based on the active payment-method filter key.
   * Uses the same null-coalescing as the totals hook (useTransactions) to ensure
   * the filter key always matches what was used to build perGroup entries.
   * key format: "card:XXXX" or "type:<typeName>"
   */
  const visibleTransactions = useMemo(() => {
    if (!activePaymentFilterKey) return transactions;
    return transactions.filter((tx) => {
      if (activePaymentFilterKey.startsWith('card:')) {
        const last4 = activePaymentFilterKey.slice(5);
        // Mirror the totals hook: `tx.cardLast4 ?? ''`
        return tx.type === 'credit_card' && (tx.cardLast4 ?? '') === last4;
      }
      if (activePaymentFilterKey.startsWith('type:')) {
        const typeName = activePaymentFilterKey.slice(5);
        // Mirror the totals hook: `tx.type ?? 'unknown'`
        return (tx.type ?? 'unknown') === typeName;
      }
      return false;
    });
  }, [transactions, activePaymentFilterKey]);

  /**
   * Derives the defaultPaymentMethod value for TransactionForm from an active
   * payment-method filter key. Returns undefined when no filter is active, or
   * when the type is not a recognised transaction type (e.g. 'unknown').
   */
  function paymentFilterToDefaultPaymentMethod(filterKey) {
    if (!filterKey) return undefined;
    if (filterKey.startsWith('card:')) {
      return { type: 'credit_card', cardLast4: filterKey.slice(5) };
    }
    if (filterKey.startsWith('type:')) {
      const typeName = filterKey.slice(5);
      // Only prefill recognised types so the form doesn't show an invalid/unselectable value
      if (!Object.prototype.hasOwnProperty.call(TRANSACTION_TYPE_LABELS, typeName)) return undefined;
      return { type: typeName };
    }
    return undefined;
  }

  /**
   * Human-readable label for the active payment-method filter.
   */
  function paymentFilterLabel(filterKey) {
    if (!filterKey) return '';
    if (filterKey.startsWith('card:')) return `****${filterKey.slice(5)}`;
    if (filterKey.startsWith('type:')) {
      const typeName = filterKey.slice(5);
      return TRANSACTION_TYPE_LABELS[typeName] || typeName;
    }
    return filterKey;
  }


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
  // "Add sub-board" modal
  // Available for: super boards (add more sub-boards) and regular top-level boards
  // (become a super board). NOT available for sub-boards (one-level limit).
  // ---------------------------------------------------------------------------
  const [showAddSubBoard, setShowAddSubBoard] = useState(false);
  const [attachingSubBoardId, setAttachingSubBoardId] = useState(null);
  const [attachSubBoardError, setAttachSubBoardError] = useState(null);

  // Boards that can be attached: owned, top-level regular boards (no parent, no children)
  // isMergeValid enforces all one-level rules, so this filter is already sufficient.
  const attachableCandidates = useMemo(() => {
    if (!isOwner || !board || isSubBoard) return [];
    return allBoards.filter(
      (b) =>
        b.ownerUid === user?.uid &&
        b.id !== boardId &&
        isMergeValid(b.id, boardId, allBoards),
    );
  }, [isOwner, board, isSubBoard, allBoards, boardId, user?.uid]);

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
  // "Move under board" modal (regular top-level board view only)
  // NOT available for sub-boards (already nested) or super boards (one-level limit).
  // ---------------------------------------------------------------------------
  const [showMoveUnder, setShowMoveUnder] = useState(false);
  const [movingUnder, setMovingUnder] = useState(false);
  const [moveUnderError, setMoveUnderError] = useState(null);

  // Boards that can be a parent: owned top-level boards that pass one-level checks
  // isMergeValid now rejects targets that already have a parent (sub-boards).
  const parentCandidates = useMemo(() => {
    if (!isOwner || !board || isSuperBoard || isSubBoard) return [];
    return allBoards.filter(
      (b) =>
        b.ownerUid === user?.uid &&
        b.id !== boardId &&
        isMergeValid(boardId, b.id, allBoards),
    );
  }, [isOwner, board, isSuperBoard, isSubBoard, allBoards, boardId, user?.uid]);

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
    setNewSubBoardTitle('');
    setCreateSubBoardError(null);
    setShowAddSubBoard(true);
  }

  function openMoveUnderModal() {
    setMoveUnderError(null);
    setShowMoveUnder(true);
  }

  // ---------------------------------------------------------------------------
  // Rename board (owner only)
  // ---------------------------------------------------------------------------
  const [showRename, setShowRename] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState(null);

  function openRenameModal() {
    setRenameTitle(board?.title ?? '');
    setRenameError(null);
    setShowRename(true);
  }

  async function handleRename(e) {
    e.preventDefault();
    const trimmed = renameTitle.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    setRenameError(null);
    try {
      await renameBoard(boardId, trimmed);
      setShowRename(false);
    } catch (err) {
      setRenameError(err.message || 'שגיאה בשמירת השם. נסה שוב.');
    } finally {
      setRenameSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Create new sub-board inline (inside "הוסף לוח-משנה" modal)
  // ---------------------------------------------------------------------------
  const [newSubBoardTitle, setNewSubBoardTitle] = useState('');
  const [creatingSubBoard, setCreatingSubBoard] = useState(false);
  const [createSubBoardError, setCreateSubBoardError] = useState(null);

  async function handleCreateSubBoard(e) {
    e.preventDefault();
    const trimmed = newSubBoardTitle.trim();
    if (!trimmed) return;
    setCreatingSubBoard(true);
    setCreateSubBoardError(null);
    try {
      const newBoardRef = await createBoard(trimmed, user.uid);
      await mergeBoardsIntoSuper(newBoardRef.id, boardId);
      setNewSubBoardTitle('');
      setShowAddSubBoard(false);
    } catch (err) {
      setCreateSubBoardError(err.message || 'שגיאה ביצירת לוח-המשנה. נסה שוב.');
    } finally {
      setCreatingSubBoard(false);
    }
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

  async function handleExportExcel() {
    if (!board) return;
    setExportingExcel(true);
    setExportError(null);
    try {
      if (isSuperBoard) {
        const subBoardSheets = await Promise.all(
          (board.subBoardIds ?? []).map(async (subBoardId) => {
            const subBoard = allBoards.find((candidate) => candidate.id === subBoardId);
            return {
              name: subBoard?.title || 'לוח',
              transactions: await getTransactionsForBoard(subBoardId),
            };
          }),
        );
        await exportBoardToExcel({
          boardName: board.title,
          worksheets: subBoardSheets,
          includeSummarySheet: true,
        });
      } else {
        await exportBoardToExcel({
          boardName: board.title,
          worksheets: [
            {
              name: board.title || 'לוח',
              transactions,
            },
          ],
        });
      }
    } catch (err) {
      setExportError(err.message || 'שגיאה בייצוא לאקסל. נסה שוב.');
    } finally {
      setExportingExcel(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (boardLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 dark:bg-gray-950">
        <Spinner size="lg" />
        {boardRetryingSecureConnection && (
          <p className="text-sm text-gray-500 dark:text-gray-400">מנסה מחדש ליצור חיבור מאובטח…</p>
        )}
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
              {isOwner && (
                <button
                  onClick={openRenameModal}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="ערוך שם לוח"
                  aria-label="ערוך שם לוח"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              {isSuperBoard && (
                <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                  לוח-על
                </span>
              )}
              {isSubBoard && (
                <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                  לוח-משנה
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
            {/* Board hierarchy actions – merged into a single dropdown menu */}
            {(isOwner || isSuperBoard) && (
              <BoardHierarchyActionsMenu
                canAddSubBoard={isOwner && !isSubBoard}
                canMoveUnder={isOwner && !isSuperBoard && !isSubBoard}
                canExport={isSuperBoard}
                onAddSubBoard={openAddSubBoardModal}
                onMoveUnder={openMoveUnderModal}
                onExport={handleExportExcel}
                exporting={exportingExcel}
              />
            )}
            {!isSuperBoard && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportExcel}
                loading={exportingExcel}
                disabled={exportingExcel}
              >
                ייצוא לאקסל
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
        {exportError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {exportError}
          </div>
        )}
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
            <TotalsSummary
              totals={totals}
              activeFilterKey={activePaymentFilterKey}
              onFilterChange={setActivePaymentFilterKey}
            />

            {/* Active payment-method filter indicator */}
            {activePaymentFilterKey && (
              <div className="flex items-center gap-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 px-4 py-2 text-sm">
                <span className="text-indigo-600 dark:text-indigo-400">
                  מסונן לפי: <strong>{paymentFilterLabel(activePaymentFilterKey)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setActivePaymentFilterKey(null)}
                  className="mr-auto flex items-center gap-1 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  aria-label="נקה סינון"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  נקה סינון
                </button>
              </div>
            )}

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
              ) : visibleTransactions.length === 0 ? (
                <EmptyState
                  icon={
                    <svg className="h-14 w-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  }
                  title={activePaymentFilterKey ? 'אין עסקאות בסינון זה' : 'אין עסקאות עדיין'}
                  description={activePaymentFilterKey ? 'אין עסקאות התואמות לאמצעי התשלום שנבחר' : 'הוסף את העסקה הראשונה כדי להתחיל לעקוב'}
                  action={
                    activePaymentFilterKey ? (
                      <Button variant="secondary" onClick={() => setActivePaymentFilterKey(null)}>
                        נקה סינון
                      </Button>
                    ) : (
                      <Button onClick={() => setShowAddModal(true)}>
                        הוסף עסקה ראשונה
                      </Button>
                    )
                  }
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {visibleTransactions.map((tx) => (
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
          defaultPaymentMethod={paymentFilterToDefaultPaymentMethod(activePaymentFilterKey)}
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

      {/* Add Sub-Board Modal (super board / regular top-level board, owner only) */}
      <Modal
        isOpen={showAddSubBoard}
        onClose={() => setShowAddSubBoard(false)}
        title="הוסף לוח-משנה"
      >
        <div className="flex flex-col gap-5">
          {/* Section 1: Create a brand-new sub-board */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              יצירת לוח-משנה חדש
            </p>
            <form onSubmit={handleCreateSubBoard} className="flex flex-col gap-3">
              <Input
                label="שם הלוח החדש"
                value={newSubBoardTitle}
                onChange={(e) => setNewSubBoardTitle(e.target.value)}
                placeholder="לדוגמה: הוצאות ינואר"
                autoFocus
              />
              {createSubBoardError && (
                <p className="text-sm text-red-500 dark:text-red-400">{createSubBoardError}</p>
              )}
              <Button
                type="submit"
                size="sm"
                loading={creatingSubBoard}
                disabled={!newSubBoardTitle.trim() || !!attachingSubBoardId}
              >
                צור וצרף
              </Button>
            </form>
          </div>

          {/* Divider */}
          {attachableCandidates.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-400 dark:text-gray-500">או</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
          )}

          {/* Section 2: Attach an existing board */}
          {attachableCandidates.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                צירוף לוח קיים
              </p>
              {attachSubBoardError && (
                <p className="text-sm text-red-500 dark:text-red-400 mb-2">{attachSubBoardError}</p>
              )}
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
                      disabled={!!attachingSubBoardId || creatingSubBoard}
                      onClick={() => handleAttachSubBoard(candidate.id)}
                    >
                      צרף
                    </Button>
                  </div>
                ))}
              </div>
            </div>
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
      {/* Rename Board Modal (owner only) */}
      <Modal
        isOpen={showRename}
        onClose={() => setShowRename(false)}
        title="ערוך שם לוח"
      >
        <form onSubmit={handleRename} className="flex flex-col gap-4">
          <Input
            label="שם הלוח"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            autoFocus
          />
          {renameError && (
            <p className="text-sm text-red-500 dark:text-red-400">{renameError}</p>
          )}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={() => setShowRename(false)}>
              ביטול
            </Button>
            <Button type="submit" loading={renameSaving} disabled={!renameTitle.trim()}>
              שמור
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
