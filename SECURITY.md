# Security Policy

## Supported Versions

Security fixes are provided for the latest minor line only.

| Version | Supported |
| --- | --- |
| 1.1.x | ✅ |
| 1.0.x | ❌ |
| < 1.0.0 | ❌ |

If you run a self-hosted deployment, upgrade to the latest `1.1.x` patch release as soon as practical.

## Reporting a Vulnerability

Please report vulnerabilities **privately**.

### Preferred reporting channel

Use GitHub’s private vulnerability reporting for this repository:

- Open a private report via the repository’s **Security** tab ("Report a vulnerability").
- If private reporting is not enabled in your view, open a GitHub Security Advisory draft for the repository maintainers.

Do **not** open a public issue for suspected vulnerabilities.

#### Other reporting channels

- Contact the maintainer directly via GitHub
- Contact us via email [expensemanagementwebsite@gmail.com](mailto:expensemanagementwebsite@gmail.com)


### What to include

Please include as much detail as possible:

- Affected area (frontend, Firestore rules, Cloud Functions, deployment config, etc.)
- Steps to reproduce
- Expected vs. actual behavior
- Impact assessment (confidentiality / integrity / availability)
- Proof-of-concept details, logs, or screenshots (if safe to share)
- Suggested remediation (optional)

### Disclosure expectations

- Please do not publicly disclose the issue before a fix is available.
- Maintainers will acknowledge reports and triage based on severity and reproducibility.
- Resolution timelines vary by complexity and maintainer availability.
- When a report is confirmed, the fix will be shipped in a supported release line.

## Scope Notes

This project relies on Firebase services (Authentication, Firestore, Functions, Hosting).
Configuration issues can be security-sensitive; include relevant Firebase project and rule/function context in reports.
