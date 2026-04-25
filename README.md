# Expense Management

Expense Management is a Firebase + React web app for collaborative expense tracking, with a Hebrew RTL UI.
It supports shared boards, one-level board hierarchies ("super boards" with sub-boards), invites, and Excel export.

🌐 **Live app:** https://of8-expense-management.web.app/

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?logo=opensourceinitiative" alt="License: MIT">
  <img src="https://img.shields.io/github/languages/top/OrF8/ExpenseManagement?style=default&logo=javascript&color=F7DF1E" alt="top-language">
  <img src="https://img.shields.io/badge/Release-v1.1.3-4c1?style=flat" alt="Release v1.1.3">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="react">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="vite">
  <img src="https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase&logoColor=black" alt="firebase">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="tailwind">
</p>
<p align="center">
  <img src="https://github.com/OrF8/ExpenseManagement/actions/workflows/deploy.yml/badge.svg?branch=main" alt="Deploy to Firebase">
  <img src="https://github.com/OrF8/ExpenseManagement/actions/workflows/codeql.yml/badge.svg?branch=main" alt="CodeQL Advanced">
</p>

## Table of Contents

- [Overview](#overview)
- [Features](#Features)
- [Boards vs. Super Boards](#boards-vs-super-boards)
- [Access Model (Direct vs. Inherited)](#access-model-direct-vs-inherited)
- [Invitation Flow](#invitation-flow)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Development](#development)
- [Deployment](#deployment)
- [Security & Privacy Notes](#security--privacy-notes)
- [Release Status](#release-status)
- [License](#license)

## Overview

The app is designed for small groups (families, roommates, partners) who manage shared spending.
Each board has members, transactions, and optional hierarchy relationships.
Data is stored in Firestore and updates in real time.

## Features

- **Authentication:** Email/password and Google sign-in.
- **Boards:** Create, rename, delete, and view shared boards.
- **Super boards:** Group regular boards under one parent board (one-level hierarchy).
- **Invitations:** Board owners can invite by email; invitees can accept or decline.
- **Membership model:**
  - `directMemberUids`: explicitly invited to a board.
  - `memberUids`: effective access (direct + inherited from parent board).
- **Inherited access:** Membership flows **down** from a super board to its sub-boards.
- **Transactions:** Create, edit, and delete transactions on regular boards.
- **Amounts:** Positive and negative amounts are supported (useful for refunds/credits).
- **Future dates:** Optional `transactionDate` accepts valid `YYYY-MM-DD` dates, including future dates.
- **Excel export:**
  - Regular board: single worksheet export.
  - Super board: multi-sheet export (one sheet per sub-board) + optional summary sheet.
- **Account management:** Update nickname, sign out, and delete account (with server-side cleanup).

## Boards vs. Super Boards

- **Regular board:** A board without `subBoardIds`; it contains transactions directly.
- **Super board:** A board with one or more `subBoardIds`; it aggregates totals from sub-boards and does not show a transaction-entry view.
- **Sub-board:** A board with `parentBoardId` set.

Hierarchy is intentionally **one level**:
- A board can be top-level, or a child of one parent board.
- A sub-board cannot itself have sub-boards.

## Access Model (Direct vs. Inherited)

This project uses two membership fields:

- `directMemberUids` = users directly added to that board.
- `memberUids` = users with effective access to that board.

Behavior:
- Direct membership on a super board grants inherited access to descendant sub-boards.
- Direct membership on a sub-board does **not** grant access to its parent.
- Removing a direct member cascades membership recalculation through descendants.

## Invitation Flow

1. Board owner sends an invite by email.
2. Invite document is created under `boards/{boardId}/invites`.
3. Invitee sees incoming invites and can accept/decline.
4. Accepting adds membership and deletes the invite.
5. Declining deletes the invite.

Notes:
- Invites include `expiresAt` and are treated as pending while the document exists.
- Functions enforce ownership/auth checks before invite and membership mutations.

## Architecture

- **Frontend:** React 19 + Vite 8 + React Router 7 + Tailwind CSS 4.
- **Backend:** Firebase Cloud Functions (Node.js 22 runtime).
- **Data/Auth:** Firestore + Firebase Authentication.
- **Hosting:** Firebase Hosting.
- **Security controls:** Firestore Security Rules, App Check integration in the client, and callable functions with `enforceAppCheck: true`.

## Project Structure

```text
ExpenseManagement/
├── src/
│   ├── components/      # UI and board/collaborator components
│   ├── context/         # Auth and theme providers
│   ├── firebase/        # Firebase client modules (auth, boards, invites, users, config)
│   ├── hooks/           # Data hooks (boards, transactions, incoming invites)
│   └── pages/           # Route pages (auth, boards, board view, legal pages)
├── functions/           # Callable Cloud Functions for invite/member/account flows
├── firestore.rules      # Firestore authorization and validation rules
├── firebase.json        # Hosting targets, headers, and Firebase service config
└── .github/workflows/   # Deploy + CodeQL workflows
```

## Setup

### Prerequisites

- Node.js 22+ (recommended for local dev, including functions)
- npm
- Firebase project with:
  - Authentication
  - Cloud Firestore
  - Cloud Functions
  - Hosting
  - App Check (recommended/enabled for production)

### Install

```bash
git clone https://github.com/OrF8/ExpenseManagement.git
cd ExpenseManagement
npm ci
npm --prefix functions ci
```

### Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_RECAPTCHA_V3_SITE_KEY`

Optional preview deployment file:

```bash
cp .env.preview.example .env.preview
```

Additional preview variables:

- `VITE_APPCHECK_DEBUG` (optional)
- `VITE_APPCHECK_DEBUG_TOKEN` (optional)
- `FIREBASE_PROJECT_ID` (required for preview deploy script)

## Development

### Run locally

```bash
npm run dev
```

Vite dev server: `http://localhost:5173`

### Production build preview

```bash
npm run build
npm run preview
```

Preview server: `http://localhost:4173`

### Linting

- Frontend linting is configured via ESLint:

```bash
npm run lint
```

- Functions package currently has a placeholder lint script (`Skipping lint`).

## Deployment

### CI/CD (main branch)

GitHub Actions workflow `.github/workflows/deploy.yml`:
- builds the frontend,
- deploys **Functions + Hosting** to Firebase,
- authenticates with Google via Workload Identity Federation (OIDC).

### Manual deploy

```bash
npm run build
firebase deploy --only functions,hosting --project <project-id>
```

To deploy Firestore rules explicitly:

```bash
firebase deploy --only firestore:rules --project <project-id>
```

### Preview deployment script

A PowerShell script is provided for preview channels:

```bash
npm run deploy:preview -- -PrNumber <pr-number>
```

This script:
- loads `.env.preview`,
- deploys functions,
- builds with `--mode preview`,
- deploys a Firebase Hosting preview channel.

## Security & Privacy Notes

- Firestore rules restrict board reads/writes to authorized users and owners by role.
- Invite and membership mutations are handled through callable functions instead of broad client-side user reads.
- Callable functions are configured with App Check enforcement.
- Account deletion is handled server-side to remove owned data and membership links.
- This is a collaborative app: data shared to a board is visible to that board’s members.

For vulnerability reporting, see [SECURITY.md](./SECURITY.md).

## Release Status

Current release target: **v1.1.3**.

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## License

This project is licensed under the MIT license. For more information, see the [LICENSE](./LICENSE) file.
