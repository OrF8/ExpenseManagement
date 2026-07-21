import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { acquireBodyScrollLock } from '../src/components/ui/bodyScrollLock.js';

beforeEach(() => {
  globalThis.document = {
    body: {
      style: {
        overflow: '',
      },
    },
  };
});

afterEach(() => {
  delete globalThis.document;
});

function setBodyOverflow(value) {
  document.body.style.overflow = value;
}

function getBodyOverflow() {
  return document.body.style.overflow;
}

test('single modal lock restores the original non-hidden overflow value', () => {
  setBodyOverflow('auto');

  const release = acquireBodyScrollLock();

  assert.equal(getBodyOverflow(), 'hidden');

  release();

  assert.equal(getBodyOverflow(), 'auto');
});

test('two stacked modal locks keep the body locked when the inner lock is released first', () => {
  setBodyOverflow('scroll');

  const releaseOuter = acquireBodyScrollLock();
  const releaseInner = acquireBodyScrollLock();

  releaseInner();
  assert.equal(getBodyOverflow(), 'hidden');

  releaseOuter();
  assert.equal(getBodyOverflow(), 'scroll');
});

test('two stacked modal locks keep the body locked when the outer lock is released first', () => {
  setBodyOverflow('clip');

  const releaseOuter = acquireBodyScrollLock();
  const releaseInner = acquireBodyScrollLock();

  releaseOuter();
  assert.equal(getBodyOverflow(), 'hidden');

  releaseInner();
  assert.equal(getBodyOverflow(), 'clip');
});

test('release functions are idempotent and do not underflow the lock count', () => {
  setBodyOverflow('auto');

  const release = acquireBodyScrollLock();

  release();
  assert.equal(getBodyOverflow(), 'auto');

  release();
  assert.equal(getBodyOverflow(), 'auto');

  const releaseAgain = acquireBodyScrollLock();
  assert.equal(getBodyOverflow(), 'hidden');

  releaseAgain();
  assert.equal(getBodyOverflow(), 'auto');
});

test('the exact pre-existing inline overflow value is restored after the final release', () => {
  setBodyOverflow('clip');

  const release = acquireBodyScrollLock();

  assert.equal(getBodyOverflow(), 'hidden');

  release();

  assert.equal(getBodyOverflow(), 'clip');
});

test('sequential lock reuse does not leak state between modal cycles', () => {
  setBodyOverflow('auto');

  const releaseFirst = acquireBodyScrollLock();
  assert.equal(getBodyOverflow(), 'hidden');
  releaseFirst();
  assert.equal(getBodyOverflow(), 'auto');

  setBodyOverflow('scroll');

  const releaseSecond = acquireBodyScrollLock();
  assert.equal(getBodyOverflow(), 'hidden');
  releaseSecond();
  assert.equal(getBodyOverflow(), 'scroll');
});
