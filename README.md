# ניהול הוצאות - Expense Management

A production-ready Hebrew RTL collaborative expense management web app.

## Tech Stack

- React + Vite
- Tailwind CSS v4
- Firebase (Authentication + Firestore + Cloud Functions)
- React Router v7

## Prerequisites

- Node.js 18+
- A Firebase project with Authentication and Firestore enabled

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and fill in your Firebase project values:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

## Running Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Building for Production

```bash
npm run build
npm run preview
```

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Authentication** → sign-in methods: Email/Password and Google
3. Enable **Firestore Database** in production mode
4. Enable **Cloud Functions** (requires the Blaze pay-as-you-go plan)
5. Add the following security rules to Firestore:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function signedInEmail() {
      return signedIn() && request.auth.token.email != null
        ? request.auth.token.email.lower()
        : null;
    }

    function isBoardMemberByDoc(boardDoc) {
      return signedIn()
        && request.auth.uid in boardDoc.memberUids;
    }

    function isBoardOwnerByDoc(boardDoc) {
      return signedIn()
        && boardDoc.ownerUid == request.auth.uid;
    }

    function isBoardMember(boardId) {
      return signedIn()
        && request.auth.uid in get(
          /databases/$(database)/documents/boards/$(boardId)
        ).data.memberUids;
    }

    function isBoardOwner(boardId) {
      return signedIn()
        && get(
          /databases/$(database)/documents/boards/$(boardId)
        ).data.ownerUid == request.auth.uid;
    }

    match /boards/{boardId} {
      allow create: if signedIn()
        && request.resource.data.ownerUid == request.auth.uid
        && request.auth.uid in request.resource.data.memberUids;

      allow read: if isBoardMemberByDoc(resource.data);

      allow update, delete: if isBoardOwnerByDoc(resource.data);
    }

    match /boards/{boardId}/transactions/{transactionId} {
      allow read, create, update, delete: if isBoardMember(boardId);
    }

    match /boards/{boardId}/invites/{inviteId} {
      allow create: if isBoardOwner(boardId)
        && request.resource.data.boardId == boardId
        && request.resource.data.invitedByUid == request.auth.uid
        && request.resource.data.invitedEmail is string
        && request.resource.data.invitedEmailLower is string
        && request.resource.data.status == "pending"
        && request.resource.data.acceptedAt == null;

      allow read: if isBoardOwner(boardId)
        || (
          signedInEmail() != null
          && resource.data.invitedEmailLower == signedInEmail()
        );

      allow update, delete: if isBoardOwner(boardId);
    }

    // Required for collectionGroup('invites') queries used in the incoming-invites UI.
    // Firestore collection-group queries are only permitted when a wildcard-path rule
    // explicitly grants access; the nested match above covers direct-path reads only.
    match /{path=**}/invites/{inviteId} {
      allow read: if signedInEmail() != null
        && resource.data.invitedEmailLower == signedInEmail();
    }
  }
}
```

## Features

- 🔐 Authentication with email/password and Google Sign-In
- 📋 Create and manage collaborative expense boards
- 👥 Invite collaborators by email; invitees can accept or decline invitations via secure Cloud Functions
- 💳 Track transactions with card last-4, name, essence, amount
- 📊 Installment tracking (תשלום X מתוך Y)
- 💰 Auto-calculated totals per card and grand total
- 🔄 Real-time updates via Firestore listeners
- 🌐 Full Hebrew RTL UI

## Firebase Functions Setup & Deployment

The `functions/` directory contains two callable Cloud Functions:

| Function | Description |
|---|---|
| `acceptBoardInvite` | Atomically adds the caller to `board.memberUids` and marks the invite accepted |
| `declineBoardInvite` | Marks the invite as declined |

### Prerequisites

- Firebase CLI: `npm install -g firebase-tools`
- Firebase Blaze (pay-as-you-go) plan — required for Cloud Functions

### First-time setup

```bash
# Log in to Firebase
firebase login

# Link the project (run from repo root)
firebase use --add
# Select your project and give it an alias (e.g. "default")
```

### Deploy the functions

```bash
# Install functions dependencies
cd functions && npm install && cd ..

# Deploy only the functions
firebase deploy --only functions
```

### Local emulation (optional)

```bash
# Start the Functions emulator alongside Firestore
firebase emulators:start --only functions,firestore
```

When running locally against the emulator, update `src/firebase/config.js` to
connect to it:

```js
import { connectFunctionsEmulator } from 'firebase/functions';
// Add after the existing exports:
if (location.hostname === 'localhost') {
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```
