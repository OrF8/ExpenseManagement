# 💰 ניהול הוצאות — Expense Management

**Expense Management** is a collaborative Hebrew RTL web app for tracking shared expenses across families, roommates, and partners — all in one place, in real time.

Instead of juggling spreadsheets or lengthy message threads, ask yourself:
- How do you keep everyone aligned when managing shared household or group costs?
- How do you track installment payments across multiple credit cards without losing count?
- How do you see running totals per card, instantly, without doing the math yourself?

This project was built by [**Or Forshmit**](https://github.com/OrF8).

🌐 **[Try the live app →](https://of8-expense-management.web.app/)**

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?logo=opensourceinitiative" alt="License: MIT">
  <img src="https://img.shields.io/github/languages/top/OrF8/ExpenseManagement?style=default&logo=javascript&color=F7DF1E" alt="top-language">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="react">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="vite">
  <img src="https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase&logoColor=black" alt="firebase">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="tailwind">
  <img src="https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white" alt="react-router">
</p>

---

## 🔗 Table of Contents

- [📍 Overview](#-overview)
- [✨ Key Features](#-key-features)
- [📁 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
  - [☑️ Prerequisites](#%EF%B8%8F-prerequisites)
  - [⚙️ Installation](#%EF%B8%8F-installation)
  - [🔧 Configuration](#-configuration)
  - [▶️ Running Locally](#%EF%B8%8F-running-locally)
- [🔥 Firebase Setup](#-firebase-setup)
- [⚡ Cloud Functions](#-cloud-functions)
- [🛡️ Security: Firebase App Check](#️-security-firebase-app-check)
- [👤 Profile & Account Management](#-profile--account-management)
- [🔒 Privacy & Terms](#-privacy--terms)
- [🤝🏼 Contributing](#-contributing)
- [📄 License](#-license)

---

## 📍 Overview

Managing shared expenses is harder than it sounds. Between split rent, grocery runs, shared subscriptions, and multi-installment purchases, keeping everyone aligned quickly turns into a full-time job.

**Expense Management** solves this with a real-time collaborative board system — each board is a shared ledger where members can log, track, and review transactions together. Invite collaborators by email, track credit card installments, and see running totals per card — all in a clean, native Hebrew RTL interface.

---

## ✨ Key Features

- 🔐 **Authentication** — email/password and Google Sign-In via Firebase Auth
- 📋 **Collaborative boards** — create shared expense boards and manage multiple ledgers
- 👥 **Invitation system** — invite collaborators by email; accept or decline via secure Cloud Functions
- 💳 **Transaction tracking** — log expenses with card last-4, name, description, and amount
- 📊 **Installment support** — track payments as installment X of Y (תשלום X מתוך Y)
- 💰 **Auto-calculated totals** — per-card subtotals and a grand total, always up to date
- 🔄 **Real-time updates** — Firestore listeners push changes to all board members instantly
- 👤 **Profile & account management** — change nickname, sign out, or permanently delete your account (with full cascade cleanup) from a dedicated account panel
- 🌐 **Full Hebrew RTL UI** — built natively for right-to-left layout
- 🌙 **Dark / light mode** — theme preference persisted locally

---

## 📁 Project Structure

```
ExpenseManagement/
├── src/
│   ├── pages/           # Route-level views (Auth, Boards, BoardPage, Landing, Privacy, Terms)
│   ├── components/      # Reusable UI components (TransactionCard, TransactionForm, CollaboratorManager, …)
│   │   └── ui/          # Primitive components (Button, Input, Modal, Spinner, ThemeToggle)
│   ├── firebase/        # Firestore & Auth wrappers (auth, boards, invites, transactions, users)
│   ├── hooks/           # Custom React hooks (useBoards, useTransactions, useIncomingInvites)
│   ├── context/         # React context providers (AuthContext, ThemeContext)
│   ├── constants/       # Shared constants (transactionTypes)
│   └── assets/          # Logos and images
├── functions/           # Firebase Cloud Functions (acceptBoardInvite, declineBoardInvite, removeBoardMember, leaveBoard)
├── public/              # Static assets (favicon, PWA icons, og-image)
├── firestore.rules      # Firestore security rules
├── firebase.json        # Firebase project configuration
└── vite.config.js       # Vite / PWA build configuration
```

---

## 🚀 Getting Started

### ☑️ Prerequisites

- **Node.js** 18+
- A **Firebase project** with Authentication and Firestore enabled

### ⚙️ Installation

```bash
git clone https://github.com/OrF8/ExpenseManagement.git
cd ExpenseManagement
npm install
```

### 🔧 Configuration

Copy `.env.example` to `.env` and fill in your Firebase project values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

### ▶️ Running Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

To build and preview a production bundle:

```bash
npm run build
npm run preview
```

---

## 🔥 Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → sign-in methods: Email/Password and Google
3. Enable **Firestore Database** in production mode
4. Enable **Cloud Functions** (requires the Blaze pay-as-you-go plan)
5. Deploy the security rules from [`firestore.rules`](./firestore.rules):

```bash
firebase deploy --only firestore:rules
```

> The rules restrict board access to members, invite access to the board owner and invited user, and user-profile writes to the profile owner. See [`firestore.rules`](./firestore.rules) for the full definition.

---

## ⚡ Cloud Functions

The `functions/` directory contains six callable Cloud Functions:

| Function | Description |
|---|---|
| `acceptBoardInvite` | Atomically adds the caller to `board.memberUids` and marks the invite accepted |
| `declineBoardInvite` | Marks the invite as declined |
| `removeBoardMember` | Allows the board owner to remove a non-owner member |
| `leaveBoard` | Allows a non-owner member to remove themselves from a board |
| `deleteBoard` | Allows the board owner to fully delete a board and all its subcollections |
| `deleteMyAccount` | Permanently deletes the caller's account, all owned boards, and all related data |

**Requirements:** Firebase CLI (`npm install -g firebase-tools`) and the Blaze (pay-as-you-go) plan.

**Deploy:**

```bash
firebase login
firebase use --add          # link your project and give it an alias (e.g. "default")
cd functions && npm install && cd ..
firebase deploy --only functions
```

**Local emulation (optional):**

```bash
firebase emulators:start --only functions,firestore
```

To connect the app to the local emulator, add to `src/firebase/config.js`:

```js
import { connectFunctionsEmulator } from 'firebase/functions';
if (location.hostname === 'localhost') {
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

---

## 🛡️ Security: Firebase App Check

[Firebase App Check](https://firebase.google.com/docs/app-check) protects backend resources from abuse by ensuring that only requests originating from the legitimate app are processed. It complements Firebase Authentication — Authentication identifies *who* is making a request, while App Check verifies *what* is making the request.

### What Is Protected

| Resource | Protection |
|---|---|
| **Cloud Firestore** | App Check tokens are verified on read/write operations |
| **Callable Cloud Functions** | All six callable functions enforce App Check (`enforceAppCheck: true`) |

### How It Works

1. **Frontend initialization** — On startup, the app initializes App Check using `ReCaptchaV3Provider` from the Firebase SDK.
2. **Automatic token attachment** — The Firebase SDK automatically attaches a valid App Check token to every Firestore and Functions request.
3. **Backend verification** — Firebase services verify the token server-side before processing the request.
4. **Callable function enforcement** — All callable Cloud Functions are declared with `enforceAppCheck: true`, so requests without a valid App Check token are rejected.

### Environment Setup

Two additional environment variables are required beyond the standard Firebase config:

| Variable | Description |
|---|---|
| `VITE_RECAPTCHA_V3_SITE_KEY` | reCAPTCHA site key from Google Cloud Console |
| `VITE_APPCHECK_DEBUG` | Set to `true` to force debug mode (e.g. in preview/CI environments) |
| `VITE_APPCHECK_DEBUG_TOKEN` | Pre-created debug token registered in Firebase Console |

#### Local Development

App Check runs in debug mode automatically during `npm run dev`. A debug token is printed in the browser console:

```
App Check debug token: <token>
```

Register this token in **Firebase Console → App Check → Apps → your app → Debug tokens**.

#### Preview Deployments (PRs)

Use debug mode with a pre-created token to avoid relying on the browser console. Set the following in your CI/CD environment variables:

```
VITE_APPCHECK_DEBUG=true
VITE_APPCHECK_DEBUG_TOKEN=<your-debug-token>
```

Register the same token in Firebase Console → App Check → Debug tokens.

#### Production

No additional configuration needed. The app uses reCAPTCHA to obtain real App Check tokens automatically. Ensure `VITE_RECAPTCHA_V3_SITE_KEY` is set to your production reCAPTCHA site key.

---

## 👤 Profile & Account Management

The app includes a dedicated **Account Settings** panel, accessible from the profile button in the top-right corner of the boards screen.

### What's in the panel

| Action | Description |
|---|---|
| **שנה כינוי** (Change nickname) | Update the display name shown throughout the app |
| **יציאה** (Sign out) | Sign out of the current session |
| **מחק חשבון** (Delete account) | Permanently delete your account and all associated data |

### Account deletion

Deleting your account is a **destructive, irreversible action** that removes all data you own:

- **Your Auth account** is permanently deleted.
- **All boards you created** are deleted — including boards that have collaborators. Ownership is absolute: shared boards created by you are removed regardless of other members.
- **All descendant boards** under your owned boards are also deleted (board hierarchies are fully removed).
- **All data under those boards** is deleted: transactions, invites, and any other subcollection data.
- **Your membership** is cleaned up from boards you participate in but do not own, so other users' boards remain intact.
- **Your user profile** (`users/{uid}`) is deleted from Firestore.

The deletion is performed entirely server-side via the `deleteMyAccount` Cloud Function. Your UID is derived from the authenticated session token — you cannot delete anyone else's account. The UI shows a confirmation dialog with a clear warning before proceeding.

---

## 🔒 Privacy & Terms

This app includes a [Privacy Policy](https://of8-expense-management.web.app/privacy) (`/privacy`) and [Terms of Service](https://of8-expense-management.web.app/terms) (`/terms`) for compliance with Firebase and Google Sign-In requirements.

---

## 🤝🏼 Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
