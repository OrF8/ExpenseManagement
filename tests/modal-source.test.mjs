import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/components/ui/Modal.jsx', import.meta.url), 'utf8');

test('modal preserves dialog semantics and close affordances', () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby=\{titleId\}/);
  assert.match(source, /aria-label="סגור"/);
  assert.match(source, /type="button"/);
  assert.match(source, /Escape/);
  assert.match(source, /onClick=\{onClose\}/);
  assert.match(source, /stopPropagation\(\)/);
});

test('modal locks body scrolling and restores the previous overflow value', () => {
  assert.match(source, /previousBodyOverflow/);
  assert.match(source, /document\.body\.style\.overflow/);
  assert.match(source, /= 'hidden'/);
  assert.match(source, /previousBodyOverflow\.current \?\? ''/);
});

test('modal uses constrained flex panel with internal scrolling content', () => {
  assert.match(source, /max-h-\[calc\(100dvh-1\.5rem\)\]/);
  assert.match(source, /sm:max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(source, /flex-col/);
  assert.match(source, /overflow-hidden/);
  assert.match(source, /shrink-0/);
  assert.match(source, /min-h-0/);
  assert.match(source, /min-w-0/);
  assert.match(source, /flex-1/);
  assert.match(source, /overflow-y-auto/);
  assert.match(source, /overflow-x-hidden/);
  assert.match(source, /overscroll-contain/);
});
