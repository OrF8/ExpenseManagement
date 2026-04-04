import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisibleIncomingInvites } from '../incomingInvitesFilter.js';

function ts(ms) {
  return { toMillis: () => ms };
}

const NOW = Date.UTC(2026, 0, 1);

function makeInvite(overrides = {}) {
  return {
    id: 'invite-1',
    boardId: 'board-1',
    createdAt: ts(NOW - 1_000),
    expiresAt: ts(NOW + 60_000),
    ...overrides,
  };
}

test('pending invite is visible for inherited member (memberUids yes, directMemberUids no)', () => {
  const invite = makeInvite();
  const boardsById = {
    'board-1': {
      memberUids: ['owner-1', 'user-a'],
      directMemberUids: ['owner-1'],
    },
  };

  const visible = getVisibleIncomingInvites({
    invites: [invite],
    boardsById,
    currentUid: 'user-a',
    nowMs: NOW,
  });

  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, invite.id);
});

test('pending invite is visible for non-member baseline', () => {
  const invite = makeInvite();
  const boardsById = {
    'board-1': {
      memberUids: ['owner-1'],
      directMemberUids: ['owner-1'],
    },
  };

  const visible = getVisibleIncomingInvites({
    invites: [invite],
    boardsById,
    currentUid: 'user-a',
    nowMs: NOW,
  });

  assert.equal(visible.length, 1);
});

test('invite is not hidden just because board is accessible via inheritance', () => {
  const invite = makeInvite();
  const boardsById = {
    'board-1': {
      memberUids: ['owner-1', 'user-a'],
      directMemberUids: ['owner-1'],
      parentBoardId: 'board-parent',
    },
  };

  const visible = getVisibleIncomingInvites({
    invites: [invite],
    boardsById,
    currentUid: 'user-a',
    nowMs: NOW,
  });

  assert.equal(visible.length, 1);
});

test('direct member does not get actionable pending invite (including legacy board docs)', () => {
  const invite = makeInvite();

  const visibleModern = getVisibleIncomingInvites({
    invites: [invite],
    boardsById: {
      'board-1': { memberUids: ['owner-1', 'user-a'], directMemberUids: ['owner-1', 'user-a'] },
    },
    currentUid: 'user-a',
    nowMs: NOW,
  });
  assert.equal(visibleModern.length, 0);

  const visibleLegacy = getVisibleIncomingInvites({
    invites: [invite],
    boardsById: {
      'board-1': { memberUids: ['owner-1', 'user-a'] },
    },
    currentUid: 'user-a',
    nowMs: NOW,
  });
  assert.equal(visibleLegacy.length, 0);
});

test('accepting inherited-member invite flow: visible before, hidden after invite removed and direct membership added', () => {
  const invite = makeInvite();

  const before = getVisibleIncomingInvites({
    invites: [invite],
    boardsById: {
      'board-1': { memberUids: ['owner-1', 'user-a'], directMemberUids: ['owner-1'] },
    },
    currentUid: 'user-a',
    nowMs: NOW,
  });
  assert.equal(before.length, 1);

  const after = getVisibleIncomingInvites({
    invites: [],
    boardsById: {
      'board-1': { memberUids: ['owner-1', 'user-a'], directMemberUids: ['owner-1', 'user-a'] },
    },
    currentUid: 'user-a',
    nowMs: NOW,
  });
  assert.equal(after.length, 0);
});

test('rejecting inherited-member invite flow: visible before, hidden after invite removed and inherited-only membership remains', () => {
  const invite = makeInvite();

  const before = getVisibleIncomingInvites({
    invites: [invite],
    boardsById: {
      'board-1': { memberUids: ['owner-1', 'user-a'], directMemberUids: ['owner-1'] },
    },
    currentUid: 'user-a',
    nowMs: NOW,
  });
  assert.equal(before.length, 1);

  const after = getVisibleIncomingInvites({
    invites: [],
    boardsById: {
      'board-1': { memberUids: ['owner-1', 'user-a'], directMemberUids: ['owner-1'] },
    },
    currentUid: 'user-a',
    nowMs: NOW,
  });
  assert.equal(after.length, 0);
});

test('filters out expired invites and invites for deleted boards', () => {
  const expiredInvite = makeInvite({ id: 'expired', expiresAt: ts(NOW - 1) });
  const deletedBoardInvite = makeInvite({ id: 'deleted-board', boardId: 'missing-board' });

  const visible = getVisibleIncomingInvites({
    invites: [expiredInvite, deletedBoardInvite],
    boardsById: {
      'board-1': { memberUids: ['owner-1'], directMemberUids: ['owner-1'] },
    },
    currentUid: 'user-a',
    nowMs: NOW,
  });

  assert.equal(visible.length, 0);
});
