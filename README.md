# 💰 ניהול הוצאות — Expense Management

**Expense Management** is a collaborative Hebrew RTL web app for tracking shared expenses across families, roommates, and partners — all in one place, in real time.

Instead of juggling spreadsheets or lengthy message threads, ask yourself:
- How do you keep everyone aligned when managing shared household or group costs?
- How do you track installment payments across multiple credit cards without losing count?
- How do you see running totals per card, instantly, without doing the math yourself?

This project was built by [**Or Forshmit**](https://github.com/OrF8).

<p align="center">
  <img src="https://img.shields.io/github/license/OrF8/ExpenseManagement?style=default&logo=opensourceinitiative" alt="license">
  <img src="https://img.shields.io/github/languages/top/OrF8/ExpenseManagement?style=default&logo=javascript&color=F7DF1E" alt="top-language">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="react">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="vite">
  <img src="https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase&logoColor=black" alt="firebase">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="tailwind">
  <img src="https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white" alt="react-router">
</p>

---

## 🔗 Table of Contents

- [📍 Overview](#-overview)
- [✨ Key Features](#-key-features)
- [📸 Screenshots](#-screenshots)
- [📁 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
  - [☑️ Prerequisites](#%EF%B8%8F-prerequisites)
  - [⚙️ Installation](#%EF%B8%8F-installation)
  - [🔧 Configuration](#-configuration)
  - [▶️ Running Locally](#%EF%B8%8F-running-locally)
- [🔥 Firebase Setup](#-firebase-setup)
- [⚡ Cloud Functions](#-cloud-functions)
- [🔒 Privacy & Terms](#-privacy--terms)

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
- 🌐 **Full Hebrew RTL UI** — built natively for right-to-left layout
- 🌙 **Dark / light mode** — theme preference persisted locally

---

## 📸 Screenshots

> _Screenshots coming soon. Clone the repo and run it locally to see it in action._

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

The `functions/` directory contains four callable Cloud Functions:

| Function | Description |
|---|---|
| `acceptBoardInvite` | Atomically adds the caller to `board.memberUids` and marks the invite accepted |
| `declineBoardInvite` | Marks the invite as declined |
| `removeBoardMember` | Allows the board owner to remove a non-owner member |
| `leaveBoard` | Allows a non-owner member to remove themselves from a board |

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

## 🔒 Privacy & Terms

This app includes a [Privacy Policy](/src/pages/PrivacyPage.jsx) (`/privacy`) and [Terms of Service](/src/pages/TermsPage.jsx) (`/terms`) for compliance with Firebase and Google Sign-In requirements.
