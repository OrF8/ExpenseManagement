import { useEffect, useId } from 'react';
import { acquireBodyScrollLock } from './bodyScrollLock';

export function Modal({ isOpen, onClose, title, children }) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [is