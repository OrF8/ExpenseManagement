# Expense Management

Expense Management is a real-time collaborative web app for managing shared expenses in Hebrew (RTL).
It is designed for families, roommates, and partners who need one reliable place to track spending, collaborators,
and board hierarchies without exposing broad user data.

The project combines a React frontend with Firebase Authentication, Firestore, Hosting, and callable Cloud Functions.
Invite, collaborator, and account management flows are implemented server-side to preserve a least-privilege security model.

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
</p>

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack & Architecture](#tech-stack--architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Run Locally](#run-locally)
- [Deployment](#deployment)
- [Security Notes](#security-notes)
- [License](#license)

## Overview

The app centers around collaborative boards. Each board contains transactions, collaborators, and optional sub-boards.
Members see real-time updates, while ownership and membership operations are enforced by Firestore rules and Cloud Functions.

## Key Features

- Firebase Auth (email/password + Google)
- Shared expense boards with real-time transaction updates
- Board hierarchy (parent/sub-board relationships)
- Installment-aware credit-card tracking
- Email-based invite flow (create/accept/decline/revoke)
- Owner/member management (remove member, leave board)
- Account deletion with server-side data cleanup
- Hebrew RTL interface with light/dark theme

## Tech Stack & Architecture

- **Frontend:** React 19, Vite 8, React Router 7, Tailwind CSS 4
- **Backend:** Firebase Cloud Functions (Node.js 20)
- **Data/Auth:** Firestore + Firebase Authentication
- **Hosting:** Firebase Hosting
- **Security:** Firestore rules + App Check enforcement on callable functions

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

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Firebase project with Authentication, Firestore, Hosting, and Functions enabled

### Installation

```bash
git clone https://github.com/OrF8/ExpenseManagement.git
cd ExpenseManagement
npm ci
npm --prefix functions ci
```

### Environment Configuration

Create `.env` from `.env.example` and fill your Firebase values.

```bash
cp .env.example .env
```

Required frontend variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_RECAPTCHA_V3_SITE_KEY`

#### Optional: Preview deployment configuration (`.env.preview`)
For preview deployments using the PowerShell script (`npm run deploy:preview -- -PrNumber pr_num`),
create a `.env.preview` fle with the same Firebase variables as `.env`,
with two optional variables (if you want to enable App Check debug mode for the preview channel):
- `VITE_APPCHECK_DEBUG=true`
- `VITE_APPCHECK_DEBUG_TOKEN=your_app_check_debug_token_here`
This allows you to deploy a Firebase Hosting preview channel separately from your main environment.

```bash
cp .env.preview.example .env.preview.
```

This is useful for testing changes without affecting the live app.

### Run Locally

```bash
npm run dev
```

App URL: `http://localhost:5173`

Production build preview:

```bash
npm run build
npm run preview
```

App URL: `http://localhost:4173`

## Deployment

Main deployment is automated through GitHub Actions (`.github/workflows/deploy.yml`) using
**Google Workload Identity Federation** (OIDC) with a deploy service account.

Typical manual deploy commands (**after** building with `npm run build`):

```bash
firebase deploy --only firestore:rules --project <project-id>
firebase deploy --only functions,hosting --project <project-id>
```

The repo also includes a PowerShell preview script (`npm run deploy:preview -- -PrNumber pr_num`) that deploys functions and a hosting preview channel using `.env.preview`.

## Security Notes

- Firestore access is scoped to board membership and document ownership; `/users/{uid}` is owner-readable and owner-writable only.
- Invite creation, acceptance, declination, revocation, member removal, and account deletion are all implemented as callable Cloud Functions to ensure server-side validation and least-privilege access.
- Callable functions enforce App Check (`enforceAppCheck: true`), and Hosting serves strict security headers (including CSP, X-Frame-Options, and Referrer-Policy).
- App Check is also enforced on Firestore and authentication operations to prevent abuse from unauthorized clients.
- Invite queries use collection-group access constrained by authenticated email match in Firestore rules.

## License

This project is licensed under the MIT license. For more information, see the [LICENSE](./LICENSE) file.
