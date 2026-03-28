# ניהול הוצאות - Expense Management

A production-ready Hebrew RTL collaborative expense management web app.

## Tech Stack

- React + Vite
- Tailwind CSS v4
- Firebase (Authentication + Firestore)
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
4. Add the following security rules to Firestore:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /boards/{boardId} {
      allow read, write: if request.auth != null
        && request.auth.uid in resource.data.memberUids;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.ownerUid
        && request.auth.uid in request.resource.data.memberUids;

      match /transactions/{transactionId} {
        allow read, write: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/boards/$(boardId)).data.memberUids;
      }
    }
  }
}
```

## Features

- 🔐 Authentication with email/password and Google Sign-In
- 📋 Create and manage collaborative expense boards
- 👥 Add collaborators by UID
- 💳 Track transactions with card last-4, name, essence, amount
- 📊 Installment tracking (תשלום X מתוך Y)
- 💰 Auto-calculated totals per card and grand total
- 🔄 Real-time updates via Firestore listeners
- 🌐 Full Hebrew RTL UI
