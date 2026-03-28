/**
 * Collaborator management UI for a board.
 * Allows adding collaborators by UID.
 * Architecture is designed to support email-based lookup in the future.
 */
import { useState } from 'react';
import { addCollaborator } from '../firebase/boards';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

export function CollaboratorManager({ board }) {
  const [uid, setUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = uid.trim();
    if (!trimmed) return;
    if (board.memberUids.includes(trimmed)) {
      setError('משתמש זה כבר חבר בלוח');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await addCollaborator(board.id, trimmed);
      setUid('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="הזן UID של המשתמש"
            value={uid}
            onChange={(e) => {
              setUid(e.target.value);
              setError(null);
            }}
            error={error}
          />
        </div>
        <Button type="submit" loading={loading} disabled={!uid.trim()}>
          הוסף
        </Button>
      </form>
      {success && (
        <p className="text-sm text-green-600 font-medium">
          ✓ שיתוף נוסף בהצלחה
        </p>
      )}
      <div>
        <p className="text-xs text-gray-500 mb-2">
          חברי הלוח ({board.memberUids.length})
        </p>
        <div className="flex flex-col gap-1">
          {board.memberUids.map((m) => (
            <div
              key={m}
              className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
            >
              <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-600 font-bold shrink-0">
                {m.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-mono text-gray-600 truncate">
                {m}
                {m === board.ownerUid && (
                  <span className="mr-2 text-xs text-indigo-500">(בעלים)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
