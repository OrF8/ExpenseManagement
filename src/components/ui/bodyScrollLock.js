let activeBodyScrollLocks = 0;
let bodyOverflowBeforeFirstLock = '';

export function acquireBodyScrollLock() {
  if (typeof document === 'undefined') {
    return () => {};
  }

  if (activeBodyScrollLocks === 0) {
    bodyOverflowBeforeFirstLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  activeBodyScrollLocks += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;

    activeBodyScrollLocks = Math.max(0, activeBodyScrollLocks - 1);

    if (activeBodyScrollLocks === 0) {
      document.body.style.overflow = bodyOverflowBeforeFirstLock;
      bodyOverflowBeforeFirstLock = '';
    }
  };
}
