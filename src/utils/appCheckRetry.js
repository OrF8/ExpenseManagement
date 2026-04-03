const DEFAULT_RETRY_DELAYS_MS = [800, 1500];

function toSearchableText(error) {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  return `${code} ${message}`;
}

export function isTransientAppCheckError(error) {
  const text = toSearchableText(error);
  return (
    text.includes('appcheck') ||
    text.includes('app check') ||
    text.includes('recaptcha') ||
    text.includes('error while retrieving app check token')
  );
}

/**
 * Wraps an onSnapshot-like subscription and retries only the initial subscription
 * failures that look like transient App Check / reCAPTCHA startup issues.
 *
 * @param {(onData: function, onError: function) => function} subscribeFn
 * @param {function} onData
 * @param {function} onError
 * @param {{ retryDelaysMs?: number[], onRetryAttempt?: function }} options
 * @returns {function} unsubscribe
 */
export function subscribeWithAppCheckRetry(
  subscribeFn,
  onData,
  onError,
  options = {},
) {
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const onRetryAttempt = options.onRetryAttempt;

  let cancelled = false;
  let initialDataReceived = false;
  let retryIndex = 0;
  let activeUnsubscribe = () => {};
  let retryTimer = null;

  function clearRetryTimer() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function startSubscription() {
    if (cancelled) return;
    activeUnsubscribe = subscribeFn(
      (data) => {
        initialDataReceived = true;
        onData(data);
      },
      (error) => {
        const canRetry =
          !initialDataReceived &&
          retryIndex < retryDelaysMs.length &&
          isTransientAppCheckError(error);

        if (!canRetry) {
          onError(error);
          return;
        }

        const delayMs = retryDelaysMs[retryIndex];
        retryIndex += 1;
        onRetryAttempt?.({ attempt: retryIndex, delayMs, error });
        activeUnsubscribe?.();
        clearRetryTimer();
        retryTimer = setTimeout(() => {
          startSubscription();
        }, delayMs);
      },
    );
  }

  startSubscription();

  return () => {
    cancelled = true;
    clearRetryTimer();
    activeUnsubscribe?.();
  };
}
